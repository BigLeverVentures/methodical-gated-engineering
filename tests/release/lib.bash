# Shared harness for the release checks (bar1, bar2, bar6, bar5-github). Sourced, not run.
#
# Each check installs the plugin the way a new user does (marketplace add, then install) into a
# throwaway HOME, copies a fixture into a throwaway git repo, runs `claude -p` with stream-json
# output, and asserts on that stream with jq. The real configuration is never read or written.
#
# Release checks spend tokens and need ANTHROPIC_API_KEY. Set MGE_CLAUDE_BIN to a stand-in for
# `claude` (tests/release/stub/claude) to run a check end to end against a recorded stream with no
# credential and no spend; tests/release-scripts-stub.sh does that in CI.
#
# Fixtures: each tests/release/fixtures/<name>/ is the base commit; its unit/ folder, when present,
# is laid over the base as the unit's branch commit.
# shellcheck shell=bash
set -uo pipefail

release_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "${release_dir}/../.." && pwd)"
claude_bin="${MGE_CLAUDE_BIN:-claude}"
max_turns="${MGE_MAX_TURNS:-25}"
check="$(basename "${0}" .sh)"

# FAIL goes to stderr so it shows even from inside a $(...) capture.
fail() { echo "FAIL ${check}: ${1}" >&2; exit 1; }
ok() { echo "ok   ${check}: ${1}"; }

# A throwaway HOME with a git identity, so commits Claude makes inside fixtures succeed.
tmp_home="$(mktemp -d)"
tmp_home="$(cd "${tmp_home}" && pwd -P)"
trap 'rm -rf "${tmp_home}"' EXIT
if [ -z "${tmp_home}" ] || [ "${tmp_home}" = "$(cd "${HOME}" && pwd -P)" ]; then
  fail "temp HOME resolves to the real HOME; refusing to run"
fi
printf '[user]\n\tname = Release Check\n\temail = release-check@example.invalid\n[init]\n\tdefaultBranch = main\n' \
  > "${tmp_home}/.gitconfig"

need_api_key() {
  if [ -z "${MGE_CLAUDE_BIN:-}" ] && [ -z "${ANTHROPIC_API_KEY:-}" ]; then
    fail "needs ANTHROPIC_API_KEY in this shell (a release check spends tokens), or MGE_CLAUDE_BIN for a stub run"
  fi
}

# Every claude call sees only the temp HOME and what it needs.
cl() {
  env -i HOME="${tmp_home}" PATH="${PATH}" TERM=dumb LANG=en_US.UTF-8 \
    ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}" GH_TOKEN="${GH_TOKEN:-}" \
    MGE_CASE="${MGE_CASE:-}" MGE_STUB_FAIL="${MGE_STUB_FAIL:-}" MGE_STUB_EMPTY="${MGE_STUB_EMPTY:-}" MGE_STUB_BARE="${MGE_STUB_BARE:-}" \
    "${claude_bin}" "$@"
}

install_from_checkout() {
  cl plugin marketplace add "${repo}" >/dev/null 2>&1 || fail "marketplace add of this checkout failed"
  cl plugin install methodical@methodical >/dev/null 2>&1 || fail "install methodical@methodical failed"
}

# fixture <name> [unit] -> prints the path of a fresh git repo holding the fixture.
fixture() {
  local src="${release_dir}/fixtures/${1}" dst
  [ -d "${src}" ] || fail "fixture ${1} missing"
  dst="$(mktemp -d "${tmp_home}/fixture.XXXXXX")"
  (cd "${src}" && tar --exclude ./unit -cf - .) | (cd "${dst}" && tar -xf -)
  (
    cd "${dst}" || exit 1
    export HOME="${tmp_home}"
    git init -q && git add -A && git commit -q -m "base" || exit 1
    # A bare remote, so a push the loop makes lands somewhere a check can read.
    git init -q --bare "${dst}.remote.git" && git remote add origin "${dst}.remote.git" || exit 1
    if [ "${2:-}" = unit ] && [ -d "${src}/unit" ]; then
      git checkout -q -b unit && cp -R "${src}/unit/." . && git add -A && git commit -q -m "unit work" || exit 1
    fi
  ) || fail "could not build fixture ${1}"
  printf '%s\n' "${dst}"
}

# headless <case> <dir> <prompt> [extra claude args...] -> prints the stream file's path.
headless() {
  local case="${1}" dir="${2}" prompt="${3}" out
  shift 3
  out="$(mktemp "${tmp_home}/${case}.XXXXXX")"
  # The prompt comes first: --allowedTools takes a list and would swallow a trailing prompt.
  (cd "${dir}" && MGE_CASE="${case}" cl -p "${prompt}" --output-format stream-json --verbose \
    --no-session-persistence --max-turns "${max_turns}" --permission-mode acceptEdits \
    "$@" --allowedTools 'Bash(git:*)') > "${out}" 2>"${out}.err"
  [ -s "${out}" ] || fail "${case}: empty stream"
  jq -e . "${out}" >/dev/null 2>&1 || fail "${case}: the stream is not valid JSON lines"
  printf '%s\n' "${out}"
}

# Readers. tool_use blocks sit inside assistant messages' content, in stream order.
# Main-thread assistant text only (subagent lines carry a parent_tool_use_id).
# A blank line follows each text block, so adjacent blocks never read as one run of lines.
texts() { jq -r 'select(.type=="assistant" and .parent_tool_use_id == null) | .message.content[]? | select(.type=="text") | .text, ""' "${1}"; }
last_text() { jq -s -r '[.[] | select(.type=="assistant" and .parent_tool_use_id == null) | .message.content[]? | select(.type=="text") | .text] | last // ""' "${1}"; }
tool_uses() { jq -c 'select(.type=="assistant") | .message.content[]? | select(.type=="tool_use")' "${1}"; }
agent_launches() { tool_uses "${1}" | jq -c 'select(.name=="Agent" or .name=="Task")'; }

# finished <stream>: the run ended in a success result. headless accepts any nonempty valid stream,
# so a case that needs the run to have completed asserts it here.
finished() {
  jq -s -e '[.[] | select(.type == "result")] | last | (.subtype == "success" and .is_error == false)' "${1}" >/dev/null 2>&1
}

# seats_cleared <stream>: the run printed seat lines, and no seat line of the last round (the last
# unbroken run of seat lines in any main-thread text) carries `material yes`. "Unresolved" means the
# opposite: a last-round seat line with `material yes`. Earlier rounds may have found something. All
# main-thread text is read, not only the last block, because a work review hands on to compound in
# the same turn, so the run's final text is the write-up, not the seat lines.
seats_cleared() {
  texts "${1}" | awk '
    / · material (yes|no)/ { if (!inrun) { run = ""; inrun = 1 } run = run $(0) "\n"; next }
    { inrun = 0 }
    END { if (run == "" || run ~ / · material yes/) exit 1 }'
}

# events <stream>: what the orchestrator did, in stream order, one `|`-separated line each. The
# index counts every tool use of the main thread, so it orders launches against commits.
#   A|index|model|effort|lens|range-end    an Agent launch (range-end: the word after `..` in its prompt)
#   C|index|sha                            a Bash `git commit` (the sha from its result)
#   P|index                                a Bash `git push`
events() {
  jq -s -r '
    ([.[] | select(.type == "user") | .message.content[]? | select(.type == "tool_result")
      | {key: .tool_use_id, value: (if (.content | type) == "string" then .content
                                    else ([.content[]? | .text? // ""] | join(" ")) end)}] | from_entries) as $res
    | [.[] | select(.type == "assistant" and .parent_tool_use_id == null) | .message.content[]? | select(.type == "tool_use")]
    | to_entries[]
    | .key as $i | .value as $t | ($t.input.command // "") as $c
    | if ($t.name == "Agent" or $t.name == "Task") then
        "A|\($i)|\($t.input.model // "")|\($t.input.effort // "")|\(((($t.input.prompt // "") | capture("lenses/(?<l>[a-z-]+)[.]md")) // {l: ""}).l)|\(((($t.input.prompt // "") | capture("[^.][.]{2,3}(?<r>[A-Za-z0-9]+)")) // {r: ""}).r)"
      elif ($t.name == "Bash" and ($c | test("git commit"))) then
        "C|\($i)|\(((($res[$t.id] // "") | capture("\\[[^\\] ]+ (?<s>[0-9a-f]{7,40})\\]")) // {s: ""}).s)"
      elif ($t.name == "Bash" and ($c | test("git push"))) then "P|\($i)"
      else empty end' "${1}"
}

# seat_row <events> <lens> -> "model effort" of the first launch of that lens (empty if none).
seat_row() { awk -F'|' -v l="${2}" '$(1) == "A" && $(5) == l { print $(3) " " $(4); exit }' <<<"${1}"; }

# sha_match <a> <b>: one is a prefix of the other (short and long forms of one commit).
sha_match() { [ -n "${1}" ] && [ -n "${2}" ] && { [[ "${1}" == "${2}"* ]] || [[ "${2}" == "${1}"* ]]; }; }
