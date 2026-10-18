#!/usr/bin/env bash
# Narrow publication regressions; raw audit records belong outside the distribution.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
python3 - <<'PY'
import re, subprocess
patterns = {
 'conversation link': re.compile(r'https?://(?:claude[.]ai/code/' + r'session_|chatgpt[.]com/(?:c|share)/|chat[.]openai[.]com/(?:c|share)/)',re.I),
 'operator handoff': re.compile(r"(?:for the ow" + r"ner.s README pass|until the first " + r"publish|private draft verifi" + r"cation passed|not merged; waiting for the " + r"owner)",re.I),
}
def findings(text):return [name for name,pattern in patterns.items() if pattern.search(text)]
# Negative controls exercise the same matcher used on distributed text.
assert findings('https://claude.ai/code/'+'session_SYNTHETIC') == ['conversation link']
assert findings('https://chatgpt.com/'+'c/synthetic') == ['conversation link']
assert findings('For the ow'+"ner's README pass") == ['operator handoff']
assert findings('Until the first '+'publish') == ['operator handoff']
for safe in ['Record rulings verbatim before compaction.', 'Synthetic session id: fixture-session-1',
             'https://claude.ai/code', 'https://chatgpt.com/', 'The user decides whether to compound.']:
 assert not findings(safe),safe
paths=subprocess.check_output(['git','ls-files','-z','--cached']).decode().split('\0')
bad=[]
for path in filter(None,paths):
 with open(path,'rb') as f:body=f.read().replace(b'\0',b'').decode('utf-8',errors='replace')
 for name in findings(body):bad.append(path+': '+name)
if bad:raise SystemExit('\n'.join(bad))
print('PASS publication-scrub (conversation links, operator notes, negative controls)')
PY
