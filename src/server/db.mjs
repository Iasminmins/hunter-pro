import pg from 'pg';

let pool;

export function getPool() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    const error = new Error('DATABASE_URL is not configured.');
    error.code = 'CONFIG_MISSING';
    throw error;
  }
  pool = new pg.Pool({
    connectionString,
    max: Number(process.env.PG_POOL_MAX || 5),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
    ssl: connectionString.includes('sslmode=disable') ? false : undefined
  });
  pool.on('error', () => {});
  return pool;
}

export async function closePool() {
  if (!pool) return;
  const current = pool;
  pool = undefined;
  await current.end();
}
