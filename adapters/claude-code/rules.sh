#!/usr/bin/env bash
# SessionStart hook: prints the always-on rules, then the routing table.
# Claude Code adds this stdout to the model's context; the user does not see it.
#
# One base table. Each role's model is the plugin default unless the user chose one in
# /config (CLAUDE_PLUGIN_OPTION_<ROLE>); a role option changes the row's model, never its effort.
# Role efforts and models resolve from the same dated profile used by dispatch. The parent
# session remains a nonblocking recommendation. Escalation is resolved by the shared policy.
# A value outside the enum is ignored with a note.
#
# Relied-on behaviour (Claude Code 2.1.295, read from its code): an option the user saved is
# exported as CLAUDE_PLUGIN_OPTION_<KEY>, and an option the user never saved is not exported.
# tests/routing.sh pins the second half: its unset cases run with no option variables.
#
# Stdin carries the SessionStart JSON; its optional `model` is the running model. Stdin is read
# only when it is not a terminal, so a manual run never blocks. The hook reads no effort: the
# input's `effort` is present only for hooks that fire within a turn, and SessionStart fires first.
set -u

root="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

cat "${root}/rules/rules.md" || exit 0

input=""
[ -t 0 ] || input="$(cat 2>/dev/null)"

# A string field of the input: jq when it works, a sed fallback otherwise; only id characters kept.
# The model id is matched whole (a long Bedrock id must still read as sonnet) and printed cut to 40.
field() {
  local v
  v="$(printf '%s' "${input}" | jq -r --arg k "${1}" 'if (.[$k]|type) == "string" then .[$k] else empty end' 2>/dev/null)" \
    || v="$(printf '%s' "${input}" | tr -d '\n' | sed -n "s/.*\"${1}\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p")"
  printf '%s' "${v}" | tr -cd 'A-Za-z0-9._:/@[]-'
}
running="$(field model)"   # the running model; absent after /clear
event="$(field source)"    # startup, resume, clear or compact

# The repo root: the launch dir is stable across clear and compact; $PWD drifts with cd.
start="${CLAUDE_PROJECT_DIR:-$PWD}"
repo_root="$(git -C "${start}" rev-parse --show-toplevel 2>/dev/null)" || repo_root="${start}"

# A pinned session: the user has already chosen a model, in the repo's committed .claude/settings.json,
# the repo's .claude/settings.local.json or their own user settings (`~/.claude/settings.json`, or under CLAUDE_CONFIG_DIR) with `model` set to any value,
# or in ANTHROPIC_MODEL. A pinned session is never offered a switch. (A --model flag is not visible here.)
has_model() {
  local f="${1}" v
  [ -f "${f}" ] || return 1
  v="$(jq -r 'if type == "object" and has("model") then "yes" else "no" end' "${f}" 2>/dev/null)" \
    || { grep -qE '"model"[[:space:]]*:' "${f}"; return; }
  [ "${v}" = yes ]
}
pinned=no
for f in "${repo_root}/.claude/settings.json" "${repo_root}/.claude/settings.local.json" "${CLAUDE_CONFIG_DIR:-${HOME:-/nonexistent}/.claude}/settings.json"; do
  has_model "${f}" && pinned=yes
done
[ -n "${ANTHROPIC_MODEL:-}" ] && pinned=yes


row=sonnet
[ -n "${running}" ] && row="${row} (running: $(printf '%s' "${running}" | cut -c1-40))"
[ "${pinned}" = yes ] && row="${row}, pinned"

printf '\n## Routing (change in /config, plugin methodical)\n\n| role | model | effort |\n|---|---|---|\n'
printf '| session | %s | high (base) |\n' "${row}"
if ! node "${root}/runtime/src/cli.js" routing-table claude-code; then
  printf '\nRouting unavailable: the compiled Methodical runtime could not resolve the profile.\n'
fi

# Startup only (so resume, clear and compact never re-offer): the running model is known, is not
# Sonnet or Fable by whole-id match, and nothing pins the session.
if [ "${event}" = startup ] && [ -n "${running}" ] && [ "${pinned}" = no ]; then
  case "$(printf '%s' "${running}" | tr '[:upper:]' '[:lower:]')" in
    *sonnet*|*fable*) ;;
    *) printf '\nOffer: run on sonnet? /model sonnet (all repos) or .claude/settings.json {"model": "sonnet"} (this repo)\n' ;;
  esac
fi
exit 0
