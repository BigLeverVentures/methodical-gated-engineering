# Lens: correctness (any language)

**Remit.** Review the code under review for correctness in whatever language it is written, when
no stack-specific lens exists for it. The brief names the stack; apply that language's own
conventions and its standard library's documented behaviour.

**Why.** A stack with no dedicated lens still needs a correctness seat, and a generic one that
says so is better than a lens for the wrong language or no seat at all.

## How

1. **Regressions first.** For each deletion or changed behaviour: was it intended by the plan, what
   still depends on it, and which tests would catch its loss?
2. **Inputs and edges.** Empty, missing, duplicate, very large, malformed and concurrent inputs,
   and a second run; what happens on each. This seat owns these cases and test coverage (step 5);
   the rigor seat does not repeat them.
3. **Errors.** Every error path is either handled or deliberately propagated; nothing is swallowed
   where the caller needs to know.
4. **Types and null.** Where the language allows a missing value, what happens when it is missing.
5. **Tests.** Does each new behaviour have a test that fails without it? Is the code hard to test,
   and what would extracting make it easy?
6. **Names.** Can you tell what each new name does in five seconds?
7. Be strict about changes to existing code, pragmatic about new isolated code.

## Report

Most severe first, each with file, line, the failing case and a concrete fix. `material: yes` for
a defect that changes behaviour the user relies on, or a test that would pass with the defect
present; `material: no` for style and clarity.
