import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createPool } from "./db.ts";
import { seedCatalog, newRun } from "./seed.ts";
import { passwordHash } from "./security.ts";
export async function migrate(url: string, instructorPassword: string) {
  if (instructorPassword.length < 16)
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
          new URL("../../../db/migrations/001_foundation.sql", import.meta.url),
          "utf8",
        ),
      );
      await db.query("INSERT INTO public.schema_migrations(version) VALUES(1)");
    }
    if (!(await db.query("SELECT 1 FROM public.schema_migrations WHERE version=2")).rowCount) {
      await db.query(await readFile(new URL("../../../db/migrations/002_training_profiles.sql", import.meta.url), "utf8"));
      await db.query("INSERT INTO public.schema_migrations(version) VALUES(2)");
    }
    if (!(await db.query("SELECT 1 FROM public.schema_migrations WHERE version=3")).rowCount) {
      await db.query(await readFile(new URL("../../../db/migrations/003_extended_labs.sql", import.meta.url), "utf8"));
      await db.query("INSERT INTO public.schema_migrations(version) VALUES(3)");
    }
    await seedCatalog(db);
    if (!(await db.query("SELECT 1 FROM store.runtime")).rowCount)
      await newRun(db);
    if (!(await db.query("SELECT 1 FROM control.instructors")).rowCount)
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
          new URL("../../../db/grants.sql", import.meta.url),
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
if (process.argv[1]?.endsWith("/migrate.ts")) {
  await migrate(
    process.env.DATABASE_URL!,
    process.env.INSTRUCTOR_PASSWORD ?? "",
  );
  console.log("Migrations and seed complete.");
}
