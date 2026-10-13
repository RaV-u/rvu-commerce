// Dependency-free mobile overflow acceptance using Chrome DevTools Protocol.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const browser=process.env.RVU_CHROME||"google-chrome";
const profile=await mkdtemp(join(tmpdir(),"rvu-layout-"));
const child=spawn(browser,[
  "--headless=new","--no-sandbox","--disable-gpu",
  "--disable-dev-shm-usage","--remote-allow-origins=*",
  "--remote-debugging-port=0","--no-first-run",
  "--user-data-dir="+profile,"about:blank"
],{stdio:"ignore"});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function port(){
  for(let i=0;i<90;i++){
    if(child.exitCode!==null)throw new Error("Chrome exited before DevTools opened");
    try{
      const lines=(await readFile(join(profile,"DevToolsActivePort"),"utf8")).split("\n");
      if(Number(lines[0])>0)return Number(lines[0]);
    }catch{}
    await pause(100);
  }
  throw new Error("Chrome DevTools did not initialize");
}
async function audit(url,width,devtoolsPort){
  const page=await fetch("http://127.0.0.1:"+devtoolsPort+"/json/new?"+encodeURIComponent(url),{method:"PUT"}).then(r=>r.json());
  const ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{
    ws.addEventListener("open",resolve,{once:true});
    ws.addEventListener("error",reject,{once:true});
  });
  const waiting=new Map();
  let id=0;
  ws.addEventListener("message",e=>{
    const response=JSON.parse(String(e.data));
    if(response.id&&waiting.has(response.id)){
      const pair=waiting.get(response.id);
      waiting.delete(response.id);
      response.error?pair.reject(new Error(response.error.message)):pair.resolve(response.result);
    }
  });
  function command(method,params={}){
    return new Promise((resolve,reject)=>{
      const key=++id;waiting.set(key,{resolve,reject});
      ws.send(JSON.stringify({id:key,method,params}));
    });
  }
  try{
    await command("Emulation.setDeviceMetricsOverride",{width,height:900,deviceScaleFactor:1,mobile:true});
    await command("Page.navigate",{url});
    await pause(1900);
    const evaluated=await command("Runtime.evaluate",{
      expression:'(() => { const root=document.documentElement; const width=root.clientWidth; return {viewport:width,scrollWidth:root.scrollWidth,overflowing:[...document.querySelectorAll("body *")].filter(x=>{const r=x.getBoundingClientRect();return r.right>width+2||r.left < -2}).slice(0,12).map(x=>({tag:x.tagName,cls:String(x.className).slice(0,65)}))};})()',
      returnByValue:true
    });
    const result=evaluated.result?.value;
    assert.ok(result && result.viewport>0,"Chrome did not render a document");
    console.log(JSON.stringify({path:new URL(url).pathname,requestedWidth:width,...result}));
    assert.ok(result.scrollWidth<=result.viewport+1,
      "Horizontal document overflow on "+url+" at "+width+"px: "+JSON.stringify(result));
    // Compare computed foregrounds with the nearest opaque ancestor background,
    // so a CSS token that leaves invisible dark-mode text breaks the CI build.
    for(const theme of ["light","dark"]){
      const themeResult=await command("Runtime.evaluate",{
        expression:`(() => {
          document.documentElement.dataset.theme=${JSON.stringify(theme)};
          const selectors=[".hero h1",".hero-signature",".hero-copy p",
            ".hero-quote-link",".section-top h2",".product-title",
            ".product-price",".categories button.active",".gift-banner h2",
            ".gift-banner p",".gift-banner .text-link",".search input"];
          function rgb(color){
            const nums=String(color).match(/[0-9.]+/g)?.slice(0,4).map(Number)||[];
            return nums.length>=3?nums:null;
          }
          function lum(vals){
            const channels=vals.slice(0,3).map(x=>{
              x/=255;return x<=.04045?x/12.92:Math.pow((x+.055)/1.055,2.4);
            });return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;
          }
          return selectors.map(selector=>{
            const el=document.querySelector(selector);
            if(!el)return {selector,missing:true};
            const fore=rgb(getComputedStyle(el).color);
            let back=null,parent=el;
            while(parent){
              const candidate=rgb(getComputedStyle(parent).backgroundColor);
              if(candidate && (candidate.length<4 || candidate[3]>.99)){
                back=candidate;break;
              }
              parent=parent.parentElement;
            }
            const a=fore&&lum(fore),b=back&&lum(back);
            const ratio=a===null||b===null?0:(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
            return {selector,ratio:Math.round(ratio*100)/100};
          });
        })()`,
        returnByValue:true
      });
      const samples=themeResult.result?.value||[];
      const weak=samples.filter(x=>x.missing||x.ratio<4.5);
      console.log(JSON.stringify({contrastTheme:theme,requestedWidth:width,samples}));
      assert.equal(weak.length,0,theme+" theme has hidden or low-contrast text: "+JSON.stringify(weak));
    }
  }finally{ws.close();}
}
try{
  const portNumber=await port();
  for(const width of [420,360])for(const pathname of ["/"])
    await audit("http://localhost:8081"+pathname,width,portNumber);
  console.log("PASS: mobile document width checks at 420px and 360px");
}finally{
  child.kill("SIGTERM");
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:150});
}
