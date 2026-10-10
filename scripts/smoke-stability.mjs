// Disposable two-account stability and relogin checks against real Docker.
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {performance} from "node:perf_hooks";
assert.equal(process.env.RVU_DISPOSABLE_CI,"yes","Run only in CI");
const origin="http://localhost:8081";
const samples=[];
function client(username){return {username,cookie:"",csrf:"",id:"",email:""};}
async function call(user,method,path,body,headers={}){
  const start=performance.now();
  const response=await fetch(origin+path,{
    method,
    headers:{Origin:origin,Cookie:user.cookie,"X-CSRF-Token":user.csrf,
      ...(body===undefined?{}:{"Content-Type":"application/json"}),...headers},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
  samples.push(performance.now()-start);
  const set=response.headers.get("set-cookie");
  if(set)user.cookie=set.split(";")[0];
  const value=await response.json();
  assert.equal(response.status,200,method+" "+path+" "+JSON.stringify(value));
  if(value.csrf)user.csrf=value.csrf;
  return value;
}
const accounts=await Promise.all(["rvu","rvu_2"].map(async username=>{
  const user=client(username);
  const signed=await call(user,"POST","/api/login",{username,password:"rvucamp"});
  assert.equal(signed.user.username,username);
  assert.equal(signed.user.email,username+"@learner.rvu.test");
  assert.equal(signed.user.verified,true);
  user.id=signed.user.id;
  user.email=signed.user.email;
  return user;
}));
assert.equal(new Set(accounts.map(x=>x.id)).size,2,"The accounts must have distinct IDs");
const started=performance.now();
await Promise.all(accounts.flatMap(user=>Array.from({length:8},async()=>{
  const [catalog,cart,wallet]=await Promise.all([
    call(user,"GET","/api/catalog"),call(user,"GET","/api/cart"),call(user,"GET","/api/wallet")
  ]);
  assert.equal(catalog.products.length,8);
  assert.equal(cart.items.length,0);
  assert.equal(wallet.balance,1500000);
})));
for(const user of accounts){
  const cart=await call(user,"PUT","/api/cart/items",{productId:"form-75",quantity:1});
  const order=await call(user,"POST","/api/checkout",{
    cartVersion:cart.version,
    delivery:{fullName:user.username,address:"12 Fictional Studio Lane",city:"Sample City"}
  },{"Idempotency-Key":randomUUID()});
  assert.equal(Number(order.total),220000);
  await call(user,"POST","/api/orders/"+order.id+"/refund",{});
  assert.equal((await call(user,"GET","/api/wallet")).balance,1500000);
  await call(user,"POST","/api/logout",{});
  const returned=await call(user,"POST","/api/login",{username:user.username,password:"rvucamp"});
  assert.equal(returned.user.id,user.id,"A logout/login must restore the same named account");
  assert.equal((await call(user,"GET","/api/orders")).orders.length,1);
}
assert.equal((await call(accounts[0],"GET","/api/session")).user.colleagueEmail,accounts[1].email);
assert.equal((await call(accounts[1],"GET","/api/session")).user.colleagueEmail,accounts[0].email);
samples.sort((a,b)=>a-b);
console.log("PASS: rvu and rvu_2 have separate sessions, wallets, cart histories, and stable identities after logout");
console.log(JSON.stringify({requests:samples.length,totalMs:Math.round(performance.now()-started),
  p95ResponseMs:Math.round(samples[Math.ceil(samples.length*.95)-1])}));
