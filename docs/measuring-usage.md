# Measuring your usage

Methodical doesn't measure token use for you. Claude Code's token records can support usage comparisons, within the telemetry limits below.
This page shows how to read it: take a baseline from the week before you installed, measure again
after your first week on Methodical, and then keep re-measuring as you tune your roles and watch how plans escalate.

## Where the data is

Claude Code keeps every session as a transcript on your machine:

```text
~/.claude/projects/<project>/<session>.jsonl
~/.claude/projects/<project>/<session>/subagents/*.jsonl
```

Each model call records its token counts: input, cache writes, cache reads and output.

**Transcripts expire.** Claude Code deletes them after about 30 days by default
(`cleanupPeriodDays`). Your baseline week is already on disk when you install, so export it on day
one, before it ages out.

## Why you extract before you analyze

The transcripts are large: a few weeks of heavy use can run to gigabytes, because they hold every
message and tool result. They also can't be summed naively:

- **One call, several lines.** Claude Code writes a call's usage on each content block of the reply,
  so the same call appears more than once. Count each call once, by its request ID.
- **Later lines carry the final count.** The first line of a multi-block reply can undercount output
  tokens. Keep the largest value seen for each call.
- **Subagents live in their own files,** under each session's `subagents/` folder. Include them, or
  every review seat and research seat goes missing.
- **Worktree sessions can appear twice,** under two project folders. Counting by request ID removes
  the duplicate.
- **Skip `<synthetic>` rows.** They are zero-token placeholders, not model calls.

Extracting just the token counts gives one row per model call, a CSV small enough to open in a
spreadsheet or hand to an analysis tool.

## Extract

Save this as `extract_usage.py`. It takes a first day and, optionally, the day after the last one to
include (dates in UTC):

```python
import csv, json, pathlib, sys

since = sys.argv[1] if len(sys.argv) > 1 else ""   # first day, e.g. 2026-09-24
until = sys.argv[2] if len(sys.argv) > 2 else "~"  # day after the last; "~" means no end
root = pathlib.Path.home() / ".claude" / "projects"
fields = ["input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens", "output_tokens"]
calls = {}

for path in root.rglob("*.jsonl"):                 # sessions and subagent transcripts
    for line in path.open(encoding="utf-8", errors="replace"):
        try:
            d = json.loads(line)
        except ValueError:
            continue                               # a torn last line in a live session
        m = d.get("message")
        if d.get("type") != "assistant" or not isinstance(m, dict) or not m.get("usage"):
            continue
        time = d.get("timestamp") or ""
        if not since <= time < until or m.get("model") == "<synthetic>":
            continue
        key = d.get("requestId") or m.get("id")    # one model call, however many lines
        row = calls.setdefault(key, [d["timestamp"], path.relative_to(root).parts[0],
                                     m.get("model"), 0, 0, 0, 0])
        for i, f in enumerate(fields):             # later lines carry the final counts
            row[3 + i] = max(row[3 + i], m["usage"].get(f) or 0)

out = csv.writer(sys.stdout)
out.writerow(["time", "project", "model", "input", "cache_write", "cache_read", "output"])
out.writerows(sorted(calls.values()))
```

```bash
# Baseline: the seven days before you installed (say you installed on 2026-10-01)
python3 extract_usage.py 2026-09-24 2026-10-01 > baseline.csv

# Your first week on Methodical, run on 2026-10-08
python3 extract_usage.py 2026-10-01 2026-10-08 > week-1.csv
```

Export the baseline on the day you install, before those transcripts age out.

Keep each export. A dated file per week is your history after the transcripts are gone.

## Compare

Total the tokens by model for each file, then run it again on `week-1.csv`:

```bash
python3 -c "
import csv, collections, sys
t = collections.defaultdict(lambda: [0, 0, 0, 0, 0])
for r in csv.DictReader(open(sys.argv[1])):
    a = t[r['model']]; a[0] += 1
    for i, k in enumerate(['input', 'cache_write', 'cache_read', 'output'], 1):
        a[i] += int(r[k])
print('model, calls, input, cache_write, cache_read, output')
for model, a in sorted(t.items(), key=lambda x: -x[1][0]):
    print(model, *a, sep=', ')
" baseline.csv
```

What to compare:

- **Before and after.** Your baseline week against your first week on Methodical, then week on week.
- **Escalation levels.** The same kind of work at each level. A lean or full unit moves seats to
  the decider's or the backstop's row, so the shift shows up in the model column, and the plan's
  `escalation:` line says which level a unit ran at.
- **Effort settings.** When a client records requested or configured effort, retain that field with its provenance. This does not independently establish backend reasoning effort. Some routes expose no backend model or effort; record those observations as unknown. Compare usage by configured settings only when the export contains them, and keep those comparisons separate from actual backend observations. The extraction example above exports no effort column and cannot alone group usage by effort.
- **Calls by model.** Fable should appear only in backstop-row seats: on a lean or full unit, the
  backstop review, and at full the deciding review seats. If it shows up elsewhere, a launch is
  inheriting a model instead of naming one. Check the applicable resolved profile and distinguish requested, configured and backend-observed settings before drawing that conclusion.
- **Cache reads.** They are usually most of the input. Long sessions grow them; compacting at half
  the window keeps them in check.

## What the transcripts can't tell you

**Your allowance.** The transcripts record tokens used, never the share of your plan that's left or
when it resets. For that, run `/usage` in Claude Code and note it alongside each export.

**Dollars, on a subscription.** You can price the CSV at API list prices to compare models on one
scale, but on a subscription read the result as relative shares, not a bill.

## Keep re-measuring

Measure after your first week, then keep measuring weekly. Each change you make, such as changing a
role in `/config` or editing a plan's `escalation:` line, is a small experiment, and the next
week's export tells you what it did.


## Cross-platform accounting

Keep parent orchestration, children, reviews, retries, failed delivery, and checkpoint work in the same accounting scope. Cache reads belong inside input totals. Subtract cumulative snapshots at defined boundaries; never sum successive cumulative snapshots. Mark unavailable native/backend telemetry unknown.

Record profile provenance and requested, routed and observed settings separately. A rewritten invocation alone does not prove native consumption. Monitored batch allocations stop new dispatch between actions; they are not a provider-enforced spending cap. Compare independently checked outcomes and rework alongside usage before claiming savings.
