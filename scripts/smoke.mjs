// Run on the host after Compose is healthy. Creates one fictional customer/order;
// refunds the order, signs out, and does not reset any existing run.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const origin = "http://localhost:8080";
let cookie = "",
  csrf = "";
async function request(path, method = "GET", body, headers = {}) {
  const r = await fetch(origin + path, {
    method,
    headers: {
      Origin: origin,
      Cookie: cookie,
      "X-CSRF-Token": csrf,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.equal(r.status, 200, `${method} ${path}: ${await r.clone().text()}`);
  const session = r.headers.get("set-cookie");
  if (session) cookie = session.split(";")[0];
  const data = await r.json();
  if (data.csrf) csrf = data.csrf;
  return data;
}
const html = await fetch(origin);
assert.equal(html.status, 200);
assert.match(await html.text(), /RVU Commerce/);
assert.ok(html.headers.get("content-security-policy"));
const servicesPage = await fetch(origin + "/services");
assert.equal(servicesPage.status, 200, "Service portal SPA route must be published");
assert.match(await servicesPage.text(), /RVU Commerce/);
// Only the storefront is published. Instructor APIs are not deployed.
const forbidden = await fetch(origin + "/api/instructor/session");
assert.equal(forbidden.status, 404);
const catalog = await request("/api/catalog");
assert.equal(catalog.products.length, 8);
assert.equal(catalog.promotions.length, 3, "Integrated storefront exposes the store promotion family");
await request("/api/register", "POST", {
  name: "Local Smoke Customer",
  email: `smoke-${randomUUID().slice(0, 8)}@learner.rvu.test`,
  password: "Fictional-Smoke-2026!",
});
const directory = await request("/api/business/status");
assert.equal(directory.profile, undefined, "Learner must not discover internal profile");
assert.equal(directory.states, undefined, "Learner must not receive lab state or tokens");
const inbox = await request("/api/inbox");
await request("/api/verify", "POST", {
  code: inbox.messages[0].body.split(": ")[1],
});
await request("/api/cart/items", "PUT", { productId: "form-75", quantity: 1 });
const cart = await request("/api/cart/coupon", "POST", { code: "WELCOME10" });
const order = await request(
  "/api/checkout",
  "POST",
  {
    cartVersion: cart.version,
    delivery: {
      fullName: "Local Smoke Customer",
      address: "12 Fictional Studio Lane",
      city: "Sample City",
    },
  },
  { "Idempotency-Key": randomUUID() },
);
assert.equal(Number(order.total), 198000);
assert.equal((await request("/api/wallet")).balance, 1302000);
await request(`/api/orders/${order.id}/refund`, "POST", {});
assert.equal((await request("/api/wallet")).balance, 1500000);
await request("/api/logout", "POST", {});
assert.equal((await request("/api/session")).user, null);
console.log(
  "PASS: proxy → frontend assets → API → PostgreSQL registration, email, coupon, settlement, refund and logout.",
);
