import pg from "pg";
import { getDatabaseConfig } from "./database.js";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (pool) return pool;
  const config = getDatabaseConfig();
  pool = new Pool({
    connectionString: config.url,
    max: config.maxConnections,
    ssl: config.ssl ? { rejectUnauthorized: false } : undefined
  });
  return pool;
}

export async function closePool(): Promise<void> {
  if (!pool) return;
  const current = pool;
  pool = null;
  await current.end();
}
