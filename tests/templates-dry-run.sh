#!/usr/bin/env bash
# Template dry run: does what the plan and compound skills tell Claude to do produce well-formed
# files? It instantiates the plan template into docs/plans/ and the solution template into
# docs/solutions/<category>/ of a throwaway repo, appends the solution's index line to a copy of
# docs/solutions/README.md, and checks the required headings, front matter and index line.
#
# Limit, stated: this fills the placeholders mechanically. It proves the templates carry what the
# skills require; it does not prove the model follows the skills. That is bar 1's release check.
set -uo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
templates="${repo}/plugins/methodical/templates"
tmp="$(mktemp -d)"
trap 'rm -rf "${tmp}"' EXIT

status=0
fail() { echo "FAIL templates-dry-run: ${1}"; status=1; }
need() { # file, fixed string, label
  grep -q -F -- "${2}" "${1}" || fail "${3}: missing '${2}'"
}

# Fill every <placeholder> with a word, the way a filled-in file would have none left. The one
# placeholder with a legal value set, the escalation level, is filled with `none` first, because
# `filled` is an unknown level.
fill() { sed -E -e 's/<none, lean or full>/none/' -e 's/<[^<>]+>/filled/g' "${1}"; }

# --- plan ---------------------------------------------------------------------------------------
plan="${tmp}/docs/plans/2026-01-01-dry-run.md"
mkdir -p "$(dirname "${plan}")"
fill "${templates}/plan.md" > "${plan}"
for h in '## North Star' '**Left short, on purpose:**' '## Goal' '## Inventory' '## Deepen score' \
         '**Score:**' '## Approach' '## Acceptance tests' '## Rulings' '## Open questions'; do
  need "${plan}" "${h}" "plan"
done
for k in title date state base escalation; do
  awk 'NR == 1 && !/^---$/ { exit 1 } NR > 1 && /^---$/ { exit } NR > 1 { print }' "${plan}" \
    | grep -q "^${k}:" || fail "plan: front matter has no '${k}:'"
done
grep -q '^escalation: none' "${plan}" || fail "plan: the escalation placeholder did not fill with 'none'"
# The deepen triggers live only in rules.md; the template must not carry a second copy.
grep -q '^- Deepen when two or more hold:' "${repo}/plugins/methodical/rules/rules.md" \
  || fail "rules.md: no deepen-trigger line"
if grep -q '^- \[ \] ' "${plan}"; then fail "plan: template repeats the deepen triggers"; fi
if grep -q -E '<[^<>]+>' "${plan}"; then fail "plan: placeholders left after filling"; fi

# --- solution and its index line ---------------------------------------------------------------
category="testing-patterns"
slug="dry-run-lesson"
sol="${tmp}/docs/solutions/${category}/${slug}.md"
mkdir -p "$(dirname "${sol}")"
sed -E -e "s/<category>/${category}/g" -e "s/<slug>/${slug}/g" "${templates}/solution.md" \
  | sed -E 's/<[^<>]+>/filled/g' > "${sol}"
for h in '## Symptoms' '## Root cause' '## Fix and evidence' '## Reuse' '## Index line'; do
  need "${sol}" "${h}" "solution"
done
for k in title category symptoms root_cause; do
  awk 'NR > 1 && /^---$/ { exit } NR > 1 { print }' "${sol}" | grep -q "^${k}:" \
    || fail "solution: front matter has no '${k}:'"
done

index="${tmp}/docs/solutions/README.md"
cp "${repo}/docs/solutions/README.md" "${index}"
line="$(awk '/^## Index line/ { f = 1; next } f && /^- \[/ { print; exit }' "${sol}")"
[ -n "${line}" ] || fail "solution: no index line under '## Index line'"
printf '\n## %s/\n\n%s\n' "${category}" "${line}" >> "${index}"

re='^- \[([a-z0-9-]+)\]\(([a-z0-9-]+)/([a-z0-9-]+)\.md\) — .+$'
added="$(grep -E -- "${re}" "${index}" | tail -n 1)"
[ -n "${added}" ] || fail "index: the appended line does not have the indexed shape"
target="$(sed -E "s|${re}|\\2/\\3.md|" <<<"${added}")"
[ -f "${tmp}/docs/solutions/${target}" ] || fail "index: link '${target}' does not resolve to the write-up"
grep -q -F -- "## ${category}/" "${index}" || fail "index: no '## ${category}/' heading"

# --- the other two templates keep the sections their skills name -------------------------------
for h in '## Who it serves' '## What they receive' '## The bar' '## Deliberately left out'; do
  need "${templates}/north-star.md" "${h}" "north-star template"
done
for h in '**Protocol, in order.**' '**A pass**' '**A fail**' '**Cost.**'; do
  need "${templates}/device-verification-queue.md" "${h}" "device-queue template"
done

if [ "${status}" -eq 0 ]; then
  echo "PASS templates-dry-run: plan at docs/plans/, solution at docs/solutions/${category}/, index line resolves"
else
  echo "FAIL templates-dry-run"
  exit 1
fi
