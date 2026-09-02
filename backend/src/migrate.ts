/**
 * migrate.ts
 * Reads database/schema.postgresql.sql and runs it against DATABASE_URL.
 * Also runs seedIraqi.ts if --seed flag is provided.
 *
 * Usage:
 *   npx ts-node src/migrate.ts
 *   npx ts-node src/migrate.ts --seed
 */

import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌  DATABASE_URL is not set. Add it to backend/.env');
  process.exit(1);
}

const SCHEMA_PATH = path.join(__dirname, '..', '..', 'database', 'schema.postgresql.sql');

async function migrate(): Promise<void> {
  console.log('🔄  Connecting to database...');

  const pool = new Pool({
    connectionString: DATABASE_URL!,
    ssl: DATABASE_URL!.includes('sslmode=require') ? { rejectUnauthorized: false } : false,
  });

  const client = await pool.connect();

  try {
    // ---- Read schema ----
    if (!fs.existsSync(SCHEMA_PATH)) {
      throw new Error(`Schema file not found: ${SCHEMA_PATH}`);
    }

    const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
    console.log(`📄  Running schema from: ${SCHEMA_PATH}`);

    await client.query('BEGIN');
    try {
      await client.query(schema);
      await client.query('COMMIT');
      console.log('✅  Schema applied successfully');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }

    // ---- Optional seed ----
    const shouldSeed = process.argv.includes('--seed');
    if (shouldSeed) {
      console.log('🌱  Running Iraqi demo seed data...');
      // Import dynamically to allow migration to work without seed
      const { seedIraqiData } = await import('./seedIraqi');
      await seedIraqiData();
      console.log('✅  Seed data applied');
    }

  } finally {
    client.release();
    await pool.end();
  }
}

migrate()
  .then(() => {
    console.log('🎉  Migration complete');
    process.exit(0);
  })
  .catch((err: Error) => {
    console.error('❌  Migration failed:', err.message);
    process.exit(1);
  });
