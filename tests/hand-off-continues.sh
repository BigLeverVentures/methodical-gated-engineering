#!/usr/bin/env bash
# Bar 1 support: a step that needs no ruling continues in the same turn. Checks, by fixed string:
#   1. every skill's "## When it hands on" section exists and says "in the same turn", except
#      compact's, which stops by nature and names `/compact` (only the user runs it); a section
#      that also names a stop ("Approve this plan?", "Merge when green?") is not exempt;
#   2. rules.md carries the rule's three load-bearing phrases, and docs/the-loop.md the phrase;
#   3. the check is not vacuous: it must fail its fixtures (a hand-off that only names its step,
#      and one whose phrase sits outside the section).
# Deterministic: reads files only. Whether Claude continues is a live-session check.
set -uo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
plugin="${repo}/plugins/methodical"
fixtures="${repo}/tests/fixtures/hand-off"

status=0
fail() { echo "FAIL hand-off-continues: ${1}"; status=1; }

# The "## When it hands on" section of a file, up to the next "## " heading.
section() { awk '/^## When it hands on[[:space:]]*$/{p=1; print; next} /^## /{p=0} p' "${1}"; }

# check <file> <needle>: the hand-off section exists and contains the needle.
check() {
  local body
  body="$(section "${1}")"
  [ -n "${body}" ] || return 1
  grep -q -F -- "${2}" <<<"${body}"
}

count=0
for f in "${plugin}"/skills/*/SKILL.md; do
  name="$(basename "$(dirname "${f}")")"
  needle='in the same turn'
  [ "${name}" = compact ] && needle='/compact'
  count=$((count + 1))
  check "${f}" "${needle}" || fail "skills/${name}: hand-off section missing or lacks '${needle}'"
done
[ "${count}" -ge 9 ] || fail "found ${count} skills, expected at least 9"

rules="${plugin}/rules/rules.md"
for s in 'in the same turn' 'never end a turn' 'owed, not a hold'; do
  grep -q -F -- "${s}" "${rules}" || fail "rules.md lacks '${s}'"
done
grep -q -F -- 'in the same turn' "${repo}/docs/the-loop.md" || fail "docs/the-loop.md lacks 'in the same turn'"

# Self-mutation: the check must reject each fixture.
for fx in named-only phrase-outside; do
  if check "${fixtures}/${fx}/SKILL.md" 'in the same turn'; then
    fail "the check passed fixture '${fx}', which it must reject"
  else
    echo "ok: fixture '${fx}' rejected"
  fi
done

if [ "${status}" -eq 0 ]; then
  echo "PASS hand-off-continues: ${count} skills, rules and the-loop, 2 fixtures rejected"
else
  echo "FAIL hand-off-continues"
  exit 1
fi
