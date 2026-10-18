#!/usr/bin/env bash
# Pre-publish check: run locally before any push, never in CI. It needs maintainer-only lists in the
# gitignored .private/ folder, which CI does not have and which must never be published.
#
# Usage:
#   tests/pre-publish-check.sh publish          the first push: the orphan branch must be one commit
#   tests/pre-publish-check.sh <ref>            a ref and all of its history
#   tests/pre-publish-check.sh <base>..<ref>    only the commits a push would add (e.g. origin/main..HEAD)
#
# Asserts, and exits non-zero on any miss:
#   - for `publish`, the history is exactly one commit;
#   - the tree has no .private/ path, no top-level docs/plans/ or .claude/, and no gitlink;
#   - no pattern in .private/identifiers.txt matches the tree (outside LICENSE and the manifests'
#     author/owner fields) or the outgoing history (commit messages and diffs);
#   - the public names (author, company, org) match neither, except the org as part of the repo
#     address, as in no-personal-identifiers.sh;
#   - no phrase in .private/ruling-phrases.txt (maintainer-only phrases)
#     appears in the tree or the history, matched across line breaks;
#   - every outgoing commit's author and committer email is a GitHub noreply address;
#   - tests/no-personal-identifiers.sh passes on the ref's own tree (checked out in a temp worktree);
#   - every remote, if any, is the repo address itself.
#
# Read-only on the repo: the only write is a temporary worktree, removed on exit.
# Limit: a phrase split by markdown markup (emphasis, a quote marker) is not matched.
set -uo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${repo}" || exit 1

arg="${1:-}"
[ -n "${arg}" ] || { echo "usage: ${0} publish | <ref> | <base>..<ref>"; exit 2; }
if [[ "${arg}" == *..* ]]; then ref="${arg##*..}"; range="${arg}"; else ref="${arg}"; range="${arg}"; fi
git rev-parse --verify --quiet "${ref}^{commit}" >/dev/null || { echo "FAIL pre-publish: no such ref ${ref}"; exit 2; }

identifiers="${repo}/.private/identifiers.txt"
phrases="${repo}/.private/ruling-phrases.txt"
for f in "${identifiers}" "${phrases}"; do
  [ -s "${f}" ] || { echo "FAIL pre-publish: ${f#"${repo}"/} is missing or empty; the check cannot run without it"; exit 2; }
done

public_address='BigLeve''rVentures/methodical-gated-engineering'
# shellcheck source=lib/identifier-patterns.bash
source "${repo}/tests/lib/identifier-patterns.bash"
manifests=(.claude-plugin/marketplace.json plugins/methodical/.claude-plugin/plugin.json)

work="$(mktemp -d)"
cleanup() { git worktree remove --force "${work}/tree" >/dev/null 2>&1; rm -rf "${work}"; }
trap cleanup EXIT

status=0
fail() { echo "FAIL pre-publish: ${1}"; status=1; }
# Drops the repo address (with an optional .git) where no name character, `.` included, follows it,
# so only the address itself passes.
strip_address() { sed -E "s#${public_address}(\.git)?([^A-Za-z0-9_.-]|$)#\\2#g"; }

# Patterns: the private list, then the public names (applied after the address is stripped).
grep -v -E '^[[:space:]]*$' "${identifiers}" > "${work}/patterns"
[ -s "${work}/patterns" ] || { echo "FAIL pre-publish: .private/identifiers.txt has no usable identifier; the check cannot run without one"; exit 2; }
printf '%s\n' "${names[@]}" >> "${work}/patterns"
grep -v -E '^[[:space:]]*$' "${phrases}" > "${work}/phrases"
[ -s "${work}/phrases" ] || { echo "FAIL pre-publish: .private/ruling-phrases.txt has no usable phrase; the check cannot run without one"; exit 2; }
# A pattern grep cannot compile makes every match below look clean, so stop here instead.
grep -i -E -f "${work}/patterns" </dev/null >/dev/null; [ "$?" -le 1 ] || { echo "FAIL pre-publish: a pattern in the identifier lists does not compile"; exit 2; }

# 1. One commit for the first push.
if [ "${arg}" = "publish" ]; then
  n="$(git rev-list --count publish)"
  [ "${n}" = "1" ] || fail "publish has ${n} commits; the first push must be exactly one"
  # The changelog starts at the version being published: one heading, and it is the manifest's version.
  # (A one-time check: a standing one would obstruct the next release.)
  if cl="$(git show "${ref}:CHANGELOG.md" 2>/dev/null)"; then
    heads="$(awk '/^ {0,3}(```|~~~)/ { f = !f; next } !f && /^## / { print }' <<<"${cl}")"
    ver="$(git show "${ref}:plugins/methodical/.claude-plugin/plugin.json" 2>/dev/null | jq -r '.version // empty' 2>/dev/null)"
    if [ -z "${ver}" ]; then
      fail "cannot read the manifest version at ${ref}"
    elif [ "$(grep -c . <<<"${heads}")" != 1 ] || [[ "${heads}" != "## ${ver}" && "${heads}" != "## ${ver} "* ]]; then
      fail "the changelog must hold exactly one entry, '## ${ver}'; found: ${heads//$'\n'/ | }"
    elif grep -q -E '(^|[^0-9.])[0-9]+\.[0-9]+\.[0-9]+' < <(sed "s/${ver//./\\.}//g" <<<"${cl}"); then
      fail "the changelog names a version other than ${ver}"
    fi
  else
    fail "publish has no CHANGELOG.md"
  fi
fi

# 2. Paths.
paths="$(git ls-tree -r --name-only "${ref}")"
if m="$(grep -E '^(\.private/|docs/plans/|\.claude/)' <<<"${paths}")"; then fail "private paths in the tree: ${m//$'\n'/, }"; fi
# A nested checkout or worktree added by `git add -A` is a gitlink (mode 160000) that points into private history.
if m="$(git ls-tree -r "${ref}" | awk '$(1) == "160000" { print $NF }')" && [ -n "${m}" ]; then fail "gitlinks (nested repositories) in the tree: ${m//$'\n'/, }"; fi

# 3. The tree: each file as published, the manifests without their author/owner fields.
while IFS= read -r f; do
  [ "${f}" = "LICENSE" ] && continue
  if [[ "${f}" == */LICENSE ]] && cmp -s <(git show "${ref}:LICENSE") <(git show "${ref}:${f}"); then continue; fi
  case "${f}" in
    .claude-plugin/marketplace.json) body="$(git show "${ref}:${f}" | jq 'del(.owner)')" ;;
    plugins/methodical/.claude-plugin/plugin.json) body="$(git show "${ref}:${f}" | jq 'del(.author)')" ;;
    *) body="$(git show "${ref}:${f}")" ;;
  esac || { fail "cannot read ${f} at ${ref}"; continue; }
  grep -Iq . <<<"${body}" || continue
  if m="$(strip_address <<<"${body}" | grep -n -i -E -f "${work}/patterns")"; then
    printf '%s\n' "${m}" | sed "s|^|  ${f}:|"; fail "identifier in ${f}"
  fi
  if m="$(tr '\n' ' ' <<<"${body}" | tr -s '[:space:]' ' ' | grep -o -i -F -f "${work}/phrases" | sort -u)"; then
    printf '%s\n' "${m}" | sed "s|^|  ${f}: |"; fail "ruling phrase in ${f}"
  fi
done <<<"${paths}"

# 4. The history: commit messages and diffs, LICENSE excluded, and in the manifests only the
#    author/owner lines the tree allows.
for f in "${manifests[@]}"; do
  git show "${ref}:${f}" 2>/dev/null | jq -r '(.author // empty), (.owner // empty) | to_entries[] | "\"\(.key)\": \"\(.value)\""'
done > "${work}/allowed"
echo '(no allowed line)' >> "${work}/allowed"   # never empty, so awk reads it as the first file
git log -p --no-color --no-ext-diff --format='commit %H%n%B' "${range}" > "${work}/log.raw" \
  || fail "cannot read the history of ${range}"
git show "${ref}:LICENSE" > "${work}/license"
awk '
  FILENAME == ARGV[1] { license[$(0)] = 1; next }
  FILENAME == ARGV[2] { ok[$(0)] = 1; next }
  /^diff --git / { file = $(3); sub(/^a\//, "", file); next }
  /^commit [0-9a-f]+$/ { file = ""; print; next }
  file == "LICENSE" { next }
  file ~ /\/LICENSE$/ {
    # Exact copies were compared in the tree check; check their diff against the root license too.
    line = $(0); sub(/^[-+ ]/, "", line)
    if (line in license) next
  }
  file ~ /(^|\/)\.claude-plugin\/(marketplace|plugin)\.json$/ {
    line = $(0); sub(/^[-+ ][[:space:]]*/, "", line); sub(/,[[:space:]]*$/, "", line)
    if (line in ok) next
  }
  { print }' "${work}/license" "${work}/allowed" "${work}/log.raw" > "${work}/log" || fail "cannot filter the history"
# An empty filtered log for a non-empty history means the filter broke; never pass on it.
if [ -s "${work}/log.raw" ] && [ ! -s "${work}/log" ]; then fail "the filtered history is empty"; fi
if m="$(strip_address < "${work}/log" | grep -n -i -E -f "${work}/patterns")"; then
  printf '%s\n' "${m}" | head -20 | sed 's|^|  history:|'; fail "identifier in the outgoing history"
fi
if m="$(sed -E 's/^[-+ ]//' "${work}/log" | tr '\n' ' ' | tr -s '[:space:]' ' ' | grep -o -i -F -f "${work}/phrases" | sort -u)"; then
  printf '%s\n' "${m}" | sed 's|^|  history: |'; fail "ruling phrase in the outgoing history"
fi

# 5. Commit emails.
while IFS=' ' read -r sha ae ce; do
  for e in "${ae}" "${ce}"; do
    [[ "${e}" == *@users.noreply.github.com ]] || fail "commit ${sha:0:7} carries ${e}, not a GitHub noreply address"
  done
done < <(git log --format='%H %ae %ce' "${range}")

# 6. The public check, on the ref's own tree.
if git worktree add --detach --quiet "${work}/tree" "${ref}" >/dev/null 2>&1; then
  out="$(bash "${work}/tree/tests/no-personal-identifiers.sh" 2>&1)" || { printf '%s\n' "${out}" | sed 's|^|  |'; fail "no-personal-identifiers.sh fails on ${ref}"; }
else
  fail "cannot check out ${ref} into a temporary worktree"
fi

# 7. Remotes: none yet, or only the repo itself.
while read -r _ url _; do
  [ -n "${url}" ] || continue
  [[ "${url}" =~ [:/]${public_address}(\.git)?$ ]] || fail "remote ${url} is not the repo address"
done < <(git remote -v)

if [ "${status}" -eq 0 ]; then
  echo "PASS pre-publish-check (${arg})"
else
  echo "FAIL pre-publish-check (${arg})"
  exit 1
fi
