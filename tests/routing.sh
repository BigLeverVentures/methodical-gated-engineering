#!/usr/bin/env bash
# Routing: the SessionStart hook prints one base table with an effort per role. Each case copies a
# fixture from tests/fixtures/routing/ into a temp dir (outside any git repo, so the hook's repo-root
# detection sees only the fixture), runs the hook with stdin given explicitly, and asserts the
# header, all five rows whole and whether the startup Offer appears.
# A role option changes the row's model and keeps its effort.
# Relied-on behaviour: an option the user saved is exported as CLAUDE_PLUGIN_OPTION_<KEY>, and one
# never saved is not (read from Claude Code's code, 2.1.295, not a doc), so "unset" cases run with
# no option variables. Re-check on CLI bumps.
set -uo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
hook="${repo}/plugins/methodical/hooks/rules.sh"
fixtures="${repo}/tests/fixtures/routing"

status=0 checked=0
fail() { echo "FAIL routing: ${1}"; status=1; }

tmp="$(mktemp -d)"; trap 'rm -rf "${tmp}"' EXIT
tmp="$(cd "${tmp}" && pwd -P)"
git -C "${tmp}" rev-parse --show-toplevel >/dev/null 2>&1 && { echo "FAIL routing: temp dir is inside a git repo"; exit 1; }

# A jq that fails, to exercise the sed fallbacks.
mkdir -p "${tmp}/nojq"; printf '#!/bin/sh\nexit 127\n' > "${tmp}/nojq/jq"; chmod +x "${tmp}/nojq/jq"

# run <fixture> <stdin: JSON text | @null> [VAR=value ...] -> hook output
# The project dir is the fixture copy unless PROJ=<relative path> is given. FILE=<name>=<text> writes
# a file into the copy. A missing fixture or an unwritable file prints nothing, which fails expect's
# header check (run() is called inside $(...), so it cannot set status itself).
run() {
  local name="${1}" in="${2}" dir rel="" path="${PATH}"; shift 2
  [ -d "${fixtures}/${name}" ] || { echo "missing fixture ${name}" >&2; return 1; }
  dir="${tmp}/case-${checked}"; mkdir -p "${dir}"
  cp -R "${fixtures}/${name}/." "${dir}/"
  local envs=() home="${tmp}" homearg=1
  for a in "$@"; do
    case "${a}" in
      NOHOME=1) homearg=0 ;;
      USERSETTINGS=*) home="${dir}/home"; mkdir -p "${home}/.claude"; printf '%s\n' "${a#USERSETTINGS=}" > "${home}/.claude/settings.json" ;;
      LOCALSETTINGS=*) mkdir -p "${dir}/.claude"; printf '%s\n' "${a#LOCALSETTINGS=}" > "${dir}/.claude/settings.local.json" ;;
      PROJ=*) rel="${a#PROJ=}" ;;
      NOJQ=1) path="${tmp}/nojq:${PATH}" ;;
      GIT=1) git -C "${dir}" init -q ;;
      RAW=*) envs+=("${a#RAW=}") ;;
      FILE=*) local rest="${a#FILE=}" fname ftext
              fname="${rest%%=*}"; ftext="${rest#*=}"
              mkdir -p "$(dirname "${dir}/${fname}")" && printf '%s\n' "${ftext}" > "${dir}/${fname}" \
                || { echo "cannot write ${fname}" >&2; return 1; } ;;
      *) envs+=("CLAUDE_PLUGIN_OPTION_${a}") ;;
    esac
  done
  local proj="${dir}${rel:+/${rel}}"
  [ "${homearg}" -eq 1 ] && envs+=("HOME=${home}")
  if [ "${in}" = @null ]; then
    env -i PATH="${path}" CLAUDE_PROJECT_DIR="${proj}" ${envs[@]+"${envs[@]}"} bash "${hook}" </dev/null
  else
    env -i PATH="${path}" CLAUDE_PROJECT_DIR="${proj}" ${envs[@]+"${envs[@]}"} bash "${hook}" <<<"${in}"
  fi
}

# expect <label> <output> <header notes> <session cell> <decider> <worker> <census> <backstop> <offer yes|no>
# The notes are the exact text between "## Routing (" and "change in /config": always "".
# Rows are checked whole, so the efforts (high (base), medium, medium, medium, high) are pinned too.
expect() {
  local label="${1}" out="${2}" notes="${3}" ok=1 block got
  checked=$((checked + 1))
  grep -q -x -F -- "## Routing (${notes}change in /config, plugin methodical)" <<<"${out}" \
    || { fail "${label}: header is not '## Routing (${notes}change in /config, plugin methodical)'"; ok=0; }
  grep -q -x -F -- '| role | model | effort |' <<<"${out}" || { fail "${label}: table header lacks the effort column"; ok=0; }
  grep -q -x -F -- "| session | ${4} | high (base) |" <<<"${out}" || { fail "${label}: session row is not '${4} | high (base)'"; ok=0; }
  grep -q -x -F -- "| decider | ${5} | medium |" <<<"${out}" || { fail "${label}: decider row is not '${5} | medium'"; ok=0; }
  grep -q -x -F -- "| worker | ${6} | medium |" <<<"${out}" || { fail "${label}: worker row is not '${6} | medium'"; ok=0; }
  grep -q -x -F -- "| census | ${7} | medium |" <<<"${out}" || { fail "${label}: census row is not '${7} | medium'"; ok=0; }
  grep -q -x -F -- "| backstop | ${8} | high |" <<<"${out}" || { fail "${label}: backstop row is not '${8} | high'"; ok=0; }
  # No tier word in the routing block, whatever a repo's files say.
  block="$(sed -n '/^## Routing/,$p' <<<"${out}")"
  if grep -q -i -E 'tier|complex|normal' <<<"${block}"; then
    fail "${label}: the routing block holds a tier word"; ok=0
  fi
  if grep -q '^Offer: ' <<<"${out}"; then got=yes; else got=no; fi
  [ "${got}" = "${9}" ] || { fail "${label}: offer ${got}, expected ${9}"; ok=0; }
  [ "${ok}" -eq 1 ] && echo "ok   ${label}"
}

opus='{"source":"startup","model":"claude-opus-5-5"}' sonnet='{"source":"startup","model":"claude-sonnet-5-5"}'
S=sonnet R='(running: claude-opus-5-5)'

# The base table, whatever the repo says.
expect "no files, no options: the base table" "$(run no-files '{}')" "" ${S} opus sonnet sonnet fable no
expect "decider option keeps the effort" "$(run no-files '{}' DECIDER=fable)" "" ${S} fable sonnet sonnet fable no
expect "backstop option keeps the effort" "$(run no-files '{}' BACKSTOP=opus)" "" ${S} opus sonnet sonnet opus no
expect "worker and census options" "$(run no-files '{}' WORKER=opus CENSUS=haiku)" "" ${S} opus opus haiku fable no
expect "invalid worker keeps the base model" "$(run no-files '{}' WORKER=gpt)" "" ${S} opus "sonnet (invalid value ignored)" sonnet fable no
expect "invalid backstop keeps the base model" "$(run no-files '{}' BACKSTOP=gpt)" "" ${S} opus sonnet sonnet "fable (invalid value ignored)" no

# A leftover setting from a version nobody runs is just text: no note, the base table.
expect "a leftover tier line in CLAUDE.md is ignored" \
  "$(run no-files '{}' "FILE=CLAUDE.md=$(printf 'methodical-%s: complex' tier)")" "" ${S} opus sonnet sonnet fable no

# The Offer: startup only, running model known and not Sonnet, not pinned, every repo.
expect "running model not Sonnet at startup: offer" "$(run no-files "${opus}")" "" "${S} ${R}" opus sonnet sonnet fable yes
for ev in resume clear compact; do
  in="{\"source\":\"${ev}\",\"model\":\"claude-opus-5-5\"}"
  expect "source ${ev}: no offer" "$(run no-files "${in}")" "" "${S} ${R}" opus sonnet sonnet fable no
done
expect "no source field: no offer" "$(run no-files '{"model":"claude-opus-5-5"}')" "" "${S} ${R}" opus sonnet sonnet fable no
expect "no jq, startup: sed reads source and model, offer" "$(run no-files "${opus}" NOJQ=1)" "" "${S} ${R}" opus sonnet sonnet fable yes
expect "no jq, resume: no offer" "$(run no-files '{"source":"resume","model":"claude-opus-5-5"}' NOJQ=1)" "" "${S} ${R}" opus sonnet sonnet fable no
expect "running model is Sonnet: no offer" "$(run no-files "${sonnet}")" "" "${S} (running: claude-sonnet-5-5)" opus sonnet sonnet fable no
expect "running Fable coordinator keeps its model" "$(run no-files '{"source":"startup","model":"claude-fable-5-2"}')" "" "${S} (running: claude-fable-5-2)" opus sonnet sonnet fable no
if ! grep -q -F '| coordinator | fable | medium |' <<<"$(run no-files '{}')"; then
  fail "the lead recommendation is missing from the routing table"
fi
long='arn:aws:bedrock:us-east-1:000000000000:inference-profile/us.anthropic.claude-sonnet-5-5-20260301-v1:0'
in="{\"source\":\"startup\",\"model\":\"${long}\"}"
expect "long Sonnet id: matched whole, no offer, printed cut to 40" "$(run no-files "${in}")" "" "${S} (running: ${long:0:40})" opus sonnet sonnet fable no
longopus='arn:aws:bedrock:us-east-1:000000000000:inference-profile/us.anthropic.claude-opus-5-5-20260301-v1:0'
in="{\"source\":\"startup\",\"model\":\"${longopus}\"}"
expect "long Opus id: printed cut to 40 with no family suffix, offer" "$(run no-files "${in}")" "" "${S} (running: ${longopus:0:40})" opus sonnet sonnet fable yes
expect "pinned repo: no offer" "$(run pinned "${opus}")" "" "${S} ${R}, pinned" opus sonnet sonnet fable no
expect "no jq: sed reads the model, grep the pin" "$(run pinned "${opus}" NOJQ=1)" "" "${S} ${R}, pinned" opus sonnet sonnet fable no
# Pinned by any layer the user's choice lives in: the repo's settings, the repo's local settings, the
# user's settings, or the environment. A case that writes user settings gets its own HOME. A settings file with no `model`
# pins nothing.
expect "model in the user's settings: no offer, pinned" "$(run no-files "${opus}" 'USERSETTINGS={"model":"opus[1m]"}')" "" "${S} ${R}, pinned" opus sonnet sonnet fable no
expect "model in the repo's local settings: no offer, pinned" "$(run no-files "${opus}" 'LOCALSETTINGS={"model":"opus"}')" "" "${S} ${R}, pinned" opus sonnet sonnet fable no
expect "ANTHROPIC_MODEL set: no offer, pinned" "$(run no-files "${opus}" RAW=ANTHROPIC_MODEL=opus)" "" "${S} ${R}, pinned" opus sonnet sonnet fable no
expect "no jq, model in the user's settings: grep reads it" "$(run no-files "${opus}" 'USERSETTINGS={"model":"opus"}' NOJQ=1)" "" "${S} ${R}, pinned" opus sonnet sonnet fable no
cfg="${tmp}/cfgdir"; mkdir -p "${cfg}"; printf '{"model":"opus"}\n' > "${cfg}/settings.json"
expect "model under CLAUDE_CONFIG_DIR: no offer, pinned" "$(run no-files "${opus}" RAW=CLAUDE_CONFIG_DIR="${cfg}")" "" "${S} ${R}, pinned" opus sonnet sonnet fable no
expect "user settings without a model pin nothing: offer" "$(run no-files "${opus}" 'USERSETTINGS={"theme":"dark"}')" "" "${S} ${R}" opus sonnet sonnet fable yes
expect "HOME unset: the hook still prints the table" "$(run no-files "${opus}" NOHOME=1)" "" "${S} ${R}" opus sonnet sonnet fable yes
expect "stdin /dev/null" "$(run no-files @null)" "" ${S} opus sonnet sonnet fable no
expect "stdin not JSON" "$(run no-files 'not json')" "" ${S} opus sonnet sonnet fable no
expect "stdin JSON, model not a string" "$(run no-files '{"model":{"id":"x"}}')" "" ${S} opus sonnet sonnet fable no
expect "no jq, not JSON" "$(run no-files 'not json' NOJQ=1)" "" ${S} opus sonnet sonnet fable no
expect "launched in a subfolder: the repo root's pin is found, no offer" "$(run subfolder-pinned "${opus}" GIT=1 PROJ=app/src)" \
  "" "${S} ${R}, pinned" opus sonnet sonnet fable no
expect "launched in a subfolder of a repo with no pin anywhere: offer" "$(run subfolder-unpinned "${opus}" GIT=1 PROJ=app/src)" \
  "" "${S} ${R}" opus sonnet sonnet fable yes
# The hook ignores a running effort: a case that sets one expects no change.
expect "CLAUDE_EFFORT is ignored" "$(run no-files '{}' RAW=CLAUDE_EFFORT=low)" "" ${S} opus sonnet sonnet fable no

# The rules still print first.
out="$(run no-files '{}')"
version="$(node -p 'require(process.argv[1]).version' "${repo}/plugins/methodical/.claude-plugin/plugin.json")"
actual="$(head -n 3 <<<"${out}")"
expected="$(printf '# Methodical Adaptive Gated Engineering v%s\n\n## Rules' "${version}")"
[ "${actual}" = "${expected}" ] || fail "versioned title and rules do not print first"

if [ "${status}" -eq 0 ]; then
  echo "PASS routing: ${checked} cases"
else
  echo "FAIL routing"
  exit 1
fi
