#!/usr/bin/env bash
set -euo pipefail
proof_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compiler="${proof_root}/node_modules/.bin/tsc"
[ -x "${compiler}" ] || { echo 'Run npm ci --prefix proofs/portable-core --ignore-scripts first.' >&2; exit 2; }
build="$(mktemp -d)"
trap 'rm -rf "${build}"' EXIT
"${compiler}" --project "${proof_root}/tsconfig.json" --outDir "${build}"
printf '%s\n' '{"type":"module"}' > "${build}/package.json"
export PROOF_SOURCE="${proof_root}"
node --test "${build}"/tests/*.test.js
