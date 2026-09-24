# 0005 — One process, one browser, one gate for every action

## What the job needed
A human must be able to take over the live session and hand it back with nothing torn down. No action, from the model or from the recipe, may bypass the safety policy. There must be no moment where automation and a person could both act.

## Decision
One Node process owns one Playwright browser. Every action goes through `Actuator.execute()`: check the session lease, check the policy, then act. The lease has one owner at a time. During handoff the lease moves to the person; the actuator refuses to act until it moves back and the blocking condition is verified gone.

## Why
Because the lease check and the action are in the same call in the same process, there is no gap between them. A separate controller service would introduce one. The actuator is the only code that touches the browser, so the policy is a guarantee rather than a convention.

## What I rejected
A control-plane service with the browser in a worker. Cleaner for scale, worse for the guarantee that matters most in a bank.

## Cost
Scale is by process, not by threads: one container per run, a queue in front. Discovery is constructed without a lease, so the handoff path is replay-only. Both are documented.
