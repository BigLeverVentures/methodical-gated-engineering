import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, digest, host, object, profile, text } from '../core/contracts.js';
import { decide, type PolicyInput } from '../core/policy.js';
import { publish, readCheckpoint, safeFile, recordRelevant, assertFixture, verifyRecovery } from '../core/checkpoint.js';
const here=path.dirname(fileURLToPath(import.meta.url));
const input=(): unknown => JSON.parse(fs.readFileSync(0,'utf8'));
const json=(x:unknown): void => { process.stdout.write(JSON.stringify(x)+'\n'); };
function scopedDecision(root:string):unknown {
  let allowed=false;
  try {
    const grant=object(JSON.parse(fs.readFileSync(safeFile(root,'.methodical/approval.json'),'utf8')));
    allowed=grant.action==='implement'&&grant.scope==='fixture-mean'&&typeof grant.operatorRef==='string'&&
      grant.planHash===digest(fs.readFileSync(safeFile(root,'docs/plan.md')));
  } catch { /* no scoped grant */ }
  return allowed?{}:{hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'deny',
    permissionDecisionReason:'Methodical proof: implementation needs the scoped operator decision.'}};
}
function hook(platform: 'claude-code'|'codex', value: unknown): unknown {
  const x=object(value); const root=text(x.cwd); const name=text(x.hook_event_name);
  // Never activate proof state in an unmarked project.
  if (!fs.existsSync(path.join(root,'methodical-proof-fixture.json'))) return {};
  const marker=object(JSON.parse(fs.readFileSync(safeFile(root,'methodical-proof-fixture.json'),'utf8')));
  if (marker.synthetic !== true || marker.schemaVersion !== 1) return {};
  // Verification must reach the pure route before readCheckpoint prepares metadata.
  const tool=x.tool_input===undefined?{}:object(x.tool_input);
  const command=typeof tool.command==='string'?tool.command:'';
  const helper=path.join(path.resolve(here,'../..'),'runtime/scripts/cli.js');
  const safeArgument=(value:string):boolean=>!/["\n\r<>|;&`$\\]/.test(value);
  const verifyParts=command.match(/^node "([^"\n\r]+)" verify "([^"\n\r]+)" "([^"\n\r]+)" (pre-restore|post-restore)$/);
  const pureVerify=verifyParts!==null&&verifyParts[1]===helper&&verifyParts[2]===root&&
    verifyParts.slice(1,4).every(value=>safeArgument(value));
  if(pureVerify) {
    assertFixture(root);
    if(name==='PreToolUse') return scopedDecision(root);
    return {};
  }
  const status=readCheckpoint(root);
  if (name==='SessionStart') {
    const packageRoot=path.resolve(here,'../..');
    const method=fs.readFileSync(path.join(packageRoot,'core/method.md'),'utf8');
    const overlay=fs.readFileSync(path.join(packageRoot,'overlay.md'),'utf8');
    const shared=['capabilities.md','records.md','proof-protocol.md'].map(name=>fs.readFileSync(path.join(packageRoot,'core',name),'utf8')).join('\n');
    return {hookSpecificOutput:{hookEventName:'SessionStart',additionalContext:
      `${method}\n${shared}\n${overlay}\nProof checkpoint: ${status.reason}.\nPackage root: ${packageRoot}`}};
  }
  if (name==='PreToolUse') return scopedDecision(root);
  if(name==='PostToolUse') {
    const packageRoot=path.resolve(here,'../..');
    // Only the exact helper invocation is exempt, not arbitrary commands mentioning cli.js.
    const helper=path.join(packageRoot,'runtime/scripts/cli.js');
    const quoted=(v:string):string=>'"'+v+'"';
    const parts=command.match(/"[^"\n]*"|[^\s]+/g)??[];
    const ownCommand=parts[0]==='node'&&parts[1]===quoted(helper)&&parts[3]===quoted(root)&&
      ((parts[2]==='status'&&parts.length===4)||
       (parts[2]==='checkpoint'&&parts.length===6&&['claude-code','codex'].includes(parts[4]!)&&/^"[^"\n<>|;&`$]+"$/.test(parts[5]!))||
       (parts[2]==='record'&&parts.length===6&&parts.slice(4).every(v=>/^[a-zA-Z0-9._:-]+$/.test(v))));

    if(!ownCommand)recordRelevant(root,'native-tool-observed',String(x.tool_use_id??x.tool_name??'tool'));
  }
  // Observations do not perform compound, block user compaction, or create a model turn.
  // Real dispatch/correlation must be qualified independently; synthetic stdin is not a receipt.
  if (name==='PreCompact' || name==='PostCompact') return {};
  return {};
}
try {
  const [command,...args]=process.argv.slice(2);
  if (command==='policy') {
    const p=profile(JSON.parse(fs.readFileSync(text(args[0]),'utf8')));
    const i=JSON.parse(fs.readFileSync(text(args[1]),'utf8')) as PolicyInput;
    json(decide(p,i));
  } else if (command==='status') json(readCheckpoint(text(args[0])));
  else if (command==='checkpoint') json(publish(text(args[0]),host(args[1]),args[2]===undefined?input():JSON.parse(fs.readFileSync(text(args[2]),'utf8'))));
  else if (command==='verify') {
    assert(args.length===3&&(args[2]==='pre-restore'||args[2]==='post-restore'),'verify ROOT BUNDLE pre-restore|post-restore');
    const result=verifyRecovery(text(args[0]),text(args[1]),args[2]);json(result);
    if(!result.pass)process.exitCode=1;
  }
  else if (command==='record') { recordRelevant(text(args[0]),text(args[1]),text(args[2]));json({recorded:true}); }
  else if (command==='hook') json(hook(host(args[0]),input()));
  else { assert(false,'commands: policy PROFILE INPUT | status ROOT | checkpoint ROOT HOST | record ROOT KIND REF | verify ROOT BUNDLE pre-restore|post-restore | hook HOST'); }
} catch (e) {
  process.stderr.write(`Methodical proof: ${(e as Error).message}\n`); process.exitCode=1;
}
