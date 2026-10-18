import {spawn,type ChildProcess} from 'node:child_process';
import {once} from 'node:events';
import type {FilePin} from './manifest.js';
export type ControlName='task-port'|'debug'|'files'|'network'|'ipc'|'descendants'|'pty'|'native-identity';
export type Control={name:ControlName;status:'inconclusive'|'not-run';basis:'positive-control-denied'|'probe-failed'|'earlier-prerequisite'|'not-implemented'|'cancelled';code?:number};
export type Qualification={ready:false;controls:Control[];cleanup:'complete'|'incomplete';target?:{pid:number;observedAt:string;exitCode:number|null;signal:NodeJS.Signals|null};helper?:{pid:number|null;reaped:boolean}};
export function classifyTask(value:unknown):{allowed:boolean;code:number;released:boolean}{
  if(value===null||typeof value!=='object'||Array.isArray(value))throw new Error('probe record');
  const v=Object.fromEntries(Object.entries(value));
  if(Object.keys(v).sort().join()!=='allowed,code,released'||typeof v.allowed!=='boolean'||!Number.isSafeInteger(v.code)||typeof v.released!=='boolean'||(v.allowed!==(v.code===0)))throw new Error('probe record');
  return {allowed:v.allowed,code:Number(v.code),released:v.released};
}
export async function reap(child:ChildProcess):Promise<boolean>{
  if(child.pid===undefined||child.exitCode!==null||child.signalCode!==null)return true;
  const finished=once(child,'exit').then(()=>true,()=>false);
  child.kill('SIGTERM');let timer:ReturnType<typeof setTimeout>|undefined;
  const exited=await Promise.race([finished,new Promise<boolean>(resolve=>{timer=setTimeout(()=>resolve(false),1000);})]);
  clearTimeout(timer);if(exited)return true;
  child.kill('SIGKILL');
  const killed=await Promise.race([finished,new Promise<boolean>(resolve=>{timer=setTimeout(()=>resolve(false),1000);})]);clearTimeout(timer);return killed;
}
export type ProbeResult={output:string|null;cleanup:boolean;pid:number|null};
/** Supervise only a synthetic helper; timeout/cancellation always joins bounded TERM then KILL. */
export async function boundedProbe(command:string,args:string[],signal:AbortSignal,timeoutMs=3000):Promise<ProbeResult>{
  if(signal.aborted)return {output:null,cleanup:true,pid:null};
  const helper=spawn(command,args,{env:{PATH:'/usr/bin:/bin'},stdio:['ignore','pipe','ignore']});
  let timer:ReturnType<typeof setTimeout>|undefined;let cancel:()=>void=()=>{};
  let output:string|null=null;let bytes=0;const chunks:Buffer[]=[];
  const finished=new Promise<string>((resolve,reject)=>{
    helper.once('error',()=>reject(new Error('probe failed')));
    helper.stdout?.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>1024)reject(new Error('probe limit'));else chunks.push(chunk);});
    helper.once('close',code=>code===0?resolve(Buffer.concat(chunks).toString('utf8')):reject(new Error('probe failed')));
  });
  const interrupted=new Promise<never>((_resolve,reject)=>{
    cancel=()=>reject(new Error('probe cancelled'));signal.addEventListener('abort',cancel,{once:true});
    timer=setTimeout(()=>reject(new Error('probe deadline')),Math.min(timeoutMs,3000));if(signal.aborted)cancel();
  });
  try{output=await Promise.race([finished,interrupted]);}catch{output=null;}
  finally{clearTimeout(timer);signal.removeEventListener('abort',cancel);}
  const cleanup=await reap(helper);return {output,cleanup,pid:helper.pid??null};
}
/** First required positive control is cheap. No later control or native start can be inferred. */
export async function preflight(node:FilePin,python:FilePin,helper:string,signal:AbortSignal):Promise<Qualification>{
  const controls:Control[]=[];let targetEvidence:Qualification['target'];let helperEvidence:Qualification['helper'];let cleanup:Qualification['cleanup']='complete';
  if(process.platform!=='darwin'||signal.aborted)controls.push({name:'task-port',status:'inconclusive',basis:signal.aborted?'cancelled':'probe-failed'});
  else {
    const target=spawn(node.path,['-e','setInterval(()=>{},1000)'],{env:{PATH:'/usr/bin:/bin'},stdio:'ignore'});
    try{
      await once(target,'spawn');if(target.pid===undefined||signal.aborted)throw new Error('owned target absent');
      targetEvidence={pid:target.pid,observedAt:new Date().toISOString(),exitCode:null,signal:null};
      const probe=await boundedProbe(python.path,['-I','-B',helper,String(target.pid)],signal);
      helperEvidence={pid:probe.pid,reaped:probe.cleanup};if(!probe.cleanup)cleanup='incomplete';
      if(probe.output===null)throw new Error('probe failed');const result=classifyTask(JSON.parse(probe.output));
      if(!result.released)cleanup='incomplete';
      controls.push(result.allowed?{name:'task-port',status:'inconclusive',basis:'not-implemented',code:result.code}:
        {name:'task-port',status:'inconclusive',basis:'positive-control-denied',code:result.code});
    }catch{controls.push({name:'task-port',status:'inconclusive',basis:signal.aborted?'cancelled':'probe-failed'});}
    finally{if(!await reap(target))cleanup='incomplete';if(targetEvidence){targetEvidence.exitCode=target.exitCode;targetEvidence.signal=target.signalCode;}}
  }
  for(const name of ['debug','files','network','ipc','descendants','pty','native-identity'] as const)
    controls.push({name,status:'not-run',basis:'earlier-prerequisite'});
  return {ready:false,controls,cleanup,...(targetEvidence?{target:targetEvidence}:{}),...(helperEvidence?{helper:helperEvidence}:{})};
}
