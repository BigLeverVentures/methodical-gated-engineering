#!/usr/bin/env bash
set -euo pipefail
core="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compiler="${core}/node_modules/typescript/lib/tsc.js"
[ -f "${compiler}" ] || { echo 'Run npm ci --prefix packages/methodical-core --ignore-scripts first.' >&2; exit 2; }
build="$(mktemp -d)"
trap 'rm -rf "${build}"' EXIT
node "${compiler}" --project "${core}/tsconfig.json" --outDir "${build}"
printf '%s\n' '{"type":"module"}' > "${build}/package.json"
mkdir -p "${build}/packages/methodical-core"
cp -R "${core}/profiles" "${build}/packages/methodical-core/profiles"
export METHODICAL_SOURCE="${core}"
if [ "$#" -eq 0 ]; then
  node --test "${build}"/packages/methodical-core/tests/*.test.js
else
  selected=()
  for name in "$@"; do
    [[ "$name" =~ ^[a-z][a-z-]*$ ]] || exit 2
    selected+=("${build}/packages/methodical-core/tests/${name}.test.js")
  done
  node --test "${selected[@]}"
fi
