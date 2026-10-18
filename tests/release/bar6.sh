#!/usr/bin/env bash
# Bar 6 release check: change one value and every seat moves; escalate by plan and the deciding
# seats and the backstop follow; block a model and the loop still runs.
#
#   1. bar6-decider: settings.json sets the decider to sonnet (the base is opus, so a pass cannot be
#      the default); a headless plan review launches every decider seat (code-grounded, rigor, any
#      correctness lens) with model sonnet and effort high, and no seat with fable.
#   2. bar6-blocked: the plan carries `escalation: full`, settings.json limits availableModels to
#      exclude the Fable family and the run uses --model opus, and the user says "the backstop is
#      low". The review finishes, the deciding seats launch on opus at high and print `re-seated`,
#      no subagent runs in the blocked family, and the plan carries `needs-backstop-re-review`.
#   3. bar6-full: the same plan at `full`, nothing blocked: code-grounded, rigor and the correctness
#      lens launch on fable at high; simplicity stays on sonnet at medium; the North Star seat sits
#      as census here (this fixture makes no end-user claim).
#   4. bar6-material: a work review of a `lean` unit that carries one defect. The backstop (rigor on
#      fable at high) reviews the committed final candidate after the round's last commit and names
#      it; whoever found the defect, a fix commit follows; the touched seats and the backstop re-run
#      after it; one push, after the last backstop launch; the defect is gone.
#   5. bar6-exhausted: backstop and decider both set to opus, worker and census on sonnet, and the
#      user says Opus and Sonnet are unavailable. The walk skips the duplicate, finds nothing left,
#      and the orchestrator sits the seats: no launch on opus or sonnet, the final text says so, and
#      both re-review tags are in the plan.
# Every case also asserts `finished` (the run ended in a success result) and `seats_cleared` (the
# final text prints seat lines and the last round carries no `material yes`), because headless
# accepts any nonempty valid stream.
# The material case runs a round, a backstop pass, a fix, a re-run, a push and then compound in one
# turn, so it needs more turns than the default; lib.bash reads MGE_MAX_TURNS when sourced.
# Spends tokens: run by a maintainer before a release, never in CI.
MGE_MAX_TURNS="${MGE_MAX_TURNS:-40}"
source "$(dirname "${BASH_SOURCE[0]}")/lib.bash"
need_api_key
install_from_checkout
settings="${tmp_home}/.claude/settings.json"
plan='docs/plans/2026-01-01-add-mean.md'
git_home() { HOME="${tmp_home}" git "$@"; }

# settings.json also holds the install (extraKnownMarketplaces, enabledPlugins): merge, never overwrite.
merge_settings() { jq "${1}" "${settings}" > "${settings}.new" && mv "${settings}.new" "${settings}" || fail "could not update settings.json"; }
# Every case starts from the plugin defaults, then sets what it needs.
reset_settings() { merge_settings 'del(.pluginConfigs, .availableModels)'; }

# A plan awaiting review: the python fixture with only the unit's plan, at state: draft, with the
# given escalation level written after the base line.
plan_fixture() {
  local dir level="${1}"
  dir="$(fixture python)" || exit 1
  mkdir -p "${dir}/docs/plans"
  sed 's/^state: approved/state: draft/; /^- Approve/d' "${release_dir}/fixtures/python/unit/${plan}" \
    | awk -v lvl="${level}" '{ print } /^base: main$/ { print "escalation: " lvl }' > "${dir}/${plan}"
  (cd "${dir}" && git_home add -A && git_home commit -q -m "plan") || fail "could not commit the plan"
  printf '%s\n' "${dir}"
}

# A unit to review: the python fixture's unit branch with the approved plan at `lean`, and one
# planted defect (mean divides by one too many) committed on the branch.
work_fixture() {
  local dir
  dir="$(fixture python unit)" || exit 1
  awk '{ print } /^base: main$/ { print "escalation: lean" }' "${dir}/${plan}" > "${dir}/${plan}.new" && mv "${dir}/${plan}.new" "${dir}/${plan}"
  sed 's|return sum(values) / len(values)|return sum(values) / (len(values) + 1)|' "${dir}/calc.py" > "${dir}/calc.py.new" && mv "${dir}/calc.py.new" "${dir}/calc.py"
  (cd "${dir}" && git_home add -A && git_home commit -q -m "unit: lean plan and a mean") || fail "could not commit the lean unit"
  printf '%s\n' "${dir}"
}

# Deciding seats of this fixture: code-grounded, rigor and the python correctness lens.
deciding='code-grounded rigor python-correctness'

# 1. One value moves every decider seat.
reset_settings
merge_settings '. + {"pluginConfigs":{"methodical@methodical":{"options":{"decider":"sonnet"}}}}'
d="$(plan_fixture none)" || exit 1
s="$(headless bar6-decider "${d}" "/methodical:plan-review ${plan}")" || exit 1
finished "${s}" || fail "decider: the run did not end in a success result"
seats_cleared "${s}" || fail "decider: the final text has no seat lines, or the last round carries material yes"
ev="$(events "${s}")"
for lens in ${deciding}; do
  row="$(seat_row "${ev}" "${lens}")"
  [ -n "${row}" ] || fail "decider: no ${lens} seat was launched"
  [ "${row}" = "sonnet high" ] || fail "decider: ${lens} launched on '${row}', not sonnet high"
done
bare="$(awk -F'|' '$(1) == "A" && $(4) == "" { n++ } END { print n + 0 }' <<<"${ev}")"
[ "${bare}" -eq 0 ] || fail "decider: ${bare} launch(es) named no effort"
fab="$(awk -F'|' '$(1) == "A" && tolower($(3)) ~ /fable/ { n++ } END { print n + 0 }' <<<"${ev}")"
[ "${fab}" -eq 0 ] || fail "decider: ${fab} seat(s) still launched on fable"
ok "decider=sonnet moved every decider seat to sonnet high; every launch named an effort; none on fable"

# 2. The backstop is low, a family is blocked, and the loop still runs.
reset_settings
merge_settings '. + {"availableModels":["opus","sonnet","haiku"]}'
d="$(plan_fixture full)" || exit 1
s="$(headless bar6-blocked "${d}" "/methodical:plan-review ${plan} The backstop is low." --model opus)" || exit 1
finished "${s}" || fail "blocked: the run did not end in a success result"
seats_cleared "${s}" || fail "blocked: the final text has no seat lines, or the last round carries material yes"
ev="$(events "${s}")"
text="$(texts "${s}")"
for lens in ${deciding}; do
  row="$(seat_row "${ev}" "${lens}")"
  [ "${row}" = "opus high" ] || fail "blocked: ${lens} launched on '${row:-nothing}', not opus high"
  grep -q -E "^${lens} .*re-seated" <<<"${text}" || fail "blocked: the ${lens} seat line does not say re-seated"
done
sub="$(jq -r 'select(.type=="assistant" and .parent_tool_use_id != null) | .message.model // ""' "${s}")"
[ -n "${sub}" ] || fail "blocked: no subagent lines in the stream; nothing shows which model the seats ran on"
inside="$(grep -c -i 'fable' <<<"${sub}")"
[ "${inside}" -eq 0 ] || fail "blocked: ${inside} subagent line(s) ran on the blocked family"
grep -q 'needs-backstop-re-review' "${d}/${plan}" || fail "blocked: the plan does not carry needs-backstop-re-review"
ok "backstop low: the deciding seats ran on opus high, re-seated; $(grep -c . <<<"${sub}") subagent line(s), none on fable; the plan carries the tag"

# 3. Full: the deciding review seats sit on the backstop's row; the others stay put.
reset_settings
d="$(plan_fixture full)" || exit 1
s="$(headless bar6-full "${d}" "/methodical:plan-review ${plan}")" || exit 1
finished "${s}" || fail "full: the run did not end in a success result"
seats_cleared "${s}" || fail "full: the final text has no seat lines, or the last round carries material yes"
ev="$(events "${s}")"
for lens in ${deciding}; do
  row="$(seat_row "${ev}" "${lens}")"
  [ "${row}" = "fable high" ] || fail "full: ${lens} launched on '${row:-nothing}', not fable high"
done
row="$(seat_row "${ev}" simplicity)"
[ "${row}" = "sonnet medium" ] || fail "full: the simplicity seat launched on '${row:-nothing}', not sonnet medium"
row="$(seat_row "${ev}" north-star)"
[ "${row}" = "sonnet low" ] || fail "full: the North Star seat launched on '${row:-nothing}', not sonnet low (census, in this fixture)"
ok "full: code-grounded, rigor and python-correctness on fable high; simplicity on sonnet medium; north-star on sonnet low"

# 4. Lean, with a defect: the backstop sees the final candidate, a fix follows, one push at the end.
reset_settings
d="$(work_fixture)" || exit 1
start_head="$(cd "${d}" && git_home rev-parse --short HEAD)"
s="$(headless bar6-material "${d}" "/methodical:work-review")" || exit 1
finished "${s}" || fail "material: the run did not end in a success result"
seats_cleared "${s}" || fail "material: the final text has no seat lines, or the last round carries material yes"
ev="$(events "${s}")"
back_idx=() back_eff=() back_end=() other_idx=() com_idx=() com_sha=() push_idx=()
while IFS='|' read -r kind idx a b c e; do
  case "${kind}" in
    A) if [ "${c}" = rigor ] && [ "${a}" = fable ]; then back_idx+=("${idx}") back_eff+=("${b}") back_end+=("${e}"); else other_idx+=("${idx}"); fi ;;
    C) com_idx+=("${idx}") com_sha+=("${a}") ;;
    P) push_idx+=("${idx}") ;;
  esac
done <<<"${ev}"
nb="${#back_idx[@]}" nc="${#com_idx[@]}"
[ "${nb}" -ge 1 ] || fail "material: no backstop launch (the rigor lens on fable)"
for e in "${back_eff[@]}"; do [ "${e}" = high ] || fail "material: a backstop launch ran at '${e}', not high"; done
[ "${nc}" -ge 1 ] || fail "material: no fix commit follows the defect"
# The first backstop launch comes after the round's last commit, and its seat line names that commit.
first_b="${back_idx[0]}" cand="${start_head}"
for k in "${!com_idx[@]}"; do [ "${com_idx[$k]}" -lt "${first_b}" ] && cand="${com_sha[$k]}"; done
shas=()
while IFS= read -r line; do shas+=("${line}"); done < <(texts "${s}" | grep 'rigor (backstop)' | grep -o '@[0-9a-f]\{7,40\}' | tr -d @)
ns="${#shas[@]}"
[ "${ns}" -ge 1 ] || fail "material: no backstop seat line names a candidate commit"
sha_match "${shas[0]}" "${cand}" || fail "material: the first backstop seat line names '${shas[0]}', not the round's last commit '${cand}'"
# The reviewed final candidate is the last commit made before the last backstop pass; it must exist, the
# pass must name it, and its range must hold it. A commit after the push (compound's write-up) is not
# part of the review; a commit between the last pass and the push is (checked below).
last_b="${back_idx[nb-1]}" last_c="" last_sha=""
for k in "${!com_idx[@]}"; do [ "${com_idx[$k]}" -lt "${last_b}" ] && { last_c="${com_idx[$k]}"; last_sha="${com_sha[$k]}"; }; done
[ -n "${last_c}" ] || fail "material: no commit precedes the last backstop pass, so there is no fix commit it could have reviewed"
sha_match "${shas[ns-1]}" "${last_sha}" || fail "material: the last backstop seat line names '${shas[ns-1]}', not the final commit '${last_sha}'"
end="${back_end[nb-1]}"
[ "${end}" = HEAD ] || sha_match "${end}" "${last_sha}" || fail "material: the last backstop range ends at '${end}', which does not hold the fix commit"
# The touched seats re-ran after the fix.
again=0
for i in ${other_idx[@]+"${other_idx[@]}"}; do [ "${i}" -gt "${last_c}" ] && again=1; done
[ "${again}" -eq 1 ] || fail "material: no seat other than the backstop re-ran after the fix commit"
# One push, after the last backstop launch.
[ "${#push_idx[@]}" -eq 1 ] || fail "material: ${#push_idx[@]} push(es), expected exactly one"
[ "${push_idx[0]}" -gt "${last_b}" ] || fail "material: the push came before the last backstop launch"
for k in "${!com_idx[@]}"; do
  if [ "${com_idx[$k]}" -gt "${last_b}" ] && [ "${com_idx[$k]}" -lt "${push_idx[0]}" ]; then
    fail "material: a commit landed after the last backstop pass and before the push, so the pushed candidate was not reviewed"
  fi
done
# Whoever found it, the defect is gone.
if grep -q 'len(values) + 1' "${d}/calc.py"; then fail "material: the planted defect is still in calc.py"; fi
# The fix must be in what was committed and pushed, not only in the working tree. The stub applies
# recorded Write and Edit tool uses but runs no git, so this is checked on live runs only.
if [ -z "${MGE_CLAUDE_BIN:-}" ]; then
  # Compound runs in the same turn and may commit its write-up after the push, so the pushed commit
  # is the reviewed candidate, not necessarily HEAD: it must be an ancestor of HEAD, carry the fix,
  # and be the last commit the backstop reviewed.
  pushed="$(git_home -C "${d}.remote.git" rev-parse --verify -q unit)" || fail "material: nothing was pushed to the fixture's remote"
  git_home -C "${d}" merge-base --is-ancestor "${pushed}" HEAD || fail "material: the pushed commit is not an ancestor of HEAD"
  grep -q 'len(values) + 1' <<<"$(git_home -C "${d}.remote.git" show "${pushed}:calc.py")" && fail "material: the pushed branch still carries the planted defect"
  grep -q 'len(values) + 1' <<<"$(git_home -C "${d}" show HEAD:calc.py)" && fail "material: HEAD still carries the planted defect"
  [ -z "${last_sha}" ] || sha_match "${pushed}" "${last_sha}" || fail "material: the pushed commit ${pushed} is not the final reviewed candidate ${last_sha}"
fi
ok "lean: ${nb} backstop pass(es) on fable high, the last on the final candidate ${last_sha}; the fix followed; one push at the end; the defect is gone"

# 5. Exhausted: the duplicate is skipped, nothing is left, and the orchestrator sits the seats.
reset_settings
merge_settings '. + {"pluginConfigs":{"methodical@methodical":{"options":{"decider":"opus","backstop":"opus"}}}}'
d="$(plan_fixture full)" || exit 1
s="$(headless bar6-exhausted "${d}" "/methodical:plan-review ${plan} Opus and Sonnet are unavailable.")" || exit 1
finished "${s}" || fail "exhausted: the run did not end in a success result"
seats_cleared "${s}" || fail "exhausted: the final text has no seat lines, or the last round carries material yes"
ev="$(events "${s}")"
# Every row holds opus or sonnet here (backstop and decider on opus, worker and census on sonnet),
# so with both unavailable no seat has a row left to launch on: any Agent launch is a retry.
used="$(awk -F'|' '$(1) == "A" { n++ } END { print n + 0 }' <<<"${ev}")"
[ "${used}" -eq 0 ] || fail "exhausted: ${used} launch(es) after the user said opus and sonnet were unavailable"
grep -q -i -E 'orchestrator.*(opus|sonnet|fable|haiku)|(opus|sonnet|fable|haiku).*orchestrator' <<<"$(texts "${s}")" \
  || fail "exhausted: the final text does not say the orchestrator sat the seats and name its model"
for tag in needs-backstop-re-review needs-decider-re-review; do
  grep -q "${tag}" "${d}/${plan}" || fail "exhausted: the plan does not carry ${tag}"
done
ok "exhausted: no launch on opus or sonnet; the orchestrator sat the seats and said so; both re-review tags are in the plan"

echo "PASS bar6: one value moved every decider seat; full and lean escalated; the backstop saw the final candidate; blocked and exhausted models were walked, not retried"
