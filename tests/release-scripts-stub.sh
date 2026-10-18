#!/usr/bin/env bash
# The release checks themselves are checked, for free: each tests/release/bar*.sh runs end to end
# with `claude` replaced by tests/release/stub/claude. A script must pass on the passing streams,
# fail when any one of its cases gets its failing stream, and fail on an empty stream or one in
# which nothing happened, so no
# check can pass vacuously or pass a known-bad run. The real runs spend tokens and are made by hand before a release;
# this proves only that the scripts' assertions bite.
set -uo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
rel="${repo}/tests/release"
export MGE_CLAUDE_BIN="${rel}/stub/claude"
unset ANTHROPIC_API_KEY GH_TOKEN

status=0
expect() { # want(pass|fail) label script [env...]
  local want="${1}" label="${2}" script="${3}" out code
  shift 3
  out="$(env "$@" bash "${rel}/${script}.sh" 2>&1)"; code=$?
  if [ "${want}" = pass ] && [ "${code}" -eq 0 ]; then echo "ok   ${label}: passes"
  elif [ "${want}" = fail ] && [ "${code}" -ne 0 ] && grep -q "^FAIL ${script}: " <<<"${out}"; then
    echo "ok   ${label}: fails ($(grep -m1 "^FAIL ${script}: " <<<"${out}" | sed "s/^FAIL ${script}: //"))"
  else
    echo "FAIL release-scripts-stub: ${label} should ${want}, exit ${code}"; printf '%s\n' "${out}" | sed 's/^/     /'; status=1
  fi
}

cases() {
  case "${1}" in
    bar1) echo bar1-python bar1-python-offers-skip bar1-python-no-question bar1-python-stray bar1-no-north-star ;;
    bar2) echo bar2-swift bar2-python bar2-ts ;;
    bar6) echo bar6-decider bar6-blocked bar6-exhausted bar6-full-error bar6-full-unresolved bar6-material-error bar6-material-unresolved bar6-material-latecommit ;;
    classify) echo classify-3-level classify-4-level classify-trigger-evidence classify-revise-stale ;;
    bar5-github) echo bar5-github ;;
  esac
}

# The stub picks a fail stream on `<case>-*`, so a case whose name is a prefix of another case's
# would have its fail variant chosen by the other. Every case has a pass stream, so the pass
# streams' names are the case names.
names="$(cd "${rel}/stub/streams/pass" && ls ./*.jsonl | sed -e 's|^\./||' -e 's|[.]jsonl$||')"
for a in ${names}; do
  for b in ${names}; do
    [ "${a}" = "${b}" ] && continue
    if [[ "${b}" == "${a}"-* ]]; then
      echo "FAIL release-scripts-stub: case '${a}' is a prefix of case '${b}'"; status=1
    fi
  done
done

for script in bar1 bar2 bar6 classify bar5-github; do
  expect pass "${script} on passing streams" "${script}"
  for c in $(cases "${script}"); do
    expect fail "${script} with ${c} failing" "${script}" MGE_RUNS=1 MGE_STUB_FAIL="${c}"
  done
  if [ "${script}" != bar5-github ]; then
    expect fail "${script} on empty streams" "${script}" MGE_RUNS=1 MGE_STUB_EMPTY=1
    expect fail "${script} on do-nothing streams" "${script}" MGE_RUNS=1 MGE_STUB_BARE=1
  fi
done

# A replayed Write outside the working directory is refused: bar1-python-stray above must fail, and
# the path it names must not exist.
out="$(env MGE_RUNS=1 MGE_STUB_FAIL=bar1-python-stray bash "${rel}/bar1.sh" 2>&1)"
grep -q 'bar1-python: empty stream' <<<"${out}" \
  || { echo "FAIL release-scripts-stub: the stray write did not make the stub fail the run"; status=1; }
if [ -e /tmp/mge-stray-should-not-exist ]; then
  echo "FAIL release-scripts-stub: the stub wrote outside the working directory"; rm -f /tmp/mge-stray-should-not-exist; status=1
fi

if [ "${status}" -eq 0 ]; then echo "PASS release-scripts-stub"; else echo "FAIL release-scripts-stub"; exit 1; fi
