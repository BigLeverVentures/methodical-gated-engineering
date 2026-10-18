# Contributing to Methodical Adaptive Gated Engineering

This repo is built with its own loop: brainstorm → North Star → plan → deepen → plan review →
work → work review → compound → compact. Install the plugin from this checkout and let it run the
steps, or follow `plugins/methodical/rules/rules.md` and the step skills by hand.

- **North Star:** [docs/north-star.md](docs/north-star.md). Every plan says how it moves toward it
  and what it leaves short, and every review judges against it.
- **Layout:** the plugin is in `plugins/methodical/` (rules, hook, step skills, templates); the
  marketplace manifest is in `.claude-plugin/`.
- **Tests:** run every `tests/*.sh` before a commit; CI runs the same set. Keep the always-on rules
  under the cap that `tests/rules-size.sh` enforces.
- **Nothing personal** goes into any tracked file; `tests/no-personal-identifiers.sh` checks. Before
  a push, maintainers also run `tests/pre-publish-check.sh <base>..HEAD`, which needs maintainer-only
  lists in a gitignored folder and so never runs in CI.
- **Releasing:** changes users should receive need a new plugin version and matching changelog entry.
  Run the deterministic checks and publication scrub on the exact candidate before publishing.
  Publish only reviewed source and distribution files; keep plans, operator records and raw evidence private.
  Update an installation with `claude plugin marketplace update methodical`, then
  `claude plugin update methodical@methodical`. Check activation in a fresh session with
  `/methodical:rules`; a session opened earlier may retain its loaded copy.
- **Branches:** one short-lived branch per unit, off `main`, merged and deleted once green.
