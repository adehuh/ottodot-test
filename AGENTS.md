# AGENTS.md

Canonical agent instructions for this repository.

## Read in this order

1. `SPEC.md` — scope, capability map, acceptance criteria, commands, time budget. What we build.
2. `.claude/RULES.md` — the enforceable rules. How we are allowed to build it.
3. `ARCHITECTURE.md` — the reasoning behind those rules. Read when a rule seems wrong.
4. `.claude/README_STYLE.md` — before writing `README.md` or `AI_USAGE.md`.

## Trust order

The brief → `SPEC.md` → `.claude/RULES.md` → the source tree → prose in `ARCHITECTURE.md`.

`package.json` scripts and the current source tree win over any prose that contradicts them.
Prose may be stale; verify commands before running them.

## Non-negotiables

- Every **STOP and ask** in `.claude/RULES.md` means stop and ask. Do not proceed on your own
  judgement.
- Never weaken a test, type, lint rule, database constraint, or the `FOR UPDATE` lock to reach green.
- Never exceed the scope fence in `.claude/RULES.md` §R10. Scope control is graded.
- Build verification before the API: prove the race against the service before any HTTP exists.
- Record deviations in `README.md` as they happen. An undocumented deviation is a defect.

## The three things that decide this submission

1. The confirm transaction is shaped exactly as `.claude/RULES.md` §R2 specifies, including the
   three-way re-read branch.
2. `authorize → seat → capture`, voiding on loss. Nothing is ever captured for a seat not given.
3. The race test uses genuine parallelism against real Postgres, and the lock-disabled proof test
   exists.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
