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
      assert.deepEqual(service.ports, ["127.0.0.1:8081:8081"]);
  }
  assert.match(c.services.store.environment.DATABASE_URL, /rvu_store/);
  assert.equal(c.services.instructor, undefined, "Instructor service must not be deployed");
  assert.equal(c.services.store.environment.INSTRUCTOR_PASSWORD, undefined);
  assert.equal(c.services.migrate.environment.RVU_INTEGRATED_MODE, "1");
  assert.equal(c.services.store.environment.RVU_SINGLE_LOGIN, "1");
  assert.equal(
    c.services.store.environment.APP_ORIGIN,
    "http://localhost:8081",
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

test("all 18 vulnerability families are present in one student-facing commerce experience",async()=>{
  const {activeTrainingProfiles,hasWeakness}=await import("../apps/api/src/policy.ts");
  const storefront=await readFile("apps/web/src/App.tsx","utf8");
  const services=await readFile("apps/web/src/Services.tsx","utf8");
  const api=await readFile("apps/api/src/app.ts","utf8");
  const workflows=await readFile("apps/api/src/extendedLabs.ts","utf8");
  const identifiers=[
    "B01","B02","B03","B04","B05","B06","B07","B08","B09","B10","B11","B12",
    "R01","R02","R03","R04","R05","R06",
  ];
  assert.equal(identifiers.length,18);
  for(const id of identifiers){
    assert.ok(activeTrainingProfiles.includes(id as typeof activeTrainingProfiles[number]),id+" not configured");
    assert.equal(hasWeakness("open-playground",id),true,id+" disabled");
    assert.equal(hasWeakness("secure-baseline",id),false,id+" should not affect historical negative controls");
  }
  const visibleContracts=[
    [storefront,["/cart/items","/cart/coupon","/cart/voucher","/checkout/prepare","/checkout/confirm","Gift cards"]],
    [services,["email.update","password.maintain","legacy.register","workspace.admin","corporate.orders",
      "notification.encrypt","remember.login","support.queue","workspace.approvals","parser.register","reset.request","reset.complete",
      "/business/checkout","/business/email-change","/business/registration","registration.confirm",
      "/business/login-verification"]],
    [api,["/api/cart/items","/api/checkout/confirm","/api/gift-cards/redeem"]],
    [workflows,["corporate.orders","legacy.register","password.maintain","workspace.admin",
      "notification.encrypt","remember.login","parser.register","reset.request","reset.complete",
      "registration.confirm"]],
  ] as const;
  for(const [source,terms] of visibleContracts)for(const term of terms)
    assert.ok(source.includes(term),"Missing storefront workflow: "+term);
  assert.ok(!services.includes("service-request"),"Do not expose editable JSON lab request forms to learners");
  assert.ok(!storefront.includes("instructor console"),"Student storefront reveals an instructor panel");
});

test("business services are embedded in My Account, not a separate website",async()=>{
  const app=await readFile("apps/web/src/App.tsx","utf8");
  const entry=await readFile("apps/web/src/main.tsx","utf8");
  const services=await readFile("apps/web/src/Services.tsx","utf8");
  assert.ok(app.includes('<AccountServices user={session.user} />'));
  assert.ok(app.includes('id: "services"'));
  assert.ok(!app.includes('href="/services"'));
  assert.ok(!entry.includes("<Services"));
  assert.ok(entry.includes("<App />"));
  assert.ok(services.includes("export function AccountServices"));
  assert.ok(!services.includes("className=\"service-page\""));
});
