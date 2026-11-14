# Set up a repository

The [platform support matrix](platform-support.md) is the authority for production qualification. The commands below describe the candidate installation route; use only the route and evidence scope recorded there. Native packages need Node.js >=22.13.

Pin a reviewed candidate commit in a local checkout, install through its native marketplace, accept normal trust prompts and start a fresh session. The public marketplace's default branch may contain another version. Record the installed commit and package inventory; a displayed version alone does not establish byte identity. Updates and rollback use the same marketplace route with the intended commit. Preserve project records and private checkpoint evidence before changing runtime versions. Recheck activation in a fresh session; open sessions may retain their previous configuration.

For a pinned Claude candidate, add that local checkout with `claude plugin marketplace add .`, then install `methodical@methodical`. The public/default-branch Claude route is documented separately below and in the README.

## Codex repository marketplace

From a checkout containing the production candidate:

```bash
codex plugin marketplace add .
codex plugin add methodical@methodical-codex
```

The `.agents/plugins/marketplace.json` catalog selects the Codex package explicitly; the Claude marketplace keeps its own identity. Accept the normal plugin-hook and project trust prompts. Start a fresh fixture chat to check activation; do not close other work or assume an open chat hot-reloads a new package. Runtime installation does not edit instruction files or global trust settings.

To remove the integration:

```bash
codex plugin remove methodical@methodical-codex
```

Your project records and checkpoint evidence remain. Start a fresh session after removal to check that the integration is inactive; open sessions may retain the loaded package. Remove only the intended marketplace/plugin entry and preserve unrelated settings. See the native overlay for the exact supported CLI protocol and suspended native-child contract.

## Build and inspect the candidate

```bash
npm ci --prefix packages/methodical-core --ignore-scripts --no-audit --no-fund
node packages/methodical-core/scripts/build.mjs
bash tests/production-adapters.sh
```

Edit the common method under `packages/methodical-core/method/`, runtime under its `src/`, and host integration under `adapters/`. Generated native packages and the portable instructional package carry source hashes and file inventories. The build check catches source/output drift; it is not a live native qualification. Pin a reviewed Git commit when trying a candidate. To roll back, install your previously verified commit through the same marketplace route, start a fresh session and inspect its inventory. Preserve project records before changing runtime versions.

## Preparing routed work

After an actual human approval, the parent records that ruling in project-local metadata, resolves the host profile and prepares the runtime input. The approval record binds the unit, plan, scope, profile, policy limits and allowed operations. It is a cooperative record, not authenticated proof of who approved. The runtime can return an approval template and hashes; it never manufactures the human ruling. No person needs to hand-calculate hashes.

Explicit preparation copies only the installed method and selected lenses to bounded project-local support records. Startup does not initialize repositories or rewrite settings. Add `.methodical/` to your project's `.gitignore` before preparing routed work. Keep this metadata private and untracked; include declared support records and routing state in checkpoints before moving hosts.



## Claude Code installation and project setup

The README gives the two install commands for the public/default-branch Claude marketplace route. Candidate users follow the pinned-checkout instructions above. This page covers what comes after installation: the files the
loop writes into your repository, how to check the plugin is the one you meant and is loaded in a
session, installing for a team, and the places Methodical does not run.

### What the loop writes

None of these is needed up front. Each appears when its step first needs it, and each stays in your
repository if you uninstall the plugin.

| File | Written by | Holds |
|---|---|---|
| `docs/north-star.md` | `north-star`, written with you | The project's goal, and the bar each unit is judged against |
| `docs/brainstorms/` | `brainstorm` | One file per unit: the problem in your words, who it serves, the options |
| `docs/plans/` | `plan` | One plan per unit, with its state (`draft`, `reviewed`, `approved`) |
| `docs/solutions/README.md` | `compound` | The index of the solution write-ups beside it |
| `docs/resume.md` | `compact`, `compound` | Where the work stands, the next action, and every ruling in force, verbatim |
| `docs/rulings.md` | the first time your words are recorded | Your rulings, verbatim |
| `docs/device-verification-queue.md` | `work`, when a check needs hardware or a time not yet come | Checks still owed, each with its exact protocol |
| `.claude/reviewer-roster.md` | you, and optional | Extra reviewers for your repository (see the README) |

**A North Star that already lives elsewhere.** The North Star is a project's own guide, so an adopting project often
has one already, for example `docs/standards/north-star.md`. The skills read `docs/north-star.md` and do not follow a
link inside it, so a bare pointer would be read as the North Star itself. Put the goal's summary in that file and link
the full text:

```markdown
# North Star

<Two or three lines: who the project serves, what they receive, and the bar.>

The full text is in [docs/standards/north-star.md](standards/north-star.md).
```

**Tracked or private.** Before Methodical first writes your own words into a file, it asks whether
they go in tracked `docs/` or in `docs/private/`. If you choose private, it adds `docs/private/` to
`.gitignore`, and `resume.md`, `brainstorms/` and every ruling live there instead.

**The roster and `.gitignore`.** Many repositories ignore `.claude/*`. Git then never commits
`.claude/reviewer-roster.md` unless a later line re-includes it:

```text
.claude/*
!.claude/reviewer-roster.md
```

This is how git works, not Claude Code. The re-include works for `.claude/*` but not for a line that
ignores the `.claude/` directory itself, because git does not look inside an ignored directory.

### Check that it is installed and loaded

1. **Is the installed copy the one you meant?** Refresh the marketplace, then list the plugin:

   ```bash
   claude plugin marketplace update methodical
   ```

   ```bash
   claude plugin list
   ```

   It prints `methodical@methodical` with its `Version`, `Scope` and `Status`. The version can stay
   the same across commits, so it is not enough. Read `gitCommitSha` for `methodical@methodical` in
   `~/.claude/plugins/installed_plugins.json` and compare it with the newest commit on `main` of the
   marketplace repository (not a working copy of it: a local checkout may sit on an unmerged
   branch; `claude plugin marketplace list` shows the source). The marketplace follows `main` unless it was added with a `#ref`, so a branch that is
   not merged to `main` cannot be installed from it. If the installed commit is behind:

   ```bash
   claude plugin update methodical@methodical
   ```

   If that prints "already at the latest version" while the commit is behind, the commit did not
   change the plugin's `version`, and Claude Code keeps the cached copy. Remove it and reinstall:
   `claude plugin uninstall methodical@methodical`, then `rm -rf ~/.claude/plugins/cache/methodical`
   (this deletes the cached copies of plugins from the methodical marketplace), then
   `claude plugin marketplace update methodical`, then `claude plugin install methodical@methodical`.
   Reinstalling can reset your `/config` options for the plugin, so check them afterwards.

   A session keeps what it loaded when it started. One started after the installed commit last
   changed is current; one opened before still runs the old copy. Start a new session for the check
   in step 3. `/reload-plugins` loads an install into an open session, but a reload is not verified
   to refresh the rules; see step 2.

2. **Installed during the session?** A plugin installed from your shell loads at the next start, or
   when you run `/reload-plugins` in a session that is already open. For the check in step 3, start
   a new session: the rules reach Claude through a session-start hook, and we have not verified
   that a reload runs it again.

3. **Is it loaded in this session?** Type:

   ```text
   /methodical:rules
   ```

   You get the always-on rules and the routing table the session-start hook supplied. That is the
   check: the rules and a `## Routing (` table mean the plugin is installed and its hook ran. If the
   table is missing, the command says so and prints default values instead (hooks disabled, or a
   `--bare` session): the plugin is installed but the hook did not supply the rules, so do not
   read the defaults as a pass. The command shows no version; step 1 does.

   Only you can type it. A model cannot run `/methodical:rules` on its own, and its description of
   its own context is a self-report, not a check.

### Which checks run before a commit

Methodical's `work` step runs all of your project's tests before every commit, and `work-review` runs all of them
again before any reviewer sits. Your repository defines what those tests are; Methodical does not. A commit can run a
cheaper check only when your repository says so, in one fixed form: a line in your root `CLAUDE.md`,

```text
narrow-check: <path prefix> — <command>
```

written on its own line, without backticks, with the em dash (a hyphen makes it plain prose, and prose is ignored).
Only you write these lines; Claude never adds, edits or infers one, and a commit that edits `CLAUDE.md` runs
everything. Lines in any other instructions file (nested, local or global) are ignored.

**What Claude does.** It stages the commit's files, lists the paths with `git diff --cached --raw --no-renames`, and
reads the lines from the root `CLAUDE.md` both as committed and as it stands in your working tree, and counts a line
only if both show it. That keeps out a line typed a moment ago and lets you withdraw one by deleting it, committed or
not. If **every** path starts with a listed prefix (a prefix ending in `/`
is a folder; any other prefix must be one exact tracked file), it prints each path beside the line it matched and runs
the command of every line any path matched, from the repository root. Anything else runs all of your tests: one path
unlisted, a commit mixing listed and unlisted paths, an empty stage, a submodule, no line, any doubt. The review never
narrows, and neither do its fix commits. Before any merge, Claude runs all of your tests on the branch's HEAD unless it already
ran all of them on that exact commit in the session.

**Write the list as an allowlist.** Name only the few folders or files the workflow produces and no test reads (for
example briefs, solution write-ups, the resume point); everything else gets the full run. A list of exceptions cannot
be completed, because no one holds every test's reads as a list: reviewers of such a rule kept finding a path a test
reads that the cheap check did not. An allowlist errs only toward more testing. Then:

1. **Name the commands exactly,** and make each exit non-zero when it fails. A command that always succeeds
   (`true`) turns the line into permission to skip.
2. **Search before you list a prefix.** Search the whole repository, not only `tests/`: run `grep -rn '<prefix>' .`,
   and look at tests that live beside the source, CI steps, Makefile targets and pre-commit configs, and for any test
   or linter that walks every file, or every tracked file of one type, with a glob that never contains your prefix.
   Such a check belongs in every narrow command. A broad prefix such as `docs/` is unsafe if any test reads a file
   under it.
3. **Keep CI as the backstop.** Narrowing is for repositories whose CI runs everything on every push, with no path
   filter (`paths-ignore`) over the listed prefixes. Wait for green CI on the pushed commit before you merge. The
   merge-grant example in the README says `when CI is green on the pushed commit` for that reason.
4. **Know what it does not catch.** A new test that starts reading a listed path is not caught locally; CI catches
   it. If you skip the review, the merge still starts with a full local run of everything, and CI is the second.
5. **Do not leave the example in a code block** in your `CLAUDE.md`: a copy inside a code fence is read as a live line.

Example lines for a repository that keeps briefs and solutions where no test reads them:

```text
narrow-check: docs/briefs/ — make docs-check
narrow-check: docs/solutions/ — make docs-check
```

(Write them in your `CLAUDE.md` on their own lines, not inside a code block.)

### For a team

Committing `enabledPlugins` to `.claude/settings.json` turns the plugin on for a repository, but
Claude Code does not download it onto a collaborator's machine. Each collaborator runs, once:

```bash
claude plugin marketplace add BigLeverVentures/methodical-gated-engineering
claude plugin install methodical@methodical --scope project
```

A plugin that a repository enables loads only after the collaborator accepts the workspace trust
dialog for that folder. Then step 3 above confirms it.

**From a private copy.** If your team installs from a private mirror or fork, Claude Code clones it
with the git credentials already on the machine and never prompts for them. With HTTPS, a credential
helper (`gh auth login` works) must already hold access; with SSH, the host must already be in
`known_hosts` and the key must work without a passphrase prompt. A host the machine has never
authenticated to fails instead of asking.

### Cloud sessions do not run Methodical

A Claude Code cloud session (claude.ai/code, the mobile app, or `claude --cloud`) starts from a
fresh clone of your repository. Claude Code's documentation says a cloud session does not install
plugins that your repository turns on, nor plugins installed on your own machine. Your repository's
`CLAUDE.md` and `.claude/` files do carry over; the plugin does not.

So in a cloud session Claude has your plans, solutions and rulings as ordinary files, but not
the always-on rules, the step skills, the routing table or the gates. Nothing in the plugin stops
it from building without a plan or merging without asking. Do not assume you have Methodical
everywhere; you do not.

Claude Code's documentation says this. We have not tested it, and we have not tested the options
below; they are queued for a live check.

**Your options**

1. **Run the loop where the plugin loads, and use the cloud for the build.** Take the work through
   brainstorm, plan, plan review and your approval in a local session. Commit and push the approved
   plan, then start the cloud session on it:

   ```bash
   claude --cloud "Build docs/plans/<the approved plan>. Stop before merging."
   ```

   When it finishes, pull the branch into a local session and run `/methodical:work-review` before
   you merge. The gates stay in the local steps: the plan, its review and your approval before the
   build, the review and the merge after. "Stop before merging" is only an instruction in the
   prompt, not a gate. A cloud build also skips the `work` step itself (its branch rule, its
   tests-before-review step, its owed-verification entry), and if you chose private records,
   `docs/private/` is gitignored, so the rulings the plan cites do not reach the cloud.

2. **Put a stopgap line in `CLAUDE.md`.** A cloud session reads your repository's `CLAUDE.md`. A line
   such as this tells Claude what is missing instead of letting it carry on as if the loop ran:

   ```text
   If your context has no "## Routing (" table and you have no methodical:plan skill, Methodical is
   not loaded in this session. Say so, and ask me before changing any file.
   ```

   Use "change no file" instead of "ask me before changing any file" for a stricter line. The line
   applies only when Methodical is missing; it is not a rule for sessions that have it. It is a
   best-effort instruction: it relies on Claude reading its own context correctly, and it does not
   run the loop.

3. **Use the cloud only for work that does not need the gates.** Read-only investigation, or a small
   fix you review yourself in the pull request, loses nothing. Keep anything that changes a contract
   or needs a ruling in a local session.

Methodical does not offer copying its skills and rules into your repository's own `.claude/`
directory, which cloud sessions do load: the copy would drift from the installed plugin, and nobody
has tested it.

### If your repository checks front matter

A plan's front matter carries `state:`, which the plugin sets to `draft`, then `reviewed`, then
`approved` (only on your yes). If your repository has its own tooling that validates a `state:`
field in front matter, add those three values to what it accepts, or it rejects the plan files.
