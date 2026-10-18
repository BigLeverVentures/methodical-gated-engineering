#!/usr/bin/env bash
set -euo pipefail
[ "$#" = 1 ] || { echo 'Usage: preflight.sh OUTPUT_JSON' >&2; exit 2; }
python3 - "${1}" <<'PYTHON'
import json, shutil, subprocess, sys
from pathlib import Path
out=Path(sys.argv[1])
if out.exists(): raise SystemExit('Refusing to replace existing preflight evidence')
def version(name, args):
    binary=shutil.which(name)
    if not binary: return {'available':False,'version':None}
    p=subprocess.run([binary,*args],capture_output=True,text=True,timeout=10)
    return {'available':True,'version':(p.stdout or p.stderr).strip(),'exitCode':p.returncode}
record={'schemaVersion':1,'mode':'offline-only','tools':{n:version(n,a) for n,a in [('node',['--version']),('python3',['--version']),('git',['--version']),('claude',['--version']),('codex',['--version'])]},'native':{h:{'installation':'unverified','isolation':'unverified','allAgentLimit':'unverified','cancellation':'unverified','liveCellsPassed':[]} for h in ['claude-code','codex']}}
with out.open('x') as f: json.dump(record,f,indent=2);f.write('\n')
print('Offline preflight saved; no native capability certified.')
PYTHON
