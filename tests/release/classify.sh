#!/usr/bin/env bash
# Classification release check: the plan step writes the right `escalation:` level, with its
# evidence. Each case runs `/methodical:plan` headless on a fixture under fixtures/classify/ and
# reads the plan file it leaves:
#
#   classify-3        a request built to score 3 (a relied-on interface, untested third-party
#                     behaviour, three modules)                     -> escalation: lean
#   classify-4        the same plus a new raw-format parser          -> escalation: full
#   classify-trigger  a release at score 2                           -> escalation: lean, and the
#                     Deepen score section names the release as the trigger
#   classify-revise   a plan at score 2 with `escalation: none` and no user edit recorded; the
#                     revision adds a third trigger                  -> the line changes to lean, so a
#                     plan step that keeps whatever line exists fails
#
# Pass, per case: the run finished; the plan file has the expected `escalation:` line; its Deepen
# score section records the expected score, says the level, and (for the trigger case) names the
# trigger. This proves the plan step agrees with the fixture author's trigger count. It does not
# prove the score itself is right: scoring the triggers is judgment.
# Spends tokens: run by a maintainer before a release, never in CI.
# At a score of 2 or more the plan step hands on to deepen and plan review in the same turn, so a
# run spends well beyond one plan step; give it room, or `finished` fails on the turn limit.
MGE_MAX_TURNS="${MGE_MAX_TURNS:-60}"
source "$(dirname "${BASH_SOURCE[0]}")/lib.bash"
need_api_key
install_from_checkout

# check <case> <fixture> <expected level> <expected score> <evidence word or -> <prompt>
check() {
  local name="${1}" fx="${2}" level="${3}" score="${4}" evidence="${5}" prompt="${6}" d s file got section
  d="$(fixture "classify/${fx}")" || exit 1
  d="$(cd "${d}" && pwd -P)"
  s="$(headless "${name}" "${d}" "${prompt}")" || exit 1
  finished "${s}" || fail "${name}: the run did not end in a success result"
  file="$(ls -t "${d}"/docs/plans/*.md 2>/dev/null | head -n 1)"
  [ -n "${file}" ] || fail "${name}: no plan file was written under docs/plans/"
  got="$(awk '/^escalation:/ { print $(2); exit }' "${file}")"
  [ "${got}" = "${level}" ] || fail "${name}: the plan says 'escalation: ${got:-<none>}', expected '${level}'"
  section="$(awk '/^## Deepen score/ { f = 1; next } /^## / { f = 0 } f' "${file}")"
  grep -q -F "**Score:** ${score} of 6" <<<"${section}" || fail "${name}: the Deepen score section does not record a score of ${score} of 6"
  grep -q -i 'escalation' <<<"${section}" || fail "${name}: the Deepen score section does not say the escalation level or what set it"
  if [ "${evidence}" != - ]; then
    grep -q -i "${evidence}" <<<"${section}" || fail "${name}: the Deepen score section does not name '${evidence}' as evidence"
  fi
  ok "${name}: escalation ${level} at score ${score}, with its evidence"
}

check classify-3 three lean 3 - \
  '/methodical:plan Add a `report` command. cli.py gains `report`; calc.py gains `variance` (using statistics.pvariance, whose behaviour on a single value no test here covers); report.py is new. readers.load_rows is called by other tools and its signature must not change. Write the plan now; record any open question in it instead of waiting.'
check classify-4 four full 4 - \
  '/methodical:plan Add a `report` command. cli.py gains `report`; calc.py gains `variance` (using statistics.pvariance, whose behaviour on a single value no test here covers); report.py is new; and a new parser reads the vendor'"'"'s tab-separated export format. readers.load_rows is called by other tools and its signature must not change. Write the plan now; record any open question in it instead of waiting.'
check classify-trigger trigger lean 2 release \
  '/methodical:plan Prepare the 0.2.0 release of tally. It ships the changed readers.load_rows signature that other tools call, and publishing relies on how the build backend handles our pyproject.toml, which no test here checks. Write the plan now; record any open question in it instead of waiting.'
check classify-revise revise lean 3 - \
  '/methodical:plan Revise docs/plans/2026-01-01-report.md: the unit now also depends on how statistics.pvariance treats a single value, which no test here covers. Recompute the score and the escalation level.'

echo "PASS classify: the plan step wrote the expected escalation level, with evidence, in all four cases"
