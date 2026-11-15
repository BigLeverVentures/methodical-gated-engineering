#!/usr/bin/env bash
# Escalation: the text that carries trigger-based escalation says what the plan's acceptance tests
# require, in the places that carry it. Each check extracts a bullet, a section or a sentence and
# looks for its load-bearing words inside that extract, never anywhere in the file.
#
# Limit, stated: this proves the words are present and ordered, not that a model follows them. The
# behaviour is tests/release/bar6.sh and tests/release/classify.sh (paid, maintainer-run). Each
# failing fixture below proves its check is live: the check must fail on the broken copy.
set -uo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
plugin="${repo}/plugins/methodical"
tmp="$(mktemp -d)"; trap 'rm -rf "${tmp}"' EXIT

errs=0 checked=0
note() { echo "FAIL escalation: ${1}"; errs=$((errs + 1)); }

flat() { tr '\n' ' ' < "${1}" | sed -E 's/[[:space:]]+/ /g'; }
# section <file> <exact heading line>: the heading and its body up to the next `## ` heading.
section() { awk -v h="${2}" '$(0) == h { f = 1; print; next } f && /^## / { exit } f' "${1}"; }
# need <text> <label> <needle>...: every needle appears in the text.
need() {
  local text="${1}" label="${2}" n; shift 2
  checked=$((checked + 1))
  for n in "$@"; do
    grep -q -F -- "${n}" <<<"${text}" || note "${label}: missing '${n}'"
  done
}

check_rules() { # rules.md
  need "$(grep -m1 '^- Escalate by plan' "${1}")" "rules escalation bullet" \
    'deepen score 3' 'named trigger (seat-selection.md)' '4 or more' 'No plan, no escalation' 'Why:'
  need "$(grep -m1 "^- Put the routing block's Offer line" "${1}")" "rules recommendation bullet" \
    'first time in a session only' 'model and effort' 'stated apart' 'Never repeat, block or force' 'Why:'
  need "$(grep -m1 '^- Prepare each Methodical Agent launch' "${1}")" "rules launch bullet" \
    'reference/native-routing.md' 'native hook applies the shared policy model, effort and complete brief'
}

check_seatsel() { # seat-selection.md
  local esc brief
  esc="$(section "${1}" '## Escalation' | tr '\n' ' ' | sed -E 's/[[:space:]]+/ /g')"
  need "${esc}" "seat-selection Escalation" \
    'a core boundary' 'a release' 'an escaped defect in the same area since the last unit' \
    "the decider's row" "the backstop's row" "deepen's research seats" "compound's write-up" \
    'fixes are committed' '`<plan base>..HEAD`' 'candidate commit' 'the backstop re-runs' 'pushed once' 'Why:'
  # No recommendation here is conditioned on the session's running model.
  if grep -q -i -E 'already on|already running' "${1}"; then
    note "seat-selection: a recommendation is conditioned on the session's current model"
  fi
  # The lifecycle order: the backstop reviews before the branch is pushed.
  [[ "${esc%%pushed once*}" == *"The backstop reviews"* ]] \
    || note "seat-selection Escalation: the first push comes before the backstop review"
  # The brief order: the artifact, acceptance tests and rulings first; the round's verdicts after.
  brief="$(grep -o 'Its brief gives.*' <<<"${esc}")"
  [[ "${brief}" == *first*after* ]] || note "seat-selection Escalation: the brief order is not 'first' then 'after'"
  # Rows only: the section names no model.
  if grep -q -i -E 'opus|fable|sonnet|haiku' <<<"${esc}"; then
    note "seat-selection Escalation: names a model instead of a row"
  fi
  need "$(section "${1}" '## Every launch')" "seat-selection Every launch" 'reference/native-routing.md'
  need "$(section "${1}" '## The seat line' | tr '\n' ' ' | sed -E 's/[[:space:]]+/ /g')" "seat-selection seat line" \
    '<reviewer> · <role> · <model> <effort> · material yes/no' '@<short sha>' 'candidate commit'
  need "$(section "${1}" '## The re-seat ladder' | tr '\n' ' ' | sed -E 's/[[:space:]]+/ /g')" "seat-selection ladder" \
    "The backstop's seats move to the decider's row" 'needs-backstop-re-review' \
    '"the backstop is low" is the user' \
    'skips any row whose model is already rejected or declared unavailable' \
    'every distinct alternative is exhausted' 'the orchestrator sits the seat and says so' \
    'both set to `opus`' 'Opus and Sonnet are both unavailable'
}

check_work() { # work SKILL.md
  local w; w="$(flat "${1}")"
  need "${w}" "work skill" \
    'Session for this build:' 'resolved host coordinator model and effort' 'host profile' 'if not already' \
    'escalation: none (plan waived)' 'gives no recommendation' 'escalation: none (no line)' \
    'escalation: none (unknown value'
  if grep -q -i -E 'already on|already running|omit|suppress' <<<"${w}"; then
    note "work skill: the recommendation is conditioned on the session's current model"
  fi
}

check_plan() { # plan SKILL.md
  need "$(flat "${1}")" "plan skill" \
    'computes the line once' "the user's edit stands and is recorded as a ruling" \
    'recomputes only when no such edit is recorded' "decider's model and effort"
}

check_template() { # templates/plan.md
  need "$(cat "${1}")" "plan template" 'escalation: <none, lean or full>'
}

check_literals() { # files that must carry no literal model or effort in a launch
  local f
  for f in "$@"; do
    if grep -q -E "model: *[\"']?(opus|sonnet|fable|haiku)|effort: *[\"']?(low|medium|high|xhigh|max)" "${f}"; then
      note "literal model or effort in ${f#"${repo}/"}"
    fi
  done
}

check_paragraphs() { # every skill that launches a seat names the row or seat-selection.md beside it
  local s
  for s in plan deepen plan-review work work-review compound; do
    checked=$((checked + 1))
    awk 'BEGIN { RS = "" } /(Agent|seat)/ && /(^|[^a-z])row([^a-z]|$)|seat-selection[.]md/ && /(model|effort)/ { found = 1 } END { exit !found }' \
      "${plugin}/skills/${s}/SKILL.md" || note "${s} skill: no paragraph pairs a seat launch with its row or seat-selection.md"
  done
}

# --- the real files -----------------------------------------------------------------------------
check_rules "${plugin}/rules/rules.md"
check_seatsel "${plugin}/reference/seat-selection.md"
check_work "${plugin}/skills/work/SKILL.md"
check_plan "${plugin}/skills/plan/SKILL.md"
check_template "${plugin}/templates/plan.md"
check_literals "${plugin}"/skills/*/SKILL.md "${plugin}/reference/seat-selection.md"
check_paragraphs
real_errs="${errs}"

# --- failing fixtures: each broken copy must fail its check -------------------------------------
broken() { # label, check function, file, sed expression
  local label="${1}" fn="${2}" src="${3}" expr="${4}" copy
  copy="${tmp}/$(basename "$(dirname "${src}")")-$(basename "${src}")-${checked}"
  sed -E "${expr}" "${src}" > "${copy}"
  cmp -s "${src}" "${copy}" && { note "fixture '${label}' did not change its source"; return; }
  errs=0
  "${fn}" "${copy}" >"${tmp}/fixture-out"
  # ESCALATION_VERBOSE=1 shows what each broken copy tripped.
  [ -z "${ESCALATION_VERBOSE:-}" ] || sed "s/^/  [${label}] /" "${tmp}/fixture-out"
  if [ "${errs}" -eq 0 ]; then
    errs="${real_errs}"; note "fixture '${label}' passed its check, so the check is not live"
  else
    errs="${real_errs}"
  fi
}
broken "recommendation bullet without once per session" check_rules "${plugin}/rules/rules.md" \
  's/, the first time in a session only//'
broken "Escalation section names a model" check_seatsel "${plugin}/reference/seat-selection.md" \
  "s/the backstop's row; the plan stays/the opus row; the plan stays/"
broken "lifecycle pushes before the backstop" check_seatsel "${plugin}/reference/seat-selection.md" \
  's/^2\. The backstop reviews/2. The branch is pushed once. The backstop reviews/'
broken "recommendation suppressed when already on Opus" check_work "${plugin}/skills/work/SKILL.md" \
  's/if not already/if not already; leave it out when already on opus/'
fixture_skill="${tmp}/skills/literal/SKILL.md"
mkdir -p "$(dirname "${fixture_skill}")"
printf -- '---\nname: literal\n---\n\nLaunch an Agent seat with effort: high and model: opus.\n' > "${fixture_skill}"
errs=0; check_literals "${fixture_skill}" >/dev/null
if [ "${errs}" -eq 0 ]; then errs="${real_errs}"; note "fixture 'literal effort in a skill' passed, so the check is not live"; else errs="${real_errs}"; fi

if [ "${errs}" -eq 0 ]; then
  echo "PASS escalation: ${checked} checks, 5 failing fixtures fail"
else
  echo "FAIL escalation"
  exit 1
fi
