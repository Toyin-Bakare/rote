# 0004 — Three result kinds declared in the capability, not the engine

## What the job needed
Replay must tell apart a valid answer ("account not found"), a known interruption (a maintenance banner), and a genuine failure (unexpected screen). New error screens appear over time and must be handled without a code release.

## Decision
Each capability carries a `knownOutcomes` list. Every entry has a code, a result type (`business-outcome`, `recoverable`, `blocked`), a checkpoint (what text to look for), and for recoverable ones, how to dismiss and a retry budget. The engine checks recoverable outcomes first, then terminal ones in order, then the success checkpoint. Anything unmatched is blocked with evidence.

## Why
A new error screen is then a data edit with a version bump, reviewed like any other change to the recipe, not a code change and a deploy. First-match-wins keeps the logic simple and makes ordering a reviewable property of the file.

## What I rejected
Outcome classification in the engine, keyed on error codes. It would have been faster to write and would have put every bank's screens into one code path.

## Cost
Checkpoints are substring matches, so a short expected string can collide with another screen. Outcomes are only checked after the last step; there are no per-step checkpoints yet. Both are on the weak-points list with a fix named.
