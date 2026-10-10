// Local disposable acceptance: four independent commerce workflow invariants.
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
assert.equal(process.env.RVU_DISPOSABLE_CI,"yes","CI-only local exercise");
const root="http://localhost:8080";
async function newShopper(){
  let cookie="",csrf="";
  async function call(method,path,payload,status=200,extra={}){
    const r=await fetch(root+path,{method,headers:{Origin:root,Cookie:cookie,"X-CSRF-Token":csrf,
       ...(payload===undefined?{}:{"Content-Type":"application/json"}),...extra},
      ...(payload===undefined?{}:{body:JSON.stringify(payload)})});
    const session=r.headers.get("set-cookie");
    if(session)cookie=session.split(";")[0];
    const value=await r.json();
    assert.equal(r.status,status,method+" "+path+" "+JSON.stringify(value));
    if(value.csrf)csrf=value.csrf;
    return value;
  }
  await call("POST","/api/login",{username:"rvu",password:"rvucamp"});
  return call;
}
const delivery={fullName:"Sample Customer",address:"12 Sample Studio Lane",city:"Sample City"};
async function paid(call,cart){
 return call("POST","/api/checkout",{cartVersion:cart.version,delivery},200,{"Idempotency-Key":randomUUID()});
}
{
  const call=await newShopper();
  await call("PUT","/api/cart/items",{productId:"vista-27",quantity:1});
  await call("POST","/api/cart/coupon",{code:"WELCOME10"});
  await call("POST","/api/cart/coupon",{code:"STUDIO15"});
  const cart=await call("POST","/api/cart/coupon",{code:"WELCOME10"});
  assert.equal(cart.total,442000,"Repeated promotional applications must change the actual payable total");
  const order=await paid(call,cart);
  assert.equal(Number(order.total),442000);
  await call("POST","/api/orders/"+order.id+"/refund",{});
  console.log("PASS: stacked promotion persisted on actual paid order");
}
{
  const call=await newShopper();
  let cart=await call("PUT","/api/cart/items",{productId:"arc-light",quantity:1});
  await paid(call,cart);
  cart=await call("PUT","/api/cart/items",{productId:"vista-27",quantity:3});
  const intent=await call("POST","/api/checkout/prepare",{cartVersion:cart.version,delivery});
  const walletBefore=(await call("GET","/api/wallet")).balance;
  const confirmed=await call("POST","/api/checkout/confirm",{intentId:intent.intentId},200,{"Idempotency-Key":randomUUID()});
  const detail=await call("GET","/api/orders/"+confirmed.id);
  assert.equal(detail.payment_state,"unsettled");
  assert.equal((await call("GET","/api/wallet")).balance,walletBefore);
  console.log("PASS: confirmed order and payment settlement remain independently observable");
}
{
  const call=await newShopper();
  let cart=await call("PUT","/api/cart/items",{productId:"gift-500",quantity:1});
  cart=await call("POST","/api/cart/coupon",{code:"GIFT20"});
  assert.equal(cart.total,40000);
  const start=(await call("GET","/api/wallet")).balance;
  const order=await paid(call,cart);
  await call("POST","/api/gift-cards/redeem",{code:order.giftCards[0].code});
  const end=(await call("GET","/api/wallet")).balance;
  assert.equal(end-start,10000);
  console.log("PASS: stored-value balance and promotional purchase are mutually consistent");
}
{
  const call=await newShopper();
  await call("PUT","/api/cart/items",{productId:"vista-27",quantity:1});
  const requests=await Promise.all(Array.from({length:4},()=>call("POST","/api/cart/voucher",{code:"STUDIO300"}).then(()=>true,()=>false)));
  const successful=requests.filter(Boolean).length;
  assert.ok(successful>=2,"Overlapping voucher claims were not reproduced in this CI run");
  const cart=await call("GET","/api/cart");
  assert.ok(cart.vouchers.length>=2);
  assert.ok(cart.total<=620000);
  const order=await paid(call,cart);
  assert.ok(Number(order.total)<=620000);
  console.log("PASS: overlapping voucher claims reach a real order");
}
console.log("PASS: four commerce families available simultaneously with one RVU credential, no profile switch");
