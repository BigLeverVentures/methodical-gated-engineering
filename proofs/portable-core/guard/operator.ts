import * as http from 'node:http';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generateKeyPairSync,randomBytes,sign,verify,timingSafeEqual } from 'node:crypto';
import { assert, freeze, exact, object, text, positive, integer, hash, fingerprint, canonical } from './contracts.js';
import { bytes } from './server.js';
import { validatePins } from './isolation.js';
import type { Ledger } from './ledger.js';
export function codeHash():string {
 const directory=fileURLToPath(new URL('.',import.meta.url));
 const files=fs.readdirSync(directory).filter(f=>f.endsWith('.js')).sort().map(f=>[f,fs.readFileSync(directory+'/'+f,'utf8')]);
 files.push(['core/contracts.js',fs.readFileSync(new URL('../core/contracts.js',import.meta.url),'utf8')]);
 return fingerprint({node:process.versions.node,files});
}
export type StateReceipt={mode:'mock-only';nonce:string;manifestHash:string;batchHash:string;tariffHash:string;codeHash:string;ledgerId:string;revision:number;ledgerDigest:string;stopped:string|null;expiresAt:number;totals:{microUsd:number;requests:number;generatedTokens:number}};
export type Pins=ReturnType<typeof validatePins>;
export type Connection={socketPath:string;token:string;pins:Pins};
export async function startMockControl(ledger:Ledger,socketPath:string):Promise<{connection:Connection;close:()=>Promise<void>}> {
 assert(!fs.existsSync(socketPath),'control path already exists');const token=randomBytes(32).toString('hex');const keys=generateKeyPairSync('ed25519');const binary=codeHash();
 const publicKey=keys.publicKey.export({type:'spki',format:'pem'}).toString();const ledgerId=ledger.snapshot().ledgerId;
 const server=http.createServer((req,res)=>{
  try {
   assert(req.method==='GET'&&req.url?.startsWith('/state?nonce='),'unsupported control operation');
   const nonce=text(req.url).slice('/state?nonce='.length);assert(/^[a-f0-9]{64}$/.test(nonce),'invalid nonce');
   const supplied=String(req.headers.authorization);const expected='Bearer '+token;
   assert(supplied.length===expected.length&&timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)),'operator authentication required');
   const s=ledger.snapshot();const receipt:StateReceipt={mode:'mock-only',nonce,manifestHash:s.manifestHash,batchHash:ledger.manifest.batchHash,
    tariffHash:ledger.manifest.tariffHash,codeHash:binary,ledgerId,revision:s.revision,ledgerDigest:fingerprint(s),stopped:s.stopped,expiresAt:Math.min(ledger.manifest.expiresAt,Date.now()+5000),totals:s.totals};
   const signature=sign(null,Buffer.from(canonical(receipt)),keys.privateKey).toString('base64');res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({receipt,signature}));
  }catch{res.writeHead(403);res.end();}
 });
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(socketPath,()=>{server.off('error',reject);resolve();});});fs.chmodSync(socketPath,0o600);
 return {connection:{socketPath,token,pins:{publicKey,codeHash:binary,manifestHash:ledger.snapshot().manifestHash,ledgerId}},close:async()=>{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}};
}
export function verifyReceipt(value:unknown,nonce:string,pins:Pins):StateReceipt {
 pins=validatePins(pins);const v=object(value);exact(v,['receipt','signature']);const r=object(v.receipt);
 exact(r,['mode','nonce','manifestHash','batchHash','tariffHash','codeHash','ledgerId','revision','ledgerDigest','stopped','expiresAt','totals']);
 assert(verify(null,Buffer.from(canonical(r)),pins.publicKey,Buffer.from(text(v.signature),'base64')),'invalid guard signature');
 assert(r.mode==='mock-only','unimplemented qualification mode');assert(r.nonce===nonce,'stale guard challenge');
 assert(r.codeHash===pins.codeHash&&r.manifestHash===pins.manifestHash&&r.ledgerId===pins.ledgerId,'guard binding mismatch');
 hash(r.batchHash);hash(r.tariffHash);hash(r.ledgerDigest);integer(r.revision);
 assert(r.stopped===null||typeof r.stopped==='string','invalid stop state');assert(positive(r.expiresAt)>Date.now(),'expired guard receipt');
 const t=object(r.totals);exact(t,['microUsd','requests','generatedTokens']);integer(t.microUsd);integer(t.requests);integer(t.generatedTokens);
 return freeze(r as StateReceipt);
}
const sessions=new WeakSet<GuardSession>();
export class GuardSession {
 private constructor(readonly receipt:StateReceipt) {sessions.add(this);}
 static async connect(c:Connection):Promise<GuardSession> {
  const nonce=randomBytes(32).toString('hex');
  const value=await new Promise<unknown>((resolve,reject)=>{
   const req=http.request({socketPath:c.socketPath,path:'/state?nonce='+nonce,method:'GET',agent:false,headers:{authorization:'Bearer '+c.token}},res=>{
    void (async()=>{assert(res.statusCode===200,'guard control denied');resolve(JSON.parse((await bytes(res,65536)).toString('utf8')));})().catch(reject);
   });const timer=setTimeout(()=>req.destroy(new Error('guard control timeout')),1000);req.on('close',()=>clearTimeout(timer));req.on('error',reject);req.end();
  });
  return new GuardSession(verifyReceipt(value,nonce,c.pins));
 }
 static requireNative(value:unknown,batchHash:string):never {
  assert(value instanceof GuardSession&&sessions.has(value),'authenticated runtime guard session required');
  assert(value.receipt.batchHash===batchHash&&value.receipt.expiresAt>Date.now()&&!value.receipt.stopped,'stale or stopped runtime guard');
  // No offline evidence can issue a native permit. Qualification is a later reviewed boundary,
  // requiring the approved protected deployment and exact clients; there is no boolean override.
  throw new Error('native guard qualification remains owed; mock receipt cannot authorize paid work');
 }
}
