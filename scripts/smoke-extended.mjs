// CI-only integration checks for the shared fictional vulnerable storefront.
// Never send these requests to a remotely hosted application.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
assert.equal(process.env.RVU_DISPOSABLE_CI, "yes", "Disposable CI required");
const origin="http://localhost:8081";
let cookie="",csrf="";
async function call(method,path,payload,expected=200,extraHeaders={}) {
  const res=await fetch(origin+path,{
    method,
    headers:{Origin:origin,Cookie:cookie,"X-CSRF-Token":csrf,...(payload===undefined?{}:{"Content-Type":"application/json"}),...extraHeaders},
    ...(payload===undefined?{}:{body:JSON.stringify(payload)}),
  });
  const text=await res.text();
  assert.equal(res.status,expected,method+" "+path+": "+text);
  const saved=res.headers.get("set-cookie");
  if(saved)cookie=saved.split(";")[0];
  const data=JSON.parse(text);
  if(data.csrf)csrf=data.csrf;
  return data;
}
const act=(action,values={})=>call("POST","/api/business/actions",{action,...values});
const pause=ms=>new Promise(done=>setTimeout(done,ms));
await call("POST","/api/login",{email:"alex@learner.rvu.test",password:"Studio-Local-2026!"});
const status=await call("GET","/api/business/status");
assert.equal(status.profile,undefined,"Do not leak internal vulnerability config");
await call("POST","/api/cart/items",{productId:"vista-27",quantity:1,price:6800});
const quantity=await call("POST","/api/cart/items",{productId:"arc-light",quantity:-1});
assert.equal(quantity.total,5400);
const reconciled=await call("POST","/api/checkout",{
  cartVersion:quantity.version,
  delivery:{fullName:"Alex Rowan",address:"12 Sample Studio Lane",city:"Sample City"},
},200,{"Idempotency-Key":randomUUID()});
assert.equal(Number(reconciled.total),5400);
assert.equal(reconciled.items.length,1);
assert.equal(Number(reconciled.items[0].unit_price),6800);
// Repeated add-to-cart requests overflow a legacy signed 32-bit total.
for(let n=0;n<63;n++)await call("POST","/api/cart/items",{productId:"vista-27",quantity:99});
const bulk=await call("POST","/api/cart/items",{productId:"vista-27",quantity:80});
assert.equal(bulk.items[0].quantity,6317);
assert.equal(bulk.total,5927);
const bulkOrder=await call("POST","/api/checkout",{
  cartVersion:bulk.version,
  delivery:{fullName:"Alex Rowan",address:"12 Sample Studio Lane",city:"Sample City"},
},200,{"Idempotency-Key":randomUUID()});
assert.equal(Number(bulkOrder.total),5927);
assert.equal(Number(bulkOrder.items[0].quantity),6317);
await act("email.update",{address:"buyer@corp.rvu.test"});
assert.equal((await act("corporate.orders")).orders.length,1);
assert.equal((await act("workspace.admin")).approved,true);
const notification=await act("notification.encrypt",{body:"A".repeat(9)+"kind=remember&user=store-admin"});
const forged=Buffer.from(notification.ciphertext,"hex").subarray(32).toString("hex");
assert.equal((await act("remember.login",{ciphertext:forged})).authenticated,true);
const long="A".repeat(241)+"@corp.rvu.test@learner.rvu.test";
await act("legacy.register",{address:long});
const inbox=await call("GET","/api/inbox");
const code=String(inbox.messages[0].body).split(": ").at(-1).trim();
await act("legacy.verify",{code});
await call("PUT","/api/cart/items",{productId:"arc-light",quantity:1});
const pending=call("POST","/api/business/checkout",{delayMs:250});
await pause(55);
await call("PUT","/api/cart/items",{productId:"vista-27",quantity:1});
const moved=await pending;
assert.ok(moved.delivered>moved.charged);
// Ordinary add-to-bag includes a client-supplied item price, just like
// PortSwigger's client-price trust lesson (not an instructor-selected API).
const quoted=await call("POST","/api/cart/items",{productId:"arc-light",quantity:1,price:100});
assert.equal(Number(quoted.items.find(x=>x.id==="arc-light").price),100);
const cheap=await call("POST","/api/checkout",{
  cartVersion:quoted.version,
  delivery:{fullName:"Alex Rowan",address:"12 Sample Studio Lane",city:"Sample City"},
},200,{"Idempotency-Key":randomUUID()});
assert.equal(Number(cheap.total),100);
assert.ok(cheap.items.some(x=>x.product_id==="arc-light" && Number(x.unit_price)===100));
const regId=randomUUID();
const registration=call("POST","/api/business/registration",{email:"hire@corp.rvu.test",registrationId:regId,delayMs:260});
await pause(60);
assert.equal((await act("registration.confirm",{registrationId:regId,code:[""]})).verified,true);
await registration;
const raceLogins=await Promise.all(Array.from({length:5},()=>call("POST","/api/business/login-verification",{password:"Target-Only-2026!",delayMs:280})));
assert.equal(raceLogins.filter(x=>x.authenticated).length,5);
console.log("PASS: integrated storefront: B01, B02, B03, B05, B06, B09, B11, R02, R03, R06 and no profile disclosure");
