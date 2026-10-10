import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { parse } from "yaml";
import { products } from "../apps/api/src/seed.ts";
test("Compose configuration exposes only loopback proxy ports and separates credentials", async () => {
  const c = parse(await readFile("compose.yaml", "utf8"), { merge: true });
  assert.equal(c.networks.private.internal, true);
  for (const [name, service] of Object.entries(c.services) as [
    string,
    { ports?: string[]; networks: string[] },
  ][]) {
    assert.deepEqual(service.networks, ["private"]);
    if (name !== "edge") assert.equal(service.ports, undefined);
    else
      assert.deepEqual(service.ports, [
        "127.0.0.1:8080:8080",
        "127.0.0.1:8081:8081",
      ]);
  }
  assert.match(c.services.store.environment.DATABASE_URL, /rvu_store/);
  assert.match(c.services.instructor.environment.DATABASE_URL, /rvu_control/);
  assert.equal(c.services.store.environment.INSTRUCTOR_PASSWORD, undefined);
  assert.equal(
    c.services.instructor.environment.INSTRUCTOR_PASSWORD,
    undefined,
  );
  assert.equal(
    c.services.store.environment.APP_ORIGIN,
    "http://localhost:8080",
  );
  assert.equal(
    c.services.instructor.environment.APP_ORIGIN,
    "http://127.0.0.1:8081",
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
