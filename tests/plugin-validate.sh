#!/usr/bin/env bash
# Gate: the plugin and the marketplace root pass Claude Code's own validator with warnings
# treated as errors. It checks manifests, hooks.json, commands and skills; it does not check
# model values (the userConfig enum does that); the check below pins the four role options the hook
# reads (decider, worker, census, backstop), their enums and their defaults, and the two options the
# compaction mod reads (nudgePercent, nudgeReserve, offer).
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
status=0
for target in plugins/methodical .; do
  if claude plugin validate --strict "${repo}/${target}"; then
    echo "PASS plugin-validate: ${target}"
  else
    echo "FAIL plugin-validate: ${target}"
    status=1
  fi
done
manifest="${repo}/plugins/methodical/.claude-plugin/plugin.json"
if jq -e '([.userConfig.backstop, .userConfig.decider, .userConfig.worker, .userConfig.census]
         | all(.options == ["fable","opus","sonnet","haiku"]))
    and .userConfig.decider.default == "opus" and .userConfig.worker.default == "sonnet"
    and .userConfig.census.default == "sonnet" and .userConfig.backstop.default == "fable"
    and (.userConfig | keys | sort) == ["backstop","census","decider","nudgePercent","nudgeReserve","offer","worker"]
    and .userConfig.nudgeReserve.type == "number" and .userConfig.nudgeReserve.default == 120000
    and .userConfig.nudgePercent.type == "number" and .userConfig.nudgePercent.default == 45
    and .userConfig.offer.options == ["on","off"] and .userConfig.offer.default == "on"' "${manifest}" >/dev/null; then
  echo "PASS plugin-validate: userConfig roles and mod options"
else
  echo "FAIL plugin-validate: userConfig must hold exactly the four role enums with the base defaults, plus nudgePercent, nudgeReserve and offer"
  status=1
fi
exit "${status}"
