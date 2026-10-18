---
title: "Native hook discovery and context delivery need separate checks"
category: testing-patterns
date: 2026-10-16
symptoms:
  - "A package generates successfully but native hooks are missing, or startup instructions arrive truncated."
root_cause: "Offline package integrity does not establish the host's manifest precedence or context allowance."
tags: [packaging, codex, hooks, startup, context, qualification]
---

# Native hook discovery and context delivery need separate checks

## Symptoms

An intact generated package can expose its skill without exposing its hooks. A complete helper response can still exceed the executing host's startup context allowance.

## Root cause

Manifest discovery and context delivery belong to the host. A portable manifest can shadow a native compatibility entrypoint, and an implicit context allowance can truncate instructions after the helper has successfully produced them. An inventory hash establishes bytes, not host behavior.

## Fix and evidence

The Codex proof builder emits the native `.codex-plugin/plugin.json` entrypoint with explicit skills and hooks, without a root manifest. Its SessionStart hook declares a finite context allowance. Packaging tests assert that shape, include every required generated document in the helper response, and apply an explicitly approximate size smoke.

The full offline proof suite and repository checks passed. Generated baseline/candidate comparison preserved Claude Code and portable artifacts byte for byte. These checks establish packaging and helper output; exact native surface/version/install qualification must independently verify discovery, ordinary changed-definition trust, and delivery without truncation. Startup alone does not clear removal or the broader proof program.

## Reuse

When a plugin loads partially, inspect native hook inventory before changing shared instructions. Keep one intended entrypoint, confirm its references, and distinguish helper output from what the host actually receives. Freeze the artifact and scope each native result to its tested surface, version and installation route.
