// Disposable two-account money, cart and refund regression against the real Docker storefront.
// Intentionally tests ordinary user journeys; it never disables instructor-selected security labs.
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
assert.equal(process.env.RVU_DISPOSABLE_CI,"yes","Disposable CI only; never run against saved student data");
const origin="http://localhost:8081";
const users=["rvu","rvu_2"].map(username=>({username,cookie:"",csrf:"",id:"",email:""}));
const price={ "form-75":2200,"arc-light":1400,"bridge-8":1650,"lift-stand":950,"vista-27":6800,"gift-500":500 };
let checks=0;
async function call(user,method,path,body,status=200,extra={}){
  const r=await fetch(origin+path,{
    method,headers:{Origin:origin,Cookie:user.cookie,"X-CSRF-Token":user.csrf,
      ...(body===undefined?{}:{"Content-Type":"application/json"}),...extra},
    ...(body===undefined?{}:{body:JSON.stringify(body)})
  });
  const session=r.headers.get("set-cookie");
  if(session) user.cookie=session.split(";")[0];
  let data;
  try{ data=await r.json(); }catch{ data={error:"Invalid JSON from server"}; }
  assert.equal(r.status,status,method+" "+path+" "+JSON.stringify(data));
  if(data.csrf) user.csrf=data.csrf;
  checks++;
  return data;
}
async function snapshot(user){
  return Promise.all([call(user,"GET","/api/cart"),call(user,"GET","/api/wallet")]);
}
function assertCart(c,expected){
  const actual=Object.fromEntries(c.items.map(i=>[i.id,i.quantity]));
  assert.deepEqual(actual,expected,"Cart rows differ from expected committed items");
}
async function add(user,sku,count=1){
  return call(user,"POST","/api/cart/items",{productId:sku,quantity:count,price:price[sku]});
}
async function set(user,sku,n){
  return call(user,"PUT","/api/cart/items",{productId:sku,quantity:n});
}
async function buy(user,cart,key=randomUUID()){
  return call(user,"POST","/api/checkout",{
    cartVersion:cart.version,
    delivery:{fullName:user.username,address:"12 Fictional Studio Lane",city:"Sample City"}
  },200,{"Idempotency-Key":key});
}
await Promise.all(users.map(async u=>{
  const session=await call(u,"POST","/api/login",{username:u.username,password:"rvucamp"});
  assert.equal(session.user.username,u.username);
  assert.equal(session.user.verified,true);
  u.id=session.user.id;u.email=session.user.email;
  const [cart,wallet]=await snapshot(u);
  assertCart(cart,{});
  assert.equal(wallet.balance,15000);
}));
assert.notEqual(users[0].id,users[1].id);
for(const user of users) {
  const other=users.find(x=>x!==user);
  const session=await call(user,"GET","/api/session");
  assert.equal(session.user.colleagueEmail,other.email);
}
// Realistic repeated shopping: add, set quantity, decrement, remove and re-add.
// The two accounts execute independently while each cart is internally serialized.
await Promise.all(users.map(async user=>{
  for(let round=0;round<3;round++){
    for(const sku of ["arc-light","bridge-8","lift-stand","form-75"]){
      assert.equal((await add(user,sku)).items.find(x=>x.id===sku)?.quantity,1);
      assert.equal((await set(user,sku,3)).items.find(x=>x.id===sku)?.quantity,3);
      assert.equal((await set(user,sku,2)).items.find(x=>x.id===sku)?.quantity,2);
      assertCart(await set(user,sku,0),{});
    }
  }
}));
// Parallel independent product adds to each account: no lost cart line or tenant crossover.
await Promise.all(users.map(async user=>{
  await Promise.all(["arc-light","bridge-8","lift-stand"].map(sku=>add(user,sku)));
  assertCart(await call(user,"GET","/api/cart"),{"arc-light":1,"bridge-8":1,"lift-stand":1});
  for(const sku of ["arc-light","bridge-8","lift-stand"]) await set(user,sku,0);
  assertCart(await call(user,"GET","/api/cart"),{});
}));
// A custom accepted quote has a line price unlike the catalog. The UI must be able to
// remove and update that item without resubmitting the quote price as a product price.
for(const user of users){
  const quote=await call(user,"POST","/api/quotes",{dock:true,support:true});
  assert.equal(quote.authorizedPrice,18300);
  const bag=await call(user,"POST",`/api/quotes/${quote.id}/accept`,{quotedTotal:quote.authorizedPrice});
  assert.equal(Number(bag.items[0].price),18300);
  assert.equal((await set(user,"vista-27",2)).items[0].quantity,2);
  assertCart(await set(user,"vista-27",0),{});
}
const [a,b]=users;
// Quantity adjustments on the same SKU arriving concurrently must add up exactly.
await Promise.all(Array.from({length:4},()=>add(a,"arc-light")));
assert.equal((await call(a,"GET","/api/cart")).items.find(x=>x.id==="arc-light")?.quantity,4);
await set(a,"arc-light",0);
const beforeA=(await call(a,"GET","/api/wallet")).balance;
let c=await add(a,"form-75");
c=await call(a,"POST","/api/cart/coupon",{code:"WELCOME10"});
assert.equal(c.total,1980);
const key=randomUUID();
const purchaseA=await buy(a,c,key);
assert.equal(Number(purchaseA.total),1980);
assert.equal(purchaseA.payment_state,"settled");
assert.equal((await call(a,"GET","/api/wallet")).balance,beforeA-1980);
// Idempotent repeated checkout cannot debit the wallet a second time.
const replay=await buy(a,c,key);
assert.equal(replay.id,purchaseA.id);
assert.equal((await call(a,"GET","/api/wallet")).balance,beforeA-1980);
// Tenant B cannot inspect or refund tenant A's paid order.
await call(b,"GET",`/api/orders/${purchaseA.id}`,undefined,404);
await call(b,"POST",`/api/orders/${purchaseA.id}/refund`,{},404);
// Concurrent duplicate refunds must credit exactly once, not twice.
const refunded=await Promise.all(Array.from({length:4},()=>call(a,"POST",`/api/orders/${purchaseA.id}/refund`,{})));
assert.ok(refunded.every(x=>x.state==="refunded"));
assert.equal((await call(a,"GET","/api/wallet")).balance,beforeA);
c=await add(b,"form-75");
const purchaseB=await buy(b,c);
assert.equal(Number(purchaseB.total),2200);
assert.equal((await call(b,"GET","/api/wallet")).balance,12800);
await call(b,"POST",`/api/orders/${purchaseB.id}/refund`,{});
await call(b,"POST",`/api/orders/${purchaseB.id}/refund`,{});
assert.equal((await call(b,"GET","/api/wallet")).balance,15000);
// Gift cards are a separate, intentional final-sale flow. A real refund should
// be rejected, but transfer of stored value between accounts must work once only.
c=await add(a,"gift-500");
const gift=await buy(a,c);
assert.equal(Number(gift.total),500);
assert.equal(gift.giftCards.length,1);
await call(a,"POST",`/api/orders/${gift.id}/refund`,{},409);
assert.equal((await call(a,"GET","/api/wallet")).balance,14500);
assert.equal((await call(b,"POST","/api/gift-cards/redeem",{code:gift.giftCards[0].code})).amount,500);
await call(b,"POST","/api/gift-cards/redeem",{code:gift.giftCards[0].code},409);
assert.equal((await call(b,"GET","/api/wallet")).balance,15500);
for(const user of users){
  const [bag,wallet]=await snapshot(user);
  assertCart(bag,{});
  const ledgerSum=wallet.transactions.reduce((n,t)=>n+Number(t.amount),0);
  assert.equal(ledgerSum,wallet.balance,"Wallet balance must equal the transaction ledger");
  await call(user,"POST","/api/logout",{});
  const signin=await call(user,"POST","/api/login",{username:user.username,password:"rvucamp"});
  assert.equal(signin.user.id,user.id,"Logout and new login must recover the original user");
  assert.equal((await call(user,"GET","/api/wallet")).balance,wallet.balance);
  assertCart(await call(user,"GET","/api/cart"),{});
}
console.log("PASS: refund is once-only, payment is idempotent, 2 accounts are isolated, carts survive repeated add/set/remove, quote edits work, ledger balances reconcile and gift credit redeems once");
console.log(JSON.stringify({checks,accounts:users.length,refundsVerified:2,parallelAdds:10,productsChangedPerAccount:48}));
