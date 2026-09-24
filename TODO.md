# TODO

Known gaps, in the order I would fix them. Each one names the seam it lands on and the test to write first, so the fix is "make the test pass" rather than "remember what I meant."

## Guarded by a test today

These are structural claims that a build failure now enforces (see `tests/`):

- Replay never imports the model — `replay-boundary.test.ts`
- Only the actuator calls `surface.execute` — `architecture-boundaries.test.ts`
- Only `src/surfaces/` imports Playwright — `architecture-boundaries.test.ts`
- Only `src/discovery/` imports the OpenAI SDK — `architecture-boundaries.test.ts`
- Replay runs with no `OPENAI_API_KEY` — `replay-needs-no-key.test.ts`
- No key, private key, or clear-text demo password in `evidence/` or `capabilities/` — `no-secrets-in-artifacts.test.ts`

## Next, in order

### 1. Per-step checkpoints
**Gap:** outcomes are only checked in `finalize()`. A wrong page at step 3 is not noticed until the end. The 350 ms wait in `playwright-adapter.ts` line 183 stands in for real verification.
**Seam:** `capabilityStepSchema` already has an optional `checkpoint`. `ReplayEngine.executeFrom()` is the one loop to change.
**Test first:** a step with a checkpoint whose text the fake surface does not show → `blocked` at that step index, not at `success-checkpoint`.
**Then:** drop the fixed wait; wait on the checkpoint.

### 2. Wire `nearbyText` into the locator ladder
**Gap:** the recorder captures the label text next to a control, but `locate()` never reads it. The iframe account field resolves through the CSS prefix `[id^="record_"]` instead of the visible label "Account record".
**Seam:** `PlaywrightSurfaceAdapter.locate()`, one rung between `getByText` and `fallbackCss`.
**Test first:** a page with a `<td>` label not linked to its input; locate by `nearbyText` finds the input, with `fallbackCss` removed from the descriptor.

### 3. Safe resume after a handoff on a write step
**Gap:** `resume()` re-enters `executeFrom()` at the stopping step, so that step runs again. Correct for a read; wrong for a submit the operator may already have completed.
**Seam:** `capabilityStepSchema` gains `idempotent: boolean` (default true). `resume()` skips a non-idempotent step whose checkpoint already holds.
**Test first:** handoff at a non-idempotent step whose checkpoint is now true → resume continues from the next step; the fake surface's `execute` is not called for the stopped step.

### 4. Browser engine from config
**Gap:** `chromium` is hard-coded at `playwright-adapter.ts` line 34.
**Seam:** `config.ts` gains `ROTE_BROWSER` (`chromium | firefox | webkit`, default `chromium`); `launch()` picks the engine.
**Test first:** `launch({ engine: "firefox" })` calls `firefox.launch` on a mocked Playwright module.

### 5. OCR confidence floor
**Gap:** `ocrText()` trusts whatever Tesseract returns. A blurry canvas can produce a wrong number with low confidence.
**Seam:** read `result.data.confidence`; below a threshold (start at 70) → `blocked` with `OCR_LOW_CONFIDENCE`.
**Test first:** mocked Tesseract returning confidence 40 → `extract()` throws; `finalize()` returns `blocked`.

### 6. Handoff during discovery
**Gap:** `cli.ts` line 94 builds the discovery actuator with no session lease, so a stuck discovery stops instead of escalating. The brief names "stuck during discovery" as an escalation trigger.
**Seam:** give `DiscoveryRunner` the same `SessionLease` and `HandoffCoordinator` replay uses; on a repeated-state stop, raise an intervention request instead of returning.
**Test first:** runner hits the repeat-state rule with a coordinator present → coordinator's `run()` is called with the stopping step.

### 7. Route risky actions into the handoff
**Gap:** a click on a control matching `riskyControlPattern` is blocked and the run ends. The brief asks for a person to decide.
**Seam:** in `executeFrom()`, catch `PolicyViolation` for a risky control and raise an intervention request with the action attached, instead of `blocked`.
**Test first:** a step clicking "Transfer" → result is `needs_intervention` with the action in the request, not `blocked`.

### 8. Host and route allowlist for every action, not just navigate
**Gap:** `evaluateAction()` only checks host and route on `navigate`. A click that triggers a cross-site form post is not caught.
**Seam:** `evaluateAction()` checks the page's current URL against the allowlist before any action; adapter exposes `currentUrl()`.
**Test first:** click action while the fake surface reports an off-allowlist URL → blocked.

### 9. Operator-pinned allowlist
**Gap:** `allowedHosts` is derived from `--target`. Whoever runs the command sets the fence.
**Seam:** `policy.json` gets a `pinnedHosts` list that must contain the target host, or the run refuses to start.
**Test first:** `loadPolicy()` with a target outside `pinnedHosts` throws.

### 10. Capability catalog with approval state
**Gap:** the caller names a file path. Nothing says which version is approved.
**Seam:** `CapabilityRepository` gains `resolve(name)` returning the approved version from `capabilities/catalog.json`; `--capability` accepts a name.
**Test first:** `resolve("altoroj-challenge-account-balance")` returns v2 when catalog says approved: 2.

### 11. Record the operator's real actions during a handoff
**Gap:** `recordHumanAction()` writes a fixed sentence. The timeline says a person acted, not what they did.
**Seam:** during the human-owned window, the adapter listens for click/type events on the page and passes each to `recordHumanAction()`.
**Test first:** fake surface emits two events while the lease is human-owned → two `action` entries in the timeline.

### 12. Event-sequence hash for determinism
**Gap:** repeat runs are compared by eye.
**Seam:** `ReplayEngine` hashes the ordered `(stepId, actionType, control)` sequence and writes it to the run record.
**Test first:** two runs of the same capability produce the same hash; a changed step produces a different one.

### 13. Integration test against the real bank
**Gap:** all 43 tests use fakes. Nothing automated hits AltoroJ.
**Seam:** a CI job that runs `docker compose up`, waits for `/altoromutual/`, and replays the happy path.
**Test first:** the happy-path replay returns `success` with `balance: 10000.42`.

## Not planned

- A UI for evidence. `docs/rote-viewer.html` is a read-only page over the JSON and is enough for review.
- Pixel-coordinate clicking. The `SurfaceAdapter` interface is the seam; a wrong click on a bank screen is worse than a failed run, so this stays unbuilt until there is a surface with no accessibility tree at all.
- Distributed storage or a queue. Scaling is one process per run; the orchestration is an operations choice, not a code change.
