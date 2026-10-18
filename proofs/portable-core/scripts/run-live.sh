#!/usr/bin/env bash
set -euo pipefail
[ "${#}" = 5 ] || { echo 'Usage: run-live.sh BATCH APPROVAL CAPABILITIES TRUSTED_SOURCES OPERATOR_GUARD_CONNECTION' >&2; exit 2; }
proof_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
build="$(mktemp -d)"
trap 'rm -rf "${build}"' EXIT
"${proof_root}/node_modules/.bin/tsc" --project "${proof_root}/tsconfig.json" --outDir "${build}"
printf '%s\n' '{"type":"module"}' > "${build}/package.json"
node "${build}/scripts/live.js" "${@}"
