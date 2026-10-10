// CI-only exercise of selected instructor profiles via the actual nginx and
// Docker stack. Deliberately refuses to run against a student's live workspace.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

assert.equal(process.env.RVU_DISPOSABLE_CI, "yes",
  "Refusing to reset training runs outside disposable CI");
const password = process.env.RVU_CI_INSTRUCTOR_PASSWORD;
assert.ok(password?.length >= 16, "Set the disposable CI instructor password");

const storeOrigin = "http://localhost:8080";
const instructorOrigin = "http://127.0.0.1:8081";
const instructor = { cookie: "", csrf: "" };
let student = { cookie: "", csrf: "" };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function request(client, origin, method, path, body, expected=200) {
  const result=await fetch(origin+path, {
    method,
    headers:{
      Origin:origin,
      Cookie:client.cookie,
      "X-CSRF-Token":client.csrf,
      ...(body===undefined?{}:{"Content-Type":"application/json"}),
    },
    ...(body===undefined?{}:{body:JSON.stringify(body)}),
  });
  const text=await result.text();
  assert.equal(result.status, expected, method+" "+path+" expected "+expected+" got "+result.status+": "+text);
  const cookies=result.headers.get("set-cookie");
  if(cookies)client.cookie=cookies.split(";")[0];
  const data=JSON.parse(text);
  if(data.csrf)client.csrf=data.csrf;
  return data;
}
const admin=(method,path,body,status)=>request(instructor,instructorOrigin,method,"/api/instructor"+path,body,status);
const shop=(method,path,body,status)=>request(student,storeOrigin,method,"/api"+path,body,status);
const act=(action,fields={},status=200)=>shop("POST","/lab/action",{action,...fields},status);
async function reset(profile) {
  const previous=student.cookie;
  const changed=await admin("POST","/reset",{confirm:"RESET",profile});
  assert.equal(changed.profile,profile);
  if(previous)assert.equal((await shop("GET","/session")).user,null,
    "Old run session must be invalidated by reset");
  student={cookie:"",csrf:""};
  const user=await shop("POST","/login",{
    email:"alex@learner.rvu.test",password:"Studio-Local-2026!"
  });
  assert.equal(user.user?.verified,true);
}
async function proof(profile){
  const data=await admin("GET","/evidence");
  assert.equal(data.profile,profile);
  assert.ok(Number(data.metrics[profile])>0,
    "Missing persisted server-side proof for "+profile);
}
await admin("POST","/login",{username:"instructor",password});
const probes=[];
async function check(profile,fn) {
  await reset(profile);
  await fn();
  await proof(profile);
  probes.push(profile);
}

// Financial reconciliation: the student receives an expensive product,
// but the actual ledger records the underpayment.
await check("B02",async()=>{
  const sale=await act("cart.reconcile",{
    lines:[{sku:"vista-27",quantity:1},{sku:"arc-light",quantity:-1}]
  });
  assert.equal(sale.delivered,680000);
  assert.equal(sale.charged,540000);
});

// Identity-change trust boundary and corporate record access.
await check("B03",async()=>{
  await act("email.update",{address:"buyer@corp.rvu.test"});
  const result=await act("corporate.orders");
  assert.equal(result.orders.length,1);
});

// Native Node legacy integer arithmetic and a durable ledger charge.
await check("B05",async()=>{
  const result=await act("bulk.invoice",{quantity:85900});
  assert.equal(result.charged,32704);
  assert.equal(result.delivered,4295000000);
});

// Outbox delivery, verification and mismatched legacy identity.
await check("B06",async()=>{
  await act("legacy.register",{
    address:"A".repeat(241)+"@corp.rvu.test@learner.rvu.test"
  });
  const inbox=await shop("GET","/inbox");
  const code=String(inbox.messages[0].body).split(": ").at(-1).trim();
  await act("legacy.verify",{code});
  const result=await act("corporate.orders");
  assert.equal(result.orders.length,1);
});

// Incomplete workspace context must not count as a selected buyer role.
await check("B09",async()=>{
  assert.equal((await act("workspace.admin")).approved,true);
  await act("workspace.select");
  await act("workspace.admin",{},403);
});

// AES-ECB crypto purpose confusion: a notification's encrypted blocks
// incorrectly become an accepted remembered administrator credential.
await check("B11",async()=>{
  const oracle=await act("notification.encrypt",{
    body:"A".repeat(9)+"kind=remember&user=store-admin"
  });
  const forged=Buffer.from(oracle.ciphertext,"hex").subarray(32).toString("hex");
  assert.equal((await act("remember.login",{ciphertext:forged})).authenticated,true);
});

// Two endpoints interleave: the latest cart differs from the paid snapshot.
await check("R03",async()=>{
  await shop("PUT","/cart/items",{productId:"arc-light",quantity:1});
  const pending=shop("POST","/lab/race/checkout",{delayMs:250});
  await wait(65);
  await shop("PUT","/cart/items",{productId:"vista-27",quantity:1});
  const result=await pending;
  assert.equal(result.charged,140000);
  assert.equal(result.delivered,820000);
});

// A partial account is visible before its token initialization completes.
await check("R06",async()=>{
  const registrationId=randomUUID();
  const pending=shop("POST","/lab/race/registration",{
    email:"hire@corp.rvu.test",registrationId,delayMs:300
  });
  await wait(70);
  assert.equal((await act("registration.confirm",{
    registrationId,code:[""]
  })).verified,true);
  await pending;
  assert.equal((await act("corporate.orders")).orders.length,1);
});

// Leave CI data in the safe baseline, and prove evidence cannot cross runs.
await admin("POST","/reset",{confirm:"RESET",profile:"secure-baseline"});
assert.equal((await shop("GET","/session")).user,null);
const final=await admin("GET","/evidence");
for(const p of probes)assert.equal(Number(final.metrics[p]),0);
console.log("PASS: real nginx → isolated instructor reset → PostgreSQL flows for "+
  probes.join(", ")+" → clean secure baseline");
