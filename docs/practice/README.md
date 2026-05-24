# docs/practice — rebuild-from-scratch exercises

This directory is the catalog of "rewind to a tag and rebuild X yourself" exercises. Each `<slug>.md` file is a self-contained spec that tells you (or an AI session) exactly:

- which tag to start from
- which files to delete / what to wire blank
- what to build (spec, **not** code)
- how to know you're done (validation)
- what NOT to look at while you're working
- stretch goals once the basic version works

## How to use this with the AI

Open a session and say:

> "I want to practice the rate limiter."

The AI should:
1. Read `docs/practice/rate-limiter.md`
2. Confirm the exercise
3. Run the git commands to put you on the right branch
4. Show you the spec
5. Get out of the way

You may also browse the catalog directly:

```bash
ls docs/practice/
```

## How to use this without the AI

Open the spec file, follow the steps. Each spec is intentionally written to stand on its own.

## Catalog

| exercise | start tag | difficulty | what you'll feel |
|---|---|---|---|
| [`api-key-auth.md`](api-key-auth.md) | `v3-api-surface` | easy | indexed-prefix lookups, timing-safe compare, cache invalidation |
| [`rate-limiter.md`](rate-limiter.md) | `v3-api-surface` | medium → hard | atomicity, Lua scripts, algorithm tradeoffs (fixed window → sliding → token bucket) |
| [`idempotency.md`](idempotency.md) | `v3-api-surface` | medium | response capture, PK race conditions, write-once semantics |

More exercises land as later tags ship:
- `custom-queue.md` (off `v3-api-surface`, build the Postgres SKIP LOCKED queue before reading the v4 impl)
- `webhook-delivery.md` (off `v4-queue-system`)
- `retry-backoff-jitter.md` (off `v5-webhooks`)

## Conventions

- Practice branches use the `practice/<slug>` prefix and are **local only** — don't push them. They're personal.
- After finishing an exercise, `git diff <start-tag>..main -- <relevant paths>` to compare your work against the reference. Steal what you missed.
- Keep your `practice/*` branch around if you want to come back to it; otherwise delete it. The exercise spec is the durable thing, not your attempt.

## Adding a new exercise

When something on `main` becomes a candidate for a rebuild exercise, write a new `docs/practice/<slug>.md`. Use any existing file as a template. Add a row to the catalog above. Don't add an exercise unless you have a reference implementation already on `main` — the diff is what makes the exercise teach.
