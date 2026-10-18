import * as http from 'node:http';
import type { Socket } from 'node:net';
import { timingSafeEqual } from 'node:crypto';
import { summarize, type Shape } from './shape.js';
export const limits = Object.freeze({requests:4,wallMs:60_000,readMs:2_000,bodyBytes:256*1024,
  headerBytes:16*1024,recordBytes:16*1024,totalBytes:64*1024});
export type Client = 'claude'|'codex';
export type Stop = 'cap'|'deadline'|'authentication'|'protocol'|'concurrency'|'storage'|'operator';
type Route = 'messages'|'responses'|'count-tokens'|'metadata'|'other';
export type RecordShape = { client:Client; sequence:number; method:'GET'|'POST'|'other';route:Route;
  contentType:'json'|'other';parameters:boolean;bodyBytes:number;authenticated:boolean;
  headers:{authorization:boolean;contentType:boolean;anthropicVersion:boolean};
  hint:'main'|'subagent'|'workflow'|'compaction'|'auxiliary'|'unknown'; shape?:Shape };
export type Observer = {port:number;stopped:Promise<Stop>;stop:(reason?:Stop)=>void;
  close:()=>Promise<void>;snapshot:()=>{requests:number;records:number;bytes:number;reason:Stop|null}};
function route(url:string|undefined):Route {
  if(url==='/v1/messages')return 'messages';
  if(url==='/v1/messages/count_tokens')return 'count-tokens';
  if(url==='/v1/responses'||url==='/responses')return 'responses';
  if(url==='/v1/models')return 'metadata';return 'other';
}
const denial='{"error":"native bootstrap observer denies all requests"}';
/** No provider client, forwarding import, upstream URL or credential loader exists here. */
export async function startObserver(client:Client,token:string,sink:(record:RecordShape)=>Promise<void>,
  time:{wallMs?:number;readMs?:number}={}):Promise<Observer> {
  if(!/^[a-f0-9]{64}$/.test(token))throw new Error('dummy token shape');
  let reason:Stop|null=null,requests=0,records=0,bytes=0,active=false;
  let resolveStop:(reason:Stop)=>void=()=>{};
  const stopped=new Promise<Stop>(resolve=>{resolveStop=resolve;});
  const sockets=new Set<Socket>();const sequenceBySocket=new WeakMap<object,number>();const seen=new WeakSet<object>();
  const stop=(why:Stop='operator')=>{if(reason===null){reason=why;resolveStop(why);}
    if(why==='deadline'||why==='operator')for(const socket of sockets)socket.destroy();};
  // Connections count immediately, including partial/malformed headers. Pipelined messages add attempts.
  const attempt=(socket:object)=>{if(seen.has(socket))return ++requests;seen.add(socket);return sequenceBySocket.get(socket)??++requests;};
  async function save(record:RecordShape):Promise<void>{
    const length=Buffer.byteLength(JSON.stringify(record)+'\n');
    if(length>limits.recordBytes||bytes+length>limits.totalBytes){stop('storage');return;}
    bytes+=length;try{await sink(record);records++;}catch{stop('storage');}
  }
  const server=http.createServer({maxHeaderSize:limits.headerBytes},(req,res)=>{
    const sequence=attempt(req.socket);
    const deny=()=>{if(!res.destroyed){res.writeHead(503,{'content-type':'application/json','connection':'close'});res.end(denial);}};
    if(reason!==null||requests>limits.requests){stop('cap');deny();return;}
    if(active){stop('concurrency');deny();return;}
    active=true;
    void (async()=>{
      const rawAuth=req.rawHeaders.filter((_,i)=>i%2===0).filter(h=>h.toLowerCase()==='authorization').length;
      const auth=req.headers.authorization;const expected=Buffer.from('Bearer '+token);
      const authenticated=rawAuth===1&&typeof auth==='string'&&Buffer.byteLength(auth)===expected.length&&timingSafeEqual(Buffer.from(auth),expected);
      const classified=route(req.url);const ct=req.headers['content-type']??'';
      const record:RecordShape={client,sequence,method:req.method==='GET'?'GET':req.method==='POST'?'POST':'other',
        route:classified,contentType:/^application\/json(?:\s*;|$)/i.test(ct)?'json':'other',parameters:ct.includes(';'),bodyBytes:0,authenticated,
        headers:{authorization:auth!==undefined,contentType:ct!=='',anthropicVersion:req.headers['anthropic-version']!==undefined},hint:'unknown'};
      const hint=req.headers['x-claude-code-request-kind'];
      if(hint==='main'||hint==='subagent'||hint==='workflow'||hint==='compaction'||hint==='auxiliary')record.hint=hint;
      if(!authenticated){await save(record);stop('authentication');return;}
      if(classified==='other'||record.method==='other'||req.headers['content-encoding']!==undefined||req.headers['transfer-encoding']!==undefined||
        (req.method==='POST'&&record.contentType!=='json')){await save(record);stop('protocol');return;}
      const chunks:Buffer[]=[];let size=0;
      for await(const chunk of req){const part=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=part.length;
        if(size>limits.bodyBytes){stop('protocol');req.destroy();return;}chunks.push(part);}
      record.bodyBytes=size;
      if(size>0)record.shape=summarize(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))));
      if(reason!==null)return;await save(record);
      if(sequence>=limits.requests)res.once('finish',()=>stop('cap'));
    })().catch(()=>{stop('protocol');}).finally(()=>{active=false;deny();});
  });
  server.maxHeadersCount=64;
  server.on('connection',socket=>{
    sequenceBySocket.set(socket,++requests);
    if(sockets.size!==0||reason!==null||requests>limits.requests){stop(requests>limits.requests?'cap':'concurrency');socket.destroy();return;}
    sockets.add(socket);
    // Absolute from acceptance: receiving bytes cannot extend either header or body lifetime.
    const deadline=setTimeout(()=>{stop('deadline');socket.destroy();},Math.min(time.readMs??limits.readMs,limits.readMs));
    socket.once('close',()=>{clearTimeout(deadline);sockets.delete(socket);});
  });
  server.on('clientError',(_error,socket)=>{attempt(socket);stop('protocol');socket.destroy();});
  const rejectTunnel=(_req:http.IncomingMessage,socket:Socket)=>{attempt(socket);stop('protocol');socket.destroy();};
  server.on('connect',rejectTunnel);server.on('upgrade',rejectTunnel);
  server.on('error',()=>stop('protocol'));
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.removeListener('error',reject);resolve();});});
  const address=server.address();if(address===null||typeof address==='string')throw new Error('listener identity');
  const wall=setTimeout(()=>stop('deadline'),Math.min(time.wallMs??limits.wallMs,limits.wallMs));
  return {port:address.port,stopped,stop,snapshot:()=>({requests,records,bytes,reason}),close:async()=>{
    stop();clearTimeout(wall);for(const socket of sockets)socket.destroy();
    await new Promise<void>(resolve=>server.close(()=>resolve()));}};
}
