import { Pool, PoolClient } from 'pg';
import path from 'path';
import fs from 'fs';

// ============================================================
//  Dual-mode Database Layer
//  - Mode 1: PostgreSQL (real) when DATABASE_URL is a valid connection string
//  - Mode 2: PGlite (embedded PostgreSQL WASM) – no external server needed,
//            supports ALL PostgreSQL features (TO_CHAR, EXTRACT, ILIKE, INTERVAL…)
//            persists to filesystem (/tmp on serverless, local data dir otherwise)
// ============================================================

type Mode = 'postgres' | 'pglite';

function isRealPostgresUrl(url: string | undefined): boolean {
  if (!url) return false;
  const u = url.trim();
  if (!/^postgres(ql)?:\/\//i.test(u)) return false;
  if (/USER:PASSWORD@HOST|user:password@host|:PASSWORD@|@HOST:|\/DATABASE(\?|$)/.test(u)) return false;
  return true;
}

const MODE: Mode = isRealPostgresUrl(process.env.DATABASE_URL) ? 'postgres' : 'pglite';

// ─────────────────────────────────────────────
//  PostgreSQL pool (postgres mode only)
// ─────────────────────────────────────────────
let pool: Pool | null = null;

export function getPool(): Pool {
  if (MODE === 'pglite') return pglitePoolShim() as unknown as Pool;
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is required');
    pool = new Pool({
      connectionString,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 8000,
    });
    pool.on('error', (err) => console.error('PG pool error', err));
  }
  return pool;
}

// ─────────────────────────────────────────────
//  PGlite (embedded PostgreSQL)
// ─────────────────────────────────────────────
let pgliteDb: any = null;
let pgliteReady: Promise<void> | null = null;

function getPglitePath(): string {
  if (process.env.PGLITE_PATH) return process.env.PGLITE_PATH;
  const onServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
  const base = onServerless ? '/tmp/accounting-pg' : (process.env.PGLITE_DIR || path.join(__dirname, '..', '..', 'data', 'pglite'));
  if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true });
  return base;
}

async function getPglite(): Promise<any> {
  if (!pgliteReady) {
    pgliteReady = (async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { PGlite } = require('@electric-sql/pglite');
      const dbPath = getPglitePath();
      pgliteDb = new PGlite(dbPath);
      await pgliteDb.ready;
    })();
  }
  await pgliteReady;
  return pgliteDb;
}

// PGlite-backed pool shim that mimics pg.Pool for routes using getPool() directly
function pglitePoolShim() {
  const pgQuery = async (sql: string, params: any[] = []) => {
    const db = await getPglite();
    // $N placeholders work natively in PGlite, ? needs conversion
    const pgSql = convertPlaceholders(sql);
    const rows = await db.query(pgSql, normalizeParams(params));
    return { rows: rows.rows, rowCount: rows.rows.length };
  };
  return {
    query: pgQuery,
    connect: async () => ({
      query: pgQuery,
      release: () => {},
    }),
    end: async () => {},
    on: () => {},
  };
}

// ─────────────────────────────────────────────
//  Public async API
// ─────────────────────────────────────────────
export async function query(sql: string, params: any[] = []): Promise<any[]> {
  const pgSql = convertPlaceholders(sql);
  if (MODE === 'postgres') {
    const result = await getPool().query(pgSql, params);
    return result.rows;
  }
  const db = await getPglite();
  const r = await db.query(pgSql, normalizeParams(params));
  return r.rows;
}

export async function queryOne(sql: string, params: any[] = []): Promise<any | undefined> {
  const rows = await query(sql, params);
  return rows[0];
}

export async function execute(sql: string, params: any[] = []): Promise<{ rowCount: number; id?: number }> {
  let pgSql = convertPlaceholders(sql);
  // Add RETURNING id for INSERT if not already present
  if (/^\s*INSERT/i.test(pgSql) && !/RETURNING/i.test(pgSql)) {
    pgSql = pgSql.replace(/;?\s*$/, ' RETURNING id');
  }
  if (MODE === 'postgres') {
    const result = await getPool().query(pgSql, params);
    return { rowCount: result.rowCount ?? 0, id: result.rows[0]?.id };
  }
  const db = await getPglite();
  const r = await db.query(pgSql, normalizeParams(params));
  return { rowCount: r.rows.length || 1, id: r.rows[0]?.id };
}

export async function withTransaction<T>(fn: (client: any) => Promise<T>): Promise<T> {
  if (MODE === 'postgres') {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
  // PGlite transaction
  const db = await getPglite();
  let txResult: T;
  await db.transaction(async (tx: any) => {
    const client = {
      query: async (sql: string, params: any[] = []) => {
        const pgSql = convertPlaceholders(sql);
        const r = await tx.query(pgSql, normalizeParams(params));
        return { rows: r.rows, rowCount: r.rows.length };
      },
    };
    txResult = await fn(client);
  });
  return txResult!;
}

// Convert ? -> $1 $2 for PostgreSQL/PGlite (PGlite uses $N notation)
function convertPlaceholders(sql: string): string {
  let idx = 0;
  return sql.replace(/\?/g, () => `$${++idx}`);
}

// Normalise params (undefined -> null, boolean -> 0/1 not needed for PGlite)
function normalizeParams(params: any[]): any[] {
  return params.map((p) => (p === undefined ? null : p));
}

// ─────────────────────────────────────────────
//  Initialization
// ─────────────────────────────────────────────
export async function initializeDatabase(): Promise<void> {
  if (MODE === 'postgres') {
    await initPostgres();
  } else {
    await initPglite();
  }
}

async function initPostgres(): Promise<void> {
  const schemaPath = resolveSchemaFile('schema.postgresql.sql');
  if (schemaPath) {
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    try { await getPool().query(schema); } catch (err: any) {
      if (!err.message?.includes('already exists')) console.error('PG init error:', err.message);
    }
  }
  console.log('✅ PostgreSQL database initialized');
  await seedExtras();
}

async function initPglite(): Promise<void> {
  const db = await getPglite();
  // Load PostgreSQL schema — PGlite's exec() handles multi-statement SQL natively
  const schemaPath = resolveSchemaFile('schema.postgresql.sql');
  if (schemaPath) {
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    try {
      await db.exec(schema);
    } catch (err: any) {
      if (!err.message?.includes('already exists')) {
        console.warn('PGlite schema init warning:', err.message?.split('\n')[0]);
      }
    }
  }
  console.log(`✅ PGlite database initialized at ${getPglitePath()}`);
  await seedExtras();
}

function resolveSchemaFile(name: string): string | null {
  const candidates = [
    path.join(__dirname, '..', '..', 'database', name),          // backend/database (bundled)
    path.join(__dirname, '..', '..', '..', 'database', name),    // repo-root/database
    path.join(process.cwd(), 'database', name),
    path.join(process.cwd(), '..', 'database', name),
    path.join(process.cwd(), 'backend', 'database', name),
  ];
  for (const c of candidates) { if (fs.existsSync(c)) return c; }
  return null;
}

async function ensureDefaultUsers(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const bcrypt = require('bcryptjs');
  const defaults = [
    { username: 'admin',    password: '123456', full_name: 'مدير النظام',        role: 'admin',     department: 'admin' },
    { username: 'mohammed', password: '123456', full_name: 'محمد - مدير مبيعات', role: 'manager',   department: 'sales' },
    { username: 'sara',     password: '123456', full_name: 'سارة - محاسبة',      role: 'accountant', department: 'accounting' },
    { username: 'ali_sale', password: '123456', full_name: 'علي - مبيعات',       role: 'sales_rep',  department: 'sales' },
    { username: 'fatima',   password: '123456', full_name: 'فاطمة - مبيعات',     role: 'sales_rep',  department: 'sales' },
  ];
  for (const u of defaults) {
    try {
      const existing = await queryOne('SELECT id, password_hash FROM users WHERE username = $1', [u.username]);
      const hash = bcrypt.hashSync(u.password, 10);
      if (!existing) {
        await execute(
          'INSERT INTO users (username, password_hash, full_name, role, department, is_active) VALUES ($1, $2, $3, $4, $5, 1)',
          [u.username, hash, u.full_name, u.role, u.department]
        );
      } else {
        const ok = existing.password_hash && bcrypt.compareSync(u.password, existing.password_hash);
        if (!ok) await execute('UPDATE users SET password_hash = $1, is_active = 1 WHERE username = $2', [hash, u.username]);
      }
    } catch { /* non-critical */ }
  }
}

async function seedExtras(): Promise<void> {
  try {
    await execute("INSERT INTO company_info (id, name) VALUES (1, 'شركتي') ON CONFLICT DO NOTHING");
  } catch { /* ignore */ }
  const settings: [string, string][] = [
    ['vat_enabled','0'], ['vat_percentage','15'], ['vat_number',''], ['fiscal_year_start','01-01'],
    ['fiscal_year_end','12-31'], ['auto_backup_enabled','0'], ['auto_backup_interval','daily'],
    ['invoice_template','default'], ['invoice_notes',''], ['low_stock_notify','1'],
    ['expiry_notify_days','30'], ['currency_symbol','د.ع'], ['decimal_places','2'],
    ['inventory_method','fifo'],
  ];
  for (const [k, v] of settings) {
    try {
      await execute(
        'INSERT INTO settings (setting_key, setting_value) VALUES ($1, $2) ON CONFLICT (setting_key) DO NOTHING',
        [k, v]
      );
    } catch { /* ignore */ }
  }
  await ensureDefaultUsers();
  console.log('✅ Database seeding complete');
}

export function getDbMode(): Mode { return MODE; }

// ─────────────────────────────────────────────
//  Re-exports
// ─────────────────────────────────────────────
export { generateCodeAsync, logActivityAsync } from '../utils/helpers';

// ─────────────────────────────────────────────
//  Legacy shim (backward compat for unmigrated code)
// ─────────────────────────────────────────────
export function getDatabase(): any {
  // In PGlite mode, throw on sync usage – all routes should use async API
  if (MODE === 'pglite') {
    return {
      prepare: (sql: string) => ({
        get: () => { throw new Error(`[DB Shim] Sync .get() not available in PGlite mode. Refactor to queryOne(). SQL: ${sql.slice(0, 80)}`); },
        all: () => { throw new Error(`[DB Shim] Sync .all() not available in PGlite mode. Refactor to query(). SQL: ${sql.slice(0, 80)}`); },
        run: () => { throw new Error(`[DB Shim] Sync .run() not available in PGlite mode. Refactor to execute(). SQL: ${sql.slice(0, 80)}`); },
      }),
      exec: (sql: string) => getPglite().then((db) => db.exec(sql)),
      close: async () => { if (pgliteDb) { await pgliteDb.close(); pgliteDb = null; pgliteReady = null; } },
    };
  }
  const p = getPool();
  return {
    prepare: (sql: string) => ({
      get: () => { throw new Error(`Sync .get() not supported on PostgreSQL. Use queryOne(). SQL: ${sql.slice(0, 60)}`); },
      all: () => { throw new Error(`Sync .all() not supported on PostgreSQL. Use query(). SQL: ${sql.slice(0, 60)}`); },
      run: () => { throw new Error(`Sync .run() not supported on PostgreSQL. Use execute(). SQL: ${sql.slice(0, 60)}`); },
    }),
    exec: (sql: string) => p.query(sql),
    close: () => { if (pool) { pool.end(); pool = null; } },
  };
}
