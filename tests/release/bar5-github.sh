#!/usr/bin/env bash
# Bar 5 release check, GitHub source: uninstall removes everything the install added. Runs after
# the repo is pushed. Installs with the README's two commands from GitHub into a throwaway HOME,
# asserts the marketplace clone, the cache copy and both records exist, uninstalls with the two
# commands, and asserts the clone and both records are gone and the cache copy is gone or marked
# .orphaned_at (Claude Code's own sweep removes marked copies; see tests/uninstall-clean.sh).
# No API spend. It needs gh auth (GH_TOKEN, or a gh login to read it from), so it also runs against a private fork.
source "$(dirname "${BASH_SOURCE[0]}")/lib.bash"
source_repo="${MGE_GITHUB_SOURCE:-BigLeverVentures/methodical-gated-engineering}"
export MGE_CASE=bar5-github

if [ -z "${MGE_CLAUDE_BIN:-}" ]; then
  GH_TOKEN="${GH_TOKEN:-$(gh auth token 2>/dev/null)}"
  [ -n "${GH_TOKEN}" ] || fail "needs GH_TOKEN or a gh login"
  export GH_TOKEN
  printf '[credential "https://github.com"]\n\thelper = !gh auth git-credential\n' >> "${tmp_home}/.gitconfig"
fi
cfg="${tmp_home}/.claude"

cl plugin marketplace add "${source_repo}" >/dev/null 2>&1 || fail "marketplace add ${source_repo} failed"
cl plugin install methodical@methodical >/dev/null 2>&1 || fail "install failed"
compgen -G "${cfg}/plugins/marketplaces/*methodical*" >/dev/null || fail "no marketplace clone after install"
compgen -G "${cfg}/plugins/cache/methodical/methodical/*/" >/dev/null || fail "no cache copy after install"
grep -q methodical "${cfg}/plugins/known_marketplaces.json" 2>/dev/null || fail "no marketplace record after install"
grep -q methodical "${cfg}/plugins/installed_plugins.json" 2>/dev/null || fail "no install record after install"
cl plugin list 2>&1 | grep -q 'methodical@methodical' || fail "plugin not listed after install"
ok "installed from ${source_repo}: clone, cache copy and both records present"

cl plugin uninstall methodical@methodical >/dev/null 2>&1 || fail "uninstall failed"
cl plugin marketplace remove methodical >/dev/null 2>&1 || fail "marketplace remove failed"
if compgen -G "${cfg}/plugins/marketplaces/*methodical*" >/dev/null; then fail "marketplace clone left behind"; fi
for d in "${cfg}"/plugins/cache/methodical/*/*/; do
  [ -d "${d}" ] || continue
  [ -f "${d}.orphaned_at" ] || fail "cache copy ${d#"${cfg}"/} neither removed nor marked for removal"
done
for f in installed_plugins.json known_marketplaces.json; do
  if [ -f "${cfg}/plugins/${f}" ] && grep -qi methodical "${cfg}/plugins/${f}"; then fail "plugins/${f} still mentions methodical"; fi
done
if cl plugin list 2>&1 | grep -q 'methodical@methodical'; then fail "plugin still listed after uninstall"; fi

echo "PASS bar5-github: install from ${source_repo} and uninstall left nothing behind"
