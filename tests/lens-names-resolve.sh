#!/usr/bin/env bash
# Bar 2 support: every reviewer a review can launch exists, and the stack table cannot send a
# reviewer to the wrong language. Checks, over reference/seat-selection.md and every SKILL.md:
#   1. every lenses/<name>.md they name is a shipped file, and every shipped lens is named;
#   2. every subagent_type they name is general-purpose;
#   3. every row of the stack table maps to a shipped lens or says `generic`, and the generic
#      lens exists;
#   4. stack detection, run from the table's own marker column, finds exactly the expected stack
#      in each release fixture (swift, python, ts) and none in an empty directory;
#   5. the three stack lenses adapted from compound-engineering credit the version, the source commit,
#      both copyright notices, the licence and THIRD-PARTY-NOTICES.md in a closed header comment; the
#      notices file names the full commit and its fenced licence text hashes to the pinned value;
#      and every lens states a Why;
#   6. the reference documents the roster line format with `when:`, the decide-and-print rule, the
#      undecided and malformed forms; and a parser of that format, run over
#      fixtures/roster/reviewer-roster.md, yields the expected (stack, file, role, when) per line
#      and flags each malformed line with its reason.
# Deterministic: reads files only. Whether Claude follows the table is the bar 2 release check.
set -uo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
plugin="${repo}/plugins/methodical"
ref="${plugin}/reference/seat-selection.md"
fixtures="${repo}/tests/release/fixtures"

status=0
fail() { echo "FAIL lens-names-resolve: ${1}"; status=1; }

[ -f "${ref}" ] || { echo "FAIL lens-names-resolve: reference/seat-selection.md missing"; exit 1; }
sources=("${ref}" "${plugin}"/skills/*/SKILL.md)

# 1. Named lenses resolve; shipped lenses are named.
named="$(grep -h -o -E 'lenses/[a-z0-9-]+\.md' "${sources[@]}" | sort -u)"
[ -n "${named}" ] || fail "no lens is named anywhere"
while IFS= read -r l; do
  [ -z "${l}" ] && continue
  if [ -f "${plugin}/${l}" ]; then echo "ok   ${l} resolves"; else fail "${l} is named but not shipped"; fi
done <<<"${named}"
for f in "${plugin}"/lenses/*.md; do
  l="lenses/$(basename "${f}")"
  grep -q -x -F "${l}" <<<"${named}" || fail "${l} is shipped but never named in the reference or a skill"
done

# 2. Every subagent_type is general-purpose.
types="$(grep -h -o -E 'subagent_type:?[[:space:]`"]*[A-Za-z0-9:_-]+' "${sources[@]}" \
  | sed -E 's/subagent_type:?[[:space:]`"]*//' | sort -u)"
[ -n "${types}" ] || fail "no subagent_type is named; reviews would launch an unnamed type"
while IFS= read -r t; do
  [ -z "${t}" ] && continue
  [ "${t}" = "general-purpose" ] || fail "subagent_type ${t} is not general-purpose"
done <<<"${types}"

# 3. The stack table: | stack | markers | lens |, between its header and the next blank line.
table="$(awk '/^\| Stack \| Markers \| Lens \|/ { on = 1; next } on && /^\|---/ { next } on && /^\|/ { print; next } on { exit }' "${ref}")"
[ -n "${table}" ] || fail "stack table not found in the reference"
[ -f "${plugin}/lenses/generic-correctness.md" ] || fail "lenses/generic-correctness.md missing"
stacks=()
while IFS='|' read -r _ stack markers lens _; do
  stack="$(xargs <<<"${stack}")"; lens="$(tr -d '`' <<<"${lens}" | xargs)"
  [ -z "${stack}" ] && continue
  stacks+=("${stack}")
  case "${lens}" in
    generic) echo "ok   ${stack} -> generic-correctness (no ${stack} lens)" ;;
    "lenses/${stack}-correctness.md")
      if [ -f "${plugin}/${lens}" ]; then echo "ok   ${stack} -> ${lens}"; else fail "${stack} maps to missing ${lens}"; fi ;;
    *) fail "${stack} maps to '${lens}', which is neither generic nor lenses/${stack}-correctness.md" ;;
  esac
done <<<"${table}"

# 4. Detection from the table's markers: alternatives split on ", ", both-needed on " + ".
#    Root and one directory down, as the reference says.
has() { # dir, glob
  [ -n "$(find "${1}" -maxdepth 2 -name "${2}" -not -path '*/unit/*' -print -quit 2>/dev/null)" ]
}
detect() { # dir -> detected stacks, space separated
  local dir="${1}" out="" stack markers alt part ok
  while IFS='|' read -r _ stack markers _ _; do
    stack="$(xargs <<<"${stack}")"; markers="$(tr -d '`' <<<"${markers}")"
    [ -z "${stack}" ] && continue
    while IFS= read -r alt; do
      alt="$(xargs <<<"${alt}")"; [ -z "${alt}" ] && continue
      ok=1
      while IFS= read -r part; do
        part="$(xargs <<<"${part}")"; [ -z "${part}" ] && continue
        has "${dir}" "${part}" || ok=0
      done <<<"${alt// + /$'\n'}"
      if [ "${ok}" -eq 1 ]; then out="${out} ${stack}"; break; fi
    done <<<"${markers//, /$'\n'}"
  done <<<"${table}"
  xargs <<<"${out}"
}
for pair in swift:swift python:python ts:typescript; do
  fx="${pair%%:*}"; want="${pair#*:}"
  [ -d "${fixtures}/${fx}" ] || { fail "fixture ${fx} missing"; continue; }
  got="$(detect "${fixtures}/${fx}")"
  if [ "${got}" = "${want}" ]; then echo "ok   fixtures/${fx} detects exactly: ${got}"
  else fail "fixtures/${fx} detects '${got}', expected exactly '${want}'"; fi
done
empty="$(mktemp -d)"; trap 'rm -rf "${empty}"' EXIT
got="$(detect "${empty}")"
[ -z "${got}" ] || fail "an empty directory detects '${got}'"

# 5. Attribution and a Why in every lens. Each adapted lens's header comment (line 1 `<!--` to the first
#    `-->`) names the version, the source commit, both copyright notices, the licence and the notices
#    file; the notices file names the full commit, and its fenced licence text hashes to the pinned value.
notices="${plugin}/THIRD-PARTY-NOTICES.md"
# sha256 of the plugin-folder LICENSE at commit 9f93f54b1f71a853464bc8cd626405ad86dc938d of
# EveryInc/compound-engineering-plugin with the root LICENSE's line 3 inserted after its own line 3.
# Regenerate, never edit by hand:
#   commit=9f93f54b1f71a853464bc8cd626405ad86dc938d; api=repos/EveryInc/compound-engineering-plugin/contents
#   gh api -H 'Accept: application/vnd.github.raw' "${api}/plugins/compound-engineering/LICENSE?ref=${commit}" > plugin.LICENSE
#   gh api -H 'Accept: application/vnd.github.raw' "${api}/LICENSE?ref=${commit}" > root.LICENSE
#   awk -v every="$(sed -n 3p root.LICENSE)" '{ print } NR == 3 { print every }' plugin.LICENSE | shasum -a 256
licence_sha256='5c76844c5bdf88efc3075e8a7c44c40771680875291a4ac80b178711dd131cf4'
credit=('compound-engineering 2\.28\.0' 'commit 9f93f54' 'Copyright \(c\) 2025 Kieran Klaassen'
        'Copyright \(c\) 2025 Every' 'MIT License' 'THIRD-PARTY-NOTICES\.md')
attribution_failed=0
for s in swift python typescript; do
  f="${plugin}/lenses/${s}-correctness.md"
  [ -f "${f}" ] || { fail "lenses/${s}-correctness.md missing"; attribution_failed=1; continue; }
  header="$(awk 'NR == 1 && !/^<!--/ { exit } { print } /-->/ { closed = 1; exit } END { exit !closed }' "${f}")" \
    || { fail "lenses/${s}-correctness.md has no closed header comment"; attribution_failed=1; continue; }
  for c in "${credit[@]}"; do
    grep -q -E -- "(^|[^[:alnum:]])${c}([^[:alnum:]]|$)" <<<"${header}" \
      || { fail "lenses/${s}-correctness.md header lacks '${c//\\/}'"; attribution_failed=1; }
  done
done
if [ -f "${notices}" ]; then
  grep -q -F 'commit 9f93f54b1f71a853464bc8cd626405ad86dc938d' "${notices}" \
    || { fail "THIRD-PARTY-NOTICES.md lacks the full source commit"; attribution_failed=1; }
  got="$(awk '/^```text$/ { on = 1; next } on && /^```$/ { exit } on' "${notices}" | shasum -a 256 | cut -d' ' -f1)"
  [ "${got}" = "${licence_sha256}" ] \
    || { fail "THIRD-PARTY-NOTICES.md licence text is not the pinned upstream text (sha256 ${got})"; attribution_failed=1; }
else fail "THIRD-PARTY-NOTICES.md missing at the plugin root"; attribution_failed=1; fi
[ "${attribution_failed}" = 0 ] \
  && echo "ok   adapted lenses credit compound-engineering 2.28.0; licence text matches upstream"
for f in "${plugin}"/lenses/*.md; do
  grep -q '\*\*Why\.\*\*' "${f}" || fail "lenses/$(basename "${f}") states no Why"
done

# 6. Roster lines: `<stack or "any"> <prompt file> [worker|census] [when: <condition>]`.
for s in '<stack or "any"> <prompt file> [worker|census] [when: <condition>]' \
         '· skipped · when: <condition>' '· when: undecided' 'the lens SITS' '· skipped · malformed:'; do
  grep -q -F -- "${s}" "${ref}" || fail "reference does not document '${s}'"
done
parse_roster_line() { # line -> "stack|file|role|when", "MALFORMED|reason", or nothing (not an entry)
  local line="${1}" head cond="" role="decider" t
  local -a f
  line="${line#"${line%%[![:space:]]*}"}"; line="${line%"${line##*[![:space:]]}"}"
  [ -z "${line}" ] && return 0
  [ "${line:0:1}" = "#" ] && return 0
  read -r -a f <<<"${line}"
  local i n=${#f[@]} w=-1
  for ((i = 0; i < n; i++)); do [ "${f[i]}" = "when:" ] && { w=${i}; break; }; done
  if [ "${w}" -ge 0 ]; then
    for ((i = w + 1; i < n; i++)); do cond="${cond:+${cond} }${f[i]}"; done
    [ -n "${cond}" ] || { echo "MALFORMED|empty condition"; return 0; }
    head=${w}
  else head=${n}; fi
  [ "${head}" -ge 2 ] || { echo "MALFORMED|no prompt file"; return 0; }
  [ "${head}" -le 3 ] || { echo "MALFORMED|more than three fields before when:"; return 0; }
  if [ "${head}" -eq 3 ]; then
    t="${f[2]}"
    case "${t}" in worker|census) role="${t}" ;; *) echo "MALFORMED|third field '${t}' is not worker or census"; return 0 ;; esac
  fi
  echo "${f[0]}|${f[1]}|${role}|${cond}"
}
roster="${fixtures}/roster/reviewer-roster.md"
want_roster=(
  "any|docs/reviewers/client-seat.md|decider|"
  "python|docs/reviewers/data-contracts.md|worker|"
  "any|docs/reviewers/determinism.md|decider|the plan or diff adds a hashed output path"
  "any|docs/reviewers/docs-census.md|census|the diff touches docs/standards/"
  "python|docs/reviewers/parsers.md|decider|a new raw-format parser appears: CSV, XLSX or PDF"
  "any|docs/reviewers/queue.md|decider|the diff changes the background worker"
  "MALFORMED|third field 'decider' is not worker or census"
  "MALFORMED|empty condition"
  "MALFORMED|no prompt file"
)
got_roster=()
if [ -f "${roster}" ]; then
  while IFS= read -r l || [ -n "${l}" ]; do
    r="$(parse_roster_line "${l}")"; [ -n "${r}" ] && got_roster+=("${r}")
  done <"${roster}"
else fail "fixture roster/reviewer-roster.md missing"; fi
[ "${#got_roster[@]}" -eq "${#want_roster[@]}" ] \
  || fail "roster fixture parses to ${#got_roster[@]} entries, expected ${#want_roster[@]}"
malformed=0
for ((i = 0; i < ${#want_roster[@]}; i++)); do
  if [ "${got_roster[i]:-}" = "${want_roster[i]}" ]; then echo "ok   roster line $((i + 1)) -> ${got_roster[i]}"
  else fail "roster line $((i + 1)) parses to '${got_roster[i]:-}', expected '${want_roster[i]}'"; fi
  [ "${want_roster[i]%%|*}" = "MALFORMED" ] && malformed=$((malformed + 1))
done

if [ "${status}" -eq 0 ]; then
  echo "PASS lens-names-resolve: ${#stacks[@]} stacks, $(wc -l <<<"${named}" | xargs) lenses, ${#got_roster[@]} roster lines (${malformed} malformed)"
else
  echo "FAIL lens-names-resolve"
  exit 1
fi
