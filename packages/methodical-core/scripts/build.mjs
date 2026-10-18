// Build both native packages from one method/runtime source. No compilation occurs at installation.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const core=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const repo=path.resolve(core,'../..');
const check=process.argv.includes('--check');
const scratch=fs.mkdtempSync(path.join(tmpdir(),'methodical-build-'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function files(root,relative='') {
  return fs.readdirSync(path.join(root,relative)).sort().flatMap(name=>{
    const rel=path.join(relative,name), stat=fs.lstatSync(path.join(root,rel));
    if(stat.isSymbolicLink() || (!stat.isFile()&&!stat.isDirectory())) throw Error('Unsupported package source: '+rel);
    return stat.isDirectory()?files(root,rel):[rel];
  });
}
function write(root,rel,bytes) { const full=path.join(root,rel);fs.mkdirSync(path.dirname(full),{recursive:true});fs.writeFileSync(full,bytes); }
function copy(src,dst) { fs.mkdirSync(path.dirname(dst),{recursive:true});fs.cpSync(src,dst,{recursive:true}); }
function renderedMethod(host,root) {
  for(const rel of files(path.join(core,'method'))) {
    const variable=host==='claude-code'?'CLAUDE_PLUGIN_ROOT':'PLUGIN_ROOT';
    let body=fs.readFileSync(path.join(core,'method',rel),'utf8').replaceAll('${METHODICAL_ROOT}','${'+variable+'}');
    if(host==='codex') body=body.replaceAll('AskUserQuestion','the native structured-question tool').replaceAll('Claude Code','the native client');
    write(root,rel,body);
  }
}
function inventory(root) { return Object.fromEntries(files(root).filter(p=>p!=='production-package.json').map(p=>[p,hash(fs.readFileSync(path.join(root,p)))])); }
function sync(generated,destination) {
  const rel=path.relative(repo,destination);
  if(check) {
    for(const name of files(generated)) {
      const dst=path.join(destination,name);
      if(!fs.existsSync(dst)||!fs.readFileSync(dst).equals(fs.readFileSync(path.join(generated,name)))) throw Error('Generated artifact differs: '+path.join(rel,name));
    }
  } else for(const name of files(generated)) copy(path.join(generated,name),path.join(destination,name));
}
try {
  const compiled=path.join(scratch,'compiled');
  execFileSync(process.execPath,[path.join(core,'node_modules/typescript/lib/tsc.js'),'--project',path.join(core,'tsconfig.json'),'--outDir',compiled],{stdio:'inherit'});
  const version=JSON.parse(fs.readFileSync(path.join(core,'package.json'),'utf8')).version;
  const methodHash=hash(files(path.join(core,'method')).map(p=>p+'\0'+hash(fs.readFileSync(path.join(core,'method',p)))).join('\n'));
  const runtimeHash=hash(files(path.join(core,'src')).map(p=>p+'\0'+hash(fs.readFileSync(path.join(core,'src',p)))).join('\n'));
  for(const host of ['claude-code','codex']) {
    const generated=path.join(scratch,host), target=path.join(repo,'plugins',host==='codex'?'methodical-codex':'methodical');
    fs.mkdirSync(generated,{recursive:true});renderedMethod(host,generated);
    copy(path.join(compiled,'packages/methodical-core/src'),path.join(generated,'runtime/packages/methodical-core/src'));
    copy(path.join(compiled,'adapters'),path.join(generated,'runtime/adapters'));
    copy(path.join(core,'profiles'),path.join(generated,'runtime/packages/methodical-core/profiles'));
    write(generated,'runtime/package.json','{"type":"module"}\n');
    write(generated,'runtime/src/cli.js',"import '../packages/methodical-core/src/cli.js';\n");
    copy(path.join(repo,'adapters',host,'overlay.md'),path.join(generated,'overlay.md'));
    copy(path.join(repo,'adapters',host,'hooks.json'),path.join(generated,'hooks/hooks.json'));
    copy(path.join(repo,'adapters',host,'hook.cjs'),path.join(generated,'hooks/hook.cjs'));
    copy(path.join(repo,'LICENSE'),path.join(generated,'LICENSE'));
    copy(path.join(repo,'plugins/methodical/THIRD-PARTY-NOTICES.md'),path.join(generated,'THIRD-PARTY-NOTICES.md'));
    if(host==='claude-code') {
      // The existing trusted Claude mod and role-option manifest retain their source paths.
      for(const name of ['register.ts','logic.ts','register.test.ts']) copy(path.join(repo,'adapters/claude-code/mod',name),path.join(generated,'hooks',name));
      copy(path.join(repo,'adapters/claude-code/rules.sh'),path.join(generated,'hooks/rules.sh'));
      copy(path.join(repo,'plugins/methodical/types'),path.join(generated,'types'));
      copy(path.join(repo,'plugins/methodical/tsconfig.json'),path.join(generated,'tsconfig.json'));
      const manifest={...JSON.parse(fs.readFileSync(path.join(repo,'plugins/methodical/.claude-plugin/plugin.json'),'utf8')),...JSON.parse(fs.readFileSync(path.join(repo,'adapters/claude-code/manifest.json'),'utf8'))};
      manifest.author=JSON.parse(fs.readFileSync(path.join(repo,'plugins/methodical/.claude-plugin/plugin.json'),'utf8')).author;
      manifest.version=version;manifest.description='Methodical gated engineering with shared native routing and portable project records. Requires supported native hooks and Node.js.';
      write(generated,'.claude-plugin/plugin.json',JSON.stringify(manifest,null,2)+'\n');
    } else {
      const manifest=JSON.parse(fs.readFileSync(path.join(repo,'adapters/codex/manifest.json'),'utf8'));manifest.version=version;
      write(generated,'.codex-plugin/plugin.json',JSON.stringify(manifest,null,2)+'\n');
      copy(path.join(repo,'LICENSE'),path.join(generated,'LICENSE'));
      copy(path.join(repo,'plugins/methodical/THIRD-PARTY-NOTICES.md'),path.join(generated,'THIRD-PARTY-NOTICES.md'));
    }
    write(generated,'production-package.json',JSON.stringify({schemaVersion:1,artifact:'methodical-native',host,version,methodSourceHash:methodHash,runtimeSourceHash:runtimeHash,qualification:'See docs/platform-support.md; integrity is not native qualification.',files:inventory(generated)},null,2)+'\n');
    sync(generated,target);
  }
  const portable=path.join(scratch,'portable');fs.mkdirSync(portable);
  write(portable,'SKILL.md','---\nname: methodical\ndescription: Apply Methodical gated engineering, verified-feedback allocation and durable project records. Native automation requires a qualified host adapter.\nlicense: MIT\n---\n\nRead references/rules/rules.md and the appropriate references/skills/<step>/SKILL.md. Resolve METHODICAL_ROOT as the references directory. This is an instructional skill; it does not install hooks, route native agents or perform host compaction.\n');
  copy(path.join(core,'method'),path.join(portable,'references'));
  copy(path.join(repo,'LICENSE'),path.join(portable,'LICENSE'));
  copy(path.join(repo,'plugins/methodical/THIRD-PARTY-NOTICES.md'),path.join(portable,'THIRD-PARTY-NOTICES.md'));
  write(portable,'production-package.json',JSON.stringify({schemaVersion:1,artifact:'portable-agent-skill',version,methodSourceHash:methodHash,capabilities:'instruction-only',files:inventory(portable)},null,2)+'\n');
  sync(portable,path.join(repo,'packages/methodical-portable'));
  console.log(check?'PASS production generated artifacts match source':'Built production adapters and portable instructional skill');
} finally { fs.rmSync(scratch,{recursive:true,force:true}); }
