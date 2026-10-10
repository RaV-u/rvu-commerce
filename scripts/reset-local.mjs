// Local developer reset, intentionally unavailable over HTTP.
import { createPool } from "../apps/api/src/db.ts";
import { newRun } from "../apps/api/src/seed.ts";
if (process.env.RVU_INTEGRATED_MODE !== "1" || process.argv[2] !== "RESET") {
  throw new Error("Run locally with RVU_INTEGRATED_MODE=1 and argument RESET.");
}
const url=process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL missing");
const pool=createPool(url);
const db=await pool.connect();
try {
  await db.query("BEGIN");
  await db.query("SELECT pg_advisory_xact_lock(814730)");
  const run=await newRun(db,"open-playground");
  await db.query("COMMIT");
  console.log("New isolated storefront run is ready:",run);
  console.log("Older accounts and orders are retained in PostgreSQL, not exposed in this run.");
} catch (error) {
  await db.query("ROLLBACK");
  throw error;
} finally {
  db.release();
  await pool.end();
}
