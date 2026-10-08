import assert from 'node:assert/strict';
import https from 'node:https';
import {mkdtemp,readFile,rm,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {createCodex} from '../dist/index.js';
const temp=await mkdtemp(join(tmpdir(),'capsule-models-'));
execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(temp,'key.pem'),'-out',join(temp,'cert.pem'),'-days','1','-subj','/CN=localhost'],{stdio:'ignore'});
const accounts=new Map(['alice','bob'].map(userId=>[userId,{userId,accountId:userId,accessToken:`fixture-${userId}`,refreshToken:'fixture-refresh',expiresAt:Date.now()+3600000}]));
const store={get:async id=>accounts.get(id)??null,put:async a=>accounts.set(a.userId,a),updateTokens:async(id,a)=>{if(accounts.has(id))accounts.set(id,a);},delete:async id=>accounts.delete(id)};
let requests=0,mode='ok',delay=0;const checks=[];
const server=https.createServer({key:await readFile(join(temp,'key.pem')),cert:await readFile(join(temp,'cert.pem'))},async(req,res)=>{
 requests++;if(delay)await new Promise(r=>setTimeout(r,delay));
 res.writeHead(mode==='error'?503:200,{'Content-Type':'application/json'});
 const who=req.headers['chatgpt-account-id'];
 res.end(JSON.stringify(mode==='error'?{}:{models:mode==='invalid'?null:[
 {slug:who,display_name:who,visibility:'list',context_window:272000,max_context_window:1000000},
 {slug:'hidden',display_name:'Hidden',visibility:'hide',context_window:-1,max_context_window:'100'},
 {slug:'unknown',display_name:'Unknown',visibility:'list'},
 {slug:'fraction',display_name:'Fraction',visibility:'list',context_window:1.5,max_context_window:Number.MAX_SAFE_INTEGER+1}
 ]}));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`https://127.0.0.1:${server.address().port}`;
const fetcher=(input,init={})=>new Promise((resolve,reject)=>{
 const url=new URL(String(input));assert.equal(url.origin,origin);
 const request=https.request(url,{headers:Object.fromEntries(new Headers(init.headers)),rejectUnauthorized:false},res=>{
  const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{init.signal?.removeEventListener('abort',abort);resolve(new Response(Buffer.concat(chunks),{status:res.statusCode}));});res.on('error',reject);
 });const abort=()=>request.destroy(init.signal.reason);request.on('error',reject);
 if(init.signal?.aborted)return abort();init.signal?.addEventListener('abort',abort,{once:true});request.end();
});
const config={store,endpoint:origin,issuer:origin,fetch:fetcher};
const codex=createCodex({...config,modelCatalogCacheTtlMs:80});
const check=(name,fn)=>Promise.resolve().then(fn).then(()=>checks.push(name));
try{
 await check('capacity metadata and null validation',async()=>{
  const list=await codex.models('alice');assert.equal(list[0].contextWindow,272000);assert.equal(list[0].maxContextWindow,1000000);
  assert(list.slice(1).every(m=>m.contextWindow===null&&m.maxContextWindow===null));
 });
 await check('cache hit and returned objects isolated',async()=>{const before=requests;const list=await codex.models('alice');list[0].slug='changed';assert.equal((await codex.models('alice'))[0].slug,'alice');assert.equal(requests,before);});
 await check('hidden catalog shares discovery but filters each caller',async()=>{const before=requests;const list=await codex.models('alice',{includeHidden:true});assert(list.some(m=>m.slug==='hidden'));assert.equal(requests,before);});
 await check('account isolation',async()=>{assert.equal((await codex.models('bob'))[0].slug,'bob');});
 await check('TTL expiry',async()=>{await new Promise(r=>setTimeout(r,100));const before=requests;await codex.models('alice');assert.equal(requests,before+1);});
 await check('explicit refresh',async()=>{const before=requests;await codex.models('alice',{refresh:true});assert.equal(requests,before+1);});
 await check('concurrent discovery and independent cancellation',async()=>{
  delay=80;const before=requests;const abort=new AbortController();const first=codex.models('alice',{refresh:true,signal:abort.signal});
  const rejected=assert.rejects(first,/cancelled/);const second=codex.models('alice',{refresh:true});setTimeout(()=>abort.abort(new Error('cancelled')),20);
  await rejected;assert.equal((await second)[0].slug,'alice');assert.equal(requests,before+1);delay=0;
 });
 await check('pre-aborted signal does no request',async()=>{const before=requests;await assert.rejects(codex.models('alice',{signal:AbortSignal.abort(new Error('cancelled'))}),/cancelled/);assert.equal(requests,before);});
 await check('HTTP errors not cached',async()=>{mode='error';await assert.rejects(codex.models('alice',{refresh:true}),/503/);mode='ok';const before=requests;await codex.models('alice');assert.equal(requests,before+1);});
 await check('invalid catalog not cached',async()=>{mode='invalid';await assert.rejects(codex.models('alice',{refresh:true}),/invalid model catalog/);mode='ok';await codex.models('alice');});
 await check('external credential deletion blocks cache hit',async()=>{const saved=accounts.get('alice');accounts.delete('alice');await assert.rejects(codex.models('alice'),/Sign in/);accounts.set('alice',saved);});
 await check('disconnect aborts pending catalog and prevents stale repopulation',async()=>{
  delay=100;const pending=codex.models('bob',{refresh:true});const rejected=assert.rejects(pending);await new Promise(r=>setTimeout(r,20));await codex.auth.disconnect('bob');await rejected;await assert.rejects(codex.models('bob'),/Sign in/);delay=0;
 });
 await check('zero TTL disables caching',async()=>{const uncached=createCodex({...config,modelCatalogCacheTtlMs:0});const before=requests;await uncached.models('alice');await uncached.models('alice');assert.equal(requests,before+2);uncached.dispose();});
 await check('bounded cache eviction',async()=>{const bounded=createCodex({...config,modelCatalogCacheMaxAccounts:1});accounts.set('bob',{...accounts.get('alice'),userId:'bob',accountId:'bob'});await bounded.models('alice');await bounded.models('bob');const before=requests;await bounded.models('alice');assert.equal(requests,before+1);bounded.dispose();});
 await check('invalid configuration rejected',()=>{assert.throws(()=>createCodex({...config,modelCatalogCacheTtlMs:-1}));assert.throws(()=>createCodex({...config,modelCatalogCacheMaxAccounts:0}));});
 await check('dispose aborts pending request and blocks new discovery',async()=>{delay=100;const pending=codex.models('alice',{refresh:true});const rejected=assert.rejects(pending);await new Promise(r=>setTimeout(r,20));codex.dispose();await rejected;await assert.rejects(codex.models('alice'),/disposed/);});
 await mkdir('.artifacts',{recursive:true});await writeFile('.artifacts/models-e2e.json',JSON.stringify({checks,requests,liveOpenAI:false},null,2));console.log(`${checks.length} HTTPS model catalog checks passed.`);
}finally{codex.dispose();server.closeAllConnections();await new Promise(r=>server.close(r));await rm(temp,{recursive:true,force:true});}
