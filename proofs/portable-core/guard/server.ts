import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { assert, positive, object, text } from './contracts.js';
import { tariff as parseTariff } from './tariff.js';
import { fingerprint, freeze } from './contracts.js';
import { prepare, completion } from './admission.js';
import type { Ledger } from './ledger.js';
import type { Tariff } from './tariff.js';
import type { Host } from '../core/contracts.js';
export async function bytes(stream:NodeJS.ReadableStream,maximum:number):Promise<Buffer> {
 const chunks:Buffer[]=[];let length=0;
 for await(const chunk of stream){assert(Buffer.isBuffer(chunk),'non-byte stream');length+=chunk.length;assert(length<=maximum,'body too large');chunks.push(chunk);}
 return Buffer.concat(chunks);
}
export function mockEndpoint(value:string):URL {const u=new URL(value);assert(u.protocol==='http:'&&u.hostname==='127.0.0.1'&&u.port&&u.pathname==='/'&&!u.search&&!u.hash&&!u.username&&!u.password,'only a fixed numeric-loopback mock upstream is supported');positive(Number(u.port));return u;}
export async function startMockGuard(ledger:Ledger,tariff:Tariff,endpoints:Record<Host,string>):Promise<{url:string;close:()=>Promise<void>}> {
 tariff=freeze(parseTariff(tariff));assert(fingerprint(tariff)===ledger.manifest.tariffHash,'tariff mismatch');
 const upstreams={'claude-code':mockEndpoint(endpoints['claude-code']),codex:mockEndpoint(endpoints.codex)};
 const settings=ledger.manifest;
 const server=http.createServer((req,res)=>{void handle(req,res).catch(()=>{if(!res.destroyed){res.writeHead(503,{'content-type':'application/json'});res.end('{"error":"guard admission denied or upstream uncertain"}');}});});
 server.on('upgrade',(_req,socket)=>{socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');});
 server.on('connect',(_req,socket)=>{socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');});
 server.headersTimeout=2000;server.requestTimeout=settings.deadlineMs;
 async function handle(req:http.IncomingMessage,res:http.ServerResponse):Promise<void> {
  assert(req.method==='POST'&&req.headers['content-type']==='application/json'&&!req.headers['content-encoding'],'unsupported request');
  const authorization=text(req.headers.authorization);assert(/^Bearer [a-f0-9]{64}$/.test(authorization),'invalid token');const token=authorization.slice(7);
  const scope=ledger.authenticate(token);const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await bytes(req,settings.maxBodyBytes)));
  assert(!res.destroyed,'client disconnected');const model=text(object(body).model);const rate=tariff.rates.find(r=>r.model===model&&r.host===scope.host);assert(rate,'model not allowlisted');
  const prepared=prepare(scope.host,text(req.url),body,rate.generatedMaximum);const attempt=ledger.reserve(token,model,prepared);
  let finished=false;const abort=new AbortController();
  const uncertain=()=>{if(finished)return;try{ledger.uncertain(attempt.id);}catch{/* An unusable ledger cannot admit another request. */}abort.abort();};
  res.once('close',uncertain);const timer=setTimeout(uncertain,settings.deadlineMs);
  try {
   ledger.dispatch(attempt.id);const upstream=upstreams[scope.host];
   const response=await new Promise<http.IncomingMessage>((resolve,reject)=>{
    const request=http.request({hostname:'127.0.0.1',port:upstream.port,path:scope.host==='claude-code'?'/v1/messages':'/v1/responses',method:'POST',agent:false,signal:abort.signal,headers:{'content-type':'application/json'}},resolve);
    request.on('error',reject);request.end(JSON.stringify(prepared));
   });
   assert(response.statusCode===200,'upstream failure or redirect');assert(!response.headers['content-encoding'],'encoded upstream unsupported');
   const type=String(response.headers['content-type']).split(';')[0]!.trim();
   const raw=await bytes(response,settings.maxBodyBytes);assert(!abort.signal.aborted,'upstream timeout/cancel');
   const u=completion(scope.host,type,raw,model);ledger.settle(attempt.id,u);finished=true;
   res.writeHead(200,{'content-type':type,'cache-control':'no-store'});res.end(raw);
  }catch(e){uncertain();throw e;}finally{clearTimeout(timer);res.off('close',uncertain);}
 }
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.off('error',reject);resolve();});});
 const address=server.address() as AddressInfo;
 return {url:`http://127.0.0.1:${address.port}`,close:async()=>{ledger.stop('mock guard stopped');server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}};
}
