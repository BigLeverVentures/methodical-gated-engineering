#!/usr/bin/env bash
# The README's "Set up a repository" section tells an adopter which files the loop writes, who writes
# each, how to check the plugin loaded, and that cloud sessions do not run it. Checks, by fixed string,
# that:
#   1. the section's table has exactly the rows pinned below, in order, and each row's path appears in
#      the one plugin file that writes it (a path that only some other file mentions does not count);
#   2. the section carries the load-check commands, the `.gitignore` re-include for the roster, the cloud
#      warning, and a link to docs/setup.md, which exists and repeats the load check and the cloud text.
# Limit, stated: this proves the README matches the plugin's own files and carries its warnings. It does
# not prove Claude Code behaves as its documentation says; the cloud text is a live check.
set -uo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
plugin="${repo}/plugins/methodical"
readme="${repo}/README.md"
setup="${repo}/docs/setup.md"

status=0
fail() { echo "FAIL setup-docs: ${1}"; status=1; }

# Row path | the plugin file that writes it | the row's "Written by" cell, exactly.
pinned='docs/north-star.md|skills/north-star/SKILL.md|`north-star`, with you
docs/brainstorms/|skills/brainstorm/SKILL.md|`brainstorm`
docs/plans/|skills/plan/SKILL.md|`plan`
docs/solutions/README.md|skills/compound/SKILL.md|`compound`
docs/resume.md|skills/compact/SKILL.md|`compact`, `compound`
docs/rulings.md|rules/user-words.md|the first time your words are recorded
docs/device-verification-queue.md|skills/work/SKILL.md|`work`, when a check needs hardware or a later time
.claude/reviewer-roster.md|reference/seat-selection.md|you, optional'

section="$(awk '/^## Set up a repository$/ { s = 1; next } /^## / { s = 0 } s' "${readme}")"
[ -n "${section}" ] || { echo "FAIL setup-docs: README.md has no '## Set up a repository' section"; exit 1; }

# 1. The table rows: the first backticked cell of every row, against the pinned list.
rows="$(printf '%s\n' "${section}" | awk -F'`' '/^\| `/ { print $(2) }')"
want="$(printf '%s\n' "${pinned}" | awk -F'|' '{ print $(1) }')"
[ "${rows}" = "${want}" ] || fail "the README table rows differ from the pinned list; got: $(printf '%s' "${rows}" | tr '\n' ' ')"

# The "Written by" column, row by row, against the pinned cells.
cells="$(printf '%s\n' "${section}" | awk -F'|' '/^\| `/ { c = $(3); gsub(/^ +| +$/, "", c); print c }')"
want_cells="$(printf '%s\n' "${pinned}" | awk -F'|' '{ print $(3) }')"
[ "${cells}" = "${want_cells}" ] || fail "the README 'Written by' column differs from the pinned cells; got: $(printf '%s' "${cells}" | tr '\n' ';')"

while IFS='|' read -r path file _cell; do
  [ -f "${plugin}/${file}" ] || { fail "writer file plugins/methodical/${file} is missing"; continue; }
  grep -q -F -- "${path}" "${plugin}/${file}" || fail "plugins/methodical/${file} does not mention ${path}, which the README says it writes"
done <<EOF
${pinned}
EOF

# 2. The warnings and checks sit in the section itself, not elsewhere in the README.
inside() { printf '%s\n' "${section}" | grep -q -F -- "${1}" || fail "the README section lacks '${1}'"; }
inside 'claude plugin list'
inside 'claude plugin marketplace update methodical'
inside 'claude plugin update methodical@methodical'
inside '/reload-plugins'
inside '/methodical:rules'
inside '!.claude/reviewer-roster.md'
inside '**Cloud sessions do not run Methodical.**'
inside 'We have not tested this or the workarounds.'
inside '[Setup details](docs/setup.md).'
inside "Claude Code's documentation says a cloud session"
inside 'run the loop locally and use the cloud for the build only'
inside 'put a line in `CLAUDE.md` that makes a cloud session say Methodical is missing'
inside 'keep the cloud for work that needs no gates'
inside "Methodical runs all of your project's tests before every commit and before every review, and your repository defines what those are."
inside '(docs/setup.md#which-checks-run-before-a-commit)'
inside "If your project's North Star already lives elsewhere, put a short \`docs/north-star.md\` in place"
inside 'The skills read that file and do not follow a link inside it.'
inside 'compare `gitCommitSha` for `methodical@methodical` in `~/.claude/plugins/installed_plugins.json` with the newest commit on `main` of the marketplace repository'
inside 'The marketplace follows `main` unless it was added with a `#ref`'
inside 'A session keeps what it loaded when it started: one started after the installed commit last changed is current'
inside 'do not read the defaults as a pass'

[ -f "${setup}" ] || fail "docs/setup.md is missing"
if [ -f "${setup}" ]; then
  for s in 'claude plugin list' '/reload-plugins' '/methodical:rules' '## Cloud sessions do not run Methodical' \
           'claude --cloud' 'We have not tested it' '!.claude/reviewer-roster.md' \
           "Claude Code's documentation says this" '## Which checks run before a commit' \
           '1. **Run the loop where the plugin loads, and use the cloud for the build.**' \
           '2. **Put a stopgap line in `CLAUDE.md`.**' '3. **Use the cloud only for work that does not need the gates.**' \
           'Do not assume you have Methodical' 'is only an instruction in the' \
           'do not follow a' 'bare pointer would be read as the North Star itself' \
           'Read `gitCommitSha` for `methodical@methodical` in' \
           '`~/.claude/plugins/installed_plugins.json` and compare it with the newest commit on `main` of the' \
           '(not a working copy of it: a local checkout may sit on an unmerged' \
           'The marketplace follows `main` unless it was added with a `#ref`' \
           'a reload is not verified' 'started after the installed commit last' \
           '`claude plugin uninstall methodical@methodical`, then `rm -rf ~/.claude/plugins/cache/methodical`'; do
    grep -q -F -- "${s}" "${setup}" || fail "docs/setup.md lacks '${s}'"
  done
fi

[ "${status}" -eq 0 ] && echo "PASS setup-docs"
exit "${status}"
