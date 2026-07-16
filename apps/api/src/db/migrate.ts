import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required');
  }

  const sql = postgres(url, { max: 1 });
  const db = drizzle(sql);
  const migrationsFolder = path.join(__dirname, '../../drizzle');

  console.log('[migrate] running migrations from', migrationsFolder);
  await migrate(db, { migrationsFolder });
  console.log('[migrate] done');
  await sql.end();
}

main().catch((err) => {
  console.error('[migrate] failed', err);
  process.exit(1);
});
