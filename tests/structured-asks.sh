#!/usr/bin/env bash
# Structured asks: every stop for the user is an AskUserQuestion questionnaire, recommended answer
# first, no option that skips a step. Checks, by fixed string, reading files only:
#   (a) rules.md carries the rule and its Why;
#   (b) each changed stop site names AskUserQuestion in its own file;
#   (c) plan-review and compound carry their exact options lines;
#   (d) seat-selection says a seat never asks;
#   (e) no options line in plugins/, docs/ or README.md offers a label that skips, waives or
#       "just does" a step; the matcher is proved non-vacuous by an in-script negative case.
# Known limit: this proves each site names the tool, not that Claude calls it; the live
# acceptance tests (plan, Acceptance 1-3) are the real bar.
set -uo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
plugin="${repo}/plugins/methodical"
status=0
fail() { echo "FAIL structured-asks: ${1}"; status=1; }

has() { # file needle
  grep -q -F -- "${2}" "${1}" 2>/dev/null || fail "${1#"${repo}"/} lacks: ${2}"
}

# (a)
has "${plugin}/rules/rules.md" 'each asked with AskUserQuestion (in text only where it is absent), recommended answer first; no option skips a required step'
has "${plugin}/rules/rules.md" 'Why: name the step and use a structured ask to surface user rulings.'

# (b)
has "${plugin}/rules/user-words.md" 'ask once with AskUserQuestion'
has "${plugin}/skills/brainstorm/SKILL.md" 'one AskUserQuestion call'
has "${plugin}/skills/north-star/SKILL.md" 'one AskUserQuestion call'
has "${plugin}/skills/north-star/SKILL.md" 'ask with AskUserQuestion only if'
has "${plugin}/skills/plan/SKILL.md" 'plan-review asks it with AskUserQuestion'
has "${plugin}/skills/plan-review/SKILL.md" '"Approve this plan?" with AskUserQuestion, as its own final call'
has "${plugin}/skills/plan-review/SKILL.md" 'then ask "Approve this plan?" with AskUserQuestion'
has "${plugin}/skills/plan-review/SKILL.md" "put the plan's open questions to the user with AskUserQuestion"
has "${plugin}/skills/deepen/SKILL.md" 'stop and ask with AskUserQuestion'
has "${plugin}/skills/work/SKILL.md" 'with AskUserQuestion, as its own final call after the open-question answers are written into the plan'
has "${plugin}/skills/work/SKILL.md" 'ask with AskUserQuestion only if the deviation'
has "${plugin}/skills/compound/SKILL.md" '"Merge when green?" with AskUserQuestion'
has "${plugin}/reference/seat-selection.md" 'with AskUserQuestion, recommendation first'
has "${plugin}/reference/seat-selection.md" 'AskUserQuestion is not available inside subagents'

# (c)
has "${plugin}/skills/plan-review/SKILL.md" 'options: "Approve (Recommended)" / "Revise"'
has "${plugin}/skills/compound/SKILL.md" 'options: "Merge when green (Recommended)" / "Hold"'

# (d)
has "${plugin}/reference/seat-selection.md" 'never asks'

# (e) Options lines: `options:` at line start after optional indent, list marker or backtick, then
# quoted labels. Prints every offending label found in the lines of stdin.
opts_re='^[[:space:]]*(([-*]|[0-9]+\.)[[:space:]]+)?`?options:[[:space:]]*"'
bad_labels() {
  grep -iE "${opts_re}" | grep -o '"[^"]*"' | grep -i -E '^"(skip|waive|just )|skip|waive' || true
}

negative='options: "Skip the review" / "Approve"'
[ -n "$(printf '%s\n' "${negative}" | bad_labels)" ] \
  || fail "(e) matcher is vacuous: it accepted the skip fixture ${negative}"
positive='options: "Approve (Recommended)" / "Revise"'
[ -z "$(printf '%s\n' "${positive}" | bad_labels)" ] \
  || fail "(e) matcher rejects a legitimate options line"

hits="$(grep -rhiE "${opts_re}" "${repo}/plugins" "${repo}/docs" "${repo}/README.md" 2>/dev/null | bad_labels)"
[ -z "${hits}" ] || fail "(e) an options line offers a skip: ${hits}"

if [ "${status}" -eq 0 ]; then echo "PASS structured-asks"; fi
exit "${status}"
