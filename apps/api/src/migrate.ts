import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { createPool } from "./db.ts";
import { seedCatalog, newRun } from "./seed.ts";
import { passwordHash } from "./security.ts";
export async function migrate(url: string, instructorPassword: string) {
  const legacyAdminMode = process.env.RVU_INTEGRATED_MODE !== "1";
  if (legacyAdminMode && instructorPassword.length < 16)
    throw new Error("Instructor password must have at least 16 characters");
  const pool = createPool(url),
    db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query("SELECT pg_advisory_xact_lock(814730)");
    await db.query(
      "CREATE TABLE IF NOT EXISTS public.schema_migrations(version int PRIMARY KEY, applied_at timestamptz DEFAULT now())",
    );
    if (
      !(
        await db.query("SELECT 1 FROM public.schema_migrations WHERE version=1")
      ).rowCount
    ) {
      await db.query(
        await readFile(
          resolve("db/migrations/001_foundation.sql"),
          "utf8",
        ),
      );
      await db.query("INSERT INTO public.schema_migrations(version) VALUES(1)");
    }
    if (!(await db.query("SELECT 1 FROM public.schema_migrations WHERE version=2")).rowCount) {
      await db.query(await readFile(resolve("db/migrations/002_training_profiles.sql"), "utf8"));
      await db.query("INSERT INTO public.schema_migrations(version) VALUES(2)");
    }
    if (!(await db.query("SELECT 1 FROM public.schema_migrations WHERE version=3")).rowCount) {
      await db.query(await readFile(resolve("db/migrations/003_extended_labs.sql"), "utf8"));
      await db.query("INSERT INTO public.schema_migrations(version) VALUES(3)");
    }
    if (!(await db.query("SELECT 1 FROM public.schema_migrations WHERE version=4")).rowCount) {
      await db.query(await readFile(resolve("db/migrations/004_integrated_storefront.sql"), "utf8"));
      await db.query("INSERT INTO public.schema_migrations(version) VALUES(4)");
    }
    if (!(await db.query("SELECT 1 FROM public.schema_migrations WHERE version=5")).rowCount) {
      await db.query(await readFile(resolve("db/migrations/005_signed_cart_quantity.sql"), "utf8"));
      await db.query("INSERT INTO public.schema_migrations(version) VALUES(5)");
    }
    if (!(await db.query("SELECT 1 FROM public.schema_migrations WHERE version=6")).rowCount) {
      await db.query(await readFile(resolve("db/migrations/006_large_order_quantities.sql"), "utf8"));
      await db.query("INSERT INTO public.schema_migrations(version) VALUES(6)");
    }
    const poundsAlreadyMigrated = !!(await db.query("SELECT 1 FROM public.schema_migrations WHERE version=7")).rowCount;
    if (!poundsAlreadyMigrated) {
      await db.query(await readFile(resolve("db/migrations/007_egp_pounds.sql"), "utf8"));
      await db.query("INSERT INTO public.schema_migrations(version) VALUES(7)");
    }
    await seedCatalog(db);
    // Preserve historical customer data while activating the current storefront.
    const integrated = process.env.RVU_INTEGRATED_MODE === "1";
    const current = await db.query("SELECT r.profile FROM store.runtime rt JOIN store.runs r ON r.id=rt.active_run");
    if (!current.rowCount || (integrated && current.rows[0].profile !== "open-playground") || (!poundsAlreadyMigrated && !!current.rowCount))
      await newRun(db, integrated ? "open-playground" : "secure-baseline");
    if (legacyAdminMode && !(await db.query("SELECT 1 FROM control.instructors")).rowCount)
      await db.query("INSERT INTO control.instructors VALUES($1,$2,$3)", [
        randomUUID(),
        "instructor",
        await passwordHash(instructorPassword),
      ]);
    if (
      (await db.query("SELECT 1 FROM pg_roles WHERE rolname='rvu_store'"))
        .rowCount
    )
      await db.query(
        await readFile(
          resolve("db/grants.sql"),
          "utf8",
        ),
      );
    await db.query("COMMIT");
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
    await pool.end();
  }
}
if (/(?:\/migrate\.ts|\/migrate\.js)$/.test(process.argv[1] ?? "")) {
  await migrate(
    process.env.DATABASE_URL!,
    process.env.INSTRUCTOR_PASSWORD ?? "",
  );
  console.log("Migrations and seed complete.");
}
