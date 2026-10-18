# Where the user's words go

Before any step first writes the user's own words (a ruling, a brainstorm's problem statement) into
a file, look for this ruling in `docs/rulings.md` or `docs/private/rulings.md`. If there is none,
say that such records would be committed and published with the next push, and ask once with the native structured-question tool: tracked in
`docs/`, or private in `docs/private/`? For private, add `docs/private/` to `.gitignore`. Record the
answer verbatim as a ruling in that place's `rulings.md`, and honor it from then on: with private,
`resume.md`, `brainstorms/` and every ruling live under `docs/private/`, and a plan's Rulings
section points there. Why: a shared repo publishes whatever is committed, and the user's words are
theirs to publish.
