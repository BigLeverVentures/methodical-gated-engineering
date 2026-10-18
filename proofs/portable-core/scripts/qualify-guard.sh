#!/usr/bin/env bash
set -euo pipefail
proof_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
build="$(mktemp -d)"
trap 'rm -rf "${build}"' EXIT
"${proof_root}/node_modules/.bin/tsc" --project "${proof_root}/tsconfig.json" --outDir "${build}"
printf '%s\n' '{"type":"module"}' > "${build}/package.json"
export PROOF_SOURCE="${proof_root}"
node --test "${build}"/tests/guard-*.test.js
# Synthetic loopback/ledger tests only: no native installation, OS setup or provider qualification.
