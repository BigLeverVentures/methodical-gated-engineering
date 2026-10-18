import {test} from 'node:test';
import * as a from 'node:assert/strict';
import * as http from 'node:http';
import {connect} from 'node:net';
import {readFileSync} from 'node:fs';
import {summarize} from '../bootstrap/shape.js';
import {startObserver,limits,type RecordShape} from '../bootstrap/observer.js';
const token='a'.repeat(64);
async function request(port:number,body:unknown,extra:Record<string,string>={},url='/v1/messages') {
  const data=JSON.stringify(body);
  return new Promise<{status:number|undefined;body:string}>((resolve,reject)=>{
    const req=http.request({hostname:'127.0.0.1',port,path:url,method:'POST',agent:false,
      headers:{authorization:'Bearer '+token,'content-type':'application/json','content-length':Buffer.byteLength(data),...extra}},res=>{
      let text='';res.on('data',c=>{text+=c.toString();});res.on('end',()=>resolve({status:res.statusCode,body:text}));});
    req.on('error',reject);req.end(data);
  });
}
test('shape redacts every scalar and arbitrary key and bounds opaque nested values',()=>{
  const secret='synthetic-private-marker';
  const shape=summarize({model:secret,messages:[{role:secret,content:[{type:secret,text:secret}]}],metadata:{[secret]:secret},[secret]:{text:secret},max_tokens:987654321});
  a.ok(!JSON.stringify(shape).includes(secret));a.ok(!JSON.stringify(shape).includes('987654321'));
  a.equal(shape.type,'object');
  let nested:unknown='secret';for(let i=0;i<14;i++)nested={unknown:nested};
  a.throws(()=>summarize(nested),/limit/);a.throws(()=>summarize(Array(1025).fill(0)),/limit/);
});
test('native richer shapes get bounded observations and four unconditional denials',async()=>{
  const records:RecordShape[]=[];const o=await startObserver('claude',token,async r=>{records.push(r);});
  try{for(let i=0;i<4;i++){
    const reply=await request(o.port,{model:'private-model',system:[{text:'private-prompt',cache_control:{type:'private-cache'}}],thinking:{type:'private-type'}});
    a.equal(reply.status,503);a.ok(!reply.body.includes('private-'));await new Promise(r=>setTimeout(r,5));
  }
  a.equal(await o.stopped,'cap');a.equal(records.length,4);a.equal(o.snapshot().requests,4);
  a.ok(!JSON.stringify(records).includes('private-'));a.ok(o.snapshot().bytes<=limits.totalBytes);
  }finally{await o.close();}
});
test('authentication, unknown routes and compression latch denial without recording payload',async()=>{
  for(const [headers,url,why] of [[{authorization:'Bearer secret'},'/v1/messages','authentication'],[{},'/private-route?secret','protocol'],[{'content-encoding':'gzip'},'/v1/messages','protocol']] as const){
    const o=await startObserver('codex',token,async r=>{a.equal(r.shape,undefined);a.equal(r.authenticated,why!=='authentication');a.ok(!JSON.stringify(r).includes('secret'));});
    try{const reply=await request(o.port,{input:'secret'},headers,url);a.equal(reply.status,503);a.equal(await o.stopped,why);a.equal(o.snapshot().records,1);}finally{await o.close();}
  }
});
test('oversized bodies, depth, malformed JSON and failed storage remain denied',async()=>{
  for(const body of [{input:'x'.repeat(limits.bodyBytes)},Array(1025).fill(0)]){
    const o=await startObserver('codex',token,async()=>{a.fail('oversize persisted');});
    try{await request(o.port,body).catch(()=>{});a.equal(await o.stopped,'protocol');}finally{await o.close();}
  }
  const o=await startObserver('codex',token,async()=>{throw new Error('private storage path');});
  try{const r=await request(o.port,{input:'secret'});a.equal(r.status,503);a.ok(!r.body.includes('private'));a.equal(await o.stopped,'storage');}finally{await o.close();}
});
test('concurrent sockets and tunnels cannot queue extra work; deadline closes idle work',async()=>{
  const o=await startObserver('codex',token,async()=>{});const first=connect(o.port,'127.0.0.1');
  try{await new Promise<void>(r=>first.once('connect',r));const second=connect(o.port,'127.0.0.1');second.on('error',()=>{});
    try{a.equal(await o.stopped,'concurrency');a.equal(o.snapshot().records,0);}finally{second.destroy();}
  }finally{first.destroy();await o.close();}
  for(const prefix of ['CONNECT localhost:443 HTTP/1.1\r\nHost: localhost\r\n\r\n','GET / HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n']){
    const x=await startObserver('claude',token,async()=>{});const s=connect(x.port,'127.0.0.1');s.on('error',()=>{});
    try{s.end(prefix);a.equal(await x.stopped,'protocol');a.equal(x.snapshot().records,0);}finally{s.destroy();await x.close();}
  }
  const timed=await startObserver('claude',token,async()=>{},{wallMs:15});try{a.equal(await timed.stopped,'deadline');}finally{await timed.close();}
});
test('observer has only local built-in imports and exposes no provider constructor',()=>{
  const source=process.env.PROOF_SOURCE;a.ok(source);
  const code=readFileSync(source+'/bootstrap/observer.ts','utf8');
  const imports=[...code.matchAll(/from '([^']+)'/g)].map(m=>m[1]);
  a.deepEqual(imports,['node:http','node:net','node:crypto','./shape.js']);
  a.ok(!code.includes('fetch('));a.ok(!code.includes('http.request('));
});

async function raw(port:number,text:string):Promise<string>{
  return new Promise((resolve,reject)=>{
    const socket=connect(port,'127.0.0.1');let response='';
    socket.on('data',data=>{response+=data.toString();});socket.on('error',reject);
    socket.on('close',()=>resolve(response));socket.write(text);
  });
}
test('raw malformed JSON is denied and same-socket pipelines cannot queue captures',async()=>{
  const headers=`POST /v1/messages HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer ${token}\r\nContent-Type: application/json\r\nContent-Length: 1\r\n\r\n`;
  const malformed=await startObserver('claude',token,async()=>a.fail('malformed body persisted'));
  try{const response=await raw(malformed.port,headers+'{');a.ok(response.includes('503'));a.equal(await malformed.stopped,'protocol');a.equal(malformed.snapshot().requests,1);a.equal(malformed.snapshot().records,0);}finally{await malformed.close();}
  const pipeline=await startObserver('codex',token,async()=>a.fail('pipeline capture queued'));
  try{await raw(pipeline.port,headers+'0'+headers+'0');a.equal(await pipeline.stopped,'concurrency');a.equal(pipeline.snapshot().requests,2);a.equal(pipeline.snapshot().records,0);}finally{await pipeline.close();}
});
test('absolute acceptance and wall deadlines close dripping or unfinished headers',async()=>{
  for(const timing of [{readMs:60,wallMs:500},{readMs:500,wallMs:40}]){
    const o=await startObserver('claude',token,async()=>a.fail('partial header persisted'),timing);
    const socket=connect(o.port,'127.0.0.1');socket.on('error',()=>{});
    let interval:ReturnType<typeof setInterval>|undefined;let timer:ReturnType<typeof setTimeout>|undefined;
    try{
      const closed=new Promise<void>(resolve=>socket.once('close',()=>resolve()));
      socket.write('POST /v1/messages HTTP/1.1\r\nX-Slow: ');interval=setInterval(()=>socket.write('x'),10);
      await Promise.race([closed,new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(new Error('read deadline extended')),250);})]);
      a.equal(await o.stopped,'deadline');a.equal(o.snapshot().requests,1);a.equal(o.snapshot().records,0);
    }finally{clearInterval(interval);clearTimeout(timer);socket.destroy();await o.close();}
  }
});
