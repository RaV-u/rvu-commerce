/**
 * Isolated, fictional, instructor-selected business-logic challenge workflows.
 * All actions operate on the active run and authenticated learner only.
 * This is deliberately vulnerable training code. Do not internet-expose it.
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { randomUUID, createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { DB } from "./db.ts";
import { transaction } from "./db.ts";
import type { Actor } from "./commerce.ts";
import { cart } from "./commerce.ts";
import { HttpError, hash, token, passwordHash, passwordValid } from "./security.ts";
import { transfer } from "./seed.ts";
import { hasWeakness } from "./policy.ts";

type Handler = (db: DB, actor: Actor, req: FastifyRequest) => Promise<unknown>;
type UserRoute = (method:"GET"|"POST"|"PUT"|"DELETE", path:string, handler:Handler, verified?:boolean) => unknown;
type LabState = Record<string, unknown>;
type Context = { app:FastifyInstance; pool:Pool; userRoute:UserRoute; actor:(db:DB,req:FastifyRequest,verified?:boolean)=>Promise<Actor> };
const obj = z.record(z.string(),z.unknown());
const sleep = (n:number) => new Promise<void>(resolve=>setTimeout(resolve,n));
const requireProfile = (a:Actor, profiles:string[]) => {
  if (a.profile!=="secure-baseline" && a.profile!=="open-playground" && !profiles.includes(a.profile)) throw new HttpError(404,"Feature not available in this training run");
};
const fail = (message:string):never => {throw new HttpError(409,message);};
async function data(db:DB,a:Actor,scenario:string):Promise<LabState> {
  await db.query("INSERT INTO store.lab_states(run_id,user_id,scenario) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[a.run,a.id,scenario]);
  const result=await db.query("SELECT data FROM store.lab_states WHERE run_id=$1 AND user_id=$2 AND scenario=$3 FOR UPDATE",[a.run,a.id,scenario]);
  return result.rows[0].data as LabState;
}
async function save(db:DB,a:Actor,scenario:string,value:LabState) {
  await db.query("UPDATE store.lab_states SET data=$4 WHERE run_id=$1 AND user_id=$2 AND scenario=$3",[a.run,a.id,scenario,JSON.stringify(value)]);
}
async function evidence(db:DB,a:Actor,scenario:string,kind:string,detail:unknown) {
  await db.query("INSERT INTO store.lab_evidence(id,run_id,user_id,scenario,kind,detail) VALUES($1,$2,$3,$4,$5,$6)",[randomUUID(),a.run,a.id,scenario,kind,JSON.stringify(detail)]);
}
async function purchase(db:DB,a:Actor,scenario:string,charged:number,delivered:number,items:unknown) {
  if (!Number.isSafeInteger(charged)||charged<=0||!Number.isSafeInteger(delivered)||delivered<=0) fail("Invalid financial total");
  const wallet=(await db.query("SELECT id,balance FROM store.accounts WHERE run_id=$1 AND user_id=$2 AND purpose='wallet' FOR UPDATE",[a.run,a.id])).rows[0];
  if (!wallet || Number(wallet.balance)<charged) fail("Insufficient fictional wallet balance");
  const merchant=(await db.query("SELECT id FROM store.accounts WHERE run_id=$1 AND purpose='merchant'",[a.run])).rows[0].id as string;
  const saleId=randomUUID();
  const journal=await transfer(db,a.run,"purchase",saleId,wallet.id,merchant,charged);
  await db.query("INSERT INTO store.lab_sales(id,run_id,user_id,scenario,delivered_total,charged_total,journal_id,items) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
    [saleId,a.run,a.id,scenario,delivered,charged,journal,JSON.stringify(items)]);
  if (charged<delivered) await evidence(db,a,scenario,"underpaid",{saleId,charged,delivered});
  return {saleId,charged,delivered};
}
function key(a:Actor){return createHash("sha256").update("fictional-RVU-"+a.run).digest().subarray(0,16);}
function encrypt(a:Actor,message:string) {
  const cipher=createCipheriv("aes-128-ecb",key(a),null);
  return Buffer.concat([cipher.update(message,"utf8"),cipher.final()]).toString("hex");
}
function decrypt(a:Actor,input:string) {
  try {
    const decipher=createDecipheriv("aes-128-ecb",key(a),null);
    return Buffer.concat([decipher.update(Buffer.from(input,"hex")),decipher.final()]).toString("utf8");
  } catch {throw new HttpError(400,"Invalid remembered token");}
}
function parse(data:unknown) {return obj.parse(data);}
function str(p:LabState,k:string) {return z.string().min(1).max(8192).parse(p[k]);}
function num(p:LabState,k:string) {return z.number().int().parse(p[k]);}
async function message(db:DB,a:Actor,recipient:string,subject:string,body:string){
  await db.query("INSERT INTO store.outbox(id,run_id,user_id,recipient,subject,body) VALUES($1,$2,$3,$4,$5,$6)",[randomUUID(),a.run,a.id,recipient,subject,body]);
}
export const extendedLabels:Record<string,string> = {
  B02:"Signed cart quantity reconciliation",
  B03:"Corporate identity after email update",
  B05:"Legacy bulk integer overflow",
  B06:"Overlong corporate onboarding identity",
  B07:"Shared password maintenance",
  B09:"Incomplete corporate session context",
  B11:"Cross-purpose encrypted notifications",
  B12:"Email parsing boundary",
  R02:"Concurrent login attempt quota",
  R03:"Checkout against moving cart",
  R04:"Corporate email change delivery",
  R05:"Time-derived password reset",
  R06:"Partially provisioned corporate account",
};
export function registerExtendedLabs({app,pool,userRoute,actor}:Context) {
  // Only instructor endpoints may reveal scenario identity, state and evidence.
  // Learners receive a neutral service-directory acknowledgement.
  userRoute("GET","/api/business/status",async(_db,a)=>({
    account:{name:a.name,verified:a.verified},
    services:"available",
  }),false);
  // Each action is also documented as a business workflow in the storefront
  // and can be inspected in Burp. The actor/profile cannot be set by the client.
  userRoute("POST","/api/business/actions",async(db,a,req)=>{
    const p=parse(req.body), action=str(p,"action");
    const profile=a.profile;
    switch(action){
      case "cart.reconcile": {
        if(profile==="open-playground")throw new HttpError(404,"Use the standard shopping cart");
        requireProfile(a,["B02"]);
        const lines=z.array(z.object({sku:z.string().max(40),quantity:z.number().int().min(-10).max(10)}).strict()).min(1).max(8).parse(p.lines);
        if(!hasWeakness(a.profile,"B02")&&lines.some(x=>x.quantity<0)) fail("Negative quantities are not permitted");
        let charged=0,delivered=0;
        for(const x of lines){
          const item=(await db.query("SELECT price,kind FROM store.products WHERE id=$1",[x.sku])).rows[0];
          if(!item||item.kind!=="physical") throw new HttpError(404,"Unknown physical product");
          charged+=Number(item.price)*x.quantity;
          if(x.quantity>0)delivered+=Number(item.price)*x.quantity;
        }
        if(charged<=0) fail("Total must be positive");
        return purchase(db,a,"B02",charged,delivered,lines);
      }
      case "bulk.invoice": {
        requireProfile(a,["B05"]);
        const quantity=z.number().int().min(1).max(100000).parse(p.quantity);
        const exact=50000*quantity;
        // Deliberate signed 32-bit conversion in the isolated legacy adapter.
        const legacy=Math.imul(50000,quantity);
        if(!hasWeakness(a.profile,"B05") && exact!==legacy) fail("Bulk invoice exceeds supported integer range");
        const paid=hasWeakness(a.profile,"B05")?legacy:exact;
        if(paid<=0) fail("Legacy invoice amount cannot be paid");
        return purchase(db,a,"B05",paid,exact,{quantity,unitPrice:50000,legacy});
      }
      case "email.update": {
        requireProfile(a,["B03"]);
        const address=z.string().email().max(120).parse(p.address);
        if(!hasWeakness(a.profile,"B03")) fail("A new address requires fresh mailbox verification");
        const s=await data(db,a,"B03");
        await save(db,a,"B03",{...s,address,verified:a.verified});
        return {address,verified:a.verified};
      }
      case "corporate.orders": {
        requireProfile(a,["B03","B06","B12","R04","R06"]);
        // The shared storefront can grant corporate access via any of its
        // independent onboarding and account-maintenance workflows.
        const targets = profile==="open-playground"
          ? ["B03","B06","B12","R04","R06"] : [profile];
        let approvedScenario:string|undefined, approvedAddress:string|undefined;
        for(const target of targets) {
          const state=await data(db,a,target);
          let address=state.address;
          let verified=state.verified===true;
          if(target==="R06") {
            const registration=(await db.query(
              "SELECT email FROM store.lab_registrations WHERE run_id=$1 AND user_id=$2 AND verified=true AND completed=true AND email LIKE '%@corp.rvu.test' ORDER BY created_at DESC LIMIT 1",
              [a.run,a.id],
            )).rows[0];
            address=registration?.email;
            verified=!!registration;
          }
          if(typeof address==="string" && address.endsWith("@corp.rvu.test") && verified) {
            approvedScenario=target; approvedAddress=address; break;
          }
        }
        if(!approvedScenario) throw new HttpError(403,"Verified corporate membership required");
        await evidence(db,a,approvedScenario,"corporate-access",{address:approvedAddress,order:"CORP-DEMO-1001"});
        return {orders:[{id:"CORP-DEMO-1001",status:"approved",value:960000}]};
      }
      case "password.maintain": {
        requireProfile(a,["B07"]);
        const target=z.string().email().parse(p.targetEmail),newPassword=z.string().min(12).max(128).parse(p.newPassword);
        const supplied=p.currentPassword;
        const isOwn=target===a.email;
        if(hasWeakness(a.profile,"B07") && supplied===undefined) {
          const updated=await db.query("UPDATE store.users SET password_hash=$3 WHERE run_id=$1 AND email=$2 RETURNING id",[a.run,target,await passwordHash(newPassword)]);
          if(!updated.rowCount)throw new HttpError(404,"No such training account");
          if(!isOwn)await evidence(db,a,"B07","foreign-password-change",{target});
          return {updated:true,usedSupportBranch:true};
        }
        if(!isOwn) throw new HttpError(403,"Changing another account requires staff authorization");
        if(typeof supplied!=="string") fail("Current password is required");
        const current=(await db.query("SELECT password_hash FROM store.users WHERE run_id=$1 AND id=$2",[a.run,a.id])).rows[0];
        if(!await passwordValid(z.string().parse(supplied),current.password_hash)) throw new HttpError(403,"Incorrect current password");
        await db.query("UPDATE store.users SET password_hash=$3 WHERE run_id=$1 AND id=$2",[a.run,a.id,await passwordHash(newPassword)]);
        return {updated:true,usedSupportBranch:false};
      }
      case "workspace.select": {
        requireProfile(a,["B09"]);
        const s=await data(db,a,"B09");
        await save(db,a,"B09",{...s,context:"buyer"});
        return {role:"buyer"};
      }
      case "workspace.admin": {
        requireProfile(a,["B09"]);
        const s=await data(db,a,"B09");
        if(!hasWeakness(a.profile,"B09") || s.context==="buyer") throw new HttpError(403,"Administrator membership required");
        const approval=randomUUID();
        await save(db,a,"B09",{...s,adminApproved:true,approval,context:null});
        await evidence(db,a,"B09","admin-action",{missingContext:true,approval});
        return {action:"corporate-refund-approval",approved:true,approval};
      }
      case "auth.target": {
        requireProfile(a,["R02"]);
        const s=await data(db,a,"R02");
        if(s.authenticatedTarget!==true)throw new HttpError(403,"Target account session required");
        return {email:"target@learner.rvu.test",authenticated:true};
      }
      case "notification.encrypt": {
        requireProfile(a,["B11"]);
        const body=z.string().min(1).max(200).parse(p.body);
        return {ciphertext:encrypt(a,"kind=notification&body="+body)};
      }
      case "remember.login": {
        requireProfile(a,["B11"]);
        const hex=z.string().regex(/^[0-9a-f]+$/).max(2048).parse(p.ciphertext);
        const plaintext=decrypt(a,hex);
        if(!hasWeakness(a.profile,"B11") || !plaintext.startsWith("kind=remember&user=store-admin")) throw new HttpError(403,"Not a remembered login credential");
        await evidence(db,a,"B11","remembered-admin",{token:hash(hex)});
        return {role:"store-admin",authenticated:true};
      }
      case "legacy.register": {
        requireProfile(a,["B06"]);
        const raw=z.string().min(3).max(420).parse(p.address);
        // Legacy delivery parses the final @; identity adapter stores first 255.
        const recipient=raw.slice(raw.lastIndexOf("@")+1).toLowerCase();
        if(recipient!=="learner.rvu.test") throw new HttpError(400,"Only learner-owned local mailboxes can receive training mail");
        if(!hasWeakness(a.profile,"B06")&&raw.length>254) throw new HttpError(400,"Address too long");
        const stored=hasWeakness(a.profile,"B06")?raw.slice(0,255):raw;
        const s=await data(db,a,"B06"),code=token();
        await save(db,a,"B06",{...s,address:stored,verification:hash(code),verified:false,raw});
        await message(db,a,a.email,"Legacy onboarding verification","Your training code: "+code);
        return {storedAddress:stored,deliveryMailbox:a.email,codeSent:true};
      }
      case "legacy.verify": {
        requireProfile(a,["B06"]);
        const code=str(p,"code"),s=await data(db,a,"B06");
        if(s.verification!==hash(code)) throw new HttpError(400,"Verification code invalid");
        await save(db,a,"B06",{...s,verified:true,verification:null});
        return {verified:true,address:s.address};
      }
      case "parser.register": {
        requireProfile(a,["B12"]);
        const raw=z.string().min(5).max(400).parse(p.address);
        if(!raw.endsWith("@corp.rvu.test"))throw new HttpError(403,"Corporate domain required");
        const word=raw.slice(0,-"@corp.rvu.test".length);
        const m=/^=\?UTF-8\?B\?([A-Za-z0-9+/=]+)\?=$/i.exec(word);
        const destination=m?Buffer.from(m[1],"base64").toString("utf8"):raw;
        const deliverable=destination.toLowerCase()===a.email.toLowerCase();
        if(!deliverable)throw new HttpError(403,"Training adapter cannot deliver to another person's mailbox");
        if(!hasWeakness(a.profile,"B12")) fail("Encoded mailbox local parts are forbidden");
        const code=token(),s=await data(db,a,"B12");
        await save(db,a,"B12",{...s,address:raw,recipient:destination,verification:hash(code),verified:false});
        await message(db,a,a.email,"Corporate verification","Your training code: "+code);
        return {validatedAddress:raw,deliveryMailbox:destination};
      }
      case "parser.verify": {
        requireProfile(a,["B12"]);
        const code=str(p,"code"),s=await data(db,a,"B12");
        if(s.verification!==hash(code)) throw new HttpError(400,"Verification code invalid");
        await save(db,a,"B12",{...s,verification:null,verified:true});
        return {verified:true};
      }
      case "email.confirm": {
        requireProfile(a,["R04"]);
        const s=await data(db,a,"R04"),code=str(p,"code");
        if(s.verification!==hash(code))throw new HttpError(400,"Invalid email change verification");
        await save(db,a,"R04",{...s,verification:null,verified:true});
        return {address:s.address,verified:true};
      }
      case "reset.request": {
        requireProfile(a,["R05"]);
        const destination=z.string().email().parse(p.email);
        const target=(await db.query("SELECT id FROM store.users WHERE run_id=$1 AND email=$2",[a.run,destination])).rows[0];
        if(!target)throw new HttpError(404,"Training account not found");
        const code=hasWeakness(a.profile,"R05")
          ? createHash("sha256").update("legacy-time-reset:"+a.run+":"+Math.floor(Date.now()/1000)).digest("hex")
          : token();
        await db.query("INSERT INTO store.lab_resets(id,run_id,user_id,token_hash,expires_at) VALUES($1,$2,$3,$4,now()+interval '15 minutes')",
          [randomUUID(),a.run,target.id,hash(code)]);
        if(destination===a.email)await message(db,a,a.email,"Account recovery","Your training code: "+code);
        return {requested:true};
      }
      case "reset.complete": {
        requireProfile(a,["R05"]);
        const address=z.string().email().parse(p.email),code=str(p,"code"),password=z.string().min(12).max(128).parse(p.newPassword);
        const match=(await db.query(
          "SELECT t.id,t.user_id FROM store.lab_resets t JOIN store.users u ON u.run_id=t.run_id AND u.id=t.user_id WHERE t.run_id=$1 AND u.email=$2 AND t.token_hash=$3 AND t.used_at IS NULL AND t.expires_at>now() ORDER BY t.id LIMIT 1 FOR UPDATE OF t",
          [a.run,address,hash(code)]
        )).rows[0];
        if(!match)throw new HttpError(400,"Reset token invalid");
        await db.query("UPDATE store.lab_resets SET used_at=now() WHERE id=$1",[match.id]);
        await db.query("UPDATE store.users SET password_hash=$3 WHERE run_id=$1 AND id=$2",[a.run,match.user_id,await passwordHash(password)]);
        if(address!==a.email) await evidence(db,a,"R05","foreign-reset",{target:address,tokenFingerprint:hash(code)});
        return {updated:true};
      }
      case "registration.confirm": {
        requireProfile(a,["R06"]);
        const id=z.string().uuid().parse(p.registrationId);
        const r=(await db.query("SELECT * FROM store.lab_registrations WHERE id=$1 AND run_id=$2 AND user_id=$3 FOR UPDATE",[id,a.run,a.id])).rows[0];
        if(!r)throw new HttpError(404,"Corporate registration not found");
        // The legacy decoder flattens string[] to its first element and maps
        // NULL stored tokens to an empty string. This is only exploitable while
        // the registration is committed but not completely provisioned.
        const candidate=typeof p.code==="string"?p.code:Array.isArray(p.code)?String(p.code[0]??""):"";
        if(!hasWeakness(a.profile,"R06") && !r.completed)fail("Account is not fully provisioned");
        if(!hasWeakness(a.profile,"R06") && typeof p.code!=="string")fail("Verification code must be a string");
        if((r.token??"")!==candidate || r.verified) throw new HttpError(400,"Invalid corporate verification code");
        await db.query("UPDATE store.lab_registrations SET verified=true WHERE id=$1",[id]);
        if(!r.completed && r.token===null) await evidence(db,a,"R06","partial-confirm",{registrationId:id,priorToken:null});
        return {verified:true};
      }
      default: throw new HttpError(404,"Unknown training operation");
    }
  });
  // Race workflows must release the initial transaction before the window;
  // deliberately holding an app-wide transaction would serialize everything.
  app.post("/api/business/checkout", async req=>{
    const p=z.object({delayMs:z.number().int().min(20).max(300).default(120)}).strict().parse(req.body);
    const initial=await transaction(pool,async db=>{
      const a=await actor(db,req,true);requireProfile(a,["R03"]);
      const c=await cart(db,a);
      if(!c.items.length)fail("Add a physical product first");
      return {run:a.run,version:c.version,charged:c.total,actorId:a.id};
    });
    await sleep(p.delayMs);
    return transaction(pool,async db=>{
      const a=await actor(db,req,true);
      if(a.run!==initial.run||a.id!==initial.actorId) fail("Training run changed");
      const c=await cart(db,a);
      if(!hasWeakness(a.profile,"R03") && c.version!==initial.version)fail("Cart changed while payment was being authorized");
      const delivered=c.items.reduce((n:number,x:{price:string;quantity:number})=>n+Number(x.price)*x.quantity,0);
      if(delivered<=0)fail("Empty cart");
      const receipt=await purchase(db,a,"R03",initial.charged,delivered,c.items);
      await db.query("DELETE FROM store.cart_items WHERE run_id=$1 AND cart_id=$2",[a.run,c.id]);
      await db.query("UPDATE store.carts SET version=version+1 WHERE run_id=$1 AND id=$2",[a.run,c.id]);
      return receipt;
    });
  });
  app.post("/api/business/email-change", async req=>{
    const {address,delayMs}=z.object({
      address:z.string().email().max(120),
      delayMs:z.number().int().min(20).max(400).default(120)
    }).strict().parse(req.body);
    const prepared=await transaction(pool,async db=>{
      const a=await actor(db,req,true);requireProfile(a,["R04"]);
      const s=await data(db,a,"R04"),code=token();
      const next={...s,address,verification:hash(code),plain:code,verified:false};
      await save(db,a,"R04",next);
      return {run:a.run,id:a.id,recipient:address,version:randomUUID(),code};
    });
    await sleep(delayMs);
    return transaction(pool,async db=>{
      const a=await actor(db,req,true);
      if(a.run!==prepared.run||a.id!==prepared.id)fail("Training run changed");
      const s=await data(db,a,"R04");
      const recipient=prepared.recipient.endsWith("@learner.rvu.test") ? a.email : null;
      if(recipient){
        const deliveredCode=hasWeakness(a.profile,"R04")?String(s.plain):prepared.code;
        await message(db,a,recipient,"Email change confirmation","Your training code: "+deliveredCode);
      }
      return {recipient:recipient?"owned mailbox":"unavailable",pendingAddress:s.address,delivered:!!recipient};
    });
  });
  app.post("/api/business/registration",async req=>{
    const p=z.object({email:z.string().email().max(120),registrationId:z.string().uuid().optional(),delayMs:z.number().int().min(40).max(500).default(150)}).strict().parse(req.body);
    const prepared=await transaction(pool,async db=>{
      const a=await actor(db,req,true);requireProfile(a,["R06"]);
      const id=p.registrationId ?? randomUUID(),code=token();
      await db.query("INSERT INTO store.lab_registrations(id,run_id,user_id,email,token) VALUES($1,$2,$3,$4,$5)",
        [id,a.run,a.id,p.email,hasWeakness(a.profile,"R06")?null:code]);
      return {id,run:a.run,actor:a.id,code};
    });
    await sleep(p.delayMs);
    return transaction(pool,async db=>{
      const a=await actor(db,req,true);
      if(a.run!==prepared.run||a.id!==prepared.actor)fail("Training run changed");
      await db.query("UPDATE store.lab_registrations SET token=coalesce(token,$2),completed=true WHERE id=$1",[prepared.id,prepared.code]);
      return {registrationId:prepared.id,completed:true};
    });
  });
  app.post("/api/business/login-verification",async req=>{
    const p=z.object({password:z.string().min(1).max(128),delayMs:z.number().int().min(20).max(300).default(80)}).strict().parse(req.body);
    const checked=await transaction(pool,async db=>{
      const a=await actor(db,req,true);requireProfile(a,["R02"]);
      const username="target@learner.rvu.test";
      if(!hasWeakness(a.profile,"R02")){
        await db.query("SELECT pg_advisory_xact_lock(hashtext($1))",["quota:"+a.run+username]);
      }
      const n=Number((await db.query("SELECT count(*)::int AS n FROM store.lab_attempts WHERE run_id=$1 AND username=$2",[a.run,username])).rows[0].n);
      if(n>=3)throw new HttpError(429,"Login attempt quota exhausted");
      if(!hasWeakness(a.profile,"R02")){
        const valid=await checkTarget(db,a,p.password);
        await db.query("INSERT INTO store.lab_attempts(id,run_id,username,accepted) VALUES($1,$2,$3,$4)",[randomUUID(),a.run,username,valid]);
        return {run:a.run,actor:a.id,valid,finished:true};
      }
      return {run:a.run,actor:a.id,valid:false,finished:false};
    });
    if(checked.finished)return {authenticated:checked.valid};
    await sleep(p.delayMs);
    return transaction(pool,async db=>{
      const a=await actor(db,req,true);
      if(a.run!==checked.run||a.id!==checked.actor)fail("Training run changed");
      const username="target@learner.rvu.test";
      const valid=await checkTarget(db,a,p.password);
      await db.query("INSERT INTO store.lab_attempts(id,run_id,username,accepted) VALUES($1,$2,$3,$4)",[randomUUID(),a.run,username,valid]);
      const count=Number((await db.query("SELECT count(*)::int AS n FROM store.lab_attempts WHERE run_id=$1 AND username=$2",[a.run,username])).rows[0].n);
      if(valid){
        const s=await data(db,a,"R02");
        await save(db,a,"R02",{...s,authenticatedTarget:true,target:username});
      }
      if(count>3 && valid)await evidence(db,a,"R02","quota-bypass",{verifiedAttempts:count,target:username});
      return {authenticated:valid,attemptsRecorded:count};
    });
  });
}
async function checkTarget(db:DB,a:Actor,password:string){
  const user=(await db.query("SELECT password_hash FROM store.users WHERE run_id=$1 AND email='target@learner.rvu.test'",[a.run])).rows[0];
  return !!user && await passwordValid(password,user.password_hash);
}
