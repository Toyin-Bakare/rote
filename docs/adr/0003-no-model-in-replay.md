# 0003 — No model in replay, enforced by a build-failing test

## What the job needed
Production runs that give the same steps for the same inputs every time, cost nothing per call, and cannot make a fresh decision on a bank screen.

## Decision
The replay engine has no path to any model. `src/replay/` does not import the OpenAI client or anything from `src/discovery/`. `tests/replay-boundary.test.ts` reads `replay-engine.ts` as plain text and fails if it contains `openai` or `discovery`. The OpenAI key is optional in config, so every replay runs with no `.env` at all.

## Why
Three things about a model are wrong for a repeated bank operation: it costs money per step, it is slow, and it can decide differently on the same screen. The model earns its cost once, during discovery. After that the recipe is the product. A rule in a README rots; a test that fails the build does not.

## What I rejected
"Assisted replay" where the model is consulted on failure. The brief lists it as a stretch goal, bounded to one step. I did not build it, and if I do it will be a separate, policy-checked path that proposes a data entry for human approval rather than acting.

## Cost
Replay cannot adapt. A changed label or moved button fails closed and needs a fresh discovery. That is by design; the brief says these apps change slowly and the real problem is runtime conditions, not drift.
