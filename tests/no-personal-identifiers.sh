#!/usr/bin/env bash
# Bar 3: nothing personal in anything published. Scans every file git would publish (tracked
# plus untracked, minus ignored, so a gitignored folder is never read) for generic shapes
# of personal data. The author's name and company are allowed only in LICENSE and the
# author/owner fields of the two manifests; the org name only as part of the repo address
# BigLeverVentures/methodical-gated-engineering, and not as the start of a longer name (so no
# other repo of the org passes). The failure-modes page gives shapes only, so it may contain no digit.
# The full private identifier list is not here, because the list is itself personal; it runs
# locally before every push, in tests/pre-publish-check.sh.
#
# The patterns live in tests/lib/identifier-patterns.bash, shared with skills-frontmatter.sh.
# The \$[0-9] shape catches dollar amounts, so shell here writes positional parameters as ${1}.
set -uo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${repo}" || exit 1

public_address='BigLeve''rVentures/methodical-gated-engineering'
# shellcheck source=lib/identifier-patterns.bash
source "${repo}/tests/lib/identifier-patterns.bash"

# Prints a file as it should be scanned: the two manifests without their author/owner fields.
render() {
  case "${1}" in
    .claude-plugin/marketplace.json) jq 'del(.owner)' "${1}" ;;
    plugins/methodical/.claude-plugin/plugin.json) jq 'del(.author)' "${1}" ;;
    *) cat "${1}" ;;
  esac
}

# A file is scanned unless it is empty. A NUL byte (or UTF-16 text) never hides a file: NULs are stripped
# where the text is read, so the patterns still see it.
scannable() { [ -s "${1}" ]; }

hits=0
while IFS= read -r -d '' f; do
  [ "${f}" = "LICENSE" ] && continue
  # Distributed license copies must match the root license byte for byte.
  if [[ "${f}" == */LICENSE ]] && cmp -s LICENSE "${f}"; then continue; fi
  [ -f "${f}" ] || continue
  scannable "${f}" || continue
  body="$(render "${f}" | tr -d '\0')" || { echo "FAIL no-personal-identifiers: cannot read ${f}"; hits=1; continue; }
  for p in "${shapes[@]}"; do
    if m="$(grep -n -E -- "${p}" <<<"${body}")"; then
      printf '%s\n' "${m}" | sed "s|^|${f}:|"; hits=1
    fi
  done
  # Drop the repo address only where no name character, "." included, follows it (".git" or a path
  # may follow), so a sibling such as "<address>.notes" still fails.
  stripped="$(sed -E "s#${public_address}(\.git)?([^A-Za-z0-9_.-]|$)#\2#g" <<<"${body}")"
  for p in "${names[@]}"; do
    if m="$(grep -n -i -E -- "${p}" <<<"${stripped}")"; then
      printf '%s\n' "${m}" | sed "s|^|${f}:|"; hits=1
    fi
  done
done < <(git ls-files -z --cached --others --exclude-standard)

# --- one version: nothing that tells a stranger there was an earlier version, a migration or a private
# process. banned <path> <body> prints the offending lines and returns 0
# when there are any; the scan and the proofs below both call it. The manifest's own version is removed from
# the text first (never a whole-line drop, so a stray older version on the same line still hits). The changelog
# and two release-corpus files that name a fixture project's own release are exempt from the version pattern only.
manifest_version="$(jq -r .version plugins/methodical/.claude-plugin/plugin.json)"
[[ "${manifest_version}" =~ ^[0-9]+(\.[0-9]+)+$ ]] \
  || { echo "FAIL no-personal-identifiers: the manifest version is unreadable: '${manifest_version}'"; exit 1; }
history_phrases=(
  'methodical[- ]tier' 'CLAUDE_PLUGIN_OPTION_TIER' 'earlier version' 'previous (release|version)' 'older version'
  '(^|[^[:alnum:]_])old settings?' 'the owner' "owner's" 'owner rul'
)
version_pattern='(^|[^0-9.])0\.[0-9]+\.[0-9]+'
banned() {
  local path="${1}" body="${2}" out="" m stripped p
  for p in "${history_phrases[@]}"; do
    if m="$(grep -n -i -E -- "${p}" <<<"${body}")"; then out+="${m}"$'\n'; fi
  done
  case "${path}" in
    CHANGELOG.md|tests/release/classify.sh|tests/release/stub/streams/pass/classify-trigger.jsonl) ;;
    *)
      stripped="$(sed -E "s/${manifest_version//./\\.}//g" <<<"${body}")"
      if [ "${path}" = docs/platform-support.md ]; then
        # This recorded vendor client version is not a prior Methodical release.
        stripped="$(sed -E 's/(^|[^[:alnum:]_.-])0\.163\.0-alpha\.10\.2([^[:alnum:]_.-]|$)/\1\2/g' <<<"${stripped}")"
      fi
      if m="$(grep -n -E -- "${version_pattern}" <<<"${stripped}")"; then out+="${m}"$'\n'; fi ;;
  esac
  [ -n "${out}" ] || return 1
  printf '%s' "${out}" | sed "s|^|${path}: |"
}
proof() { # <hit|none> <path> <body> <label>
  local got=none
  banned "${2}" "${3}" >/dev/null && got=hit
  [ "${got}" = "${1}" ] || { echo "FAIL no-personal-identifiers: banned() ${4}: expected ${1}, got ${got}"; hits=1; }
}
proof hit docs/x.md "A line about an earlier version." "an earlier-version phrase"
proof hit docs/x.md "see the methodical-tier setting" "the old tier setting"
proof hit docs/x.md "The Owner ruled it." "a private-voice phrase, any case"
proof hit docs/x.md "released as 0.9.1 last week" "a stray older version"
proof hit docs/x.md "now ${manifest_version} and 0.9.1 together" "the manifest version beside a stray one on one line"
proof none plugins/methodical/.claude-plugin/plugin.json "  \"version\": \"${manifest_version}\"," "the manifest version alone"
proof none CHANGELOG.md "- fixed in 0.9.1" "a version in the changelog"
proof hit CHANGELOG.md "The owner ruled it." "a phrase in the changelog"
proof none tests/release/classify.sh "Prepare the 0.2.0 release of tally." "a fixture project's own release"
proof none tests/release/stub/streams/pass/classify-trigger.jsonl "Prepare the 0.2.0 release of tally." "the second fixture release line"
proof none docs/x.md "a threshold setting" "a word that merely ends in old"
proof none docs/x.md "Claude Code v2.1.271 or later" "a Claude Code version"
proof none docs/platform-support.md "| Codex managed CLI | 0.163.0-alpha.10.2 |" "the recorded Codex client version"
proof hit docs/platform-support.md "0.163.0-alpha.10.2 and 0.10.0" "a Methodical version beside the vendor version"
proof hit docs/x.md "0.163.0-alpha.10.2" "the vendor version outside its documented path"
proof hit docs/platform-support.md "0.163.0-alpha.10.2-extra" "a suffixed vendor near-match"
proof hit docs/platform-support.md "x0.163.0-alpha.10.2" "a prefixed vendor near-match"
nul_file="$(mktemp)"; printf 'The owner ruled it.\n\0' > "${nul_file}"
scannable "${nul_file}" || { echo "FAIL no-personal-identifiers: a file holding a NUL byte is skipped by the scan"; hits=1; }
banned docs/x.md "$(tr -d '\0' < "${nul_file}")" >/dev/null || { echo "FAIL no-personal-identifiers: a phrase beside a NUL byte is not seen"; hits=1; }
rm -f "${nul_file}"
while IFS= read -r -d '' f; do
  case "${f}" in docs/plans/*|tests/release/fixtures/*|tests/no-personal-identifiers.sh) continue ;; esac
  [ -f "${f}" ] || continue
  scannable "${f}" || continue
  if banned "${f}" "$(tr -d '\0' < "${f}")"; then hits=1; fi
done < <(git ls-files -z)

# The failure-modes page tells shapes only, with no counts: no digit outside a leading front-matter block.
if [ -f docs/failure-modes.md ]; then
  if m="$(awk 'NR == 1 && /^---$/ { fm = 1; next } fm && /^---$/ { fm = 0; next } !fm' docs/failure-modes.md | grep -n -E '[0-9]')"; then
    printf '%s\n' "${m}" | sed 's|^|docs/failure-modes.md (digit; shapes only): |'; hits=1
  fi
fi

if [ "${hits}" -eq 0 ]; then
  echo "PASS no-personal-identifiers"
else
  echo "FAIL no-personal-identifiers"
  exit 1
fi
