#!/usr/bin/env bash
# Every step skill can load and announce itself: each skills/<step>/SKILL.md has front matter with a
# `name` equal to its folder and a non-empty `description` (the auto-load trigger), names its step
# aloud as `Step: <name>` (in backticks, so `Step: plan-review` does not count for plan), gives at
# least one Why, and contains no personal identifiers. Every template a skill points at through
# ${CLAUDE_PLUGIN_ROOT}/templates/, rules/, reference/ or lenses/ must exist.
#
# This checks the files, not the model: whether Claude actually follows a skill is the release
# check for bar 1. Patterns are split across quotes so this file does not match itself.
set -uo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
plugin="${repo}/plugins/methodical"
required=(brainstorm north-star plan deepen plan-review work work-review compound compact)
# Identifier patterns: the shared public list, plus any reference to the user's real config
# (a skill must never point there), plus the private list when this checkout has it.
# shellcheck source=lib/identifier-patterns.bash
source "${repo}/tests/lib/identifier-patterns.bash"
personal=("${shapes[@]}" "${names[@]}" '~/\.cla''ude/')
private="${repo}/.private/identifiers.txt"
if [ -f "${private}" ]; then
  while IFS= read -r p; do [ -n "${p}" ] && personal+=("${p}"); done < "${private}"
fi

status=0
fail() { echo "FAIL skills-frontmatter: ${1}"; status=1; }

for step in "${required[@]}"; do
  [ -f "${plugin}/skills/${step}/SKILL.md" ] || fail "missing skills/${step}/SKILL.md"
done

for f in "${plugin}"/skills/*/SKILL.md; do
  [ -f "${f}" ] || continue
  dir="$(basename "$(dirname "${f}")")"
  rel="skills/${dir}/SKILL.md"

  [ "$(head -n 1 "${f}")" = "---" ] || { fail "${rel}: no front matter"; continue; }
  front="$(awk 'NR == 1 { next } /^---$/ { exit } { print }' "${f}")"
  body="$(awk 'c >= 2 { print } /^---$/ { c++ }' "${f}")"

  name="$(sed -n 's/^name:[[:space:]]*//p' <<<"${front}" | tr -d '"' | head -n 1)"
  [ "${name}" = "${dir}" ] || fail "${rel}: name '${name}' does not match folder '${dir}'"

  desc="$(sed -n 's/^description:[[:space:]]*//p' <<<"${front}" | tr -d '"' | head -n 1)"
  [ "${#desc}" -ge 40 ] || fail "${rel}: description missing or too short to act as a trigger"

  grep -q -F "\`Step: ${dir}\`" <<<"${body}" || fail "${rel}: never names its step as \`Step: ${dir}\`"
  grep -q 'Why:' <<<"${body}" || fail "${rel}: gives no Why"

  for p in "${personal[@]}"; do
    if grep -n -i -E -- "${p}" "${f}" >/dev/null; then fail "${rel}: personal identifier (${p})"; fi
  done

  while IFS= read -r t; do
    [ -f "${plugin}/${t}" ] || fail "${rel}: points at ${t}, which does not exist"
  done < <(grep -o -E '\$\{CLAUDE_PLUGIN_ROOT\}/(templates|rules|reference|lenses)/[A-Za-z0-9._-]+' "${f}" | sed 's|^\${CLAUDE_PLUGIN_ROOT}/||' | sort -u)

  [ "${status}" -eq 0 ] && echo "ok   ${rel}: ${desc:0:72}..."
done

if [ "${status}" -eq 0 ]; then
  echo "PASS skills-frontmatter"
else
  echo "FAIL skills-frontmatter"
  exit 1
fi
