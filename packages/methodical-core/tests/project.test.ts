import {test} from 'node:test';
import * as a from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {execFileSync} from 'node:child_process';
import {assertProject,candidateIdentity,repositoryIdentity,resolvePlan,safeFile,identityAlgorithm} from '../src/project.js';
import {digest} from '../src/contracts.js';
import {fixture} from './records-fixture.js';
test('ordinary Git lineage is path/remote independent and domain separated',()=>{
  const f=fixture();const moved=fs.mkdtempSync(path.join(os.tmpdir(),'methodical-relocate-'));
  try {
    a.equal(assertProject(f.root),f.root);a.equal(fs.existsSync(path.join(f.root,'.methodical')),false);
    const roots=f.git('rev-list','--max-parents=0','HEAD').toString().trim().split('\n').sort();
    a.equal(repositoryIdentity(f.root),digest(identityAlgorithm+'\0'+roots.join('\n')));
    f.git('remote','add','origin','https://example.invalid/private-repository');
    execFileSync('git',['clone','-q','--local',f.root,moved],{stdio:'pipe'});a.equal(repositoryIdentity(moved),repositoryIdentity(f.root));
    a.throws(()=>assertProject(path.join(f.root,'plans')),/repository root/);
  }finally{f.cleanup();fs.rmSync(moved,{recursive:true,force:true});}
});
test('candidate binds index, bytes, modes, untracked and HEAD; metadata is excluded',()=>{
  const f=fixture();try {
    const initial=candidateIdentity(f.root);fs.mkdirSync(path.join(f.root,'.methodical'));fs.writeFileSync(path.join(f.root,'.methodical/control'),'metadata');a.equal(candidateIdentity(f.root),initial);
    fs.appendFileSync(path.join(f.root,'app.txt'),'staged\n');f.git('add','app.txt');const staged=candidateIdentity(f.root);a.notEqual(staged,initial);
    fs.writeFileSync(path.join(f.root,'app.txt'),'baseline\n');a.notEqual(candidateIdentity(f.root),initial);
    f.git('reset','--hard','-q','HEAD');fs.chmodSync(path.join(f.root,'app.txt'),0o755);a.notEqual(candidateIdentity(f.root),initial);
    fs.chmodSync(path.join(f.root,'app.txt'),0o644);fs.writeFileSync(path.join(f.root,'new.txt'),'untracked');a.notEqual(candidateIdentity(f.root),initial);
  }finally{f.cleanup();}
});
test('active plan resolver rejects stale, traversal, symlink and special files',()=>{
  const f=fixture();try {
    const sum=digest(fs.readFileSync(path.join(f.root,'plans/active.md')));a.equal(resolvePlan(f.root,'plans/active.md',sum),path.join(f.root,'plans/active.md'));
    a.throws(()=>resolvePlan(f.root,'plans/active.md','0'.repeat(64)),/hash mismatch/);a.throws(()=>safeFile(f.root,'../escape'),/unsafe/);
    fs.symlinkSync('active.md',path.join(f.root,'plans/link.md'));a.throws(()=>resolvePlan(f.root,'plans/link.md',sum),/symlink/);
    fs.symlinkSync('plans',path.join(f.root,'alias'));a.throws(()=>safeFile(f.root,'alias/missing',true),/symlink/);
  }finally{f.cleanup();}
});
