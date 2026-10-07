import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createCodex, tool } from '../dist/index.js';
import { createEncryptedFileStore, createAesEncryption } from '../dist/adapters/storage.js';
import { z } from 'zod';
const directory=process.env.CODEX_ACCOUNT_DIRECTORY, keyFile=process.env.CODEX_KEY_FILE,userId=process.env.CODEX_USER_ID;
if(!directory||!keyFile||!userId)throw Error('Set CODEX_ACCOUNT_DIRECTORY, CODEX_KEY_FILE, and CODEX_USER_ID. See docs/VERIFY.md.');
const keyText=(await readFile(keyFile,'utf8')).trim();const key=Buffer.from(keyText,'base64');
const store=createEncryptedFileStore({directory,encryption:createAesEncryption(key),...(process.env.CODEX_ACCOUNT_FILENAME?{singleAccount:{userId,filename:process.env.CODEX_ACCOUNT_FILENAME}}:{})});
const codex=createCodex({store});
try{
 const models=await codex.models(userId);const model=process.env.CODEX_MODEL||models[0]?.slug;if(!model)throw Error('No model is available.');
 const calls=[];const tools={multiply:tool({description:'Multiply two numbers.',inputSchema:z.object({a:z.number(),b:z.number()}),execute:async({a,b})=>{const result={answer:a*b};calls.push({a,b,...result});return result;}})};
 async function collect(result){let text='';const events=[];for await(const part of result.fullStream){if(part.type==='error')throw part.error;if(part.type==='text-delta')text+=part.text;if(part.type==='tool-call')events.push({type:part.type,name:part.toolName,input:part.input});if(part.type==='tool-result')events.push({type:part.type,name:part.toolName,output:part.output});}return{text,events,messages:(await result.response).messages};}
 const history=[{role:'user',content:'Call multiply for 17 times 23, then tell me the result.'}];
 const first=await collect(codex.chat({userId,model,messages:history,tools}));assert(calls.length);assert(first.text.includes('391'));
 const followup=await collect(codex.chat({userId,model,messages:[...history,...first.messages,{role:'user',content:'What did the tool return? Do not call it again.'}],tools}));assert(followup.text.includes('391'));
 const report={provider:'live OpenAI Codex',model,models:models.map(m=>m.slug),first:{text:first.text,events:first.events},followup:{text:followup.text,events:followup.events},calls};
 await mkdir('.artifacts',{recursive:true});await writeFile('.artifacts/live.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{codex.dispose();}
