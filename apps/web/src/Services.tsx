import {useEffect,useMemo,useState,type FormEvent} from "react";
import {api,setCsrf,type Session} from "./api.ts";
import "./services.css";
type Operation={section:string;title:string;description:string;path:string;body:Record<string,unknown>};
const operations:Operation[]=[
  {section:"Buying",title:"Cart reconciliation",description:"Review an order made of multiple catalogue lines.",path:"/lab/action",body:{action:"cart.reconcile",lines:[{sku:"vista-27",quantity:1},{sku:"arc-light",quantity:1}]}},
  {section:"Buying",title:"Bulk business invoice",description:"Create a wholesale invoice for a component order.",path:"/lab/action",body:{action:"bulk.invoice",quantity:3}},
  {section:"Buying",title:"Pay for current cart",description:"Settle a reviewed bag after processing time.",path:"/lab/race/checkout",body:{delayMs:120}},
  {section:"Accounts",title:"Update contact email",description:"Maintain the email address for your business identity.",path:"/lab/action",body:{action:"email.update",address:"alex@learner.rvu.test"}},
  {section:"Accounts",title:"Password maintenance",description:"Change the current account password after confirming the old one.",path:"/lab/action",body:{action:"password.maintain",targetEmail:"alex@learner.rvu.test",currentPassword:"",newPassword:"New-Training-Password-2026!"}},
  {section:"Accounts",title:"Legacy onboarding",description:"Register an older-style corporate billing address.",path:"/lab/action",body:{action:"legacy.register",address:"alex@learner.rvu.test"}},
  {section:"Accounts",title:"Confirm onboarding email",description:"Redeem the code delivered to the account inbox.",path:"/lab/action",body:{action:"legacy.verify",code:""}},
  {section:"Accounts",title:"Request password recovery",description:"Send a recovery code to the selected account's inbox.",path:"/lab/action",body:{action:"reset.request",email:"alex@learner.rvu.test"}},
  {section:"Accounts",title:"Complete password recovery",description:"Use a recovery code with a new account password.",path:"/lab/action",body:{action:"reset.complete",email:"alex@learner.rvu.test",code:"",newPassword:"Recovered-Training-2026!"}},
  {section:"Accounts",title:"Corporate registration",description:"Create a pending corporate identity and finish provisioning.",path:"/lab/race/registration",body:{email:"sample@corp.rvu.test",delayMs:150}},
  {section:"Accounts",title:"Confirm corporate registration",description:"Verify a corporate identity by registration reference.",path:"/lab/action",body:{action:"registration.confirm",registrationId:"",code:""}},
  {section:"Workspace",title:"Select workspace",description:"Select the workspace permitted by your membership.",path:"/lab/action",body:{action:"workspace.select"}},
  {section:"Workspace",title:"Business approval",description:"Access a business administration workflow.",path:"/lab/action",body:{action:"workspace.admin"}},
  {section:"Workspace",title:"Corporate order history",description:"Review corporate customer order records.",path:"/lab/action",body:{action:"corporate.orders"}},
  {section:"Workspace",title:"Corporate email change",description:"Request a new contact email and send confirmation.",path:"/lab/race/email-change",body:{address:"alex@learner.rvu.test",delayMs:120}},
  {section:"Workspace",title:"Confirm changed email",description:"Finish an earlier email change from its confirmation message.",path:"/lab/action",body:{action:"email.confirm",code:""}},
  {section:"Workspace",title:"Corporate email onboarding",description:"Verify an employee mailbox under the corporate account policy.",path:"/lab/action",body:{action:"parser.register",address:"employee@corp.rvu.test"}},
  {section:"Workspace",title:"Confirm corporate email",description:"Validate a corporate invitation or mailbox verification.",path:"/lab/action",body:{action:"parser.verify",code:""}},
  {section:"Support",title:"Send encrypted notification",description:"Encode a message with the legacy notification system.",path:"/lab/action",body:{action:"notification.encrypt",body:"Delivery update"}},
  {section:"Support",title:"Remembered sign-in",description:"Resume a remembered session from its encrypted credential.",path:"/lab/action",body:{action:"remember.login",ciphertext:""}},
  {section:"Support",title:"Account login verification",description:"Submit a login attempt to the protected business account.",path:"/lab/race/login",body:{password:"",delayMs:80}},
];
function pretty(value:unknown){return JSON.stringify(value,null,2);}
export function Services(){
  const [session,setSession]=useState<Session>({user:null});
  const [ready,setReady]=useState(false);
  const [choice,setChoice]=useState(0);
  const [payload,setPayload]=useState(pretty(operations[0].body));
  const [response,setResponse]=useState("");
  const [error,setError]=useState("");
  const [sending,setSending]=useState(false);
  const op=operations[choice];
  const categories=useMemo(()=>Array.from(new Set(operations.map(x=>x.section))),[]);
  useEffect(()=>{
    let mounted=true;
    void api<Session>("/session").then(s=>{
      if(mounted){setCsrf(s.csrf);setSession(s);}
    }).catch(()=>{if(mounted)setError("Please sign in from the storefront first.");})
      .finally(()=>{if(mounted)setReady(true);});
    return ()=>{mounted=false;};
  },[]);
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    setError("");setResponse("");setSending(true);
    try{
      const parsed=JSON.parse(payload) as unknown;
      if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw new Error("Request body must be a JSON object.");
      const result=await api<unknown>(op.path,"POST",parsed);
      setResponse(pretty(result));
    }catch(e){setError((e as Error).message);}
    finally{setSending(false);}
  }
  return <div className="service-page">
    <header className="service-header">
      <a href="/" aria-label="Return to RVU Commerce"><img src="/brand/rvu-commerce.svg" alt="RVU Commerce" width="220" height="56"/></a>
      <a href="/">← Back to the collection</a>
    </header>
    <main className="service-content">
      <div className="service-intro"><span className="service-eyebrow">RVU BUSINESS SERVICES</span>
        <h1>Work, connected.</h1>
        <p>Manage business purchases, account access, company workspaces and support requests. These services run entirely on fictional data in your local installation.</p>
      </div>
      {!ready?<p>Checking your account…</p>:!session.user?.verified?
        <section className="service-signed-out"><h2>Sign in to use your account services.</h2><p>Open the store, sign in as your fictional training customer and verify your email before returning here.</p><a href="/">Go to the store →</a></section>:
        <div className="service-columns">
          <aside className="service-menu"><p>Service directory</p>
            {categories.map(group=><div key={group} className="service-group"><h2>{group}</h2>
              {operations.map((o,i)=>o.section===group?<button type="button" key={i} className={choice===i?"chosen":""} onClick={()=>{setChoice(i);setPayload(pretty(o.body));setError("");setResponse("");}}>{o.title}</button>:null)}
            </div>)}
          </aside>
          <section className="service-workspace" aria-live="polite">
            <span className="service-eyebrow">ACCOUNT OPERATION</span>
            <h2>{op.title}</h2>
            <p>{op.description}</p>
            <form onSubmit={e=>void submit(e)}>
              <label htmlFor="service-request">Request details <span>POST /api{op.path}</span></label>
              <textarea id="service-request" spellCheck={false} rows={10} value={payload} onChange={e=>setPayload(e.target.value)} />
              <p className="service-hint">Editable request details are provided for this local training edition. Inspect the network request with your usual debugging tools.</p>
              <button type="submit" disabled={sending}>{sending?"Processing…":"Submit request →"}</button>
            </form>
            {error&&<div className="service-result error" role="alert"><strong>Request not completed</strong><pre>{error}</pre></div>}
            {response&&<div className="service-result"><strong>Service response</strong><pre>{response}</pre></div>}
          </section>
        </div>}
    </main>
    <footer className="service-footer">RVU Commerce · Local, simulated accounts and orders · No real payments</footer>
  </div>;
}
