import { Pool, PoolClient } from 'pg';
import path from 'path';
import fs from 'fs';

// ============================================================
//  Dual-mode Database Layer
//  - Uses PostgreSQL when DATABASE_URL is a real connection string
//  - Falls back to embedded node:sqlite (built into Node >=22) otherwise
//  Both expose the SAME async API: query / queryOne / execute / withTransaction
// ============================================================

type Mode = 'postgres' | 'sqlite';

function isRealPostgresUrl(url: string | undefined): boolean {
  if (!url) return false;
  const u = url.trim();
  if (!/^postgres(ql)?:\/\//i.test(u)) return false;
  // Reject obvious placeholders
  if (/USER:PASSWORD@HOST|user:password@host|:PASSWORD@|@HOST:|\/DATABASE(\?|$)/.test(u)) return false;
  return true;
}

const MODE: Mode = isRealPostgresUrl(process.env.DATABASE_URL) ? 'postgres' : 'sqlite';

// ------------------------------------------------------------
//  PostgreSQL pool (only initialised in postgres mode)
// ------------------------------------------------------------
let pool: Pool | null = null;

export function getPool(): Pool {
  if (MODE === 'sqlite') {
    // Return a pg-compatible shim backed by node:sqlite so routes that call
    // getPool().query(sql, params) with $N placeholders keep working.
    return sqlitePoolShim() as unknown as Pool;
  }
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is required for PostgreSQL');
    }
    pool = new Pool({
      connectionString,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 8000,
    });
    pool.on('error', (err) => {
      console.error('Unexpected error on idle PG client', err);
    });
  }
  return pool;
}

function pgPlaceholdersToQmarks(sql: string): string {
  // Convert $1, $2 ... into ? for SQLite
  return sql.replace(/\$(\d+)/g, '?');
}

function sqlitePoolShim() {
  const db = getSqlite();
  const run = (sql: string, params: any[] = []) => {
    const s = translateForSqlite(pgPlaceholdersToQmarksSafe(sql));
    const stmt = db.prepare(s);
    if (/^\s*(SELECT|WITH|PRAGMA)/i.test(s)) {
      return { rows: stmt.all(...normalizeParams(params)), rowCount: undefined };
    }
    const info = stmt.run(...normalizeParams(params));
    return { rows: info.lastInsertRowid != null ? [{ id: Number(info.lastInsertRowid) }] : [], rowCount: Number(info.changes ?? 0) };
  };
  return {
    query: async (sql: string, params: any[] = []) => run(sql, params),
    connect: async () => ({
      query: async (sql: string, params: any[] = []) => run(sql, params),
      release: () => {},
    }),
    end: async () => {},
    on: () => {},
  };
}

// If the SQL already uses ? we keep it; if it uses $N we convert.
function pgPlaceholdersToQmarksSafe(sql: string): string {
  if (/\$\d+/.test(sql)) return pgPlaceholdersToQarksInner(sql);
  return sql;
}
function pgPlaceholdersToQarksInner(sql: string): string {
  return sql.replace(/\$(\d+)/g, '?');
}

// ------------------------------------------------------------
//  SQLite (node:sqlite) engine
// ------------------------------------------------------------
let sqliteDb: any = null;

function getSqlitePath(): string {
  if (process.env.SQLITE_PATH) return process.env.SQLITE_PATH;
  // On serverless (Vercel/Lambda) only /tmp is writable.
  const onServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
  const baseDir = onServerless
    ? path.join('/tmp', 'accounting-data')
    : (process.env.SQLITE_DIR || path.join(__dirname, '..', '..', 'data'));
  if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
  return path.join(baseDir, 'accounting.db');
}

function getSqlite(): any {
  if (!sqliteDb) {
    // node:sqlite is built-in on Node >= 22 (stable on 24)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DatabaseSync } = require('node:sqlite');
    sqliteDb = new DatabaseSync(getSqlitePath());
    sqliteDb.exec('PRAGMA journal_mode = WAL;');
    sqliteDb.exec('PRAGMA foreign_keys = ON;');
  }
  return sqliteDb;
}

// ------------------------------------------------------------
//  SQL translation: Postgres-style ($N, NOW(), ILIKE, etc.) -> SQLite
// ------------------------------------------------------------
function convertPlaceholdersToPg(sql: string): string {
  let idx = 0;
  return sql.replace(/\?/g, () => `$${++idx}`);
}

function translateForSqlite(sql: string): string {
  let s = sql;

  // ---- Date/time arithmetic (do BEFORE NOW() replacement) ----
  // NOW()/CURRENT_DATE/CURRENT_TIMESTAMP - INTERVAL 'N unit'
  const intervalMinus = /(NOW\(\)|CURRENT_TIMESTAMP|CURRENT_DATE)\s*-\s*INTERVAL\s*'(\d+)\s*(minute|minutes|hour|hours|day|days|month|months|year|years)'/gi;
  s = s.replace(intervalMinus, (_m, _base, n, unit) => `datetime('now','-${n} ${unit.replace(/s?$/, 's')}')`);
  const intervalPlus = /(NOW\(\)|CURRENT_TIMESTAMP|CURRENT_DATE)\s*\+\s*INTERVAL\s*'(\d+)\s*(minute|minutes|hour|hours|day|days|month|months|year|years)'/gi;
  s = s.replace(intervalPlus, (_m, _base, n, unit) => `datetime('now','+${n} ${unit.replace(/s?$/, 's')}')`);

  // ---- TO_CHAR(col, 'FMT') -> strftime ----
  s = s.replace(/TO_CHAR\s*\(\s*([^,]+?)\s*,\s*'YYYY-MM'\s*\)/gi, "strftime('%Y-%m', $1)");
  s = s.replace(/TO_CHAR\s*\(\s*([^,]+?)\s*,\s*'YYYY-MM-DD'\s*\)/gi, "strftime('%Y-%m-%d', $1)");
  s = s.replace(/TO_CHAR\s*\(\s*([^,]+?)\s*,\s*'MM'\s*\)/gi, "strftime('%m', $1)");
  s = s.replace(/TO_CHAR\s*\(\s*([^,]+?)\s*,\s*'YYYY'\s*\)/gi, "strftime('%Y', $1)");
  s = s.replace(/TO_CHAR\s*\(\s*([^,]+?)\s*,\s*'DD'\s*\)/gi, "strftime('%d', $1)");
  s = s.replace(/TO_CHAR\s*\(\s*([^,]+?)\s*,\s*'HH24'\s*\)/gi, "strftime('%H', $1)");

  // ---- EXTRACT(YEAR/MONTH/DAY FROM x) -> strftime ----
  s = s.replace(/EXTRACT\s*\(\s*YEAR\s+FROM\s+([^)]+?)\s*\)/gi, "CAST(strftime('%Y', $1) AS INTEGER)");
  s = s.replace(/EXTRACT\s*\(\s*MONTH\s+FROM\s+([^)]+?)\s*\)/gi, "CAST(strftime('%m', $1) AS INTEGER)");
  s = s.replace(/EXTRACT\s*\(\s*DAY\s+FROM\s+([^)]+?)\s*\)/gi, "CAST(strftime('%d', $1) AS INTEGER)");

  // ---- DATE(x) -> date(x) (SQLite) ; PG DATE() cast style ----
  s = s.replace(/\bDATE\s*\(/gi, 'date(');

  // ---- NOW() / CURRENT_DATE remaining -> SQLite equivalents ----
  s = s.replace(/\bNOW\(\)/gi, "datetime('now')");
  s = s.replace(/\bCURRENT_DATE\b/gi, "date('now')");
  // CURRENT_TIMESTAMP is valid in SQLite — keep it

  // ---- ILIKE -> LIKE ----
  s = s.replace(/\bILIKE\b/gi, 'LIKE');

  // ---- casts ::type -> drop ----
  s = s.replace(/::\s*(integer|int|numeric|real|float|double precision|text|bigint|date|timestamp)/gi, '');

  // ---- NULLS LAST / FIRST -> remove ----
  s = s.replace(/\bNULLS\s+(LAST|FIRST)\b/gi, '');

  // ---- SUBSTRING( -> substr( ----
  s = s.replace(/\bSUBSTRING\s*\(/gi, 'substr(');

  // ---- RETURNING clause -> strip (use lastInsertRowid) ----
  s = s.replace(/\s+RETURNING\s+[a-z_,\s*]+;?\s*$/i, '');

  // ---- Boolean literals ----
  s = s.replace(/(=|\s|,|\()\s*true\b/gi, '$1 1').replace(/(=|\s|,|\()\s*false\b/gi, '$1 0');

  // ---- ON CONFLICT (col) DO NOTHING already valid in SQLite ----
  // ---- ON CONFLICT(col) DO UPDATE SET ... also valid in SQLite ----

  return s;
}

// ------------------------------------------------------------
//  Public async API
// ------------------------------------------------------------
export async function query(sql: string, params: any[] = []): Promise<any[]> {
  if (MODE === 'postgres') {
    const pgSql = convertPlaceholdersToPg(sql);
    const result = await getPool().query(pgSql, params);
    return result.rows;
  }
  const db = getSqlite();
  const s = translateForSqlite(sql);
  const stmt = db.prepare(s);
  return stmt.all(...normalizeParams(params));
}

export async function queryOne(sql: string, params: any[] = []): Promise<any | undefined> {
  const rows = await query(sql, params);
  return rows[0];
}

export async function execute(sql: string, params: any[] = []): Promise<{ rowCount: number; id?: number }> {
  if (MODE === 'postgres') {
    let pgSql = convertPlaceholdersToPg(sql);
    if (/^\s*INSERT/i.test(pgSql) && !/RETURNING/i.test(pgSql)) {
      pgSql = pgSql.replace(/;?\s*$/, ' RETURNING id');
    }
    const result = await getPool().query(pgSql, params);
    return { rowCount: result.rowCount ?? 0, id: result.rows[0]?.id };
  }
  const db = getSqlite();
  const s = translateForSqlite(sql);
  const stmt = db.prepare(s);
  const info = stmt.run(...normalizeParams(params));
  return {
    rowCount: Number(info.changes ?? 0),
    id: info.lastInsertRowid != null ? Number(info.lastInsertRowid) : undefined,
  };
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
  const db = getSqlite();
  db.exec('BEGIN');
  try {
    // For SQLite we pass a lightweight client shim that mirrors pg's client.query
    const client = {
      query: async (sql: string, params: any[] = []) => {
        const s = translateForSqlite(pgPlaceholdersToQmarksSafe(sql));
        const stmt = db.prepare(s);
        if (/^\s*(SELECT|WITH|PRAGMA)/i.test(s)) {
          return { rows: stmt.all(...normalizeParams(params)) };
        }
        const info = stmt.run(...normalizeParams(params));
        return {
          rows: info.lastInsertRowid != null ? [{ id: Number(info.lastInsertRowid) }] : [],
          rowCount: Number(info.changes ?? 0),
          insertId: info.lastInsertRowid,
        };
      },
    };
    const result = await fn(client);
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// SQLite bindings don't accept undefined/booleans; normalise them
function normalizeParams(params: any[]): any[] {
  return params.map((p) => {
    if (p === undefined) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    return p;
  });
}

// ------------------------------------------------------------
//  Initialization: load schema + seed
// ------------------------------------------------------------
export async function initializeDatabase(): Promise<void> {
  if (MODE === 'postgres') {
    await initPostgres();
  } else {
    await initSqlite();
  }
}

async function initPostgres(): Promise<void> {
  const schemaPath = resolveSchemaFile('schema.postgresql.sql');
  if (!schemaPath) {
    console.warn('PostgreSQL schema file not found');
  } else {
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    try {
      await getPool().query(schema);
      console.log('✅ PostgreSQL database initialized');
    } catch (err: any) {
      if (!err.message?.includes('already exists')) {
        console.error('PG init error:', err.message);
      }
    }
  }
  await seedExtras();
}

async function initSqlite(): Promise<void> {
  const db = getSqlite();
  const schemaPath = resolveSchemaFile('schema.sql');
  if (schemaPath) {
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    try {
      db.exec(schema);
    } catch (err: any) {
      // Individual statement failures (already-exists) are tolerable
      // Try executing statement-by-statement for resilience
      execSqliteStatements(db, schema);
    }
  }
  console.log('✅ SQLite (embedded) database initialized at', getSqlitePath());
  await seedExtras();
}

function execSqliteStatements(db: any, schema: string): void {
  const statements = schema
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));
  for (const stmt of statements) {
    try {
      db.exec(stmt + ';');
    } catch {
      // ignore individual failures (already exists, etc.)
    }
  }
}

function resolveSchemaFile(name: string): string | null {
  const candidates = [
    path.join(__dirname, '..', '..', 'database', name),        // backend/database (bundled)
    path.join(__dirname, '..', '..', '..', 'database', name),  // repo-root/database
    path.join(process.cwd(), 'database', name),
    path.join(process.cwd(), '..', 'database', name),
    path.join(process.cwd(), 'backend', 'database', name),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

async function ensureDefaultUsers(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const bcrypt = require('bcryptjs');
  const defaults = [
    { username: 'admin', password: '123456', full_name: 'مدير النظام', role: 'admin', department: 'admin' },
    { username: 'mohammed', password: '123456', full_name: 'محمد - مدير مبيعات', role: 'manager', department: 'sales' },
    { username: 'sara', password: '123456', full_name: 'سارة - محاسبة', role: 'accountant', department: 'accounting' },
  ];
  for (const u of defaults) {
    try {
      const existing = await queryOne('SELECT id, password_hash FROM users WHERE username = ?', [u.username]);
      const hash = bcrypt.hashSync(u.password, 10);
      if (!existing) {
        await execute(
          'INSERT INTO users (username, password_hash, full_name, role, department, is_active) VALUES (?, ?, ?, ?, ?, 1)',
          [u.username, hash, u.full_name, u.role, u.department]
        );
      } else {
        const ok = existing.password_hash && bcrypt.compareSync(u.password, existing.password_hash);
        if (!ok) {
          await execute('UPDATE users SET password_hash = ?, is_active = 1 WHERE username = ?', [hash, u.username]);
        }
      }
    } catch {
      // non-critical
    }
  }
}

async function seedExtras(): Promise<void> {
  try {
    await execute(
      `INSERT INTO company_info (id, name) VALUES (1, 'شركتي') ON CONFLICT DO NOTHING`
    ).catch(async () => {
      // SQLite: ON CONFLICT DO NOTHING without target — retry with OR IGNORE
      await execute(`INSERT OR IGNORE INTO company_info (id, name) VALUES (1, 'شركتي')`).catch(() => {});
    });
  } catch { /* ignore */ }

  // Ensure a working default admin user (username: admin, password: 123456)
  await ensureDefaultUsers();

  const extraSettings: [string, string][] = [
    ['vat_enabled', '0'],
    ['vat_percentage', '15'],
    ['vat_number', ''],
    ['fiscal_year_start', '01-01'],
    ['fiscal_year_end', '12-31'],
    ['auto_backup_enabled', '0'],
    ['auto_backup_interval', 'daily'],
    ['invoice_template', 'default'],
    ['invoice_notes', ''],
    ['low_stock_notify', '1'],
    ['expiry_notify_days', '30'],
    ['currency_symbol', 'د.ع'],
    ['decimal_places', '2'],
    ['inventory_method', 'fifo'],
  ];
  for (const [k, v] of extraSettings) {
    if (MODE === 'postgres') {
      await getPool()
        .query(
          `INSERT INTO settings (setting_key, setting_value) VALUES ($1, $2) ON CONFLICT (setting_key) DO NOTHING`,
          [k, v]
        )
        .catch(() => {});
    } else {
      await execute(`INSERT OR IGNORE INTO settings (setting_key, setting_value) VALUES (?, ?)`, [k, v]).catch(() => {});
    }
  }
  console.log('✅ Database seeding complete');
}

export function getDbMode(): Mode {
  return MODE;
}

// ------------------------------------------------------------
//  Re-export async helpers
// ------------------------------------------------------------
export { generateCodeAsync, logActivityAsync } from '../utils/helpers';

// ------------------------------------------------------------
//  Legacy SQLite compatibility shim (kept for un-migrated code paths)
// ------------------------------------------------------------
export function getDatabase(): any {
  if (MODE === 'sqlite') {
    const db = getSqlite();
    return {
      prepare(sql: string) {
        const s = translateForSqlite(sql);
        return {
          get: (...params: any[]) => db.prepare(s).get(...normalizeParams(params)),
          all: (...params: any[]) => db.prepare(s).all(...normalizeParams(params)),
          run: (...params: any[]) => {
            const info = db.prepare(s).run(...normalizeParams(params));
            return { changes: Number(info.changes ?? 0), lastInsertRowid: info.lastInsertRowid };
          },
        };
      },
      exec: (sql: string) => db.exec(translateForSqlite(sql)),
      close: () => { if (sqliteDb) { sqliteDb.close(); sqliteDb = null; } },
    };
  }
  const p = getPool();
  return {
    prepare(sql: string) {
      return {
        get() { throw new Error(`[DB Shim] Sync .get() not supported on PostgreSQL. Refactor to queryOne(). SQL: ${sql.slice(0, 60)}`); },
        all() { throw new Error(`[DB Shim] Sync .all() not supported on PostgreSQL. Refactor to query(). SQL: ${sql.slice(0, 60)}`); },
        run() { throw new Error(`[DB Shim] Sync .run() not supported on PostgreSQL. Refactor to execute(). SQL: ${sql.slice(0, 60)}`); },
      };
    },
    exec: (sql: string) => p.query(sql),
    close: () => { if (pool) { pool.end(); pool = null; } },
  };
}
