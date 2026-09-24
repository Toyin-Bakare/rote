# 0006 — Risky actions are blocked, not flagged

## What the job needed
The brief says a step that could move money or change state must not be taken without a person deciding. During discovery the model proposes actions; during replay the recipe requests them.

## Decision
`policy.json` carries a regex of risky control names (transfer, withdraw, wire, approve, submit, confirm, delete, close). A click on a control whose name matches is refused by the policy and the run stops with evidence. It is not logged and continued.

## Why
A flag is a note in a log; a block is a guarantee. The demo capability reads a balance, which never needs a risky action, so blocking costs nothing here. In production the fix is to route a blocked risky step into the existing handoff, where a person confirms it in the same session; the lease and coordinator already exist for that.

## What I rejected
Flag-and-continue with a review afterwards. Fine for observability, wrong for money.

## Cost
The pattern is broad on purpose: "close" blocks both "Close account" and a harmless "Close" on a popup. Better to fail a benign run than to pass a harmful one.
