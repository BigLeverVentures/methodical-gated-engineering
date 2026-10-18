import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {randomBytes} from 'node:crypto';
import {startObserver,type Client} from './observer.js';
import {hash,manifest,verifyCandidate} from './manifest.js';
import {preflight,type Qualification} from './preflight.js';
export type Result={client:Client;state:'preflight-blocked'|'incomplete';nativeStarted:false;providerRequests:0;
  liveBudgetUsd:0;observerRequests:number;qualification:Qualification;cleanup:'complete'|'incomplete';
  sourceCommit:string;approvedPlanHash:string;helperHash:string;retainedScratch?:string;os:{platform:string;release:string;version:string}};
/** Operator-only qualification runner. This module has no native launch or UI-input path. */
export async function experiment(repo:string,source:string,input:unknown,outputDirectory:string,signal:AbortSignal=new AbortController().signal):Promise<Result[]>{
  const m=manifest(input);verifyCandidate(repo,m);
  if(!path.isAbsolute(outputDirectory)||fs.existsSync(outputDirectory)||fs.realpathSync(path.dirname(outputDirectory))!==path.dirname(outputDirectory))throw new Error('exclusive canonical output required');
  fs.mkdirSync(outputDirectory,{mode:0o700});
  fs.writeFileSync(path.join(outputDirectory,'manifest.json'),JSON.stringify(m,null,2)+'\n',{flag:'wx',mode:0o600});
  const helper=path.join(source,'bootstrap/task-port-probe.py');const helperHash=hash(fs.readFileSync(helper));const results:Result[]=[];
  for(const client of m.clients){
    verifyCandidate(repo,m);
    const root=fs.realpathSync(fs.mkdtempSync('/private/tmp/methodical-bootstrap-'));fs.chmodSync(root,0o700);
    const operator=path.join(root,'operator');fs.mkdirSync(operator,{mode:0o700});
    const copiedHelper=path.join(operator,'task-port-probe.py');fs.copyFileSync(helper,copiedHelper,fs.constants.COPYFILE_EXCL);fs.chmodSync(copiedHelper,0o400);
    const token=randomBytes(32).toString('hex');let observer:Awaited<ReturnType<typeof startObserver>>|undefined;
    let qualification:Qualification={ready:false,controls:[],cleanup:'incomplete'};let cleanup:Result['cleanup']='complete';
    try{
      if(hash(fs.readFileSync(copiedHelper))!==helperHash)throw new Error('helper changed');
      observer=await startObserver(client.client,token,async record=>{fs.writeFileSync(path.join(operator,`shape-${record.sequence}.json`),JSON.stringify(record),{flag:'wx',mode:0o600});});
      qualification=await preflight(m.node,m.python,copiedHelper,signal);
    }catch{cleanup='incomplete';}
    finally{if(observer)await observer.close().catch(()=>{cleanup='incomplete';});}
    if(qualification.cleanup!=='complete')cleanup='incomplete';
    // No native process was started. Keep exclusive resources/evidence on uncertain synthetic cleanup.
    if(cleanup==='complete')fs.rmSync(root,{recursive:true});
    const result:Result={client:client.client,state:cleanup==='complete'&&!signal.aborted?'preflight-blocked':'incomplete',nativeStarted:false,
      providerRequests:0,liveBudgetUsd:0,observerRequests:observer?.snapshot().requests??0,qualification,cleanup,
      sourceCommit:m.sourceCommit,approvedPlanHash:m.approvedPlanHash,helperHash,...(cleanup==='incomplete'?{retainedScratch:root}:{}),
      os:{platform:os.platform(),release:os.release(),version:os.version()}};
    fs.writeFileSync(path.join(outputDirectory,`${client.client}.json`),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});results.push(result);
    if(cleanup!=='complete'||signal.aborted)break;
  }
  return results;
}
export function description(){return {status:'preflight-only',nativeLaunchSupported:false,providerTransport:false,liveBudgetUsd:0,
  blocker:'task-port positive control and exact-policy qualification required',maximumNativeRequestsPerClient:4,maximumNativeSecondsPerClient:60};}
