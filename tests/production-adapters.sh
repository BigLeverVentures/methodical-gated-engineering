#!/usr/bin/env bash
set -euo pipefail
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bash "${repo}/packages/methodical-core/scripts/check.sh"
node "${repo}/packages/methodical-core/scripts/build.mjs" --check
