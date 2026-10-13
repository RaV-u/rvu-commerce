// Disposable extended-lab regression: covers B07, B12, R04, R05 and unsafe-input rejection.
// Runs only against a fresh local CI Docker stack; never target a live user workspace.
import assert from "node:assert/strict";
assert.equal(process.env.RVU_DISPOSABLE_CI,"yes","This check is CI only");
const base="http://localhost:8081";
const actors=["rvu","rvu_2"].map(username=>({username,cookie:"",csrf:"",email:username+"@learner.rvu.test"}));
let assertions=0;
async function request(user,method,path,data,status=200,extraHeaders={}){
  const r=await fetch(base+path,{
    method,headers:{Origin:base,Cookie:user.cookie,"X-CSRF-Token":user.csrf,
      ...(data===undefined?{}:{"Content-Type":"application/json"}),...extraHeaders},
    ...(data===undefined?{}:{body:JSON.stringify(data)})
  });
  const raw=await r.text();
  assert.equal(r.status,status,method+" "+path+" "+raw);
  const cookie=r.headers.get("set-cookie");
  if(cookie)user.cookie=cookie.split(";")[0];
  const obj=JSON.parse(raw);
  if(obj.csrf)user.csrf=obj.csrf;
  assertions++;
  return obj;
}
const pause=ms=>new Promise(done=>setTimeout(done,ms));
const act=(user,action,payload={})=>request(user,"POST","/api/business/actions",{action,...payload});
async function latestCode(user,subject){
  const inbox=await request(user,"GET","/api/inbox");
  const message=inbox.messages.find(m=>m.subject===subject);
  assert.ok(message,"Missing "+subject+" from "+user.email);
  const code=String(message.body).split("Your verification code: ").at(-1).trim();
  assert.ok(code.length>10,"Code missing from "+subject);
  return code;
}
await Promise.all(actors.map(async actor=>{
  const s=await request(actor,"POST","/api/login",{username:actor.username,password:"rvucamp"});
  assert.equal(s.user.email,actor.email);
  assert.ok(s.user.verified);
}));
const [owner,colleague]=actors;
// Verify that normal account-notification delivery appears in the private Inbox.
const inboxBefore=(await request(owner,"GET","/api/inbox")).messages.length;
const sent=await act(owner,"legacy.register",{address:owner.email});
assert.equal(sent.codeSent,true);
const inboxAfter=await request(owner,"GET","/api/inbox");
assert.equal(inboxAfter.messages.length,inboxBefore+1);
const verification=await latestCode(owner,"Business address verification");
assert.equal((await act(owner,"legacy.verify",{code:verification})).verified,true);
console.log("PASS: account registration verification reaches the account Inbox");

// B07: intentionally unsafe support branch can change the second identity's password.
const changed=await act(owner,"password.maintain",{
  targetEmail:colleague.email,newPassword:"RVU-Other-Account-2026!"
});
assert.equal(changed.usedSupportBranch,true);
const login=await request(owner,"POST","/api/business/login-verification",{
  email:colleague.email,password:"RVU-Other-Account-2026!",delayMs:50
});
assert.equal(login.authenticated,true);
console.log("PASS B07: support branch changes other account password");
// B12: alternate decoding of encoded contact redirects verification to the owned mailbox.
const encoded="=?utf-7?q?rvu&AEA-learner.rvu.test&ACA-?=@corp.rvu.test";
const invited=await act(owner,"parser.register",{address:encoded});
assert.equal(invited.deliveryMailbox,owner.email);
const parserCode=await latestCode(owner,"Corporate verification");
assert.equal((await act(owner,"parser.verify",{code:parserCode})).verified,true);
assert.equal((await act(owner,"corporate.orders")).orders[0].id,"CORP-DEMO-1001");
console.log("PASS B12: parser-boundary contact verified via owned inbox");
// R04: slow owned-mailbox delivery sees the token stored by the newer corporate request.
const slow=request(owner,"POST","/api/business/email-change",{address:owner.email,delayMs:350});
await pause(50);
const quick=request(owner,"POST","/api/business/email-change",{address:"manager@corp.rvu.test",delayMs:60});
await quick;
const outcome=await slow;
assert.equal(outcome.delivered,true);
const emailCode=await latestCode(owner,"Email change confirmation");
const promoted=await act(owner,"email.confirm",{code:emailCode});
assert.equal(promoted.address,"manager@corp.rvu.test");
assert.equal(promoted.verified,true);
console.log("PASS R04: corporate change confirmed using old owned mailbox");
// R05: reset tokens derived from the same time interval can cross users.
// Start both requests together to minimize timing variability.
let recovered=false;
for(let attempt=0;attempt<5 && !recovered;attempt++){
  await Promise.all([
    act(owner,"reset.request",{email:owner.email}),
    act(owner,"reset.request",{email:colleague.email})
  ]);
  const code=await latestCode(owner,"Account recovery");
  const result=await request(owner,"POST","/api/business/actions",{
    action:"reset.complete",email:colleague.email,code,
    newPassword:"Recovered-Other-Account-2026!"
  },200).catch(e=>e);
  if(result && result.updated===true) recovered=true;
  else {
    if(attempt===4) throw new Error("R05 did not reproduce after five synchronized attempts");
    await pause(1050);
  }
}
assert.ok(recovered);
console.log("PASS R05: time-derived reset used for other account");
// Malformed and unexpected customer requests fail, with correct origin and CSRF boundaries.
await request(owner,"POST","/api/cart/items",{productId:"form-75",quantity:1.5},400);
await request(owner,"POST","/api/cart/items",{productId:"form-75",quantity:99999},400);
await request(owner,"PUT","/api/cart/items",{productId:"arc-light",quantity:-1},400);
await request(owner,"POST","/api/cart/items",{productId:"does-not-exist",quantity:1},404);
await request(owner,"POST","/api/cart/items",{productId:"gift-500",quantity:-1},400);
await request(owner,"POST","/api/cart/items",{productId:"form-75",quantity:1},403,{"X-CSRF-Token":"wrong"});
await request(owner,"POST","/api/cart/items",{productId:"form-75",quantity:1},403,{"Origin":"http://evil.rvu.test"});
console.log("PASS: unexpected cart payloads rejected without corrupting the wallet");
console.log("PASS: extended lab coverage",JSON.stringify({verified:["B07","B12","R04","R05"],assertions}));
