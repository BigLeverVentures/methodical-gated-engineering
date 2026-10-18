#!/usr/bin/env bash
set -euo pipefail
[ "${#}" = 1 ] && [ "${1}" = --describe ] || {
  echo 'Native protected setup is not provisioned. Use --describe for the owed protocol; native-bootstrap.sh offers zero-provider staged preflight only.' >&2
  exit 2
}
cat <<'JSON'
{"state":"not-provisioned","liveBudgetUsd":0,"protocol":"docs/device-verification-queue.md#reservation-guard--native-protected-setup-owed","launchSupported":false}
JSON
