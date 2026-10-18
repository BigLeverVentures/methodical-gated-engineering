#!/usr/bin/env bash
# Bar 1 support: the always-on rules stay short. The SessionStart hook loads them into every
# session of every project the plugin is installed in, so the cap applies to the rendered hook
# output (Claude Code's own cap is 10,000).
# The cap leaves a margin over the measured worst case, so a bullet can be added without cutting a Why;
# a trim that would drop a reason is not worth the characters.
# Measured with the longest routing block the hook can print: a long running-model id (printed cut to
# 40), the session cell `high (base)`, the four role options all invalid, and the startup Offer.
# Stdin is given explicitly.
# Every `- ` bullet in rules.md must still carry a `Why:`, so a trim cannot drop a reason.
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
plugin="${repo}/plugins/methodical"
cap=5000

# wc -m counts characters only under a UTF-8 locale; pick one this machine has.
locales="$(locale -a 2>/dev/null || true)"
utf8="$(grep -i -m1 -E '^(C|en_US)\.utf-?8$' <<<"${locales}")" \
  || { echo "FAIL rules-size: no UTF-8 locale available to count characters"; exit 1; }

proj="$(mktemp -d)"; trap 'rm -rf "${proj}"' EXIT
# An 80-character id; the hook prints at most 40 of it, so any longer id renders the same.
id="arn:aws:bedrock:us-east-1:000000000000:inference-profile/us.anthropic.claude-opu"
[ "${#id}" -eq 80 ] || { echo "FAIL rules-size: test id is ${#id} characters, expected 80"; exit 1; }
stdin="{\"source\":\"startup\",\"model\":\"${id}\"}"

out="$(env -i PATH="${PATH}" CLAUDE_PLUGIN_ROOT="${plugin}" CLAUDE_PROJECT_DIR="${proj}" \
  CLAUDE_PLUGIN_OPTION_DECIDER=x CLAUDE_PLUGIN_OPTION_WORKER=x CLAUDE_PLUGIN_OPTION_CENSUS=x \
  CLAUDE_PLUGIN_OPTION_BACKSTOP=x \
  bash "${plugin}/hooks/rules.sh" <<<"${stdin}")"

# The worst case holds everything it claims to.
for role in session decider worker census backstop; do
  grep -q "^| ${role} | " <<<"${out}" || { echo "FAIL rules-size: routing row '${role}' missing"; exit 1; }
done
grep -q -F '| session | sonnet (running: arn:aws:bedrock:us-east-1:000000000000:i) | high (base) |' <<<"${out}" \
  || { echo "FAIL rules-size: worst case lacks the 40-character id in the session row"; exit 1; }
[ "$(grep -c 'invalid value ignored' <<<"${out}")" -eq 4 ] || { echo "FAIL rules-size: worst case does not have four invalid roles"; exit 1; }
grep -q '^Offer: ' <<<"${out}" || { echo "FAIL rules-size: worst case lacks the offer"; exit 1; }

# Every rule bullet keeps its Why, so a trim cannot drop a reason.
bullets="$(grep -c '^- ' "${plugin}/rules/rules.md")"
whys="$(grep '^- ' "${plugin}/rules/rules.md" | grep -c 'Why:' || true)"
[ "${bullets}" -eq "${whys}" ] || { echo "FAIL rules-size: ${whys} of ${bullets} rule bullets carry a Why"; exit 1; }

worst="$(printf '%s\n' "${out}" | LC_ALL="${utf8}" wc -m | tr -d ' ')"

if [ "${worst}" -le "${cap}" ]; then
  echo "PASS rules-size: ${worst} characters worst case (cap ${cap})"
else
  echo "FAIL rules-size: ${worst} characters worst case exceeds cap ${cap}"
  exit 1
fi
