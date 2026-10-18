# Minimal production-adapter example

Build the candidate first, then prepare a read-only review in a new directory:

```bash
node examples/prepare-review.mjs codex ./review-example --approve-preparation
```

Use `claude-code` for the other adapter. This creates an ordinary Git project, explicitly approves only synthetic preparation, imports the installed canonical support and prepares an intent. It never installs a plugin or invokes a model. Existing directories are refused.

After native qualification and normal installation/trust, open that project in the supported client. Authorize the read-only review and give its native Agent tool the returned marker as `message` (Codex) or `prompt` (Claude). The native hook supplies the exact brief and policy setting. Inspect `dispatch-status` with the installed runtime and corroborate the actual native receipt. A prepared intent alone is not automatic routing evidence.

Removing the plugin preserves `.methodical/` and the project. Keep these work records private. See `docs/platform-support.md` before relying on a candidate capability.
