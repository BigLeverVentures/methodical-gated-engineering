# Portable work-record semantics

Use durable project files to carry the method across sessions. For instructional/manual use,
maintain docs/resume.md, active rulings, the current plan and docs/solutions/README.md with indexed
lesson files. These are semantic work records, not a claim of compatibility with a binary checkpoint
codec. A manual resume note MUST NOT be presented as a versioned helper checkpoint or full snapshot.

Before a handoff record:
- source host/surface and method/package version; current step and exact next action;
- plan revision/hash and scope, applicable direct authorization references and active rulings verbatim;
- repository identity, branch and HEAD, observed dirty tracked/untracked paths, and any separately
  saved bytes/patches with their hashes; missing bytes or unavailable Git are explicit limitations;
- unresolved findings, review debt and the exact candidate each completed review saw;
- acceptance results/diagnostic references, lesson paths and index references;
- decisions/findings newer than the last complete publication, capture time and freshness limitations.

Only a matching complete native checkpoint can claim its adapter's snapshot guarantees. The proof
writer emits schema-v2. It retains planHash, step, nextAction, rulings, lessons, findings, reviewDebt
and opaque `work.evidence: string[]`, plus generation, source host, repository identity/head/branch/
tree/index and hashed payloads. An evidence label is never implicitly interpreted as a file.

To carry support bytes, provide optional `work.captures` with explicit descriptors:
- `{kind:"local", ref:"diagnostic", source:".methodical/evidence/diagnostic.txt", archive:"evidence/diagnostic.txt", required:true}`;
- `{kind:"external", ref:"operator-decision", url:"https://example.invalid/record"}`;
- `{kind:"unavailable", ref:"missing-diagnostic", reason:"The source session did not retain it."}`.

The versioned `capture: {schemaVersion:1, records:[...]}` manifest maps each logical `ref` to its
immutable bundle-relative `archive`; local records add `bytes` and `sha256`. External and unavailable
records never satisfy a required local obligation. Missing or unreadable required support fails
publication. Explicit local sources must be ordinary repository files; ignored synthetic support is
allowed only under `.methodical/evidence/`. Control metadata, `.git`, symlinks, special files, unsafe
paths, duplicate references/sources/archives and collisions are rejected. Never select transcripts or
credentials. Limits: 128 descriptors, 1 MiB per local file, 8 MiB captured total, 64 KiB manifest metadata.
Selected source bytes are checked again before pointer publication. No recursive metadata copy occurs.

Legacy schema-v1 bundles remain readable with evidence coverage reported unknown. Old readers reject
v2. The helper remains restricted to synthetic fixtures and the two supported native host tags;
manual records do not prescribe a competing codec or add a third host.

At resume, verify references and hashes where supplied, compare current repository/dirty state and
new decisions with the saved state, and reconcile gaps. Read the lesson index and relevant lessons.
Missing, interrupted or stale records remain incomplete/stale; a timestamp is insufficient. Preserve
the last complete generation and outstanding review debt. Report unavailable byte preservation rather
than silently dropping untracked work or asserting that fresh-session recovery passed.
