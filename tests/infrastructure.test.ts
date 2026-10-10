import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { parse } from "yaml";
import { products } from "../apps/api/src/seed.ts";
test("Compose configuration exposes only loopback proxy ports and separates credentials", async () => {
  const c = parse(await readFile("compose.yaml", "utf8"), { merge: true });
  assert.equal(c.networks.private.internal, true);
  assert.ok(c.networks.ingress, "Ingress bridge must exist for loopback-published proxy ports");
  assert.notEqual(c.networks.ingress.internal, true);
  for (const [name, service] of Object.entries(c.services) as [
    string,
    { ports?: string[]; networks: string[] },
  ][]) {
    assert.deepEqual(service.networks, name === "edge" ? ["private", "ingress"] : ["private"]);
    if (name !== "edge") assert.equal(service.ports, undefined);
    else
      assert.deepEqual(service.ports, ["127.0.0.1:8080:8080"]);
  }
  assert.match(c.services.store.environment.DATABASE_URL, /rvu_store/);
  assert.equal(c.services.instructor, undefined, "Instructor service must not be deployed");
  assert.equal(c.services.store.environment.INSTRUCTOR_PASSWORD, undefined);
  assert.equal(c.services.migrate.environment.RVU_INTEGRATED_MODE, "1");
  assert.equal(c.services.store.environment.RVU_SINGLE_LOGIN, "1");
  assert.equal(
    c.services.store.environment.APP_ORIGIN,
    "http://localhost:8080",
  );
});
test("every seeded product has a local asset and no external image dependency", async () => {
  for (const p of products) {
    await access(`apps/web/public/products/${p[6]}.svg`);
    assert.ok(Number.isSafeInteger(p[4]));
    assert.ok(p[4] > 0);
  }
  await access("apps/web/public/products/studio.svg");
});
