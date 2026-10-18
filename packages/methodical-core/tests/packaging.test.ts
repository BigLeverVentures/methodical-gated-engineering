import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {digest,object,text} from '../src/contracts.js';
const source=process.env.METHODICAL_SOURCE;
assert.ok(source,'METHODICAL_SOURCE required');
const repo=path.resolve(source,'../..');
function files(root:string,relative=''):string[]{return fs.readdirSync(path.join(root,relative)).sort().flatMap(name=>{const rel=path.join(relative,name),st=fs.lstatSync(path.join(root,rel));assert.ok(!st.isSymbolicLink());return st.isDirectory()?files(root,rel):[rel];});}
test('native package inventories independently cover shipped files and one common method/runtime source',()=>{
 const manifests=[];
 for(const name of ['methodical','methodical-codex']){
  const root=path.join(repo,'plugins',name),manifest=object(JSON.parse(fs.readFileSync(path.join(root,'production-package.json'),'utf8'))),declared=object(manifest.files);
  const shipped=files(root).filter(file=>file!=='production-package.json'&&!file.startsWith('.claude-plugin/types/'));
  assert.deepEqual(Object.keys(declared).sort(),shipped.sort());
  for(const[file,sum]of Object.entries(declared))assert.equal(digest(fs.readFileSync(path.join(root,file))),sum,file);
  assert.ok(!shipped.some(file=>/(?:^|\/)(?:node_modules|guard|evaluation|fixtures|tests|\.private)(?:\/|$)/.test(file)));
  assert.equal(fs.readFileSync(path.join(root,'LICENSE'),'utf8'),fs.readFileSync(path.join(repo,'LICENSE'),'utf8'));
  assert.ok(shipped.includes('hooks/hook.cjs')&&shipped.includes('runtime/src/cli.js'));
  manifests.push(manifest);
 }
 assert.equal(manifests[0]?.methodSourceHash,manifests[1]?.methodSourceHash);
 assert.equal(manifests[0]?.runtimeSourceHash,manifests[1]?.runtimeSourceHash);
 assert.equal(fs.existsSync(path.join(repo,'plugins/methodical-codex/plugin.json')),false,'one intended Codex manifest');
});
test('portable package shares canonical instructions and explicitly limits runtime claims',()=>{
 const root=path.join(repo,'packages/methodical-portable'),manifest=object(JSON.parse(fs.readFileSync(path.join(root,'production-package.json'),'utf8'))),native=object(JSON.parse(fs.readFileSync(path.join(repo,'plugins/methodical/production-package.json'),'utf8')));
 assert.equal(manifest.methodSourceHash,native.methodSourceHash);assert.equal(manifest.capabilities,'instruction-only');
 assert.match(fs.readFileSync(path.join(root,'SKILL.md'),'utf8'),/does not install hooks/);
 assert.ok(!files(root).some(file=>file.startsWith('runtime/')||file.startsWith('hooks/')));
 const declared=object(manifest.files);assert.deepEqual(Object.keys(declared).sort(),files(root).filter(p=>p!=='production-package.json').sort());
 for(const[file,sum]of Object.entries(declared))assert.equal(digest(fs.readFileSync(path.join(root,file))),sum);
 const catalog=object(JSON.parse(fs.readFileSync(path.join(repo,'.agents/plugins/marketplace.json'),'utf8')));assert.equal(text(catalog.name),'methodical-codex');
});
