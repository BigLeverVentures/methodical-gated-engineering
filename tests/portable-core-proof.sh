#!/usr/bin/env bash
set -euo pipefail
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bash "${repo}/proofs/portable-core/scripts/run-local.sh"
