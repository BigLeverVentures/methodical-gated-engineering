import {test} from 'node:test';
import * as a from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {execFileSync} from 'node:child_process';
import {classifyTask} from '../bootstrap/preflight.js';
import {hash,pin,manifest,probePython} from '../bootstrap/manifest.js';
import {description} from '../bootstrap/supervisor.js';
test('denied task-port positive control is never a pass, even with well-formed JSON',()=>{
  a.deepEqual(classifyTask({allowed:false,code:5,released:true}),{allowed:false,code:5,released:true});
  for(const v of [{allowed:true,code:5,released:true},{allowed:false,code:0,released:true},{allowed:false,code:5,released:true,ready:true},null])a.throws(()=>classifyTask(v));
  a.equal(description().nativeLaunchSupported,false);a.equal(description().providerTransport,false);a.equal(description().liveBudgetUsd,0);
});
test('file pins reject changed bytes, aliases, extra authority fields and substituted runtimes',()=>{
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'bootstrap-pins-')));
  try{
    const f=root+'/binary';fs.writeFileSync(f,'synthetic',{mode:0o600});const frozen=pin(f);
    a.equal(frozen.sha256,hash('synthetic'));fs.symlinkSync(f,root+'/alias');a.throws(()=>pin(root+'/alias'));
    for(const mode of [0o620,0o602,0o666]){fs.chmodSync(f,mode);a.throws(()=>pin(f));}fs.chmodSync(f,0o600);
    // CI runtimes need not meet native qualification; only controlled fixture modes belong here.
    const node=frozen;
    const m={schemaVersion:1,purpose:'zero-provider-preflight',approvedPlanHash:'a'.repeat(64),sourceCommit:'b'.repeat(40),node,python:frozen,clients:[{client:'claude',binary:frozen},{client:'codex',binary:frozen}]};
    a.throws(()=>manifest(m),/unapproved probe runtime/);
    a.throws(()=>manifest({...m,nativeQualified:true}),/fields/);
    fs.writeFileSync(f,'changed');a.throws(()=>manifest(m),/file changed/);
  }finally{fs.rmSync(root,{recursive:true});}
});
test('task-port helper deallocates successful synthetic rights and emits no target metadata',()=>{
  const source=process.env.PROOF_SOURCE;a.ok(source);
  // Execute the helper with an in-memory fake libc; no platform/task API is called in ordinary tests.
  const code=`import importlib.util,json,ctypes\nspec=importlib.util.spec_from_file_location('probe',${JSON.stringify(source+'/bootstrap/task-port-probe.py')})\nm=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)\nclass Fn:\n def __init__(self,fn): self.fn=fn\n def __call__(self,*args): return self.fn(*args)\nclass Lib:\n pass\nlib=Lib();calls=[]\nlib.mach_task_self=Fn(lambda:123)\nlib.task_for_pid=Fn(lambda own,pid,out:(setattr(out._obj,'value',789) or 0))\nlib.mach_port_deallocate=Fn(lambda own,port:calls.append((own,port)) or 0)\nm.sys.platform='darwin';m.ctypes.CDLL=lambda *a,**k:lib\nr=m.probe(456)\nassert r=={'allowed':True,'code':0,'released':True} and calls==[(123,789)]\nlib.mach_port_deallocate=Fn(lambda *args:5)\nassert m.probe(456)['released'] is False\nlib.task_for_pid=Fn(lambda *args:5)\nr=m.probe(456)\nassert r=={'allowed':False,'code':5,'released':True} and len(calls)==1\nprint('helper-pure-pass')\n`;
  const out=execFileSync('python3',['-I','-B','-c',code],{encoding:'utf8'});a.equal(out.trim(),'helper-pure-pass');
});
