import {before, after, test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {PGlite} from "@electric-sql/pglite";
import {PGLiteSocketServer} from "@electric-sql/pglite-socket";
import {migrate} from "../apps/api/src/migrate.ts";
import {buildApp} from "../apps/api/src/app.ts";
import {createPool} from "../apps/api/src/db.ts";

type Client={cookie:string;csrf:string};
const alex:Client={cookie:"",csrf:""},admin:Client={cookie:"",csrf:""},target:Client={cookie:"",csrf:""};
const password="Local-Instructor-Test-2026!";
let url=process.env.TEST_DATABASE_URL??"",wasm:PGlite|undefined,socket:PGLiteSocketServer|undefined;
let store:Awaited<ReturnType<typeof buildApp>>,control:Awaited<ReturnType<typeof buildApp>>;
let loginCounter=0;
const pause=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
async function call(c:Client,method:string,path:string,body?:unknown,status=200){
  const isAdmin=path.startsWith("/api/instructor");
  const r=await (isAdmin?control:store).app.inject({
    method:method as "POST",
    url:path,
    // Each instructor reset starts a fresh fictional learner client. Avoid
    // conflating its global per-IP login limiter with the R02 quota experiment.
    remoteAddress:path==="/api/login"?"192.0.2."+String(10+(loginCounter++%240)):"127.0.0.1",
    headers:{origin:isAdmin?"http://127.0.0.1:8081":"http://localhost:8080",cookie:c.cookie,"x-csrf-token":c.csrf},
    ...(body===undefined?{}:{payload:body as object}),
  });
  assert.equal(r.statusCode,status,method+" "+path+" "+r.body);
  const cookie=r.headers["set-cookie"];
  if(cookie)c.cookie=(Array.isArray(cookie)?cookie[0]:cookie).split(";")[0];
  const response=r.json();
  if(response.csrf)c.csrf=response.csrf;
  return response;
}
async function fresh(profile:string) {
  await call(admin,"POST","/api/instructor/reset",{confirm:"RESET",profile});
  alex.cookie="";alex.csrf="";
  await call(alex,"POST","/api/login",{email:"alex@learner.rvu.test",password:"Studio-Local-2026!"});
}
async function act(action:string,fields:Record<string,unknown>={},status=200) {
  return call(alex,"POST","/api/business/actions",{action,...fields},status);
}
async function latestCode(){
  const inbox=await call(alex,"GET","/api/inbox");
  return String(inbox.messages[0]?.body??"").split(": ").at(-1)?.trim()??"";
}
async function proof(profile:string){
  const result=await call(admin,"GET","/api/instructor/evidence");
  return Number(result.metrics[profile]??0);
}
before(async()=>{
  if(!url){
    wasm=await PGlite.create();
    socket=new PGLiteSocketServer({db:wasm,host:"127.0.0.1",port:0,maxConnections:10});
    await socket.start();
    url="postgresql://postgres:postgres@"+socket.getServerConn()+"/postgres";
  }
  const bootstrap=createPool(url);
  await bootstrap.query("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='rvu_store') THEN CREATE ROLE rvu_store; END IF; IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='rvu_control') THEN CREATE ROLE rvu_control; END IF; END $$");
  await bootstrap.end();
  await migrate(url,password);
  store=await buildApp({databaseUrl:url,origin:"http://localhost:8080",cookieSecure:false,mode:"store"});
  control=await buildApp({databaseUrl:url,origin:"http://127.0.0.1:8081",cookieSecure:false,mode:"control"});
  if(process.env.TEST_DATABASE_URL){
    store.pool.options.verify=(client,done)=>{void client.query("SET ROLE rvu_store").then(()=>done(),done);};
    control.pool.options.verify=(client,done)=>{void client.query("SET ROLE rvu_control").then(()=>done(),done);};
  }
  await call(admin,"POST","/api/instructor/login",{username:"instructor",password});
});
after(async()=>{await store?.app.close();await control?.app.close();await socket?.stop();await wasm?.close();});


test("instructor proof details are isolated from unauthenticated and student services",async()=>{
  await fresh("B03");
  await act("email.update",{address:"buyer@corp.rvu.test"});
  await act("corporate.orders");
  const evidenceLog=await call(admin,"GET","/api/instructor/evidence/events");
  assert.ok(evidenceLog.events.some((e:{scenario:string})=>e.scenario==="B03"));
  const unauthorized=await control.app.inject({method:"GET",url:"/api/instructor/evidence/events",headers:{origin:"http://127.0.0.1:8081"}});
  assert.equal(unauthorized.statusCode,401);
  const student=await store.app.inject({method:"GET",url:"/api/instructor/evidence/events",headers:{origin:"http://localhost:8080",cookie:alex.cookie}});
  assert.equal(student.statusCode,404);
  await fresh("secure-baseline");
  assert.equal((await call(admin,"GET","/api/instructor/evidence/events")).events.length,0);
});
test("baseline denies negative quantities and signed-32 arithmetic wrap",async()=>{
  await fresh("secure-baseline");
  await act("cart.reconcile",{lines:[{sku:"vista-27",quantity:1},{sku:"arc-light",quantity:-1}]},409);
  await act("bulk.invoice",{quantity:85900},409);
  await act("email.update",{address:"fake@corp.rvu.test"},409);
  await act("workspace.admin",{},403);
  assert.equal(await proof("B02"),0);
  const neutral=await call(alex,"GET","/api/business/status");
  assert.equal(neutral.profile,undefined);
  assert.equal(neutral.states,undefined);
  assert.equal(neutral.proofs,undefined);
});

test("baseline isolates password, notification, parser and legacy storage controls",async()=>{
  await fresh("secure-baseline");
  await act("password.maintain",{targetEmail:"target@learner.rvu.test",newPassword:"Invalid-Target-2026!"},403);
  const encrypted=await act("notification.encrypt",{body:"A".repeat(9)+"kind=remember&user=store-admin"});
  const forged=Buffer.from(encrypted.ciphertext,"hex").subarray(32).toString("hex");
  await act("remember.login",{ciphertext:forged},403);
  await act("legacy.register",{address:"A".repeat(241)+"@corp.rvu.test@learner.rvu.test"},400);
  const encoded="=?UTF-8?B?"+Buffer.from("alex@learner.rvu.test").toString("base64")+"?=@corp.rvu.test";
  await act("parser.register",{address:encoded},409);
});
test("secure baseline rejects a cart update during authorization",{
  skip:!process.env.TEST_DATABASE_URL?"Requires real parallel PostgreSQL sessions":false,
},async()=>{
  await fresh("secure-baseline");
  await call(alex,"PUT","/api/cart/items",{productId:"arc-light",quantity:1});
  const pending=call(alex,"POST","/api/business/checkout",{delayMs:200},409);
  await pause(40);
  await call(alex,"PUT","/api/cart/items",{productId:"vista-27",quantity:1});
  await pending;
  assert.equal((await call(alex,"GET","/api/wallet")).balance,1500000);
});
test("secure baseline rejects corporate confirmation before provisioning completes",{
  skip:!process.env.TEST_DATABASE_URL?"Requires real parallel PostgreSQL sessions":false,
},async()=>{
  await fresh("secure-baseline");
  const registrationId=randomUUID();
  const pending=call(alex,"POST","/api/business/registration",{email:"hire@corp.rvu.test",registrationId,delayMs:200});
  await pause(40);
  await act("registration.confirm",{registrationId,code:[""]},409);
  await pending;
  await act("corporate.orders",{},403);
});
test("B02: negative quantity offsets a positive delivered product and debits real wallet",async()=>{
  await fresh("B02");
  const sale=await act("cart.reconcile",{lines:[{sku:"vista-27",quantity:1},{sku:"arc-light",quantity:-1}]});
  assert.equal(sale.delivered,680000);
  assert.equal(sale.charged,540000);
  assert.equal((await call(alex,"GET","/api/wallet")).balance,960000);
  assert.equal(await proof("B02"),1);
});
test("B03: updating a trusted identity gives access to corporate order data",async()=>{
  await fresh("B03");
  await act("email.update",{address:"buyer@corp.rvu.test"});
  const orders=await act("corporate.orders");
  assert.equal(orders.orders[0].id,"CORP-DEMO-1001");
  assert.equal(await proof("B03"),1);
});
test("B05: an explicitly converted 32-bit invoice wraps while ledger tracks charge",async()=>{
  await fresh("B05");
  const receipt=await act("bulk.invoice",{quantity:85900});
  assert.equal(receipt.delivered,4295000000);
  assert.equal(receipt.charged,32704);
  assert.equal(await proof("B05"),1);
});
test("B06: legacy storage/truncation identity differs from an owned delivery mailbox",async()=>{
  await fresh("B06");
  const raw="A".repeat(241)+"@corp.rvu.test"+"@learner.rvu.test";
  const created=await act("legacy.register",{address:raw});
  assert.equal(created.storedAddress.length,255);
  assert.ok(created.storedAddress.endsWith("@corp.rvu.test"));
  await act("legacy.verify",{code:await latestCode()});
  const corporate=await act("corporate.orders");
  assert.equal(corporate.orders.length,1);
  assert.equal(await proof("B06"),1);
});
test("B07: missing currentPassword chooses unsafe support branch and changes a different real account",async()=>{
  await fresh("B07");
  const changed=await act("password.maintain",{targetEmail:"target@learner.rvu.test",newPassword:"Altered-Target-2026!"});
  assert.equal(changed.usedSupportBranch,true);
  await call(target,"POST","/api/login",{email:"target@learner.rvu.test",password:"Altered-Target-2026!"});
  assert.equal(await proof("B07"),1);
});
test("B09: an unselected workspace gets administrator access but explicit buyer context does not",async()=>{
  await fresh("B09");
  assert.equal((await act("workspace.admin")).approved,true);
  assert.equal(await proof("B09"),1);
  const approval=(await store.pool.query("SELECT data FROM store.lab_states WHERE scenario='B09' AND run_id=(SELECT active_run FROM store.runtime)")).rows[0].data;
  assert.equal(approval.adminApproved,true);
  await act("workspace.select");
  await act("workspace.admin",{},403);
});
test("B11: ECB notification oracle allows extracted encrypted blocks to become an admin credential",async()=>{
  await fresh("B11");
  const oracle=await act("notification.encrypt",{body:"A".repeat(9)+"kind=remember&user=store-admin"});
  const forged=Buffer.from(oracle.ciphertext,"hex").subarray(32).toString("hex");
  assert.equal((await act("remember.login",{ciphertext:forged})).authenticated,true);
  await act("remember.login",{ciphertext:oracle.ciphertext},403);
  assert.equal(await proof("B11"),1);
});
test("B12: encoded-word parser routes a corporate-validated address into the owned inbox",async()=>{
  await fresh("B12");
  const raw="=?UTF-8?B?"+Buffer.from("alex@learner.rvu.test").toString("base64")+"?=@corp.rvu.test";
  const prepared=await act("parser.register",{address:raw});
  assert.equal(prepared.deliveryMailbox,"alex@learner.rvu.test");
  await act("parser.verify",{code:await latestCode()});
  assert.equal((await act("corporate.orders")).orders.length,1);
  assert.equal(await proof("B12"),1);
});
test("R02: native PostgreSQL counts actual password checks beyond the three-attempt policy",{
  skip:!process.env.TEST_DATABASE_URL?"Concurrent authentications require native PostgreSQL":false,
},async()=>{
  await fresh("R02");
  const entries=await Promise.all(Array.from({length:5},()=>call(alex,"POST","/api/business/login-verification",{password:"Target-Only-2026!",delayMs:120})));
  assert.equal(entries.filter(x=>x.authenticated).length,5);
  assert.ok(await proof("R02")>=1);
  assert.equal((await act("auth.target")).authenticated,true);
});
test("R03: adding a product during payment produces durable undercharged fulfillment",{
  skip:!process.env.TEST_DATABASE_URL?"Independent checkout/cart requests require native PostgreSQL":false,
},async()=>{
  await fresh("R03");
  await call(alex,"PUT","/api/cart/items",{productId:"arc-light",quantity:1});
  const pending=call(alex,"POST","/api/business/checkout",{delayMs:220});
  await pause(60);
  await call(alex,"PUT","/api/cart/items",{productId:"vista-27",quantity:1});
  const sale=await pending;
  assert.equal(sale.charged,140000);
  assert.equal(sale.delivered,820000);
  assert.ok(await proof("R03")>0);
});
test("R04: two overlapping email-change workers deliver the new corporate verification to old owned mailbox",{
  skip:!process.env.TEST_DATABASE_URL?"Parallel email transactions require native PostgreSQL":false,
},async()=>{
  await fresh("R04");
  const owned=call(alex,"POST","/api/business/email-change",{address:"alex@learner.rvu.test",delayMs:240});
  await pause(35);
  const corporate=call(alex,"POST","/api/business/email-change",{address:"buyer@corp.rvu.test",delayMs:50});
  await Promise.all([owned,corporate]);
  await act("email.confirm",{code:await latestCode()});
  await act("corporate.orders");
  assert.ok(await proof("R04")>0);
});
test("R05: recovery tokens generated in one time tick can reset a different fictional account",async()=>{
  await fresh("R05");
  let changed=false;
  for(let attempt=0;attempt<5&&!changed;attempt++){
    await act("reset.request",{email:"alex@learner.rvu.test"});
    const code=await latestCode();
    await act("reset.request",{email:"target@learner.rvu.test"});
    const result=await act("reset.complete",{email:"target@learner.rvu.test",code,newPassword:"Recovered-Target-2026!"},200).catch(e=>{
      if(String(e).includes("400"))return null;
      throw e;
    });
    changed=!!result;
  }
  assert.ok(changed,"Two tokens should collide during at least one same-second window");
  await call(target,"POST","/api/login",{email:"target@learner.rvu.test",password:"Recovered-Target-2026!"});
  assert.equal(await proof("R05"),1);
});
test("R06: registration is exploitable only while token provisioning is incomplete",{
  skip:!process.env.TEST_DATABASE_URL?"Partial-state interleaving requires native PostgreSQL":false,
},async()=>{
  await fresh("R06");
  const registrationId=randomUUID();
  const pending=call(alex,"POST","/api/business/registration",{email:"hire@corp.rvu.test",registrationId,delayMs:260});
  await pause(60);
  const confirmed=await act("registration.confirm",{registrationId,code:[""]});
  assert.equal(confirmed.verified,true);
  await pending;
  const db=await store.pool.query("SELECT verified,completed FROM store.lab_registrations WHERE id=$1",[registrationId]);
  assert.equal(db.rows[0].verified,true);
  assert.equal(db.rows[0].completed,true);
  assert.equal((await act("corporate.orders")).orders.length,1);
  assert.ok(await proof("R06")>=1);
});

test("integrated storefront keeps multiple independent business weaknesses active together",async()=>{
  await fresh("open-playground");
  const account=await act("email.update",{address:"buyer@corp.rvu.test"});
  assert.equal(account.verified,true);
  assert.equal((await act("corporate.orders")).orders.length,1);
  const cartSale=await act("cart.reconcile",{lines:[{sku:"vista-27",quantity:1},{sku:"arc-light",quantity:-1}]});
  assert.equal(cartSale.charged,540000);
  const bulk=await act("bulk.invoice",{quantity:85900});
  assert.equal(bulk.charged,32704);
  assert.equal((await act("workspace.admin")).approved,true);
  const note=await act("notification.encrypt",{body:"A".repeat(9)+"kind=remember&user=store-admin"});
  const forged=Buffer.from(note.ciphertext,"hex").subarray(32).toString("hex");
  assert.equal((await act("remember.login",{ciphertext:forged})).authenticated,true);
  for(const id of ["B02","B03","B05","B09","B11"])assert.ok(await proof(id)>0,id+" evidence missing");
  const status=await call(alex,"GET","/api/business/status");
  assert.equal(status.profile,undefined);
  assert.equal(status.evidence,undefined);
});
