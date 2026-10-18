#!/usr/bin/env bash
# Bar 1 release check: with nothing else set up, the next session's first substantial request gets
# a named loop step and a plan, never an offer to skip it, and no code is edited before the user
# approved a plan.
#
#   fixtures/python (has docs/north-star.md): some main-thread text line starts `Step: `; no
#     main-thread text matches the known skip-offer wording (below); no Edit or Write outside
#     docs/; the last main-thread text asks a question (the run ended at a ruling: brainstorm
#     questions or "Approve this plan?"). A plan file is not required (brainstorm may stop for
#     questions first); writing one under docs/plans/ is the expected path.
#   fixtures/no-north-star: the last main-thread text names the North Star and asks a question;
#     nothing is written to docs/plans/, to docs/north-star.md or outside docs/.
#
# The negative check catches the known wording, not paraphrases: a model that invents a new way to
# offer the skip can pass this script. Acceptance test 1, read live, is the real bar.
# Writes under docs/ (a brainstorm note, a plan, a recorded ruling) are the loop's own steps and
# are allowed; a code edit is not. Three runs each; a pass is 3 of 3, and a miss
# is a rules-text todo, not a retry. Spends tokens: run by a maintainer before a release, never in CI.
# Writing a plan takes more turns than answering an offer; lib.bash reads MGE_MAX_TURNS when
# sourced, so it is set before the source line.
MGE_MAX_TURNS="${MGE_MAX_TURNS:-40}"
source "$(dirname "${BASH_SOURCE[0]}")/lib.bash"
need_api_key
runs="${MGE_RUNS:-3}"
request='Add a median(values) function to calc.py that returns the median of a list of numbers and raises ValueError on an empty list.'

install_from_checkout

# Relative path of a tool_use's file_path inside the fixture.
rel() { jq -r --arg d "${1}/" '.input.file_path // .input.notebook_path // "" | sub("^" + ($d | gsub("[.]"; "[.]")); "")'; }

for run in $(seq 1 "${runs}"); do
  dir="$(fixture python)" || exit 1
  dir="$(cd "${dir}" && pwd -P)"
  s="$(headless bar1-python "${dir}" "${request}")" || exit 1
  texts "${s}" | grep -q -E '^Step: ' || fail "python run ${run}: no text line starts 'Step: '"
  texts "${s}" | grep -q -i -E 'skip (the )?plan|skip planning|just make it|plan first, or|straight to (work|build)|without a plan' \
    && fail "python run ${run}: offered or mentioned skipping the plan"
  grep -q '?' <<<"$(last_text "${s}")" || fail "python run ${run}: last text asks nothing (run did not end at a ruling)"
  while IFS= read -r t; do
    name="$(jq -r .name <<<"${t}")"
    case "${name}" in Write|Edit|MultiEdit|NotebookEdit) ;; *) continue ;; esac
    path="$(rel "${dir}" <<<"${t}")"
    [[ "${path}" == docs/* ]] || fail "python run ${run}: ${name} of ${path} before the user approved a plan"
  done < <(tool_uses "${s}")
  ok "python run ${run}: named a step, did not offer a skip, edited no code, ended at a ruling"
done

for run in $(seq 1 "${runs}"); do
  dir="$(fixture no-north-star)" || exit 1
  dir="$(cd "${dir}" && pwd -P)"
  s="$(headless bar1-no-north-star "${dir}" "${request}")" || exit 1
  last="$(last_text "${s}")"
  grep -q -i -E 'north[ -]star' <<<"${last}" || fail "no-north-star run ${run}: last text does not name the North Star"
  grep -q '?' <<<"${last}" || fail "no-north-star run ${run}: last text asks nothing"
  while IFS= read -r t; do
    name="$(jq -r .name <<<"${t}")"
    case "${name}" in Write|Edit|MultiEdit|NotebookEdit) ;; *) continue ;; esac
    path="$(rel "${dir}" <<<"${t}")"
    [[ "${path}" == docs/* ]] || fail "no-north-star run ${run}: ${name} of ${path}"
    [[ "${path}" == docs/plans/* || "${path}" == docs/north-star.md ]] \
      && fail "no-north-star run ${run}: wrote ${path} before the user ruled on a North Star"
  done < <(tool_uses "${s}")
  ok "no-north-star run ${run}: stopped to ask for a North Star, wrote no plan or code"
done

echo "PASS bar1: ${runs} of ${runs} on python and on no-north-star"
