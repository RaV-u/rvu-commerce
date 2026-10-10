import pg from "pg";
export const RESET_LOCK = 814731;
export type DB = pg.PoolClient;
export function createPool(url: string) {
  return new pg.Pool({
    connectionString: url,
    max: 12,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
  });
}
export async function transaction<T>(
  pool: pg.Pool,
  fn: (db: DB) => Promise<T>,
  reset = false,
): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query(
      reset
        ? "SELECT pg_advisory_xact_lock($1)"
        : "SELECT pg_advisory_xact_lock_shared($1)",
      [RESET_LOCK],
    );
    const result = await fn(db);
    await db.query("COMMIT");
    return result;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}
export async function activeRun(db: DB) {
  const { rows } = await db.query(
    "SELECT active_run FROM store.runtime WHERE singleton=true",
  );
  if (!rows[0]) throw new Error("Database is not initialized");
  return rows[0].active_run as string;
}
