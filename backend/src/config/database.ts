import { Pool, PoolClient } from 'pg';
import path from 'path';
import fs from 'fs';

// ============================================================
//  PostgreSQL Connection Pool
// ============================================================

let pool: Pool | null = null;

export function getPool(): Pool {
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
      connectionTimeoutMillis: 2000,
    });
    pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
    });
  }
  return pool;
}

// ============================================================
//  Query helper — returns rows array
// ============================================================
export async function query(sql: string, params?: any[]): Promise<any[]> {
  const p = getPool();
  // Convert SQLite ? placeholders to PostgreSQL $1, $2, ...
  const pgSql = convertPlaceholders(sql);
  const result = await p.query(pgSql, params);
  return result.rows;
}

// ============================================================
//  Single-row helper
// ============================================================
export async function queryOne(sql: string, params?: any[]): Promise<any | undefined> {
  const rows = await query(sql, params);
  return rows[0];
}

// ============================================================
//  Execute (INSERT/UPDATE/DELETE) — returns rowCount + insertId
// ============================================================
export async function execute(sql: string, params?: any[]): Promise<{ rowCount: number; id?: number }> {
  const p = getPool();
  let pgSql = convertPlaceholders(sql);
  // Append RETURNING id for INSERT statements if not already there
  if (/^\s*INSERT/i.test(pgSql) && !/RETURNING/i.test(pgSql)) {
    pgSql = pgSql.replace(/;?\s*$/, ' RETURNING id');
  }
  const result = await p.query(pgSql, params);
  return {
    rowCount: result.rowCount ?? 0,
    id: result.rows[0]?.id,
  };
}

// ============================================================
//  Transaction helper
// ============================================================
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
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

// ============================================================
//  Convert SQLite ? placeholders → PostgreSQL $1 $2 ...
// ============================================================
function convertPlaceholders(sql: string): string {
  let idx = 0;
  return sql.replace(/\?/g, () => `$${++idx}`);
}

// ============================================================
//  Initialize Database — run schema + seed
// ============================================================
export async function initializeDatabase(): Promise<void> {
  const schemaPath = path.join(__dirname, '..', '..', '..', 'database', 'schema.postgresql.sql');
  if (!fs.existsSync(schemaPath)) {
    console.warn('PostgreSQL schema file not found at', schemaPath);
    return;
  }
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  const p = getPool();
  try {
    await p.query(schema);
    console.log('✅ PostgreSQL database initialized successfully');
  } catch (err: any) {
    // Some statements may fail if objects already exist — that's OK
    if (!err.message?.includes('already exists')) {
      console.error('DB init error:', err.message);
    }
  }

  // Extra settings & company_info seed
  await p.query(`INSERT INTO company_info (id, name) VALUES (1, 'شركتي') ON CONFLICT DO NOTHING`).catch(() => {});
  const extraSettings = [
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
    await p.query(
      `INSERT INTO settings (setting_key, setting_value) VALUES ($1, $2) ON CONFLICT (setting_key) DO NOTHING`,
      [k, v]
    ).catch(() => {});
  }
  console.log('✅ Database seeding complete');
}

// ============================================================
//  Re-export async helpers from utils/helpers so routes can import everything from one place
// ============================================================
export { generateCodeAsync, logActivityAsync } from '../utils/helpers';

// ============================================================
//  Legacy SQLite compatibility shim
//  Allows gradual migration: routes that still call getDatabase()
//  will receive this shim instead of crashing.
//  All methods return sync-like objects but execute async under hood.
// ============================================================

/**
 * @deprecated Use query/queryOne/execute helpers directly.
 * This shim wraps PostgreSQL in a synchronous-looking API for backward compatibility.
 * NOTE: .get() and .all() CANNOT be truly synchronous on PostgreSQL.
 * Routes should be refactored to use the async helpers.
 */
export function getDatabase(): any {
  const p = getPool();
  return {
    prepare(sql: string) {
      return {
        get(...params: any[]) {
          throw new Error(
            `[DB Shim] Synchronous .get() called for SQL: "${sql.slice(0, 60)}..." — ` +
            `Please refactor this route to use async queryOne() from config/database`
          );
        },
        all(...params: any[]) {
          throw new Error(
            `[DB Shim] Synchronous .all() called for SQL: "${sql.slice(0, 60)}..." — ` +
            `Please refactor this route to use async query() from config/database`
          );
        },
        run(...params: any[]) {
          throw new Error(
            `[DB Shim] Synchronous .run() called for SQL: "${sql.slice(0, 60)}..." — ` +
            `Please refactor this route to use async execute() from config/database`
          );
        },
      };
    },
    exec(sql: string) {
      return p.query(sql);
    },
    close() {
      if (pool) { pool.end(); pool = null; }
    },
  };
}
