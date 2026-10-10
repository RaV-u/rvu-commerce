// Non-destructive multi-customer smoke against disposable local Docker.
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {performance} from "node:perf_hooks";
assert.equal(process.env.RVU_DISPOSABLE_CI,"yes","Run only in disposable CI");
const origin="http://localhost:8080";
const samples=[];
function client(){return {cookie:"",csrf:""};}
async function call(user,method,path,body,headers={}){
  const start=performance.now();
  const response=await fetch(origin+path,{
    method,headers:{Origin:origin,Cookie:user.cookie,"X-CSRF-Token":user.csrf,
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
const accounts=await Promise.all(Array.from({length:3},async(_,n)=>{
  const user=client(),email="stability-"+randomUUID().slice(0,8)+"@learner.rvu.test";
  await call(user,"POST","/api/register",{name:"Independent Buyer "+n,email,password:"Stable-Local-2026!"});
  const messages=await call(user,"GET","/api/inbox");
  await call(user,"POST","/api/verify",{code:messages.messages[0].body.split(": ").at(-1).trim()});
  return user;
}));
const start=performance.now();
await Promise.all(accounts.flatMap(user=>Array.from({length:8},async()=>{
  const [catalog,cart,wallet]=await Promise.all([
    call(user,"GET","/api/catalog"),
    call(user,"GET","/api/cart"),
    call(user,"GET","/api/wallet")
  ]);
  assert.equal(catalog.products.length,8);
  assert.equal(cart.items.length,0);
  assert.equal(wallet.balance,1500000);
})));
for(const user of accounts){
  const cart=await call(user,"PUT","/api/cart/items",{productId:"form-75",quantity:1});
  const order=await call(user,"POST","/api/checkout",{
    cartVersion:cart.version,
    delivery:{fullName:"Independent Buyer",address:"12 Fictional Studio Lane",city:"Sample City"}
  },{"Idempotency-Key":randomUUID()});
  assert.equal(Number(order.total),220000);
  await call(user,"POST","/api/orders/"+order.id+"/refund",{});
  assert.equal((await call(user,"GET","/api/wallet")).balance,1500000);
}
samples.sort((a,b)=>a-b);
console.log("PASS: 3 independent customers, parallel catalog/cart/wallet browsing, valid checkout/refund");
console.log(JSON.stringify({requests:samples.length,totalMs:Math.round(performance.now()-start),
  p95ResponseMs:Math.round(samples[Math.ceil(samples.length*.95)-1])}));
