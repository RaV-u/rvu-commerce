import {useEffect,useMemo,useState,type FormEvent} from "react";
import {api,type User} from "./api.ts";
type Operation={section:string;title:string;description:string;path:string;body:Record<string,unknown>};
const operations:Operation[]=[
  {section:"Buying",title:"Express purchase",description:"Settle a reviewed bag after processing time.",path:"/business/checkout",body:{delayMs:120}},
  {section:"Accounts",title:"Update contact email",description:"Maintain the email address for your business identity.",path:"/business/actions",body:{action:"email.update",address:"alex@learner.rvu.test"}},
  {section:"Accounts",title:"Password maintenance",description:"Change the current account password after confirming the old one.",path:"/business/actions",body:{action:"password.maintain",targetEmail:"alex@learner.rvu.test",currentPassword:"",newPassword:"New-Training-Password-2026!"}},
  {section:"Accounts",title:"Business account registration",description:"Add your company billing contact to your account.",path:"/business/actions",body:{action:"legacy.register",address:"alex@learner.rvu.test"}},
  {section:"Accounts",title:"Confirm business address",description:"Redeem the code delivered to the account inbox.",path:"/business/actions",body:{action:"legacy.verify",code:""}},
  {section:"Accounts",title:"Request password recovery",description:"Send a recovery code to the selected account's inbox.",path:"/business/actions",body:{action:"reset.request",email:"alex@learner.rvu.test"}},
  {section:"Accounts",title:"Complete password recovery",description:"Use a recovery code with a new account password.",path:"/business/actions",body:{action:"reset.complete",email:"alex@learner.rvu.test",code:"",newPassword:"Recovered-Training-2026!"}},
  {section:"Accounts",title:"Register company contact",description:"Request access for a company contact.",path:"/business/registration",body:{email:"sample@corp.rvu.test",delayMs:150}},
  {section:"Accounts",title:"Verify company contact",description:"Verify a corporate identity by registration reference.",path:"/business/actions",body:{action:"registration.confirm",registrationId:"",code:""}},
  {section:"Workspace",title:"Select workspace",description:"Select the workspace permitted by your membership.",path:"/business/actions",body:{action:"workspace.select"}},
  {section:"Workspace",title:"Approve company order",description:"Access a business administration workflow.",path:"/business/actions",body:{action:"workspace.admin"}},
  {section:"Workspace",title:"Company orders",description:"Review corporate customer order records.",path:"/business/actions",body:{action:"corporate.orders"}},
  {section:"Workspace",title:"Company approval history",description:"View the history of authorised company order approvals.",path:"/business/actions",body:{action:"workspace.approvals"}},
  {section:"Workspace",title:"Update company contact",description:"Request a new contact email and send confirmation.",path:"/business/email-change",body:{address:"alex@learner.rvu.test",delayMs:120}},
  {section:"Workspace",title:"Confirm changed email",description:"Finish an earlier email change from its confirmation message.",path:"/business/actions",body:{action:"email.confirm",code:""}},
  {section:"Workspace",title:"Invite a team member",description:"Verify an employee mailbox under the corporate account policy.",path:"/business/actions",body:{action:"parser.register",address:"employee@corp.rvu.test"}},
  {section:"Workspace",title:"Confirm corporate email",description:"Validate a corporate invitation or mailbox verification.",path:"/business/actions",body:{action:"parser.verify",code:""}},
  {section:"Support",title:"Send delivery notice",description:"Prepare a delivery notification for your account.",path:"/business/actions",body:{action:"notification.encrypt",body:"Delivery update"}},
  {section:"Support",title:"Restore remembered access",description:"Restore a remembered device session.",path:"/business/actions",body:{action:"remember.login",ciphertext:""}},
  {section:"Support",title:"Support case queue",description:"Review restricted customer support cases.",path:"/business/actions",body:{action:"support.queue"}},
  {section:"Support",title:"Company account sign-in",description:"Sign in to a separate company account in your workspace.",path:"/business/login-verification",body:{email:"target@learner.rvu.test",password:"",delayMs:80}},
];
function pretty(value:unknown){return JSON.stringify(value,null,2);}
// Pre-populate self-service forms with the private mailbox assigned to this
// sign-in, rather than the retired shared demo customer's address.
function accountDefaults(op:Operation, user?:User|null) {
  const body:Record<string,unknown>={...op.body};
  for(const [key,value] of Object.entries(body)){
    if(value==="alex@learner.rvu.test" && user?.email)body[key]=user.email;
    if(value==="target@learner.rvu.test" && user?.colleagueEmail)body[key]=user.colleagueEmail;
  }
  if(op.path==="/business/registration")body.registrationId=crypto.randomUUID();
  return pretty(body);
}
function humanize(name:string):string {
  return name.replace(/([a-z])([A-Z])/g,"$1 $2").replace(/[._]/g," ").replace(/(^|\s)\w/g,c=>c.toUpperCase());
}
function summarizeResponse(response:string):[string,string][] {
  try {
    const value=JSON.parse(response) as unknown;
    if(!value || typeof value!=="object" || Array.isArray(value)) return [];
    return Object.entries(value as Record<string,unknown>).slice(0,8).map(([field,item])=>{
      let display:string;
      if(Array.isArray(item)) display=item.length+" "+(item.length===1?"record":"records");
      else if(item && typeof item==="object")display="Details available";
      else if(typeof item==="boolean") display=item?"Yes":"No";
      else display=String(item??"—");
      return [humanize(field),display.length>115?display.slice(0,115)+"…":display];
    });
  } catch {return [];}
}
export function AccountServices({user}:{user:User}){
  const [choice,setChoice]=useState(0);
  const [payload,setPayload]=useState(accountDefaults(operations[0],user));
  const [response,setResponse]=useState("");
  const [error,setError]=useState("");
  const [sending,setSending]=useState(false);
  const op=operations[choice];
  const categories=useMemo(()=>Array.from(new Set(operations.map(x=>x.section))),[]);
  useEffect(()=>{
    setChoice(0);setPayload(accountDefaults(operations[0],user));setError("");setResponse("");
  },[user.id]);
  function updateField(key:string, raw:string) {
    const next=JSON.parse(payload) as Record<string,unknown>;
    const sample=op.body[key];
    if(typeof sample==="number") next[key]=Number(raw);
    else if(typeof sample==="boolean") next[key]=raw==="true";
    else if(typeof sample==="object"){
      try{next[key]=JSON.parse(raw);}catch{return;}
    }else next[key]=raw;
    setPayload(pretty(next));
  }
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    setError("");setResponse("");setSending(true);
    try{
      const parsed=JSON.parse(payload) as unknown;
      if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw new Error("Request body must be a JSON object.");
      const result=await api<unknown>(op.path,"POST",parsed);
      setResponse(pretty(result));
      // A committed lab message can arrive after My Account initially loads.
      // Tell the account inbox to refresh without revealing any verification code
      // through a different account or through the service response.
      const action=(parsed as Record<string,unknown>).action;
      const generatesMailboxMessage = (
        op.path==="/business/actions" &&
        ["legacy.register","parser.register","reset.request"].includes(String(action))
      ) || (op.path==="/business/email-change" &&
        typeof result==="object" && result!==null &&
        (result as {delivered?:boolean}).delivered===true);
      if(generatesMailboxMessage) window.dispatchEvent(new window.Event("rvu:inbox-updated"));
    }catch(e){setError((e as Error).message);}
    finally{setSending(false);}
  }
  return <section className="account-services" aria-label="Account and business services">
    <div className="service-intro">
      <span className="service-eyebrow">ACCOUNT & BUSINESS SERVICES</span>
      <p>Manage your contact details, business purchases, workspace and account access.</p>
      {user.colleagueEmail && <p className="service-workspace-peer">Linked company account: <strong>{user.colleagueEmail}</strong></p>}
    </div>
        <div className="service-columns">
          <aside className="service-menu"><p>Service directory</p>
            {categories.map(group=><div key={group} className="service-group"><h2>{group}</h2>
              {operations.map((o,i)=>o.section===group?<button type="button" key={i} className={choice===i?"chosen":""} onClick={()=>{setChoice(i);setPayload(accountDefaults(o,user));setError("");setResponse("");}}>{o.title}</button>:null)}
            </div>)}
          </aside>
          <section className="service-workspace" aria-live="polite">
            <span className="service-eyebrow">ACCOUNT OPERATION</span>
            <h2>{op.title}</h2>
            <p>{op.description}</p>
            <form onSubmit={e=>void submit(e)}>
              {op.path==="/business/registration" && <p className="service-hint">Application reference: <code>{String((JSON.parse(payload) as Record<string,unknown>).registrationId??"")}</code></p>}
              <div className="service-fields">
                {Object.entries(op.body).filter(([key])=>key!=="action" && key!=="delayMs").map(([key,example])=>{
                  const current=(JSON.parse(payload) as Record<string,unknown>)[key];
                  return <label className="service-field" htmlFor={"business-"+key} key={key}>
                    <span>{humanize(key)}</span>
                    {typeof example==="object"
                      ? <textarea id={"business-"+key} rows={4} spellCheck={false}
                          value={pretty(current)} onChange={e=>updateField(key,e.target.value)} />
                      : typeof example==="boolean"
                        ? <select id={"business-"+key} value={String(current)} onChange={e=>updateField(key,e.target.value)}>
                            <option value="true">Yes</option><option value="false">No</option>
                          </select>
                        : <input id={"business-"+key}
                            type={typeof example==="number"?"number":key.toLowerCase().includes("password")?"password":"text"}
                            value={String(current??"")} onChange={e=>updateField(key,e.target.value)}
                          />}
                  </label>;
                })}
              </div>
              <button type="submit" disabled={sending}>{sending?"Processing…":"Continue →"}</button>
            </form>
            {error&&<div className="service-result error" role="alert"><strong>Request not completed</strong><p>{error}</p></div>}
            {response&&<div className="service-result">
              <strong>Request completed</strong>
              <p>The service returned the following information.</p>
              <dl className="service-overview">
                {summarizeResponse(response).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
              </dl>
              <details><summary>View technical details</summary><pre>{response}</pre></details>
            </div>}
          </section>
        </div>
  </section>;
}
