#!/usr/bin/env bash
set -euo pipefail
proof_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[ "${#}" = 1 ] || { echo 'Usage: package.sh EMPTY_OUTPUT_DIRECTORY' >&2; exit 2; }
build="$(mktemp -d)"
trap 'rm -rf "${build}"' EXIT
"${proof_root}/node_modules/.bin/tsc" --project "${proof_root}/tsconfig.json" --outDir "${build}"
printf '%s\n' '{"type":"module"}' > "${build}/package.json"
PROOF_SOURCE="${proof_root}" node "${build}/scripts/build-package.js" "${1}"
