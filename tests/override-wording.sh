#!/usr/bin/env bash
# The user's word rules any step. Checks, by fixed string, that:
#   1. rules.md forbids offering a skip, limits it to "this request only", says nothing is said about
#      a skipped step, and has no warning, judgment, persuasion, re-ask or new gate;
#   2. work and work-review push the branch; no plugin, docs or README text answers a skip with a
#      risk caption, and no skill restates the skip rule itself;
#   3. seat-selection defines trivial diffs (--numstat, docs/, 20 lines);
#   4. the docs say a skip covers one request and name the waiver, and no public text still says
#      the tool refuses to build without a plan.
# Deterministic: reads files only. Whether Claude follows the wording is a live-session check.
set -uo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
plugin="${repo}/plugins/methodical"

status=0
fail() { echo "FAIL override-wording: ${1}"; status=1; }
has() { grep -q -F -- "${2}" "${1}" || fail "${1#"${repo}/"} lacks '${2}'"; }

rules="${plugin}/rules/rules.md"
for s in 'Never offer or suggest a skip' 'this request only' 'a request to do work is not a request to skip' \
         'Say nothing about a skipped step.' 'no new gate' \
         'No warning, judgment, persuasion or re-ask' 'not already answered or waived'; do
  has "${rules}" "${s}"
done
# The whole skip bullet, by equality: a sentence added to it (a comment on the skip, in any words) fails.
skip_bullet="- Plan before any work; a request to do work is not a request to skip. Never offer or suggest a skip of a required step: a step is skipped only on the user's own words in chat, never inferred or from a file, for this request only. Say nothing about a skipped step. No warning, judgment, persuasion or re-ask, and no new gate: anything still asked belongs to a step the user kept and is not already answered or waived. Then continue. Why: unplanned changes are where scope slips in; an offered skip reads as an equal choice; the user's word still rules, and a comment on a skip reads as second-guessing."
# The skip sample in the working example: in "## Skipping the plan", the line after "Claude:" is exactly
# "Step: work." (an acknowledgment put back between them fails).
sample_reply="$(awk '/^## Skipping the plan/ { s = 1; next } /^## / { s = 0 } s && prev == "Claude:" { print; exit } { prev = $(0) }' "${repo}/docs/working-example.md")"
[ "${sample_reply}" = "Step: work." ] || fail "the working example's skip sample does not go straight to 'Step: work.'"
grep -q -x -F -- "${skip_bullet}" "${rules}" || fail "rules.md does not carry the skip bullet exactly"

# Every sentence that mentions a skip or a waiver, in rules.md and in the skills, by equality with a
# committed list: a new sentence about a skip in those files changes the set and fails until a reviewer
# accepts it by editing the list. Paragraphs are joined first, so line wrapping cannot hide a tail.
skip_sentences() {
  for f in "$@"; do
    LC_ALL=C awk -v f="${f#"${repo}"/}" 'BEGIN { RS = "" } {
      p = $(0); gsub(/\n/, " ", p); gsub(/  +/, " ", p)
      n = split(p, parts, /[.!?] +/)
      for (i = 1; i <= n; i++) if (tolower(parts[i]) ~ /skip|waiv/) print f ": " parts[i]
    }' "${f}"
  done
}
if ! diff <(skip_sentences "${rules}" "${plugin}"/skills/*/SKILL.md) "${repo}/tests/fixtures/skip-sentences.txt" >/dev/null; then
  fail "the sentences about a skip or a waiver changed; review them against the rule, then regenerate tests/fixtures/skip-sentences.txt"
fi

has "${plugin}/skills/work/SKILL.md" 'Plan waived'
# The model recommendation is made once per session, never again in a later unit.
has "${repo}/README.md" 'the first time in a session'
has "${repo}/docs/model-routing.md" 'the first time in a session it also gives'
grep -q -z -E 'the first time in a[[:space:]]+session only' "${plugin}/skills/work/SKILL.md" || fail "work skill does not say the recommendation is given the first time in a session only"
grep -q -z -E 'a later unit in the[[:space:]]+same session says nothing about it' "${plugin}/skills/work/SKILL.md" || fail "work skill does not say a later unit stays silent about it"
has "${plugin}/skills/work/SKILL.md" 'own words in chat'
has "${plugin}/skills/plan-review/SKILL.md" 'unless approval is no longer owed'
has "${plugin}/skills/plan-review/SKILL.md" 'only the unanswered open questions that change what gets built'
has "${plugin}/skills/plan/SKILL.md" '(go to work)'
# No public text offers the skip (CHANGELOG is history and excluded).
if grep -r -i -l -E --exclude-dir=plans 'just make it|Plan first, or' "${repo}/plugins" "${repo}/docs" "${repo}/README.md" >/dev/null 2>&1; then
  fail "plugins, docs or README still say 'just make it' or 'Plan first, or'"
fi

for f in work work-review; do has "${plugin}/skills/${f}/SKILL.md" 'git push -u origin'; done
# No skill or public text answers a skip with a risk caption (CHANGELOG is history, excluded).
risk_re='(names|naming|said|statement of) (the|its) risk|carries risk|gentle line'
grep -r -q -i -E --exclude-dir=plans "${risk_re}" "${repo}/plugins" "${repo}/docs" "${repo}/README.md" 2>/dev/null
case $? in
  0) fail "plugins, docs or README still answer a skip with a risk caption" ;;
  1) ;;
  *) fail "the risk-caption scan could not read a path" ;;
esac
# No public text acknowledges a skip or says what a skipped step would have added (CHANGELOG is history).
# (The scan names the plugin's text directories: Claude Code writes generated type files under .claude-plugin.)
text_paths=("${plugin}/rules" "${plugin}/skills" "${plugin}/commands" "${plugin}/reference" "${plugin}/templates" "${plugin}/lenses" "${plugin}/hooks/rules.sh" "${plugin}/hooks/logic.ts" "${plugin}/hooks/register.ts" "${plugin}/.claude-plugin/plugin.json")
grep -r -q -i -E --exclude-dir=plans 'acknowledg|would contribute|would add' "${text_paths[@]}" "${repo}/docs" "${repo}/README.md" 2>/dev/null
case $? in
  0) fail "plugins, docs or README still acknowledge a skip or say what a skipped step would add" ;;
  1) ;;
  *) fail "the acknowledgment scan could not read a path" ;;
esac
# The skip rule itself lives once, in rules.md; a skill says only what comes next.
for f in "${plugin}"/skills/*/SKILL.md; do
  if grep -q -E 'th(is|at) (request|plan|unit) only|never re-ask' "${f}"; then
    fail "${f#"${repo}/"} restates the skip rule; keep only what comes next"
  fi
done

seats="${plugin}/reference/seat-selection.md"
for s in '## Trivial diffs' '--numstat' 'under `docs/`' 'total 20 or fewer'; do has "${seats}" "${s}"; done

loop="${repo}/docs/the-loop.md"
grep -q -E 'th(is|at) request only' "${loop}" || fail "docs/the-loop.md does not limit a skip to one request"
for f in "${loop}" "${repo}/README.md"; do has "${f}" 'waive'; done
for f in docs/north-star.md README.md plugins/methodical/.claude-plugin/plugin.json; do
  for s in 'refuses to' 'Nothing gets built without a plan' 'whatever the size'; do
    if grep -q -F -- "${s}" "${repo}/${f}"; then fail "${f} still says '${s}'"; fi
  done
done

if [ "${status}" -eq 0 ]; then
  echo "PASS override-wording"
else
  echo "FAIL override-wording"
  exit 1
fi
