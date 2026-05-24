# Instructions for Claude (and other AI assistants) working in this repo

**Read in this order at the start of every session:**

1. **`STATUS.md`** — where the lab is right now: current tag, branches that exist, what was just completed, what to pick up next. This is the "you are here" pointer.
2. **`LAB.md`** — canonical workflow, branch/tag conventions, scenario catalog, educational philosophy. Supersedes anything below on conflict.
3. **`packages/db/README.md`** — schema reasoning and per-table scenario map. Read when touching anything DB-shaped.

The summary below is fast onboarding only — those three files are the actual sources of truth.

## TL;DR

This is a **long-term systems-engineering laboratory**, not a normal application repo. The product is incidental; the git history, tags, and scenario branches ARE the deliverable.

## Non-negotiable rules

1. **Read `STATUS.md` then `LAB.md` first** — every session, every time. `STATUS.md` is "where am I"; `LAB.md` is "what are the rules."
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
9. **Update `STATUS.md` at the end of any state-changing session.** New tag? New scenario/solution pair? New "what's next"? Update it. This is the handoff contract between sessions — treat it as part of the work, not a chore.

## When you're about to do something, ask yourself:

- Is this fix making `main` better, or removing a learning opportunity?
- What's the naive version? Could I ship that on `main` and put the clever version on a `solution/*` branch?
- Does the scenario catalog (§7 of LAB.md) rely on the thing I'm about to change?
- Have I named the tag this work will land on?

If any of those are unanswered, pause and confirm with the user before writing code.

## Pointers

- `STATUS.md` — **read first.** Where the lab is right now, what's next.
- `LAB.md` — workflow, tag roadmap, scenario catalog, philosophy (canonical)
- `README.md` — user-facing project intro and quickstart
- `packages/db/README.md` — schema reasoning, per-table scenario map
- `scenarios/README.md` — catalog index of scenario branches that exist
- `docs/incidents/*.md` — per-scenario post-mortems
- `C:\Users\antho\.claude\plans\i-want-to-build-ancient-floyd.md` — original build plan (background context)
