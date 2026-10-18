# Narrow checks

Read by `work` and by `compound` for its checkpoint commit, before a commit. The default is all of the
project's tests. A repository may narrow the run for one commit only as this file says; `work-review` never
reads it, and neither does a merge. Why: only the repository knows which tests read which
paths, and a narrower run Claude chose for itself is how a break reaches a commit unchecked.

A repository narrows a run with lines in its root `CLAUDE.md`, one per path family, in this form:

```text
narrow-check: <path prefix> — <command>
```

Follow these in order:

1. **Stage first.** Stage the commit's files, then commit with a plain `git commit`: no `-a`, no pathspec, no
   amend that brings in other changes. Why: the paths you test must be the paths that are committed.
2. **List the paths** with `git diff --cached --raw --no-renames`. An empty list runs all of the project's
   tests. A path with mode `160000` (a gitlink), on either side, counts as unmatched. Why: `--name-only`
   lists only the new path of a move out of a listed folder and shows no mode; `--no-renames` lists both
   sides.
3. **Read the lines** from the root `CLAUDE.md` two ways, `git show HEAD:CLAUDE.md` and the working-tree file,
   each filtered by `grep -E '^[[:space:]>*-]*(\*\*)?narrow-check: [^ ]+ — .+$'`. Read the lines they
   print, not the exit status. A line counts only if both print it, with the same text (ignore a trailing
   carriage return). A line that does not
   match (a hyphen for the dash, no command) is prose, and so is a `narrow-check:` line in any other file (a
   nested, local or global instructions file). A copy inside a code fence matches, so a repository never
   leaves the example in one. No file at `HEAD` means no lines. Why: `HEAD` keeps out a line typed a moment
   ago, and the working tree lets the user withdraw a line without committing.
4. **Check each prefix.** A prefix must end in `/` (a directory) or equal a file path in the index exactly; a line
   with any other prefix, or a prefix written in backticks, is prose. A path matches a prefix ending in `/` by
   starting with it, and an exact-file prefix only by equality.
5. **A commit that stages `CLAUDE.md` runs all of the project's tests.** Why: the commit could be adding the
   line it would then use.
6. **Match every path.** If every path matches some line's prefix, print each path beside the lines it
   matched, then run the command of every line any path matched, from the repository root. Otherwise (one path unmatched, a commit that
   mixes listed and unlisted paths, no line, any doubt) run all of the project's tests.
7. **Only the user writes a `narrow-check:` line.** Never add, edit or infer one. A command that exits
   non-zero is a red test: fix it, do not skip it. Why: a line Claude wrote would be Claude choosing the
   narrower run.
