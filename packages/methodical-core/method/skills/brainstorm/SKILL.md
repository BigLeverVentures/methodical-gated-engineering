---
name: brainstorm
description: "Explore what to build and why, and record it in docs/brainstorms/, before any plan exists. Use when the user starts a new unit of work (a feature, a fix with unclear scope, a redesign) and docs/plans/ has no plan for it. First step of the methodical loop. Not for questions or reviews that change no files."
---

# Brainstorm

Say `Step: brainstorm` before anything else.

## What it produces

`docs/brainstorms/<YYYY-MM-DD>-<slug>.md`: the problem in the user's words, who it serves, two or
three approaches with their trade-offs, the one recommended and why, what is out of scope, and the
open questions. Commit it, after you read `${METHODICAL_ROOT}/rules/user-words.md` and follow it.

If the request is already specific (the what and the why are both clear), the brainstorm is a short
paragraph in that file, not a workshop. Why: the step exists to catch a wrong framing early, and a
clear request has less framing to get wrong.

## How

1. **Look for prior art first.** Search `docs/solutions/`, `docs/plans/` and `docs/brainstorms/`
   for the same problem or its neighbours, and name what you found (or "none found", with the
   search you ran). Why: re-solving a problem the project already solved is the most avoidable
   waste there is.
2. **Read `docs/north-star.md` if it exists**, and say in one line how this unit could move toward
   it. Why: a brainstorm that ignores the project's goal produces options the user will reject.
3. **Ask, don't assume.** Questions to the user are rulings: batch them into one AskUserQuestion call (at most 4 questions; if more, the 4 that
   shape the approach first, the rest in a second call), put
   the recommended option first with its reason, and keep working on whatever does not depend on
   the answers. Why: one batched question costs the user one interruption; a drip of questions
   costs many.
4. Use research seats only when a question needs facts the repo does not hold (a library's
   behaviour, how others solved it). Launch them on the worker model and say so.

## When it hands on

When the user has ruled on the open questions that shape the approach, say `Step: north-star` and
continue with the north-star skill in the same turn.
