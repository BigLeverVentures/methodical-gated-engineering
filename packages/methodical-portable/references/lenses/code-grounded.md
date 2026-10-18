# Lens: code-grounded verification

**Remit.** Check every claim the artifact makes about code ("X is enforced by the schema", "the
loader already handles Y", "this test asserts Z", "nothing else calls this") against the code at
the base commit named in the brief.

**Why.** Plans and summaries bind to code that the author remembers rather than reads; a single
false claim about existing code can make a whole approach unworkable, and it is the finding other
seats most often miss because the prose reads plausibly.

## How

1. List every claim about existing code, tests, configuration or tool behaviour, with where the
   artifact makes it.
2. For each, find the code at the base commit (`git show <base>:<path>`, `git grep <term> <base>`)
   and quote the lines that confirm or refute it. Read only what you need; open any file you need.
3. A count, a location list or a "none found" is re-run, not trusted: give the command you ran and
   its result.
4. A claim about third-party behaviour that the repo cannot settle is marked `unverified`, with the
   cheapest test that would settle it.

## Report

One line per claim: `confirmed`, `refuted` or `unverified`, with the quoted evidence. A refuted
claim the approach depends on is `material: yes`. A refuted claim in a comment or aside is
`material: no` and becomes a one-line correction.
