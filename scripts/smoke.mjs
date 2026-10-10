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
const signedIn = await request("/api/login", "POST", { username: "rvu", password: "rvucamp" });
assert.equal(signedIn.user.verified, true);
assert.match(signedIn.user.colleagueEmail,/^colleague-[a-f0-9]{32}@learner\.rvu\.test$/);
const directory = await request("/api/business/status");
assert.equal(directory.profile, undefined, "Learner must not discover internal profile");
assert.equal(directory.states, undefined, "Learner must not receive lab state or tokens");
const freshQuote=await request("/api/quotes","POST",{dock:true,support:true});
const modifiedQuote=await fetch(origin+"/api/quotes/"+freshQuote.id+"/accept",{
  method:"POST",
  headers:{Origin:origin,Cookie:cookie,"X-CSRF-Token":csrf,"Content-Type":"application/json"},
  body:JSON.stringify({quotedTotal:100}),
});
assert.equal(modifiedQuote.status,409,"Storefront custom quotes must be server-priced");

const unregistered = await fetch(origin + "/api/register", {
  method:"POST",
  headers: {Origin:origin,"Content-Type":"application/json"},
  body: JSON.stringify({name:"Unknown",email:"new@learner.rvu.test",password:"Not-Allowed-2026!"}),
});
assert.equal(unregistered.status, 404, "Self-registration must be disabled");
const former = await fetch(origin + "/api/login", {
  method:"POST",
  headers: {Origin:origin,"Content-Type":"application/json"},
  body: JSON.stringify({email:"alex@learner.rvu.test",password:"Studio-Local-2026!"}),
});
assert.equal(former.status, 401, "The previous demo login must be disabled");
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
  "PASS: one RVU login → private workspace → no registration → coupon, payment, refund and logout.",
);
