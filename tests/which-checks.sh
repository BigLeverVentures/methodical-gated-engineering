#!/usr/bin/env bash
# Which checks run. A repository may narrow a commit's run only through `narrow-check:` lines and the
# procedure in plugins/methodical/reference/narrow-checks.md; everything else runs all of the project's
# tests, and work-review never narrows. Checks, by equality where it can be done:
#   1. the whole reference file equals its pinned sha256, and the paragraphs that tell Claude what to run
#      (work step 3, work-review steps 3 and 4, compound's checkpoint step 3 and closing paragraph) equal
#      tests/fixtures/narrow-paragraphs.txt;
#   2. work-review step 3 names all of the project's tests and does not point at the reference file;
#   3. none of those texts uses a word that hands the choice to Claude's judgment;
#   4. every sentence in the plugin's instruction files that names a test, check, suite, command or narrowing
#      equals tests/fixtures/check-sentences.txt, so an added clause fails until a reviewer accepts it.
# Limit, stated: a new sentence elsewhere that uses none of those words is caught only by review. Whether
# Claude follows the text is a live-session check. After an accepted edit, regenerate with
#   bash tests/which-checks.sh --regenerate
# and read the fixture diff.
set -uo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
plugin="${repo}/plugins/methodical"
ref="${plugin}/reference/narrow-checks.md"
fixtures="${repo}/tests/fixtures"

# Regenerate: shasum -a 256 plugins/methodical/reference/narrow-checks.md, and the two fixtures below.
ref_sha256='c328e176094a15f1877926d3188a2112c9807f0b5b86bf33233f222d0d07c734'

status=0
fail() { echo "FAIL which-checks: ${1}"; status=1; }

# A paragraph block: from the first line matching the second argument up to (not including) the next blank line, numbered
# step or heading.
block() {
  RE="${2}" awk '
    found && (/^$/ || /^[0-9]+\. \*\*/ || /^#/) { exit }
    !found && $(0) ~ ENVIRON["RE"] { found = 1 }
    found { print }
  ' "${1}"
}

paragraphs() {
  local s="${plugin}/skills"
  printf '== work step 3\n';              block "${s}/work/SKILL.md"        '^3\. \*\*Test, then commit\.\*\*'
  printf '== work-review step 3\n';       block "${s}/work-review/SKILL.md" '^3\. \*\*Run all of the project'
  printf '== work-review step 4\n';       block "${s}/work-review/SKILL.md" '^4\. \*\*Run the round'
  printf '== compound step 3\n';          block "${s}/compound/SKILL.md"    '^3\. \*\*Run all of the project'
  printf '== compound closing paragraph\n'; block "${s}/compound/SKILL.md"   '^Commit these on the unit'
  printf '== compound before any merge\n'; block "${s}/compound/SKILL.md"      '^Before any merge'
}

# Every sentence (paragraphs joined, so wrapping cannot hide a tail) that names a test, check, suite,
# command or narrowing, with its file.
check_sentences() {
  for f in "${plugin}"/rules/*.md "${plugin}"/skills/*/SKILL.md "${plugin}"/reference/*.md \
           "${plugin}"/commands/*.md "${plugin}"/templates/*.md "${plugin}/hooks/rules.sh" "${plugin}"/lenses/*.md; do
    [ "${f}" = "${ref}" ] && continue
    case "${f}" in
      "${plugin}"/lenses/*) lens=1;;   # a lens briefs a read-only seat that runs nothing: only narrowing words count
      *) lens=0;;
    esac
    LC_ALL=C awk -v f="${f#"${repo}"/}" -v lens="${lens}" 'BEGIN { RS = "" } {
      p = $(0); gsub(/\n/, " ", p); gsub(/  +/, " ", p)
      n = split(p, parts, /[.!?] +/)
      for (i = 1; i <= n; i++) {
        t = tolower(parts[i])
        if (lens == 1) { if (t ~ /narrow|run all|full run|suite/) print f ": " parts[i]; continue }
        if (t ~ /test|suite|narrow|run all|full run|command|lint|green|verif|merge/ || t ~ /(^|[^a-z])check(s|ed|ing|list)?([^a-z]|$)/) print f ": " parts[i]
      }
    }' "${f}"
  done
}

if [ "${1:-}" = "--regenerate" ]; then
  paragraphs > "${fixtures}/narrow-paragraphs.txt"
  check_sentences > "${fixtures}/check-sentences.txt"
  echo "sha256: $(shasum -a 256 "${ref}" | cut -d' ' -f1)"
  exit 0
fi

[ -f "${ref}" ] || { echo "FAIL which-checks: reference/narrow-checks.md is missing"; exit 1; }

# 1. The whole reference file, and the paragraphs that tell Claude what to run.
[ "$(shasum -a 256 "${ref}" | cut -d' ' -f1)" = "${ref_sha256}" ] \
  || fail "reference/narrow-checks.md differs from its pinned sha256; review the change, then regenerate"
diff <(paragraphs) "${fixtures}/narrow-paragraphs.txt" >/dev/null \
  || fail "the paragraphs that say what to run differ from tests/fixtures/narrow-paragraphs.txt; review them, then regenerate"

# 2. The review never narrows; the three others default to all and point at the reference file.
wr3="$(block "${plugin}/skills/work-review/SKILL.md" '^3\. \*\*Run all of the project')"
case "${wr3}" in *"all of the project's tests"*"whatever the repository's \`narrow-check:\` lines say"*) ;; *) fail "work-review step 3 does not run all of the project's tests whatever the lines say";; esac
case "${wr3}" in *narrow-checks.md*) fail "work-review step 3 points at the narrow-checks reference; the review never narrows";; esac
for f in work/SKILL.md compound/SKILL.md; do
  flat="$(tr '\n' ' ' < "${plugin}/skills/${f}" | tr -s ' ')"
  case "${flat}" in *"unless you have read \`\${CLAUDE_PLUGIN_ROOT}/reference/narrow-checks.md\` and followed it for"*) ;; *) fail "skills/${f} lacks the default-first pointer sentence";; esac
  case "${flat}" in *"printing each path beside the \`narrow-check:\` line it matched; a run without that printout is a full run"*) ;; *) fail "skills/${f} does not say a run without the printout is a full run";; esac
done
# The review and a merge never narrow: work-review does not mention the reference file anywhere.
grep -q -F 'narrow-checks.md' "${plugin}/skills/work-review/SKILL.md" && fail "work-review mentions the narrow-checks reference; the review and its fix commits never narrow"
flat="$(tr '\n' ' ' < "${plugin}/skills/compound/SKILL.md" | tr -s ' ')"
case "${flat}" in *"Before any merge, whether the user's go or a standing grant gives it, run all of the project's tests on the branch's HEAD, unless you ran all of them on that exact HEAD in this session."*) ;; *) fail "compound does not run all tests before any merge";; esac
wflat="$(tr '\n' ' ' < "${plugin}/skills/work/SKILL.md" | tr -s ' ')"
case "${wflat}" in *"and any merge first runs compound's full run of all of the project's tests"*) ;; *) fail "work does not send a merge through compound's full run";; esac

# 3. No word that hands the choice to Claude's judgment, in the reference file and the pinned paragraphs.
judgment='warrant|judge|relevant|affected|as needed|enough|suffice|sufficient|lighter|subset|appropriate|quick|fast'
if { cat "${ref}"; paragraphs; } | grep -n -i -E -w "${judgment}" >/dev/null; then
  fail "a judgment word ($(printf '%s' "${judgment}" | tr '|' ' ')) appears in the narrow-checks text"
fi

# 4. Every sentence naming a test, check, suite, command, lint, green or narrowing, against the committed list
#    (narrow-checks.md is excluded: the sha256 above pins it; a lens counts only on narrowing words: it briefs
#    a read-only review seat, which runs nothing).
diff <(check_sentences) "${fixtures}/check-sentences.txt" >/dev/null \
  || fail "the sentences that name a test, check or command changed; review them, then regenerate tests/fixtures/check-sentences.txt"

[ "${status}" -eq 0 ] && echo "PASS which-checks"
exit "${status}"
