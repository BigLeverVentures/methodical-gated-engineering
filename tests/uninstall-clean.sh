#!/usr/bin/env bash
# Bar 5: uninstall removes everything it added and nothing else. Runs the stranger's two-command
# install and two-command uninstall against this checkout, inside a throwaway HOME with a minimal
# environment, so the real user configuration is never read or written. No credential is needed:
# install and uninstall are local.
#
# Claude Code copies the plugin into plugins/cache even from a local-path marketplace. On uninstall
# it does not delete that copy: it writes an .orphaned_at marker, and its background sweep removes
# marked copies after 14 days, but only while some plugin is still installed (the plugin-cache cleanup section of Claude
# Code's plugin docs). A user whose only plugin this was keeps the copy until they
# remove it; the README gives the command. So a leftover cache copy passes only if it carries the
# marker: the leftover is Claude Code's lifecycle, not this plugin's.
#
# Limit, stated: a local-path marketplace makes no clone under plugins/marketplaces, so this test
# cannot prove a clone is removed. The release check from the GitHub source does.
set -uo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
real_home="${HOME}"
tmp_home="$(mktemp -d)"
tmp_home="$(cd "${tmp_home}" && pwd -P)"
trap 'rm -rf "${tmp_home}"' EXIT

if [ -z "${tmp_home}" ] || [ "${tmp_home}" = "$(cd "${real_home}" && pwd -P)" ]; then
  echo "FAIL uninstall-clean: temp HOME resolves to the real HOME; refusing to run"
  exit 1
fi

# Every claude call sees only the temp HOME.
cl() { env -i HOME="${tmp_home}" PATH="${PATH}" TERM=dumb LANG=en_US.UTF-8 claude "$@"; }

fail() { echo "FAIL uninstall-clean: ${1}"; exit 1; }

cfg="${tmp_home}/.claude"
mkdir -p "${cfg}"
printf '# My own instructions\nKeep this file exactly as it is.\n' > "${cfg}/CLAUDE.md"
printf '{\n  "theme": "dark"\n}\n' > "${cfg}/settings.json"
cp "${cfg}/CLAUDE.md" "${tmp_home}/CLAUDE.md.before"
cp "${cfg}/settings.json" "${tmp_home}/settings.json.before"

# Install: the two commands the README gives, from this checkout.
cl plugin marketplace add "${repo}" >/dev/null 2>&1 || fail "marketplace add failed"
cl plugin install methodical@methodical >/dev/null 2>&1 || fail "install failed"
cl plugin list 2>&1 | grep -q 'methodical@methodical' || fail "plugin not listed after install"
grep -q 'methodical' "${cfg}/plugins/installed_plugins.json" 2>/dev/null \
  || fail "install record not written"
echo "ok   install: methodical@methodical installed from the local checkout"
# The licence notice for the adapted reviewer prompts travels with the installed plugin, byte for byte.
installed="$(compgen -G "${cfg}/plugins/cache/methodical/methodical/*/THIRD-PARTY-NOTICES.md" | head -n 1)"
if [ -n "${installed}" ] && cmp -s "${installed}" "${repo}/plugins/methodical/THIRD-PARTY-NOTICES.md"; then
  echo "ok   install: the installed copy carries THIRD-PARTY-NOTICES.md unchanged"
else fail "the installed copy lacks THIRD-PARTY-NOTICES.md, or it differs from the plugin's"; fi

# Uninstall: the two commands the README gives.
cl plugin uninstall methodical@methodical >/dev/null 2>&1 || fail "uninstall failed"
cl plugin marketplace remove methodical >/dev/null 2>&1 || fail "marketplace remove failed"

cmp -s "${tmp_home}/CLAUDE.md.before" "${cfg}/CLAUDE.md" || fail "CLAUDE.md changed"
[ -f "${cfg}/settings.json" ] || fail "settings.json removed"
jq -e '.theme == "dark"' "${cfg}/settings.json" >/dev/null || fail "user setting lost from settings.json"
if grep -qi 'methodical' "${cfg}/settings.json"; then fail "settings.json still mentions methodical"; fi
for f in installed_plugins.json known_marketplaces.json; do
  if [ -f "${cfg}/plugins/${f}" ] && grep -qi 'methodical' "${cfg}/plugins/${f}"; then
    fail "plugins/${f} still mentions methodical"
  fi
done
if compgen -G "${cfg}/plugins/data/*methodical*" >/dev/null; then fail "plugin data directory left behind"; fi
for d in "${cfg}"/plugins/cache/methodical/*/*/; do
  [ -d "${d}" ] || continue
  [ -f "${d}.orphaned_at" ] || fail "cache copy ${d#"${cfg}"/} not marked for removal"
done
if compgen -G "${cfg}/plugins/marketplaces/*methodical*" >/dev/null; then fail "marketplace clone left behind"; fi
if cl plugin list 2>&1 | grep -q 'methodical@methodical'; then fail "plugin still listed after uninstall"; fi

echo "PASS uninstall-clean"
