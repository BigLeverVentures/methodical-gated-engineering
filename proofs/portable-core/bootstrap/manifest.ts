import * as fs from 'node:fs';
import * as path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import type {Client} from './observer.js';
export const probePython='/Applications/Xcode.app/Contents/Developer/Library/Frameworks/Python3.framework/Versions/3.9/bin/python3.9';
export type FilePin={path:string;sha256:string;uid:number;mode:number};
export type Manifest={schemaVersion:1;purpose:'zero-provider-preflight';approvedPlanHash:string;
  sourceCommit:string;node:FilePin;python:FilePin;clients:{client:Client;binary:FilePin}[]};
export function hash(bytes:Buffer|string):string{return createHash('sha256').update(bytes).digest('hex');}
export function pin(file:string):FilePin{
  if(!path.isAbsolute(file)||fs.realpathSync(file)!==file)throw new Error('canonical file required');
  const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o022)!==0)throw new Error('unsafe file');
  return {path:file,sha256:hash(fs.readFileSync(file)),uid:stat.uid,mode:stat.mode&0o777};
}
function object(v:unknown):Record<string,unknown>{if(v===null||typeof v!=='object'||Array.isArray(v))throw new Error('object required');return Object.fromEntries(Object.entries(v));}
function keys(v:Record<string,unknown>,names:string[]):void{if(Object.keys(v).sort().join()!==names.sort().join())throw new Error('manifest fields');}
function digest(v:unknown,length:number):string{if(typeof v!=='string'||!new RegExp(`^[a-f0-9]{${length}}$`).test(v))throw new Error('digest required');return v;}
function filePin(v:unknown):FilePin{
  const o=object(v);keys(o,['path','sha256','uid','mode']);
  if(typeof o.path!=='string'||!Number.isSafeInteger(o.uid)||!Number.isSafeInteger(o.mode))throw new Error('file identity');
  const actual=pin(o.path);if(actual.sha256!==digest(o.sha256,64)||actual.uid!==o.uid||actual.mode!==o.mode)throw new Error('file changed');return actual;
}
export function manifest(value:unknown):Manifest{
  const o=object(value);keys(o,['schemaVersion','purpose','approvedPlanHash','sourceCommit','node','python','clients']);
  if(o.schemaVersion!==1||o.purpose!=='zero-provider-preflight'||!Array.isArray(o.clients)||o.clients.length!==2)throw new Error('manifest purpose');
  const clients=o.clients.map((item):Manifest['clients'][number]=>{
    const c=object(item);keys(c,['client','binary']);if(c.client!=='claude'&&c.client!=='codex')throw new Error('native surface');return {client:c.client,binary:filePin(c.binary)};
  });if(new Set(clients.map(c=>c.client)).size!==2)throw new Error('both native surfaces required');
  if(object(o.node).path!==fs.realpathSync(process.execPath)||object(o.python).path!==probePython)throw new Error('unapproved probe runtime');
  return {schemaVersion:1,purpose:'zero-provider-preflight',approvedPlanHash:digest(o.approvedPlanHash,64),sourceCommit:digest(o.sourceCommit,40),node:filePin(o.node),python:filePin(o.python),clients};
}
export function verifyCandidate(repo:string,m:Manifest):void{
  const git=(...args:string[])=>execFileSync('/usr/bin/git',['-C',repo,...args],{encoding:'utf8',env:{PATH:'/usr/bin:/bin'},maxBuffer:1024*1024}).trim();
  if(git('rev-parse','HEAD')!==m.sourceCommit||git('status','--porcelain')!=='')throw new Error('clean frozen candidate required');
  for(const f of [m.node,m.python,...m.clients.map(c=>c.binary)])if(pin(f.path).sha256!==f.sha256)throw new Error('inventory changed');
}
