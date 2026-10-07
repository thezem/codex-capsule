// Full HTTP protocol/UI harness. These synthetic accounts are NOT OpenAI live proof.
import assert from 'node:assert/strict';
import https from 'node:https';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { chromium } from 'playwright';
import { createCodex } from '../dist/index.js';
import { createAesEncryption, createEncryptedFileStore } from '../dist/adapters/storage.js';
import { createAuthHandler } from '../dist/adapters/http.js';
const temp=await mkdtemp(join(tmpdir(),'codex-capsule-e2e-'));
execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(temp,'key.pem'),'-out',join(temp,'cert.pem'),'-days','1','-subj','/CN=localhost'],{stdio:'ignore'});
const {publicKey,privateKey}=await generateKeyPair('RS256');const jwk={...await exportJWK(publicKey),kid:'fixture-key',alg:'RS256',use:'sig'};
let origin,codex,handler,browser;let sequence=0,latest,refreshCount=0,inferenceCount=0,refreshDelay=0,exchangeHold,exchangeEntered=false;
const flows=new Map(),checks=[];
const json=(res,value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
const server=https.createServer({key:await readFile(join(temp,'key.pem')),cert:await readFile(join(temp,'cert.pem'))},async(req,res)=>{
 try{
  const url=new URL(req.url,origin);let raw='';for await(const c of req)raw+=c;
  if(url.pathname==='/.well-known/jwks.json')return json(res,{keys:[jwk]});
  if(url.pathname==='/api/accounts/deviceauth/usercode'){
   latest=`device-${++sequence}`;flows.set(latest,{approved:false,transient:false});return json(res,{device_auth_id:latest,user_code:`TEST-${sequence}`,interval:1});
  }
  if(url.pathname==='/api/accounts/deviceauth/token'){
   const body=JSON.parse(raw),flow=flows.get(body.device_auth_id);if(flow?.transient){flow.transient=false;return json(res,{error:'temporary'},503);}
   return flow?.approved?json(res,{authorization_code:body.device_auth_id,code_verifier:'fixture-verifier'}):json(res,{},403);
  }
  if(url.pathname==='/oauth/token'){
   const form=new URLSearchParams(raw),refresh=form.get('grant_type')==='refresh_token';
   if(refresh){refreshCount++;if(refreshDelay)await new Promise(r=>setTimeout(r,refreshDelay));}
   if(!refresh&&exchangeHold){exchangeEntered=true;await exchangeHold;}
   const id=refresh?form.get('refresh_token').replace(/^refresh-/,''):form.get('code');
   const jwt=await new SignJWT({email:`${id}@example.test`,'https://api.openai.com/auth':{chatgpt_account_id:`account-${id}`,chatgpt_plan_type:'fixture'}}).setProtectedHeader({alg:'RS256',kid:'fixture-key'}).setIssuer(origin).setAudience('fixture-client').setIssuedAt().setExpirationTime('1h').sign(privateKey);
   return json(res,{access_token:`access-${id}-${refreshCount}`,refresh_token:`refresh-${id}`,id_token:jwt,expires_in:3600});
  }
  if(url.pathname==='/codex/models')return json(res,{models:[{slug:'fixture-model',display_name:'Fixture',visibility:'list'}]});
  if(url.pathname==='/codex/responses'){inferenceCount++;return json(res,{error:{message:'Fixture only'}},501);}
  if(url.pathname.startsWith('/auth/')){
   const response=await handler(new Request(url,{method:req.method,headers:req.headers}));res.writeHead(response.status,Object.fromEntries(response.headers));return res.end(await response.text());
  }
  if(url.pathname==='/ui.js'){res.writeHead(200,{'Content-Type':'text/javascript'});return res.end(await readFile('dist/ui/index.js'));}
  if(url.pathname==='/'){
   res.writeHead(200,{'Content-Type':'text/html'});return res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="auth"></div><script type="module">import {mountCodexAuth,createAuthTransport} from '/ui.js';window.panel=mountCodexAuth(document.querySelector('#auth'),{transport:createAuthTransport({baseURL:'/auth'}),labels:{title:'Your account. Your agents.'}});</script>`);
  }
  return json(res,{},404);
 }catch(e){if(!res.headersSent)json(res,{error:String(e)},500);else res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`https://127.0.0.1:${server.address().port}`;
// The self-signed certificate exception is confined to this fixture's exact origin.
const fixtureFetch=async(input,init={})=>{
 const url=new URL(input instanceof Request?input.url:String(input));if(url.origin!==origin)throw Error('Fixture fetch cannot leave its origin.');
 return new Promise((resolve,reject)=>{
  const req=https.request(url,{method:init.method||'GET',headers:Object.fromEntries(new Headers(init.headers)),rejectUnauthorized:false},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{init.signal?.removeEventListener('abort',abort);resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:res.headers}));});res.on('error',reject);});
  const abort=()=>req.destroy(init.signal.reason||Error('Aborted'));req.on('error',reject);if(init.signal){if(init.signal.aborted)return abort();init.signal.addEventListener('abort',abort,{once:true});}req.end(init.body?String(init.body):undefined);
 });
};
const store=createEncryptedFileStore({directory:join(temp,'accounts'),encryption:createAesEncryption(randomBytes(32))});
codex=createCodex({store,issuer:origin,endpoint:`${origin}/codex`,clientId:'fixture-client',fetch:fixtureFetch});
handler=createAuthHandler({codex,origin,resolveUser:req=>req.headers.get('x-fixture-user')||'browser-user'});
async function waitFor(fn,label){const until=Date.now()+10000;while(Date.now()<until){if(await fn())return;await new Promise(r=>setTimeout(r,30));}throw Error(`Timed out: ${label}`);}
try{
 await codex.auth.start('alice');flows.get(latest).transient=true;flows.get(latest).approved=true;
 await waitFor(async()=> (await codex.auth.session('alice')).status==='connected','approval');checks.push('signed approval + transient polling recovery');
 const alice=await store.get('alice');assert(alice.accountId);assert(!JSON.stringify(await codex.auth.session('alice')).includes(alice.accessToken));checks.push('public status contains no tokens');
 await store.put({...alice,expiresAt:0});refreshDelay=150;const before=refreshCount;
 const refresh=Promise.all([codex.models('alice'),codex.models('alice')]);codex.auth.cancel('alice');await refresh;assert.equal(refreshCount,before+1);assert((await store.get('alice')).expiresAt>Date.now());checks.push('single concurrent refresh survives sign-in cancellation');
 await codex.auth.start('bob');flows.get(latest).approved=true;await waitFor(async()=> (await codex.auth.session('bob')).status==='connected','second account');assert.notEqual((await store.get('alice')).accountId,(await store.get('bob')).accountId);checks.push('two accounts stay isolated');
 await codex.auth.start('cancelled');flows.get(latest).approved=true;codex.auth.cancel('cancelled');await new Promise(r=>setTimeout(r,1100));assert.equal(await store.get('cancelled'),null);checks.push('cancelled approval is not stored');
 let release;exchangeHold=new Promise(r=>release=r);exchangeEntered=false;await codex.auth.start('race');flows.get(latest).approved=true;await waitFor(()=>exchangeEntered,'exchange in flight');await codex.auth.disconnect('race');release();exchangeHold=null;await new Promise(r=>setTimeout(r,150));assert.equal(await store.get('race'),null);checks.push('disconnect wins over in-flight exchange');
 const expired=await store.get('bob');await store.put({...expired,expiresAt:0});refreshDelay=200;const refreshRace=codex.models('bob').then(()=>false,()=>true);await new Promise(r=>setTimeout(r,50));await codex.auth.disconnect('bob');assert(await refreshRace);assert.equal(await store.get('bob'),null);checks.push('refresh does not recreate disconnected account');
 const aborted=new AbortController();aborted.abort();const result=codex.chat({userId:'alice',model:'fixture-model',messages:[{role:'user',content:'hello'}],signal:aborted.signal});for await(const part of result.fullStream){}assert.equal(inferenceCount,0);checks.push('pre-aborted chat sends no inference request');
 const blocked=await handler(new Request(`${origin}/auth/disconnect`,{method:'POST',headers:{Origin:'https://wrong.example'}}));assert.equal(blocked.status,403);checks.push('wrong-origin mutation rejected');
 const executablePath=process.env.CODEX_BROWSER_PATH||(process.platform==='linux'&&await import('node:fs').then(fs=>fs.existsSync('/usr/bin/google-chrome'))?'/usr/bin/google-chrome':undefined);
 browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});const context=await browser.newContext({ignoreHTTPSErrors:true,permissions:['clipboard-read','clipboard-write'],viewport:{width:390,height:780}});const page=await context.newPage();await page.goto(origin);
 await page.getByRole('button',{name:'Continue with ChatGPT'}).click();await page.getByRole('textbox',{name:'Sign-in code'}).waitFor();await page.getByRole('button',{name:'Copy code',exact:true}).click();await page.getByText('Copied',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await mkdir('.artifacts',{recursive:true});await page.screenshot({path:'.artifacts/auth-ui.png'});await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.getByRole('button',{name:'Continue with ChatGPT'}).waitFor();assert.equal(await store.get('browser-user'),null);checks.push('browser code + clipboard + mobile layout + cancel');
 await page.getByRole('button',{name:'Continue with ChatGPT'}).click();await page.getByRole('textbox',{name:'Sign-in code'}).waitFor();flows.get(latest).approved=true;await page.getByRole('heading',{name:'ChatGPT connected',exact:true}).waitFor();await page.getByRole('button',{name:'Disconnect',exact:true}).click();await page.getByRole('button',{name:'Continue with ChatGPT'}).waitFor();assert.equal(await store.get('browser-user'),null);checks.push('browser approval + disconnect');
 const report={provider:'isolated HTTPS protocol harness (not OpenAI)',checks,passed:true};await writeFile('.artifacts/auth-e2e.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{codex.dispose();await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(temp,{recursive:true,force:true});}
