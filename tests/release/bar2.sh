#!/usr/bin/env bash
# Bar 2 release check: on Swift, Python and TypeScript repos a review launches that language's
# reviewer and never another language's. Runs /methodical:work-review headless on each fixture's
# unit branch and reads the Agent launches: at least one prompt names lenses/<stack>-correctness.md;
# none names another stack's lens; every launch is general-purpose with a model given.
# Spends tokens: run by a maintainer before a release, never in CI.
source "$(dirname "${BASH_SOURCE[0]}")/lib.bash"
need_api_key
install_from_checkout

all=(swift python typescript)
for pair in swift:swift python:python ts:typescript; do
  fx="${pair%%:*}"; stack="${pair#*:}"
  dir="$(fixture "${fx}" unit)" || exit 1
  s="$(headless "bar2-${fx}" "${dir}" '/methodical:work-review')" || exit 1
  launches="$(agent_launches "${s}")"
  [ -n "${launches}" ] || fail "${fx}: no reviewer was launched"
  own="$(jq -r --arg l "lenses/${stack}-correctness.md" 'select(.input.prompt | contains($l)) | .id' <<<"${launches}" | wc -l | xargs)"
  [ "${own}" -ge 1 ] || fail "${fx}: no launch names lenses/${stack}-correctness.md"
  for other in "${all[@]}"; do
    [ "${other}" = "${stack}" ] && continue
    n="$(jq -r --arg l "lenses/${other}-correctness.md" 'select(.input.prompt | contains($l)) | .id' <<<"${launches}" | wc -l | xargs)"
    [ "${n}" -eq 0 ] || fail "${fx}: ${n} launch(es) name lenses/${other}-correctness.md"
  done
  bad="$(jq -r 'select(.input.subagent_type != "general-purpose" or ((.input.model // "") == "")) | .id' <<<"${launches}" | wc -l | xargs)"
  [ "${bad}" -eq 0 ] || fail "${fx}: ${bad} launch(es) not general-purpose or with no model"
  ok "${fx}: ${own} ${stack} seat(s), no other stack's lens, every launch general-purpose with a model"
done

echo "PASS bar2: swift, python and ts each launched only their own stack's reviewer"
