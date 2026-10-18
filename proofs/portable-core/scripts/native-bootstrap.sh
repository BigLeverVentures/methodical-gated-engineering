#!/usr/bin/env bash
set -euo pipefail
proof_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[ "${#}" = 1 ] && [ "${1}" = --describe ] || {
  [ "${#}" = 3 ] && [ "${1}" = --preflight ] || {
    echo 'Use --describe or --preflight FROZEN_MANIFEST EXCLUSIVE_PRIVATE_OUTPUT. Native launch is unavailable.' >&2
    exit 2
  }
}
compiler="${proof_root}/node_modules/.bin/tsc"
[ -x "${compiler}" ] || { echo 'Install the proof development dependencies first.' >&2; exit 2; }
build="$(mktemp -d)"
trap 'rm -rf "${build}"' EXIT
"${compiler}" --project "${proof_root}/tsconfig.json" --outDir "${build}"
printf '%s\n' '{"type":"module"}' > "${build}/package.json"
export PROOF_SOURCE="${proof_root}"
# Replace the shell so cancellation reaches the supervised Node runner directly.
# The wrapper owns this newly allocated build directory and joins main before removing it.
exec node --input-type=module -e '
  const fs=await import("node:fs");const {pathToFileURL}=await import("node:url");
  const entry=process.argv[1],build=process.argv[2];process.argv.splice(1,2,entry);
  try{await import(pathToFileURL(entry).href);}finally{fs.rmSync(build,{recursive:true});}
' "${build}/bootstrap/main.js" "${build}" "${@}"
