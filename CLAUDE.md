# Instructions for Claude (and other AI assistants) working in this repo

**Before suggesting any change, read `LAB.md` in full.** It defines what this repo is and the rules of engagement. The summary below is for fast onboarding; `LAB.md` is canonical and supersedes any conflict.

## TL;DR

This is a **long-term systems-engineering laboratory**, not a normal application repo. The product is incidental; the git history, tags, and scenario branches ARE the deliverable.

## Non-negotiable rules

1. **Read `LAB.md` first** — every session, every time. It contains the workflow, tag roadmap, scenario catalog, and educational philosophy.
2. **`main` stays runnable and stable.** Never commit non-trivial work directly to `main` — open a `feature/*` branch.
3. **Intentional omissions are sacred.** Files and migrations carry `INTENTIONAL OMISSIONS` comments. Do NOT "fix" anything called out there without the user's explicit instruction. Each omission powers a future learning scenario.
4. **Prefer the naive implementation on `main`.** The optimized version lives on a paired `solution/*` branch. If you're about to write the "clever" version on `main`, stop and ask.
5. **Every milestone proposal must include:**
   - Branch name (`feature/<slug>`)
   - Tag name on merge (`vN-shortname`)
   - List of intentional omissions in this milestone
   - Scenario branches this milestone unlocks
6. **Suggest proactively:** tag points at the end of meaningful work, scenario branches when the code is in a state to support them, write-up topics for `docs/incidents/` or `docs/benchmarks/` after each session.
7. **Commits go in the user's voice.** No `Co-Authored-By: Claude` trailers unless the user explicitly asks for one.
8. **When in doubt, ask.** This repo values pedagogy over speed. Wrong-but-fast guesses cost more here than the time spent confirming.

## When you're about to do something, ask yourself:

- Is this fix making `main` better, or removing a learning opportunity?
- What's the naive version? Could I ship that on `main` and put the clever version on a `solution/*` branch?
- Does the scenario catalog (§7 of LAB.md) rely on the thing I'm about to change?
- Have I named the tag this work will land on?

If any of those are unanswered, pause and confirm with the user before writing code.

## Pointers

- `LAB.md` — workflow, tag roadmap, scenario catalog, philosophy (canonical)
- `README.md` — user-facing project intro and quickstart
- `packages/db/README.md` — schema reasoning, per-table scenario map
- `C:\Users\antho\.claude\plans\i-want-to-build-ancient-floyd.md` — original build plan (background context)
