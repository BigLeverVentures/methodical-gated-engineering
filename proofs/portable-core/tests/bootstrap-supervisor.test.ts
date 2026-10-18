import {test} from 'node:test';
import * as a from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {reap} from '../bootstrap/preflight.js';
import {experiment} from '../bootstrap/supervisor.js';
test('owned synthetic lifecycle is reaped idempotently without name-based signals',async()=>{
  const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
  await once(child,'spawn');a.equal(await reap(child),true);a.ok(child.exitCode!==null||child.signalCode!==null);a.equal(await reap(child),true);
});
test('grant-shaped JSON cannot provide native admission or reach setup before validation',async()=>{
  await a.rejects(experiment('/nonexistent','/nonexistent',{ready:true},'/nonexistent/output'),/fields/);
  const source=process.env.PROOF_SOURCE;a.ok(source);
  const code=fs.readFileSync(path.join(source,'bootstrap/supervisor.ts'),'utf8');
  a.ok(!code.includes('spawn('));a.ok(!code.includes('execFile('));a.ok(!code.includes('fetch('));
  for(const kind of ['claude','codex']){
    const resource=JSON.parse(fs.readFileSync(path.join(source,`bootstrap/${kind}.json`),'utf8'));
    a.equal(resource.status,'proposed-not-launchable');a.ok(!('HOME' in resource.environment));
    a.ok(!JSON.stringify(resource).includes('sk-'));
  }
});
test('proposed outer policy preserves immutable payload and denies reads and writes globally',()=>{
  const source=process.env.PROOF_SOURCE;a.ok(source);const policy=fs.readFileSync(path.join(source,'bootstrap/policy.sb.in'),'utf8');
  a.ok(policy.includes('(deny file-read*)'));a.ok(policy.includes('(deny file-write*)'));
  a.ok(policy.includes('(deny mach-lookup)'));a.ok(policy.includes('(deny appleevent-send)'));
  a.ok(!policy.includes('(allow file-write* (subpath {{PAYLOAD}})'));a.ok(!policy.includes('(subpath "/private/tmp")'));
});

test('timeout and cancellation reap a synthetic helper even when it ignores TERM',async()=>{
  const {boundedProbe}=await import('../bootstrap/preflight.js');
  const root=fs.realpathSync(fs.mkdtempSync(path.join((await import('node:os')).tmpdir(),'bootstrap-cancel-')));
  try{
    for(const cancel of [false,true]){
      const marker=path.join(root,cancel?'cancel-pid':'timeout-pid');const abort=new AbortController();
      const program=`const fs=require('node:fs');process.on('SIGTERM',()=>{});fs.writeFileSync(${JSON.stringify(marker+'.tmp')},String(process.pid));fs.renameSync(${JSON.stringify(marker+'.tmp')},${JSON.stringify(marker)});setInterval(()=>{},1000);`;
      const pending=boundedProbe(process.execPath,['-e',program],abort.signal,500);
      const until=Date.now()+1500;while(!fs.existsSync(marker)&&Date.now()<until)await new Promise(r=>setTimeout(r,5));
      a.ok(fs.existsSync(marker));const pid=Number(fs.readFileSync(marker,'utf8'));if(cancel)abort.abort();
      const result=await pending;a.equal(result.output,null);a.equal(result.cleanup,true);a.equal(result.pid,pid);
      a.throws(()=>process.kill(pid,0));
    }
  }finally{fs.rmSync(root,{recursive:true});}
});

test('preflight cancellation joins both owned target and live helper', {skip:process.platform!=='darwin'},async()=>{
  const {preflight}=await import('../bootstrap/preflight.js');const {pin}=await import('../bootstrap/manifest.js');
  const root=fs.realpathSync(fs.mkdtempSync(path.join((await import('node:os')).tmpdir(),'bootstrap-preflight-cancel-')));
  try{
    const marker=path.join(root,'pids.json');const fake=path.join(root,'synthetic-python');
    fs.writeFileSync(fake,`#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(marker)},JSON.stringify({helper:process.pid,target:Number(process.argv.at(-1))}));process.on('SIGTERM',()=>{});setInterval(()=>{},1000);\n`,{mode:0o700});
    const abort=new AbortController();const pending=preflight(pin(fs.realpathSync(process.execPath)),pin(fake),'unused-synthetic-helper',abort.signal);
    const until=Date.now()+1500;while(!fs.existsSync(marker)&&Date.now()<until)await new Promise(r=>setTimeout(r,5));
    a.ok(fs.existsSync(marker));const pids=JSON.parse(fs.readFileSync(marker,'utf8'));abort.abort();const q=await pending;
    a.equal(q.ready,false);a.equal(q.cleanup,'complete');a.equal(q.controls[0]?.basis,'cancelled');
    a.equal(q.target?.pid,pids.target);a.equal(q.helper?.pid,pids.helper);a.equal(q.helper?.reaped,true);
    a.throws(()=>process.kill(pids.target,0));a.throws(()=>process.kill(pids.helper,0));
  }finally{fs.rmSync(root,{recursive:true});}
});
