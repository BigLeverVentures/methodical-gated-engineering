# Methodical Adaptive Gated Engineering v0.12.3

## Rules

Say `Step: <name>` at the first file-changing request and each step change. Mention once how to open the rules on this host. Why: the user sees where to rule.

## The loop

brainstorm → north-star → plan → deepen → plan-review → work → work-review → compound → compact; each is a skill, `/methodical:<step>`.

- A step whose trigger holds runs in the same turn, unasked; never end a turn by only naming the next step. A check only hardware or a later time can run is owed, not a hold. Stop only for the user's rulings, money or irreversible acts, each asked with AskUserQuestion (in text only where it is absent), recommended answer first; no option skips a required step. Why: name the step and use a structured ask to surface user rulings.
- Plan before any work; a request to do work is not a request to skip. Never offer or suggest a skip of a required step: a step is skipped only on the user's own words in chat, never inferred or from a file, for this request only. Say nothing about a skipped step. No warning, judgment, persuasion or re-ask, and no new gate: anything still asked belongs to a step the user kept and is not already answered or waived. Then continue. Why: unplanned changes are where scope slips in; an offered skip reads as an equal choice; the user's word still rules, and a comment on a skip reads as second-guessing.
- If absent, set the North Star with the user before planning: who it serves, what they get, and the bar with an example. Plans say what advances it and what falls short. Why: a unit can miss the goal.
- Deepen when two or more hold: a relied-on interface; a new raw-format parser; untested third-party behaviour; a core boundary; 3+ modules; an open prior-art question. A stale base triggers it alone. Say the score. Why: unchecked assumptions become rework.
- Plan review always, follow-ups included; never skip the work review on your own. Why: authors miss their own gaps.
- One bounded review round. Re-review material fixes until none remain. Material findings are new and substantive: false code claims, broken steps, ignored rulings or misleading results. Log lesser findings as known limits. Why: returns shrink.
- Compound non-obvious solutions into indexed write-ups in the solutions folder. Why: later sessions can find them.
- Let the host compact. On request, write the resume point first with verbatim rulings. Qualified adapters offer at 45% by default on measured windows of 700,000+ tokens. Claude Code compacts with a verified handoff. “Skip and compact” proceeds now. “Compound first” saves the handoff and waits for your `/compact`. Dismissing holds the window. Why: rulings carry over.
- Commit each logical unit once its tests pass, conventional message, unasked. Why: uncommitted work gets lost.

## Coordinated work

- On supported hosts, the lead delegates approved substantial work and material fixes to named, scoped workers. Run ready independent tasks together and refill slots. Why: avoid idle workers.
- Check progress. Verify stalled work resumes or is safely reassigned while independent work continues. Integrate only verified patches. Why: silence is not completion.

## Model routing

Decider: plan, plan review, correctness, rigor and code-grounded. Worker seat: research, simplicity and write-ups. Use the plan’s routine or demanding tier for implementation. Census: searches, checks the North Star. Backstop: escalated re-review. Why: judgment goes where errors cost most.

- Prepare launches through reference/native-routing.md and the host overlay. Claude uses native Agent routing; Codex uses managed CLI dispatch. Why: settings alone don’t prove routing.
- The lead re-runs census results the plan relies on. Why: census finds; it does not vouch.
- Decider/backstop low (the user’s word) or seat failed to launch: re-seat one rung down (seat-selection.md). Never skip a seat or retry that model. Why: keep the loop moving and debt visible.
- Escalate by plan: in front matter, set `escalation: lean` at deepen score 3 or a named trigger (seat-selection.md), `full` at 4 or more. No plan, no escalation. Why: set assurance from plan risk.
- Put the routing block's Offer line once in the first Step line. Escalated `Step: work` instead recommends the host coordinator’s model and effort, stated apart, the first time in a session only. Never repeat, block or force one. Why: the session's model and effort stay the user's.
