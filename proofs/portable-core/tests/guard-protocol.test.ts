import { test as nodeTest } from 'node:test';
const test=(name:string,fn:()=>void|Promise<void>)=>nodeTest(name,{timeout:5000},fn);
import * as a from 'node:assert/strict';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { guardManifest,ledgerFixture,rates } from './guard-fixture.js';
import { startMockGuard,mockEndpoint } from '../guard/server.js';
import { prepare,completion } from '../guard/admission.js';
import type { Host } from '../core/contracts.js';
const codex={model:'mock-codex',input:'hello',stream:false};
const claude={model:'mock-claude',messages:[{role:'user',content:'hello'}],stream:false};
const terminal=(host:Host)=>host==='codex'?{id:'synthetic-response',object:'response',model:'mock-codex',status:'completed',usage:{input_tokens:10,output_tokens:10,total_tokens:20,output_tokens_details:{reasoning_tokens:8}}}:{id:'synthetic-message',type:'message',model:'mock-claude',stop_reason:'end_turn',usage:{input_tokens:10,output_tokens:10}};
type Handle=(req:http.IncomingMessage,res:http.ServerResponse,body:Record<string,unknown>)=>void;
async function fixture(handler?:Handle,m=guardManifest()){
 const f=ledgerFixture(m);const seen:Record<string,unknown>[]=[];
 const upstream=http.createServer((req,res)=>{void (async()=>{let s='';for await(const c of req)s+=c;const body=JSON.parse(s) as Record<string,unknown>;seen.push(body);
  a.equal(f.ledger.snapshot().attempts.at(-1)?.state,'dispatched');a.ok(f.ledger.snapshot().totals.microUsd>0);
  a.equal(req.headers.authorization,undefined);if(handler){handler(req,res,body);return;}res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(terminal(req.url==='/v1/messages'?'claude-code':'codex')));
 })().catch(e=>{res.destroy(e as Error);});});
 await new Promise<void>(resolve=>upstream.listen(0,'127.0.0.1',resolve));const address=upstream.address() as AddressInfo;
 const guard=await startMockGuard(f.ledger,rates,{'claude-code':`http://127.0.0.1:${address.port}`,codex:`http://127.0.0.1:${address.port}`});
 async function send(body:unknown=codex,host:Host='codex',path=host==='codex'?'/v1/responses':'/v1/messages',token=f.tokens[host==='codex'?'codex-run':'claude-run']){
  return fetch(guard.url+path,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify(body)});
 }
 return {...f,seen,guard,send,close:async()=>{await guard.close();upstream.closeAllConnections();await new Promise<void>(resolve=>upstream.close(()=>resolve()));f.cleanup();}};
}
test('both protocols reserve durably, clamp generation including reasoning and settle trusted final usage',async()=>{
 const f=await fixture();try{
  a.equal((await f.send()).status,200);a.equal(f.seen[0]?.max_output_tokens,4000);
  a.equal((await f.send(claude,'claude-code')).status,200);a.equal(f.seen[1]?.max_tokens,4000);
  a.deepEqual(f.ledger.snapshot().totals,{microUsd:220,requests:2,generatedTokens:20});
 }finally{await f.close();}
});
test('retries and replayed IDs consume fresh request slots and a scoped token cannot select another host',async()=>{
 const m=guardManifest();m.allocations[1]!.cap.requests=2;const f=await fixture(undefined,m);try{
  a.equal((await f.send()).status,200);a.equal((await f.send()).status,200);a.equal((await f.send()).status,503);
  a.equal((await f.send(claude,'codex','/v1/messages')).status,503);
  a.equal(f.seen.length,2);a.equal(new Set(f.ledger.snapshot().attempts.map(x=>x.id)).size,2);
 }finally{await f.close();}
});
test('unknown endpoint, premium model/tools, hidden state and actor price claims never reach upstream',async()=>{
 const f=await fixture();try{
  for(const [body,path] of [
   [{...codex,service_tier:'priority'},'/v1/responses'],[{...codex,tools:[{type:'web_search'}]},'/v1/responses'],
   [{...codex,previous_response_id:'opaque'},'/v1/responses'],[{...codex,microUsd:1},'/v1/responses'],
   [{...codex,input:[{role:'user',content:[{type:'input_image',image_url:'invalid'}]}]},'/v1/responses'],
   [codex,'/v1/responses/compact'],[codex,'/v1/responses?redirect=1'],[codex,'/state?nonce=1']
  ] as const)a.equal((await f.send(body,'codex',path)).status,503);
  a.equal(f.seen.length,0);a.equal(f.ledger.snapshot().totals.requests,0);
  for(const endpoint of ['https://api.example.invalid','http://localhost:1234','http://127.0.0.1:1234/forward','http://actor@127.0.0.1:1234'])a.throws(()=>mockEndpoint(endpoint),/loopback/);
 }finally{await f.close();}
});
test('redirect, missing or excessive usage retain the full reserve and do not retry implicitly',async()=>{
 for(const which of ['redirect','missing','excess'] as const){
  const f=await fixture((_req,res)=>{if(which==='redirect'){res.writeHead(307,{location:'http://api.example.invalid'});res.end();return;}
   const t=terminal('codex');if(which==='missing')delete (t as Partial<typeof t>).usage;
   else t.usage={input_tokens:1001,output_tokens:10,total_tokens:1011,output_tokens_details:{reasoning_tokens:8}};
   res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(t));});
  try{a.equal((await f.send()).status,503);a.equal(f.seen.length,1);a.equal(f.ledger.snapshot().attempts[0]?.state,'uncertain');a.equal(f.ledger.snapshot().totals.microUsd,39000);}finally{await f.close();}
 }
});
test('HTTP timeout and client cancellation retain exposure while future attempts still need reservations',async()=>{
 const m=guardManifest();m.deadlineMs=40;const f=await fixture(()=>{},m);try{
  a.equal((await f.send()).status,503);a.equal(f.ledger.snapshot().attempts[0]?.state,'uncertain');a.equal(f.seen.length,1);
  const aborted=new AbortController();const request=fetch(f.guard.url+'/v1/responses',{method:'POST',signal:aborted.signal,headers:{'content-type':'application/json',authorization:'Bearer '+f.tokens['codex-run']},body:JSON.stringify(codex)});
  while(f.seen.length<2)await new Promise(resolve=>setTimeout(resolve,2));aborted.abort();await a.rejects(request);
  await new Promise(resolve=>setTimeout(resolve,20));a.equal(f.ledger.snapshot().attempts[1]?.state,'uncertain');a.equal(f.ledger.snapshot().totals.microUsd,78000);
 }finally{await f.close();}
});
test('concurrent HTTP requests each hold their full reserve and respect aggregate cap before forwarding',async()=>{
 const m=guardManifest();m.total.microUsd=78000;const pending:http.ServerResponse[]=[];
 const f=await fixture((_req,res)=>{pending.push(res);},m);try{
  let denied=0;const requests=Array.from({length:5},()=>f.send().then(r=>{if(r.status===503)denied++;return r;}));
  while(pending.length<2||denied<3)await new Promise(resolve=>setTimeout(resolve,2));
  a.equal(f.seen.length,2);a.equal(f.ledger.snapshot().totals.microUsd,78000);
  for(const res of pending){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(terminal('codex')));}
  const results=await Promise.all(requests);a.equal(results.filter(r=>r.status===200).length,2);a.equal(results.filter(r=>r.status===503).length,3);
 }finally{await f.close();}
});
test('SSE final accounting requires an unambiguous complete terminal frame and no extra terminal',()=>{
 const event=(type:string,rest:unknown)=>`event: ${type}\ndata: ${JSON.stringify({type,...rest as object})}\n\n`;
 const codexStream=event('response.created',{})+event('response.completed',{response:terminal('codex')});
 a.deepEqual(completion('codex','text/event-stream',Buffer.from(codexStream),'mock-codex'),{inputTokens:10,outputTokens:10});
 for(const raw of [codexStream.trimEnd(),codexStream+event('response.completed',{response:terminal('codex')}),event('response.failed',{}),event('response.completed',{response:{...terminal('codex'),model:'changed'}})])a.throws(()=>completion('codex','text/event-stream',Buffer.from(raw),'mock-codex'));
 const claudeStream=event('message_start',{message:{model:'mock-claude',usage:{input_tokens:10,output_tokens:0}}})+event('message_delta',{delta:{stop_reason:'end_turn'},usage:{output_tokens:20}})+event('message_stop',{});
 a.deepEqual(completion('claude-code','text/event-stream',Buffer.from(claudeStream),'mock-claude'),{inputTokens:10,outputTokens:20});
 a.throws(()=>completion('claude-code','text/event-stream',Buffer.from(claudeStream.replace(/event: message_stop[\s\S]*/,'')),'mock-claude'),/final/);
 a.throws(()=>prepare('claude-code','/v1/messages',{...claude,thinking:{type:'adaptive'}},4000),/unknown/);
});
test('WebSocket upgrade and CONNECT cannot create a passthrough billing channel',async()=>{
 const f=await fixture();try{
  const port=new URL(f.guard.url).port;
  const upgrade=await new Promise<number|undefined>((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port,path:'/v1/responses',headers:{connection:'Upgrade',upgrade:'websocket'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end();});a.equal(upgrade,403);
  const tunnel=await new Promise<number|undefined>((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port,method:'CONNECT',path:'api.example.invalid:443'});req.on('connect',(res,socket)=>{socket.destroy();resolve(res.statusCode);});req.on('error',reject);req.end();});a.equal(tunnel,403);a.equal(f.seen.length,0);
 }finally{await f.close();}
});
