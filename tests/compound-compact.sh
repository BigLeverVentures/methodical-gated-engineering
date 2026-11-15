#!/usr/bin/env bash
# The compound-before-compact checks: text and
# structure properties of the skills, the hook files and the mod. The mod's behaviour is tested by
# `claude plugin test` (plugins/methodical/hooks/register.test.ts); this pins what a test of the
# engine cannot see: that the skills say the right thing, the dialog offers no skip, the shell hook
# is untouched, and the mod writes nothing to disk. A grep is a forgery target, so the section matcher is
# first run against a fixture that breaks the property and must see it.
set -uo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
plugin="${repo}/plugins/methodical"
compound="${plugin}/skills/compound/SKILL.md"
compact="${plugin}/skills/compact/SKILL.md"
status=0
fail() { echo "FAIL compound-compact: ${1}"; status=1; }
has() { grep -q -F -- "${2}" "${1}" 2>/dev/null || fail "${1#"${repo}"/} lacks: ${2}"; }
lacks() { if grep -q -E -- "${2}" "${1}" 2>/dev/null; then fail "${1#"${repo}"/} must not match: ${2}"; fi; }

# The text of one "## " section of a markdown file.
section() { awk -v h="## ${2}" '$(0) == h { on = 1; next } /^## / { on = 0 } on { print }' "${1}"; }

# --- the matcher is live: section() sees a merge ask in a fixture that breaks the property -------
fixture="$(mktemp)"
trap 'rm -f "${fixture}"' EXIT
printf '## Checkpoint\nAsk "Merge when green?" with AskUserQuestion\n## Other\n' >"${fixture}"
[ -n "$(section "${fixture}" 'Checkpoint' | grep -E 'AskUserQuestion|Merge when green')" ] \
  || fail "section matcher is vacuous: it did not see a merge ask in the fixture"

# --- compound: two modes, a checkpoint that never closes the unit -------------------------------
has "${compound}" '## Two modes'
has "${compound}" '**Closure**'
has "${compound}" '**Checkpoint**'
has "${compound}" 'a bare `/methodical:compound`'
cp="$(section "${compound}" 'Checkpoint')"
[ -n "${cp}" ] || fail "compound has no '## Checkpoint' section"
for bad in 'AskUserQuestion' 'Merge when green' 'merge-grant' 'git push -u' 'git merge'; do
  if grep -q -F -- "${bad}" <<<"${cp}"; then fail "the checkpoint section mentions: ${bad}"; fi
done
grep -q 'never ends with a question' <<<"${cp}" || fail "checkpoint does not say it never ends with a question"
grep -q 'one write-up for each outstanding' <<<"${cp}" || fail "checkpoint does not write one write-up per outstanding problem"
grep -q 'docs/private/resume.md' <<<"${cp}" || fail "checkpoint does not handle the private resume location"
grep -q 'force-added' <<<"${cp}" || fail "checkpoint does not keep a private resume file out of git"
grep -q 'checkpoint-finalize' <<<"${cp}" || fail "checkpoint does not publish through the production finalizer"
grep -q 'methodical:resume' <<<"${cp}" || fail "checkpoint does not require the chosen resume capture"
grep -q 'methodical-checkpoint-finalized' <<<"${cp}" || fail "checkpoint does not require a runtime receipt"
grep -q 'current: true' <<<"${cp}" || fail "checkpoint does not require current runtime verification"
grep -q 'Make no tool call of any kind after successful finalization' <<<"${cp}" || fail "checkpoint lets tools follow final publication"
if grep -q -E 'The marker, last|openssl rand -hex 8|Write tool' <<<"${cp}"; then fail "checkpoint retains the conflicting final-marker protocol"; fi
# The ordering matcher must reject publication before tests/handoff in a counterexample.
ordered_checkpoint() {
  local text="${1}" t_at h_at p_at
  t_at="$(grep -n 'Run all of the project' <<<"${text}" | head -n 1 | cut -d: -f1)"
  h_at="$(grep -n 'The handoff' <<<"${text}" | head -n 1 | cut -d: -f1)"
  p_at="$(grep -n 'Publish and verify, last' <<<"${text}" | head -n 1 | cut -d: -f1)"
  [ -n "${t_at}" ] && [ -n "${h_at}" ] && [ -n "${p_at}" ] && [ "${t_at}" -lt "${h_at}" ] && [ "${h_at}" -lt "${p_at}" ]
}
if ordered_checkpoint $'Publish and verify, last\nRun all of the project\nThe handoff'; then fail "checkpoint order matcher accepts early publication"; fi
ordered_checkpoint "${cp}" || fail "checkpoint does not finish verification and semantic handoff before publication"
reference="${plugin}/reference/native-routing.md"
for expected in 'checkpoint-binding' 'methodical:resume' 'checkpoint-finalize' 'policyHash' 'profileHash' 'current: true' 'same process' 'waiver' 'without forcing this protocol'; do
  has "${reference}" "${expected}"
done
# Closure keeps its merge ask byte for byte (structured-asks.sh pins the options line too).
has "${compound}" 'To ask, ask "Merge when green?" with AskUserQuestion and stop; this is the unit'"'"'s one merge ask:'

# --- compact: opens with the compound check, states, does not ask -------------------------------
c_at="$(grep -n '^## First, the compound check' "${compact}" | head -n 1 | cut -d: -f1)"
w_at="$(grep -n '^## What it produces' "${compact}" | head -n 1 | cut -d: -f1)"
{ [ -n "${c_at}" ] && [ -n "${w_at}" ] && [ "${c_at}" -lt "${w_at}" ]; } || fail "the compact skill does not open with the compound check"
has "${compact}" 'Say in one sentence what you will do, never ask, and do it'
has "${compact}" 'not an offered skip'
has "${compact}" 'never force a replacement checkpoint'
has "${compact}" 'successful runtime finalizer'
has "${compact}" '`offer` plugin option'
has "${compact}" 'run it anyway'

# Closure must not reintroduce a percentage trigger independently of the host adapter.
for distribution in "${plugin}" "${repo}/plugins/methodical-codex" "${repo}/packages/methodical-portable/references"; do
  for step in compound compact; do
    lacks "${distribution}/skills/${step}/SKILL.md" 'half (the |full)|compacting at half'
  done
  has "${distribution}/skills/compound/SKILL.md" 'If the user requests compaction'
  has "${distribution}/rules/rules.md" 'write the resume point first with verbatim rulings'
done

# --- the dialog offers no skip; the question says how to leave it -------------------------------
logic="${plugin}/hooks/logic.ts"
q="$(sed -n "s/^export const QUESTION = \"\(.*\)\"$/\1/p" "${logic}")"
o1="$(sed -n "s/^export const OPTION_COMPOUND = '\(.*\)'$/\1/p" "${logic}")"
o2="$(sed -n "s/^export const OPTION_CHAIN = '\(.*\)'$/\1/p" "${logic}")"
[ -n "${q}" ] && [ -n "${o1}" ] && [ -n "${o2}" ] || fail "logic.ts does not define QUESTION and both options"
for label in "${o1}" "${o2}"; do
  if grep -q -i -E 'skip|waive|just|now$|no thanks|not now' <<<"${label}"; then fail "an option reads as a skip: ${label}"; fi
  grep -q -i 'compound' <<<"${label}" || fail "an option does not lead to compounding: ${label}"
done
grep -q 'Esc compacts as is' <<<"${q}" || fail "the question does not say how to leave it"
case "${q}" in *'?') ;; *) fail "the question does not end with a question mark: ${q}" ;; esac

# --- the shell hook is untouched and the mod is wired -------------------------------------------
lacks "${plugin}/hooks/rules.sh" 'checkpoint|after-compact|nudge|\.private'
hj="${plugin}/hooks/hooks.json"
jq -e '.modules == ["./register.ts"] and (.hooks.SessionStart | length) == 1' "${hj}" >/dev/null || fail "hooks.json does not declare the mod beside the SessionStart hook"
manifest="${plugin}/.claude-plugin/plugin.json"
jq -e '.types == "./types/index.d.ts" and .userConfig.nudgeReserve.type == "number" and .userConfig.nudgeReserve.default > 0
       and .userConfig.offer.options == ["on","off"] and .userConfig.offer.default == "on"' "${manifest}" >/dev/null \
  || fail "the manifest lacks the types field or the two options"
# --- the mod: every hook fails open (session.compact holds back next(e) after an abort), nothing is written to disk ---------------------------------
reg="${plugin}/hooks/register.ts"
ons="$(grep -c -E "^  on\('" "${reg}")"
catches="$(grep -c -E '^  \}\)\.catch\(|^  \)\.catch\(|\.catch\(\(\$, e, next\) => next\(e\)\)$' "${reg}")"
[ "${ons}" -ge 7 ] || fail "register.ts registers ${ons} hooks, expected at least 7"
[ "${ons}" -eq "${catches}" ] || fail "register.ts has ${ons} hooks but ${catches} .catch handlers"
lacks "${reg}" '\$\.fs\.write|\$\.store|process\.run|\$\.network'
lacks "${reg}" 'prompt\.submit\(|\$\.prompt\.submit'
# The offers never compact: nudge() may only read and write its own state, read usage, toast and append the
# cue. Every engine call in its body must be on that list (a delayed command, a setting change or a
# prompt would not be), and the matcher is first run on a fixture that breaks the property.
nudge_calls() { awk '/^async function nudge\(/ { on = 1 } on { print } on && /^}/ { exit }' "${1}" | grep -o -E '\$\.[a-z]+\.[a-z]+' | sort -u; }
allowed='$.session.append
$.session.usage
$.state.get
$.state.set
$.ui.toast'
fix="$(mktemp)"
printf 'async function nudge($, a) {\n  await $.state.get(X)\n  void $.clock.after(1, () => $.command.run({ command: "compact" }))\n}\n' >"${fix}"
[ -n "$(nudge_calls "${fix}" | grep -v -x -F -f <(printf '%s\n' "${allowed}"))" ] \
  || fail "the nudge() call matcher is vacuous: it did not see a delayed compaction in the fixture"
rm -f "${fix}"
[ -n "$(nudge_calls "${reg}")" ] || fail "the nudge() call matcher found no calls in register.ts"
extra="$(nudge_calls "${reg}" | grep -v -x -F -f <(printf '%s\n' "${allowed}"))"
[ -z "${extra}" ] || fail "nudge() makes a call that is not an offer: ${extra}"

# --- standalone: nothing here calls or names Every's plugin -------------------------------------
if grep -r -l -E "EveryInc|Every's|every\.to|compound-engineering|ce-compound|compound-docs|workflows:" \
     "${plugin}/skills" "${plugin}/hooks" "${plugin}/rules" "${plugin}/templates" >/dev/null 2>&1; then
  fail "a skill, hook, rule or template names Every's plugin"
fi

if [ "${status}" -eq 0 ]; then echo "PASS compound-compact"; fi
exit "${status}"
