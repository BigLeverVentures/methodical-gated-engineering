import * as fs from 'node:fs';
import * as path from 'node:path';
import { assert, digest, profile, type Host } from '../core/contracts.js';
function tree(root: string, relative=''): string[] {
  return fs.readdirSync(path.join(root,relative)).sort().flatMap(name=>{
    const p=path.join(relative,name);const st=fs.lstatSync(path.join(root,p));
    assert(!st.isSymbolicLink(),'package source contains symlink');
    return st.isDirectory()?tree(root,p):[p];
  });
}
function copy(src: string,dst: string): void { fs.mkdirSync(path.dirname(dst),{recursive:true});fs.cpSync(src,dst,{recursive:true}); }
const sharedReferences = ['capabilities.md','records.md'] as const;
function sharedMethod(source: string): { method: string; methodSourceHash: string } {
  const method=fs.readFileSync(path.join(source,'core/method.md'),'utf8');
  return { method, methodSourceHash:digest(method) };
}
function skillReferences(source: string, destination: string): void {
  for(const name of sharedReferences) copy(path.join(source,'core',name),path.join(destination,'references',name));
}
export function portableSkill(source: string, output: string): string {
  assert(path.basename(path.resolve(output))==='methodical','portable skill directory must be named methodical');
  assert(!fs.existsSync(output)||fs.readdirSync(output).length===0,'package output must be absent or empty');
  const repo=path.resolve(source,'../..');
  const version=JSON.parse(fs.readFileSync(path.join(repo,'plugins/methodical/.claude-plugin/plugin.json'),'utf8')).version as string;
  const {method,methodSourceHash}=sharedMethod(source);
  fs.mkdirSync(output,{recursive:true});skillReferences(source,output);
  fs.writeFileSync(path.join(output,'SKILL.md'),`---\nname: methodical\ndescription: Apply Methodical gated engineering to scoped software work using reviewed plans, verified-feedback resource decisions and compounded work records. Use when the user requests this workflow; native automation depends on the execution adapter.\nlicense: MIT\n---\n\n${method}`);
  for(const name of ['LICENSE','THIRD-PARTY-NOTICES.md']) copy(path.join(repo,name==='LICENSE'?name:'plugins/methodical/'+name),path.join(output,name));
  const all=tree(output);
  fs.writeFileSync(path.join(output,'proof-package.json'),JSON.stringify({schemaVersion:1,version,
    artifact:'portable-agent-skill',methodSourceHash,
    capabilities:'instruction-only; native activation, automation and recovery unverified',
    files:Object.fromEntries(all.map(name=>[name,digest(fs.readFileSync(path.join(output,name)))]))},null,2)+'\n');
  return fs.realpathSync(output);
}
export function packages(source: string, compiled: string, output: string): Record<Host,string> {
  assert(!fs.existsSync(output)||fs.readdirSync(output).length===0,'package output must be absent or empty');
  const repo=path.resolve(source,'../..');
  const version=JSON.parse(fs.readFileSync(path.join(repo,'plugins/methodical/.claude-plugin/plugin.json'),'utf8')).version as string;
  const commonFiles=tree(path.join(source,'core')).filter(p=>p!=='budget.ts').map(p=>'core/'+p);
  const common=digest(commonFiles.map(p=>p+'\0'+digest(fs.readFileSync(path.join(source,p)))).join('\n'));
  const result={} as Record<Host,string>;
  for (const h of ['claude-code','codex'] as const) {
    const dst=path.join(output,h);fs.mkdirSync(dst,{recursive:true});result[h]=fs.realpathSync(dst);
    copy(path.join(source,'core'),path.join(dst,'core'));
    copy(path.join(source,'fixtures/python'),path.join(dst,'fixtures/python'));
    copy(path.join(compiled,'core'),path.join(dst,'runtime/core'));
    // Operator admission is kept outside actor packages with the scorer and protected state.
    fs.rmSync(path.join(dst,'core/budget.ts'));fs.rmSync(path.join(dst,'runtime/core/budget.js'));
    copy(path.join(compiled,'scripts/cli.js'),path.join(dst,'runtime/scripts/cli.js'));
    fs.writeFileSync(path.join(dst,'runtime/package.json'),'{"type":"module"}\n');
    copy(path.join(source,`adapters/${h}/overlay.md`),path.join(dst,'overlay.md'));
    copy(path.join(source,`adapters/${h}/hooks.json`),path.join(dst,'hooks/hooks.json'));
    if(h==='claude-code') {
      copy(path.join(source,'adapters/claude-code/register.ts'),path.join(dst,'hooks/register.ts'));
      copy(path.join(source,'adapters/claude-code/register.test.fixture'),path.join(dst,'hooks/register.test.ts'));
    }
    const manifest=JSON.parse(fs.readFileSync(path.join(source,`adapters/${h}/manifest.json`),'utf8'));
    // Proof adapters have an independent patch revision so native upgrades replace cached hooks.
    const proofVersion=version.split('.').map(Number);
    assert(proofVersion.length===3&&proofVersion.every(Number.isInteger),'invalid source version');
    proofVersion[2]=proofVersion[2]!+1;
    manifest.version=proofVersion.join('.');
    const name=h==='claude-code'?'.claude-plugin/plugin.json':'.codex-plugin/plugin.json';
    fs.mkdirSync(path.dirname(path.join(dst,name)),{recursive:true});
    fs.writeFileSync(path.join(dst,name),JSON.stringify(manifest,null,2)+'\n');
    const {method,methodSourceHash}=sharedMethod(source);
    fs.mkdirSync(path.join(dst,'skills/proof'),{recursive:true});
    fs.writeFileSync(path.join(dst,'skills/proof/SKILL.md'),`---\nname: proof\ndescription: Run the bounded Methodical proof in a marked synthetic fixture using its shared workflow, allocation policy and checkpoint contract.\n---\n\n${method}\n\nRead [the synthetic proof protocol](../../core/proof-protocol.md) and [the native overlay](../../overlay.md) before the proof. Resolve the actual package root from this skill path.\n`);
    skillReferences(source,path.join(dst,'skills/proof'));
    copy(path.join(repo,'plugins/methodical/lenses'),path.join(dst,'lenses'));
    copy(path.join(repo,'LICENSE'),path.join(dst,'LICENSE'));
    copy(path.join(repo,'plugins/methodical/THIRD-PARTY-NOTICES.md'),path.join(dst,'THIRD-PARTY-NOTICES.md'));
    // Definitions are examples until native loading is observed. Never install these into real state.
    const p=profile(JSON.parse(fs.readFileSync(path.join(source,`core/profiles/${h}.json`),'utf8')));
    for(const role of ['worker','decider','census','backstop']) {
      const s=p.choices[role]!;
      if(h==='claude-code') {
        const file=path.join(dst,'agents',role+'.md');fs.mkdirSync(path.dirname(file),{recursive:true});
        fs.writeFileSync(file,`---\nname: ${role}\ndescription: Scoped Methodical proof ${role} for a synthetic fixture.\nmodel: ${s.model}\neffort: ${s.effort}\nmaxTurns: 4\n---\nUse the assigned canonical lens, plan hash and candidate commit. Return evidence and material findings. Never create a new approval or start a live batch.\n`);
      } else {
        const file=path.join(dst,'resources/agents',role+'.toml');fs.mkdirSync(path.dirname(file),{recursive:true});
        fs.writeFileSync(file,`name = "proof-${role}"\ndescription = "Scoped Methodical proof ${role}"\nmodel = "${s.model}"\nmodel_reasoning_effort = "${s.effort}"\ndeveloper_instructions = "Use the assigned canonical lens and candidate. Return evidence, do not fabricate approvals."\n`);
      }
    }
    const all=tree(dst);
    fs.writeFileSync(path.join(dst,'proof-package.json'),JSON.stringify({schemaVersion:1,host:h,version:manifest.version,commonSourceHash:common,methodSourceHash,
      capabilities:'offline package only; native behavior unverified',
      files:Object.fromEntries(all.map(p=>[p,digest(fs.readFileSync(path.join(dst,p)))]))},null,2)+'\n');
  }
  return result;
}
