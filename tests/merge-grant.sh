#!/usr/bin/env bash
# The compound skill honors a standing merge grant. Checks:
#   1. skills/compound/SKILL.md carries the recognition grep verbatim, names the three files and
#      both values, says to run it from the repo root and to read its output, not its exit status;
#   2. work and work-review name the grant, and the-loop documents `merge-grant: standing`;
#   3. the grep, taken from the skill itself and run from each fixture's root, gives the expected
#      verdict: list, quote and bold forms are a grant; prose and near-misses are not; `ask` beats
#      `standing`; no file at all means ask.
# Deterministic: reads files only. Whether Claude follows the skill is observed in real use.
set -uo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
plugin="${repo}/plugins/methodical"
skill="${plugin}/skills/compound/SKILL.md"
fixtures="${repo}/tests/fixtures/merge-grant"

status=0
fail() { echo "FAIL merge-grant: ${1}"; status=1; }

expected_grep="grep -nE '^[[:space:]>*-]*(\\*\\*)?merge-grant: (standing|ask)\\b' CLAUDE.md docs/rulings.md docs/private/rulings.md 2>/dev/null"

[ -f "${skill}" ] || { echo "FAIL merge-grant: skills/compound/SKILL.md missing"; exit 1; }

# 1. The skill: the grep verbatim, the files, the values, the repo root, output not status.
grep -q -x -F -- "${expected_grep}" "${skill}" || fail "compound skill lacks the recognition grep verbatim"
for s in 'CLAUDE.md' 'docs/rulings.md' 'docs/private/rulings.md' 'merge-grant: standing' \
         'merge-grant: ask' 'git rev-parse --show-toplevel' 'never its exit status' 'Merge when green?' \
         'Merging on the standing grant at'; do
  grep -q -F -- "${s}" "${skill}" || fail "compound skill does not say '${s}'"
done

# 2. The other skills and the docs name the grant.
for f in skills/work/SKILL.md skills/work-review/SKILL.md; do
  grep -q -F 'standing merge grant' "${plugin}/${f}" || fail "${f} does not name the standing merge grant"
done
for f in docs/the-loop.md; do
  grep -q -F 'merge-grant: standing' "${repo}/${f}" || fail "${f} does not document merge-grant: standing"
done

# 3. Run the skill's own grep line in each fixture root. Reading output, as the skill says.
cmd="$(grep -x -F -- "${expected_grep}" "${skill}" | head -n 1)"
[ -n "${cmd}" ] || { echo "FAIL merge-grant: no grep line to run"; exit 1; }
verdict() { # dir -> standing | ask | none
  local out
  out="$(cd "${1}" && eval "${cmd}")"
  if grep -q 'merge-grant: ask' <<<"${out}"; then echo ask
  elif grep -q 'merge-grant: standing' <<<"${out}"; then echo standing
  else echo none; fi
}

empty="$(mktemp -d)"; trap 'rm -rf "${empty}"' EXIT
cases=(
  "standing-claude-md:standing"
  "standing-private-rulings:standing"
  "standing-bold-list-item:standing"
  "standing-quote:standing"
  "ask-overrides-standing:ask"
  "prose-only:none"
  "near-miss:none"
  "@empty:none"
)
checked=0
for c in "${cases[@]}"; do
  name="${c%%:*}"; want="${c#*:}"
  if [ "${name}" = "@empty" ]; then dir="${empty}"; name="no files"
  else dir="${fixtures}/${name}"; [ -d "${dir}" ] || { fail "fixture ${name} missing"; continue; }; fi
  got="$(verdict "${dir}")"
  checked=$((checked + 1))
  if [ "${got}" = "${want}" ]; then echo "ok   ${name} -> ${got}"
  else fail "${name} gives '${got}', expected '${want}'"; fi
done
[ "${checked}" -eq "${#cases[@]}" ] || fail "checked ${checked} of ${#cases[@]} cases"

# Why output, not status: a grant in one file while the others are missing still exits non-zero.
(cd "${fixtures}/standing-private-rulings" && eval "${cmd}" >/dev/null)
[ $? -ne 0 ] || fail "standing-private-rulings exits 0, so the output-not-status case is not exercised"

# The near-miss fixture must hold the near-misses it claims to (guards the guard).
n="$(grep -ci 'merge.grant' "${fixtures}/near-miss/CLAUDE.md" 2>/dev/null || true)"
[ "${n:-0}" -ge 5 ] || fail "near-miss fixture holds ${n:-0} near-miss lines, expected at least 5"

if [ "${status}" -eq 0 ]; then
  echo "PASS merge-grant: ${checked} cases (4 standing, 1 ask, 3 none), ${n} near-misses rejected"
else
  echo "FAIL merge-grant"
  exit 1
fi
