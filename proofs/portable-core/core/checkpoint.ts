import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { assert, digest, hash, integer, object, text, host as parseHost, type Host } from './contracts.js';

export type CaptureRequest =
  | { kind: 'local'; ref: string; source: string; archive: string; required: true }
  | { kind: 'external'; ref: string; url: string }
  | { kind: 'unavailable'; ref: string; reason: string };
export type CapturedRecord = CaptureRequest & { bytes?: number; sha256?: string };
export type CaptureManifest = { schemaVersion: 1; records: CapturedRecord[] };
export const captureLimits = { descriptors: 128, fileBytes: 1024 * 1024, totalBytes: 8 * 1024 * 1024, metadataBytes: 64 * 1024 } as const;
export type Work = { planHash: string; step: string; nextAction: string; rulings: string;
  lessons: string[]; findings: string[]; reviewDebt: string[]; evidence: string[]; captures?: CaptureRequest[] };
type RepoState = { identity: string; head: string; branch: string; tree: Record<string,string | null>; index: string };
export type Checkpoint = { schemaVersion: 1 | 2; capture?: CaptureManifest; generation: string; createdAt: string; host: Host;
  relevant: number; repo: RepoState; work: Work; payload: Record<string,string> };
type Journal = { sequence: number; relevant: number; generation: number; records: { at: string; kind: string; ref: string }[] };
const empty = (): Journal => ({ sequence: 0, relevant: 0, generation: 0, records: [] });
const git = (root: string, ...args: string[]): Buffer => execFileSync('git', ['--no-optional-locks','-C',root,...args], { maxBuffer: 16 * 1024 * 1024, stdio: ['ignore','pipe','pipe'] });
const metadata = (root: string): string => path.join(root,'.methodical');
export function safeFile(root: string, relative: string, allowMissing = false): string {
  assert(!path.isAbsolute(relative) && !relative.includes('\\') && !relative.includes('\0') && relative.length > 0 && !relative.split(/[\\/]/).some(p => p === '..' || p === '.' || p === ''), 'unsafe relative path');
  const resolved = path.resolve(root, relative);
  assert(resolved.startsWith(path.resolve(root) + path.sep), 'path escaped repository');
  let here = path.resolve(root);
  for (const part of relative.split('/')) {
    here = path.join(here,part);
    try { assert(!fs.lstatSync(here).isSymbolicLink(), 'symlink not allowed'); }
    catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      assert(allowMissing, `missing file ${relative}`); break;
    }
  }
  return resolved;
}
export function assertFixture(root: string): string {
  const actual = fs.realpathSync(root);
  assert(git(actual,'rev-parse','--show-toplevel').toString().trim() === actual, 'checkpoint root must be repository root');
  const marker = object(JSON.parse(fs.readFileSync(safeFile(actual,'methodical-proof-fixture.json'),'utf8')));
  assert(marker.schemaVersion === 1 && marker.synthetic === true, 'checkpoint helper is restricted to synthetic proof fixtures');
  text(marker.id);
  return actual;
}
function atomic(file: string, bytes: string): void {
  const tmp = file + '.tmp-' + randomBytes(8).toString('hex');
  const fd = fs.openSync(tmp,'wx',0o600);
  try { fs.writeFileSync(fd,bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp,file);
}
function prepare(root: string): void {
  safeFile(root,'.methodical',true);
  fs.mkdirSync(metadata(root), { recursive: true, mode: 0o700 });
  assert(!fs.lstatSync(metadata(root)).isSymbolicLink(), 'symlink metadata');
}
function journal(root: string): Journal {
  const file = safeFile(root,'.methodical/journal.json',true);
  if (!fs.existsSync(file)) return empty();
  const j = object(JSON.parse(fs.readFileSync(file,'utf8')));
  integer(j.sequence); integer(j.relevant); integer(j.generation);
  assert(Array.isArray(j.records), 'invalid journal');
  return j as Journal;
}
function saveJournal(root: string, j: Journal): void { atomic(safeFile(root,'.methodical/journal.json',true), JSON.stringify(j)); }
export function withLock<T>(root: string, act: () => T): T {
  const real = assertFixture(root); prepare(real);
  const lock = safeFile(real,'.methodical/lock',true);
  try { fs.mkdirSync(lock); } catch (e) { throw new Error('checkpoint publisher busy; reconcile abandoned lock before retry', { cause: e }); }
  try { return act(); } finally { fs.rmdirSync(lock); }
}
export function recordRelevant(root: string, kind: string, ref: string): void {
  withLock(root, () => {
    const j = journal(root); j.sequence++; j.relevant++;
    j.records.push({ at: new Date().toISOString(), kind: text(kind), ref: text(ref) });
    saveJournal(root,j);
  });
}
function files(root: string): string[] {
  return [...new Set(git(root,'ls-files','-z','--cached','--others','--exclude-standard').toString().split('\0'))]
    .filter(p => p && !p.startsWith('.methodical/')).sort();
}
function snapshot(root: string): RepoState {
  const tree: Record<string,string | null> = Object.create(null);
  for (const file of files(root)) {
    const full = safeFile(root,file,true);
    if (!fs.existsSync(full)) { tree[file] = null; continue; }
    assert(fs.lstatSync(full).isFile(), 'snapshot accepts only regular files');
    tree[file] = digest(Buffer.concat([Buffer.from(String(fs.statSync(full).mode & 0o777)+':'),fs.readFileSync(full)]));
  }
  return { identity: repositoryIdentity(root), head: git(root,'rev-parse','HEAD').toString().trim(),
    branch: git(root,'symbolic-ref','--short','-q','HEAD').toString().trim(), tree,
    index: digest(git(root,'ls-files','--stage','-z')) };
}
// Keep the raw marker bytes and internal root-commit newlines; trim only the complete Git text.
export function repositoryIdentity(root: string): string {
  return digest(Buffer.concat([fs.readFileSync(safeFile(root,'methodical-proof-fixture.json')),
    Buffer.from(git(root,'rev-list','--max-parents=0','HEAD').toString().trim())]));
}
function same(a: unknown,b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const x=Object.keys(a).sort(), y=Object.keys(b).sort();
  return x.length === y.length && x.every((key,i)=>key===y[i] && same((a as Record<string,unknown>)[key],(b as Record<string,unknown>)[key]));
}
function workShape(value: unknown): Work {
  const w = object(value); hash(w.planHash); text(w.step); text(w.nextAction);
  relativePath(text(w.rulings));
  assert(Array.isArray(w.lessons) && w.lessons.every(x => typeof x === 'string'), 'invalid lesson paths');
  for (const item of w.lessons) relativePath(item as string);
  for (const name of ['findings','reviewDebt','evidence']) {
    assert(Array.isArray(w[name]) && (w[name] as unknown[]).every(v => typeof v === 'string'), `invalid ${name}`);
  }
  if (w.captures !== undefined) captureShape({schemaVersion:1,records:w.captures},false);
  return w as Work;
}
function validateWork(root: string, value: unknown): Work {
  const work=workShape(value);
  safeFile(root,work.rulings);
  for (const lesson of work.lessons) safeFile(root,lesson);
  assert(digest(fs.readFileSync(safeFile(root,'docs/plan.md'))) === work.planHash, 'work plan hash does not match repository');
  return work;
}
export function publish(root: string, host: Host, value: unknown, fault?: (phase: 'captured' | 'staged' | 'swapped') => void): Checkpoint {
  return withLock(root, () => {
    const work = validateWork(root,value); const capture = captureSources(root,work.captures ?? []); const before = snapshot(root); const j = journal(root);
    const number = j.generation + 1; const generation = `${number}-${randomBytes(8).toString('hex')}`;
    const payload: Record<string,string> = Object.create(null);
    const stageBase = safeFile(root,'.methodical/checkpoints',true); fs.mkdirSync(stageBase,{recursive:true});
    const stage = path.join(stageBase, '.stage-' + generation); fs.mkdirSync(stage,{mode:0o700});
    const put = (name: string, bytes: Buffer | string): void => {
      const f = path.join(stage,name); fs.mkdirSync(path.dirname(f),{recursive:true});
      const fd=fs.openSync(f,'wx',0o600);
      try { fs.writeFileSync(fd,bytes);fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      payload[name] = digest(Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes));
    };
    try {
      fault?.('captured');
      for (const record of capture.records) if (record.kind === 'local') put(record.archive,capture.bytes.get(record.ref)!);
      put('file-modes.json',JSON.stringify(Object.fromEntries(Object.keys(before.tree).filter(name=>before.tree[name]!==null).map(name=>[name,fs.statSync(safeFile(root,name)).mode&0o777]))));
      put('dirty.patch',git(root,'diff','--binary','HEAD'));
      put('index.patch',git(root,'diff','--cached','--binary','HEAD'));
      const changed = new Set(git(root,'diff','--name-only','-z','HEAD').toString().split('\0'));
      const untracked = new Set(git(root,'ls-files','--others','--exclude-standard','-z').toString().split('\0'));
      for (const name of Object.keys(before.tree)) {
        if ((changed.has(name) || untracked.has(name)) && before.tree[name] !== null)
          put((untracked.has(name) ? 'untracked/' : 'worktree/') + name,fs.readFileSync(safeFile(root,name)));
      }
      put('resume.md',`# Resume\n\nStep: ${work.step}\n\nNext: ${work.nextAction}\n\n${fs.readFileSync(safeFile(root,work.rulings),'utf8')}\n\nOpen findings: ${work.findings.join('; ')}\nReview debt: ${work.reviewDebt.join('; ')}\nLessons: ${work.lessons.join(', ')}\n`);
      const c: Checkpoint = { schemaVersion:2,capture:{schemaVersion:1,records:capture.records},generation,createdAt:new Date().toISOString(),host,
        relevant:j.relevant,repo:before,work,payload };
      put('checkpoint.json', JSON.stringify(c,null,2));
      // checkpoint.json is hashed by the pointer, not recursively by its own payload map.
      delete payload['checkpoint.json'];
      fault?.('staged');
      assert(same(before,snapshot(root)) && journal(root).relevant === j.relevant, 'repository changed while checkpointing');
      for (const record of capture.records) if (record.kind === 'local')
        assert(digest(readBounded(safeFile(root,record.source),captureLimits.fileBytes)) === record.sha256, 'captured evidence changed while checkpointing');
      const final = path.join(stageBase,generation); fs.renameSync(stage,final);
      j.generation = number; j.sequence++; saveJournal(root,j);
      atomic(safeFile(root,'.methodical/checkpoint-current.json',true),JSON.stringify({
        schemaVersion:1,generation,sha256:digest(fs.readFileSync(path.join(final,'checkpoint.json'))) }));
      fault?.('swapped');
      assert(same(before,snapshot(root)), 'checkpoint became stale during publication');
      return c;
    } finally { fs.rmSync(stage,{recursive:true,force:true}); }
  });
}
export function readCheckpoint(root: string): { checkpoint: Checkpoint | null; current: boolean; reason: string } {
  try {
    assertFixture(root); prepare(root);
    const p = object(JSON.parse(readBounded(safeFile(root,'.methodical/checkpoint-current.json'),4096).toString('utf8')));
    assert(p.schemaVersion === 1 && /^\d+-[a-f0-9]{16}$/.test(text(p.generation)), 'invalid checkpoint pointer');
    const base = `.methodical/checkpoints/${p.generation as string}`;
    const bytes = readBounded(safeFile(root,base+'/checkpoint.json'),16*1024*1024);
    assert(digest(bytes) === hash(p.sha256), 'checkpoint metadata checksum mismatch');
    const checkpoint = inspectBundle(safeFile(root,base));
    assert(checkpoint.generation === p.generation,'invalid checkpoint generation');
    validateWork(root,checkpoint.work);
    const j=journal(root);
    const current = same(checkpoint.repo,snapshot(root)) && checkpoint.relevant === j.relevant &&
      Number(checkpoint.generation.split('-')[0]) === j.generation;
    return { checkpoint,current,reason:current ? 'current at this read; revalidate before use' : 'stale: reconcile repository, rulings and latest work before resuming' };
  } catch (e) { return { checkpoint:null,current:false,reason:(e as Error).message }; }
}

function relativePath(value: string): void {
  assert(value.length > 0 && !path.isAbsolute(value) && !value.includes('\\') && !value.includes('\0') &&
    !value.split('/').some(part=>part === '' || part === '.' || part === '..'), 'unsafe relative path');
}
function sourcePath(value: string): void {
  relativePath(value);
  const lower=value.toLowerCase();
  assert(lower !== '.git' && !lower.startsWith('.git/'), 'Git metadata cannot be evidence');
  assert(lower !== '.methodical' && (!lower.startsWith('.methodical/') || lower.startsWith('.methodical/evidence/')), 'helper control metadata cannot be evidence');
  assert(!value.split('/').some(part=> /^(?:\.env(?:\..*)?|credentials(?:\..*)?|auth\.json|id_(?:rsa|ed25519)|transcript(?:s)?(?:\..*)?)$/i.test(part)), 'credentials or transcripts cannot be evidence');
}
function readBounded(file: string, limit: number): Buffer {
  const fd=fs.openSync(file,fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const st=fs.fstatSync(fd);
    assert(st.isFile() && st.size <= limit, 'file must be regular and within size limit');
    const bytes=Buffer.alloc(st.size+1); let size=0;
    while (size < bytes.length) { const count=fs.readSync(fd,bytes,size,bytes.length-size,null); if (!count) break; size+=count; }
    assert(size === st.size, 'file size changed while reading');
    return bytes.subarray(0,size);
  } finally { fs.closeSync(fd); }
}
function captureShape(value: unknown, archived: boolean): CaptureManifest {
  const manifest=object(value);
  assert(manifest.schemaVersion === 1 && Array.isArray(manifest.records), 'invalid capture schema');
  assert(manifest.records.length <= captureLimits.descriptors, 'capture descriptor limit exceeded');
  assert(Buffer.byteLength(JSON.stringify(manifest)) <= captureLimits.metadataBytes, 'capture metadata limit exceeded');
  const refs=new Set<string>(), sources=new Set<string>(), archives: string[]=[]; let total=0;
  for (const item of manifest.records) {
    const r=object(item); const ref=text(r.ref);
    assert(!refs.has(ref), 'duplicate evidence reference'); refs.add(ref);
    let keys: string[];
    if (r.kind === 'local') {
      const source=text(r.source), archive=text(r.archive); sourcePath(source); relativePath(archive);
      assert(archive.startsWith('evidence/'), 'capture archive must be under evidence/');
      assert(r.required === true, 'local evidence must declare required true');
      const sourceKey=source.toLowerCase(), archiveKey=archive.toLowerCase();
      assert(!sources.has(sourceKey), 'duplicate evidence source'); sources.add(sourceKey);
      assert(!archives.some(other=>other===archiveKey || other.startsWith(archiveKey+'/') || archiveKey.startsWith(other+'/')), 'capture archive collision');
      archives.push(archiveKey);
      keys=['kind','ref','source','archive','required'];
      if (archived) {
        const size=integer(r.bytes); hash(r.sha256); total+=size;
        assert(size <= captureLimits.fileBytes && total <= captureLimits.totalBytes, 'capture byte limit exceeded');
        keys.push('bytes','sha256');
      }
    } else if (r.kind === 'external') {
      const url=new URL(text(r.url)); assert(['https:','http:'].includes(url.protocol), 'external reference needs HTTP URL');
      keys=['kind','ref','url'];
    } else {
      assert(r.kind === 'unavailable', 'unknown capture kind'); text(r.reason); keys=['kind','ref','reason'];
    }
    assert(Object.keys(r).length === keys.length && Object.keys(r).every(key=>keys.includes(key)), 'unexpected capture fields');
  }
  assert(Object.keys(manifest).length === 2, 'unexpected capture manifest fields');
  return manifest as CaptureManifest;
}
function captureSources(root: string, requests: CaptureRequest[]): {records: CapturedRecord[]; bytes: Map<string,Buffer>} {
  captureShape({schemaVersion:1,records:requests},false);
  const bytes=new Map<string,Buffer>(); let total=0;
  const records=requests.map(record=>{
    if (record.kind !== 'local') return {...record};
    // An explicit dedicated evidence path is the sole exception for ignored support records.
    if (!record.source.startsWith('.methodical/evidence/')) {
      const ignored=spawnSync('git',['--no-optional-locks','-C',root,'check-ignore','--no-index','-z','--stdin'],
        {input:record.source+'\0',encoding:'utf8',stdio:['pipe','pipe','pipe']});
      assert(!ignored.error && ignored.status === 1,'ignored support must be staged under .methodical/evidence/');
    }
    const data=readBounded(safeFile(root,record.source),captureLimits.fileBytes); total+=data.length;
    assert(total <= captureLimits.totalBytes,'capture total byte limit exceeded'); bytes.set(record.ref,data);
    return {...record,bytes:data.length,sha256:digest(data)};
  });
  // Sizes/hashes are also bounded metadata and are checked before publication.
  captureShape({schemaVersion:1,records},true);
  return {records,bytes};
}
function cleanBase(root: string): Record<string,string> {
  const entries=git(root,'ls-tree','-r','-z','HEAD').toString().split('\0').filter(Boolean).map(line=>{
    const tab=line.indexOf('\t'), [mode,type,oid]=line.slice(0,tab).split(' '), name=line.slice(tab+1);
    assert(tab > 0 && type === 'blob' && (mode === '100644' || mode === '100755') && oid,'clean base supports ordinary files only');
    const file=safeFile(root,name); const stat=fs.lstatSync(file);
    assert(stat.isFile() && (stat.mode & 0o777) === (Number.parseInt(mode,8) & 0o777),'destination worktree mode differs from clean base');
    const bytes=fs.readFileSync(file);
    assert(digest(bytes) === digest(git(root,'cat-file','blob',oid)),'destination worktree bytes differ from clean base');
    return {name,sum:digest(Buffer.concat([Buffer.from(String(stat.mode & 0o777)+':'),bytes])),record:`${mode} ${oid} 0\t${name}\0`};
  }).sort((a,b)=>Buffer.compare(Buffer.from(a.name),Buffer.from(b.name)));
  assert(digest(Buffer.from(entries.map(e=>e.record).join(''))) === digest(git(root,'ls-files','--stage','-z')),'destination index differs from clean base');
  return Object.fromEntries(entries.map(entry=>[entry.name,entry.sum]));
}
function repoShape(value: unknown): RepoState {
  const r=object(value);
  assert(same(Object.keys(r).sort(),['branch','head','identity','index','tree']),'invalid repository state fields');
  hash(r.identity); hash(r.index);
  assert(/^[a-f0-9]{40,64}$/.test(text(r.head)), 'invalid saved HEAD'); text(r.branch);
  const tree=object(r.tree);
  for (const [name,sum] of Object.entries(tree)) {
    relativePath(name); assert(!/^\.(?:git|methodical)(?:\/|$)/i.test(name),'metadata in saved tree');
    if (sum !== null) hash(sum);
  }
  return r as RepoState;
}
function bundleFiles(root: string, relative=''): string[] {
  return fs.readdirSync(path.join(root,relative)).sort().flatMap(name=>{
    const rel=relative ? relative+'/'+name : name;
    const full=safeFile(root,rel); const stat=fs.lstatSync(full);
    assert(stat.isFile() || stat.isDirectory(), 'special file in bundle');
    return stat.isDirectory() ? bundleFiles(root,rel) : [rel];
  });
}
/** Validate an archive without touching repository state or requiring restored work files. */
export function inspectBundle(bundle: string): Checkpoint {
  const root=fs.realpathSync(bundle);
  const c=object(JSON.parse(readBounded(safeFile(root,'checkpoint.json'),16*1024*1024).toString('utf8')));
  assert(c.schemaVersion === 1 || c.schemaVersion === 2,'invalid checkpoint schema');
  assert(/^\d+-[a-f0-9]{16}$/.test(text(c.generation)), 'invalid checkpoint generation');
  assert(Number.isFinite(Date.parse(text(c.createdAt))),'invalid checkpoint timestamp'); parseHost(c.host); integer(c.relevant);
  const work=workShape(c.work), repo=repoShape(c.repo), payload=object(c.payload);
  for (const name of ['resume.md','dirty.patch','index.patch','file-modes.json']) hash(payload[name]);
  let capture: CaptureManifest | undefined;
  if (c.schemaVersion === 2) {
    capture=captureShape(c.capture,true);
    const requests=capture.records.map(record=>{const {bytes,sha256,...request}=record; return request;});
    assert(same(requests,work.captures ?? []),'work capture requests do not match archived manifest');
  } else assert(c.capture === undefined && work.captures === undefined,'v1 evidence coverage must remain unknown');
  const archives=new Map<string,CapturedRecord>();
  for (const record of capture?.records ?? []) if (record.kind === 'local') archives.set(record.archive,record);
  const modes=object(JSON.parse(readBounded(safeFile(root,'file-modes.json'),16*1024*1024).toString('utf8')));
  for (const [name,mode] of Object.entries(modes)) {
    relativePath(name); assert(repo.tree[name] !== null && Object.hasOwn(repo.tree,name),'mode lacks saved tree file');
    assert(integer(mode) <= 0o777,'invalid saved file mode');
  }
  assert(Object.keys(repo.tree).filter(name=>repo.tree[name] !== null).every(name=>Object.hasOwn(modes,name)),'missing saved file mode');
  for (const [file,sum] of Object.entries(payload)) {
    relativePath(file); hash(sum);
    assert(['resume.md','dirty.patch','index.patch','file-modes.json'].includes(file) || file.startsWith('untracked/') || file.startsWith('worktree/') || archives.has(file),'unknown archive payload');
    const record=archives.get(file);
    const bytes=readBounded(safeFile(root,file),record ? captureLimits.fileBytes : 16*1024*1024);
    assert(digest(bytes) === sum,'checkpoint payload checksum mismatch');
    if (record) assert(bytes.length === record.bytes && sum === record.sha256,'capture byte/hash mismatch');
    if (file.startsWith('untracked/') || file.startsWith('worktree/')) {
      const name=file.slice(file.indexOf('/')+1);
      assert(Object.hasOwn(modes,name) && repo.tree[name] === digest(Buffer.concat([Buffer.from(String(modes[name])+':'),bytes])), 'restoration payload does not match saved tree');
      assert(!Object.hasOwn(payload,(file.startsWith('untracked/') ? 'worktree/' : 'untracked/')+name),'duplicate restoration payload');
    }
  }
  for (const [archive,record] of archives) assert(payload[archive] === record.sha256,'missing captured payload');
  const declared=Object.keys(payload).concat('checkpoint.json').sort();
  assert(same(bundleFiles(root),declared),'undeclared or missing bundle files');
  return c as Checkpoint;
}

export type RecoveryCheck = { pass: boolean; reason: string };
export type RecoveryVerification = {
  pass: boolean; phase: 'pre-restore' | 'post-restore'; integrity: RecoveryCheck;
  destinationCompatibility: RecoveryCheck; restoredState: RecoveryCheck | null;
  evidenceCompleteness: RecoveryCheck & { coverage: 'explicit' | 'unknown'; limitations: string[]; mappings: {ref:string;archive:string;sha256:string;bytes:number}[] };
  semanticFreshness: 'not-established';
};
/** Both phases are strictly read-only, including when metadata is absent or validation fails. */
export function verifyRecovery(root: string, bundle: string, phase: 'pre-restore' | 'post-restore'): RecoveryVerification {
  const failed=(reason: string): RecoveryCheck=>({pass:false,reason});
  const result: RecoveryVerification={pass:false,phase,integrity:failed('not checked'),destinationCompatibility:failed('not checked'),restoredState:null,
    evidenceCompleteness:{...failed('not checked'),coverage:'unknown',limitations:[],mappings:[]},semanticFreshness:'not-established'};
  let checkpoint: Checkpoint;
  try {
    assert(phase === 'pre-restore' || phase === 'post-restore','invalid recovery phase');
    checkpoint=inspectBundle(bundle); result.integrity={pass:true,reason:'bundle shape and payload checksums valid'};
  } catch(e) {result.integrity=failed((e as Error).message); return result;}
  const manifest=checkpoint.capture;
  result.evidenceCompleteness={pass:checkpoint.schemaVersion === 2,coverage:manifest ? 'explicit':'unknown',
    reason:manifest ? 'all declared required local records are present; opaque labels assert no coverage':'legacy bundle evidence coverage is unknown',
    limitations:(manifest?.records ?? []).filter(r=>r.kind !== 'local').map(r=>r.kind === 'external' ? `${r.ref}: external ${r.url}` : r.kind === 'unavailable' ? `${r.ref}: unavailable ${r.reason}` : ''),
    mappings:(manifest?.records ?? []).flatMap(r=>r.kind === 'local' ? [{ref:r.ref,archive:r.archive,sha256:r.sha256!,bytes:r.bytes!}] : [])};
  try {
    const real=assertFixture(root);
    assert(repositoryIdentity(real) === checkpoint.repo.identity,'destination fixture identity mismatch');
    assert(git(real,'rev-parse','HEAD').toString().trim() === checkpoint.repo.head,'destination HEAD mismatch');
    assert(git(real,'symbolic-ref','--short','-q','HEAD').toString().trim() === checkpoint.repo.branch,'destination branch mismatch');
    let baseTree: Record<string,string> | undefined;
    if (phase === 'pre-restore') {
      baseTree=cleanBase(real);
      assert(git(real,'ls-files','--others','-z').toString().split('\0').every(name=>!name || name.startsWith('.methodical/')),'destination has unexpected untracked files');
    }
    result.destinationCompatibility={pass:true,reason:phase === 'pre-restore' ? 'fixture identity, HEAD, branch and clean base match':'fixture identity, HEAD and branch match'};
    if (baseTree) {
      try {
        // A self-consistent declaration cannot hide missing recovery bytes. HEAD supplies only unchanged files.
        for (const [name,sum] of Object.entries(checkpoint.repo.tree)) {
          if (sum === null || sum === baseTree[name]) continue;
          assert(Object.hasOwn(checkpoint.payload,'worktree/'+name) || Object.hasOwn(checkpoint.payload,'untracked/'+name),
            `missing restoration payload for ${name}`);
        }
      } catch(e) {result.integrity=failed((e as Error).message);}
    }
    if (phase === 'post-restore') {
      try {
        assert(same(snapshot(real),checkpoint.repo),'restored tree or index mismatch');
        validateWork(real,checkpoint.work);
        result.restoredState={pass:true,reason:'saved bytes, modes, deletions, index and work references match'};
      } catch(e) {result.restoredState=failed((e as Error).message);}
    }
  } catch(e) {result.destinationCompatibility=failed((e as Error).message);}
  result.pass=result.integrity.pass && result.destinationCompatibility.pass && result.evidenceCompleteness.pass && (phase === 'pre-restore' || result.restoredState?.pass === true);
  return result;
}
