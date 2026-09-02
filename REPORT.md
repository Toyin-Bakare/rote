# Architecture

Rote is a single-process TypeScript and Node.js application. Its job is simple: let an LLM work out how to complete a task in a legacy UI once, then turn that run into automation that repeats reliably without the model. `docs/architecture.png` shows the same structure end to end, and distinguishes what is built in this slice from what is designed but not implemented.

Responsibilities split four ways: **DiscoveryModel** talks to the LLM, **SurfaceAdapter** reads and drives the UI, **Actuator** asserts session ownership and enforces the policy allowlist before any action reaches the surface, and **CapabilityRepository** saves and loads recorded automation. A distributed setup was avoided on purpose — it adds deployment work without improving this vertical slice — but the seams are real, so any of the four can move behind a network boundary later without changing the artifact contract.

TypeScript and Zod mean every capability, action, checkpoint, and result contract is checked by the compiler and validated again at runtime. OpenAI's Responses API drives discovery through a configurable `OPENAI_MODEL`, chosen for two properties. Schema-constrained output means each decision parses directly into the same action schema replay executes, rather than being scraped out of prose. Multimodal input means screenshots carry content missing from the DOM and accessibility tree entirely — exactly the case here, where the balance is painted onto a canvas. The provider sits behind `DiscoveryModel.decide()`, so swapping it is one file. Replay imports no model client, and `tests/replay-boundary.test.ts` asserts that.

Discovery is a strict observe → decide → act loop, one action per turn. The model receives the goal, URL, title, visible text from the page and nested frames, semantic control descriptors, any pending dialog, a `valueState` flag marking already-filled fields, and a compressed screenshot. It returns one action or a completion signal, extracted outputs when complete, and a sanitised reason — that reason becomes the step description in the artifact, which is how the artifact carries intent without carrying the transcript. Max steps, a wall-clock timeout, and a repeated observation/action fingerprint stop the loop running open-ended.

Playwright handles frame-aware navigation, semantic locators, synchronisation, dialog interception, screenshots, and DOM snapshots. For the canvas-only balance, where the DOM cannot help at all, local Tesseract OCR reads the pixels — locally, so replay needs no external service and regulated data stays off the network. That is the deliberate hedge for the wider problem: once a surface renders into a canvas, an image, or a native window, DOM automation is finished and only what a human operator sees remains.

The target is a local AltoroJ sandbox on port 8083, hardened on purpose to behave like real legacy bank software: per-session control IDs, nested tables, an authenticated iframe, canvas-only output, and deterministic records producing each exceptional state. It is the only target — a second, unmodified variant would add a container to build without exercising anything the challenge surface does not already cover. Only synthetic credentials and records are used anywhere.

# Artifact schema

A successful discovery run is saved as a capability artifact: a versioned, reviewable recipe an agent can invoke later with new parameters. Each is a human-readable JSON file at `capabilities/<name>/v<N>.json` — JSON because these get reviewed in pull requests, where diffs matter more than parse speed; a file per version because two versions must coexist while one is promoted. Saves write to a temp file and rename atomically, so a crashed write cannot leave half an artifact behind, and names are path-validated so an artifact cannot escape the repository root.

Every artifact declares metadata (schema version, name, version, description, target), typed inputs and output shapes, ordered steps, a success checkpoint, and known outcomes. Zod validates all of it on save, load, and again at the start of every replay, so a malformed or hand-edited artifact fails at the boundary rather than halfway through a bank screen.

Three choices carry most of the weight.

**Steps identify controls semantically, not by brittle selector.** Each names a role, accessible name, label, nearby text, an optional frame scope, and an optional CSS fallback — and every descriptor must carry a written `robustnessRationale`. A reviewer sees not just how a control is found, but why that identity was expected to survive.

**Inputs and outputs are declared, not implied.** Values captured during discovery become templates like `{{memberId}}`, sensitive fields are flagged so they are never stored as literals, and each output declares its extraction rule and type — so the caller receives `10000.42`, not `"$10,000.42"`.

**The error taxonomy lives in the artifact, not the engine.** `knownOutcomes` names each condition, the checkpoint that recognises it, and its class: `business_outcome`, `recoverable` (which must also declare a bounded recovery action), or `blocked`. Adding a runtime condition is a reviewed data change to the artifact, not a code change to the replay engine.

The artifact is also decoupled from the raw model transcript by design: sanitised step descriptions only — no prompts, no model output, no credentials.

# Determinism & error handling

In production an agent triggers deterministic replay, with no LLM involved. Replay parses the artifact, validates inputs against their declared types, fills the templates, and executes the recorded sequence. Elements resolve through semantic signals in a fixed priority order and the run fails closed on ambiguity rather than picking the first match; navigation is explicitly synchronised instead of waited out with fixed sleeps. Two committed logs, `evidence/altoroj-repeat-replay-a.json` and `-b.json`, show the same seven-step sequence and same output for identical inputs.

Real applications produce conditions that are not bugs, so the result contract separates three classes:

- **Business outcomes** — legitimate answers the caller needs: no such member, a validation rejection, an expired session, a permission denial, an unposted-transaction hold announced by a dialog. Valid results, not crashes. Conflating them with failures is the mistake this contract exists to prevent.
- **Recoverable conditions** — interruptions the artifact declares a bounded answer for, such as dismissing a maintenance interstitial or waiting out a slow load. The engine applies the declared recovery after each step and before final classification, records every recovery on the result, and treats an exhausted attempt budget as a hard failure. Because the recovery is data in the artifact, the same interstitial is always answered the same way.
- **Hard failures** — anything else. Execution stops.

A blocked result is built to be debugged: it names the step id and index it stopped at, an error code, what was expected, what was observed, any recoveries applied on the way, and a reference to captured evidence. That evidence is written automatically on every blocked run — a full-page screenshot, a redacted DOM snapshot of the main document and every live child frame, and a metadata file under `evidence/failures/<run-id>/`. Capture is best-effort, so a failing capture never masks the original failure.

UI drift is secondary here, since these applications change slowly, but it surfaces through the same machinery: a descriptor that stops resolving or becomes ambiguous, a checkpoint that disappears, or a visual extraction finding more than one candidate all stop the run with the observed state attached. The fix is a reviewed new artifact version — which is precisely why versions coexist — rather than letting a model guess its way through.

# Heterogeneity & multi-tenant

`SurfaceAdapter` is the boundary that keeps the design from being locked to one browser. It exposes `observe`, `snapshot`, `execute`, `verify`, and `extract`, and its signatures never mention Playwright. Capabilities are written in terms of intent and semantic identity — "the button whose accessible name is Inspect, inside the account console frame" — and the adapter is the only component that turns that into a click. A legacy web app is the same adapter leaning harder on frame scoping, nearby-text anchors, and OCR. A desktop app is a different adapter mapping the same role-and-name vocabulary onto Windows UI Automation or macOS AX, which speak exactly that vocabulary. The artifact does not change shape; only the adapter behind it does. AltoroJ already shows the seam is honest: the canvas balance is read visually through the same `extract` contract that returns a DOM value.

For scale across hundreds of institutions running slightly different builds of one vendor product, an artifact belongs to a **product and version, not a tenant**. Tenants on the same core application share one base capability. Where a tenant genuinely differs — a relabelled control, a different entry URL, an extra branded interstitial — a narrow, versioned override patches just that difference, for example mapping "Member" to "Customer" for one institution. An override is a reviewed diff, not a copy, so a fix to the base flow reaches every tenant that has not overridden that step.

Drift is detected by the same fail-closed conditions replay already uses. A descriptor that stops resolving or a checkpoint that stops matching is the signal; aggregated per tenant and version, a step failing across many runs for one institution shows where that vendor build has moved. The response is review and a pinned override, never improvisation. Override resolution and drift aggregation are designed for but not implemented here.

# Escalation & handoff

"Stuck" is three defined conditions, not a judgement call: discovery hits a stopping condition (max steps, timeout, or a repeated observation/action fingerprint); replay matches a known outcome classed as blocked; or a checkpoint, extraction, or policy check fails. In every case it returns a structured result rather than looping.

When replay stops on `HUMAN_INTERVENTION_REQUIRED`, it raises an intervention request carrying what an operator needs: the capability, the goal, why it stopped, the step id and index, the observed state, the checkpoint to clear, and a reference to the captured screenshot and DOM snapshot.

Control transfer is enforced by a `SessionLease` naming exactly one owner at any moment — automation or human. The Actuator asserts ownership before every action, so automation physically cannot act while the operator holds the session. The lease records a timeline (started, paused, transferred, human action, returned, resumed, completed) written into the run's evidence file, so what the human did is part of the record. The operator works in the same live Chromium session the automation was using, not a fresh one, and clears the condition. Rote detects the gate clearing, verifies it independently before taking the lease back — a handoff that did not actually clear the gate is refused — and resumes from the recorded step index, with no re-navigation and no repeated steps.

Only the operator's button is mocked; a real deployment would put a co-browsing console there. The lease, the ownership assertion, the independent verification, the same-session continuity, and the resume path are real, and `evidence/altoroj-handoff-live.json` is a live run of the whole sequence.

# Safety

Guardrails are enforced at a single chokepoint. Every action, in discovery and replay, passes through the `Actuator` before reaching a surface. That is the only path to the browser, which makes the guardrails enforceable rather than advisory: it asserts session ownership, evaluates the action against the policy, then executes.

The policy lives in `policy.json` and loads at runtime, so an institution can widen or narrow it without a rebuild. It declares allowed hosts, allowed route prefixes, permitted action types, and a pattern of control names treated as risky. Actions are classified safe, reversible, or risky, and **risky controls are blocked outright** — the run stops and a human decides. That is the right default for unattended replay inside bank software: a flag nobody reads is not a control. The cost is false positives, which surface as an explicit block a person can clear, and that is the cheaper error.

Sensitive data stays out of anything that persists. Sensitive inputs remain templated in artifacts and are never written as literals; values are redacted by name before any log or evidence file is written; password field values and sensitive input values are stripped from DOM snapshots before capture reaches disk. Only synthetic accounts and credentials are used.

The limits are worth stating plainly. Host and route allowlisting constrains where the agent can go, not what a page can do once it is there. Regex risk classification can over-block a harmless "Submit search" and under-block a blandly named control, and it has no notion of amount, so a transfer of one dollar and one million look identical to it. DOM snapshots are redacted but screenshots are not, so failure evidence should be treated as sensitive. And the policy constrains the automation path, not the model: a prompt-injected discovery run is confined to allowlisted actions, which limits blast radius without eliminating it. Production would need per-capability scopes, amount thresholds, an approval state gating unattended replay, stronger visual redaction, and auditable operator identity.

# Cuts

**Mocked on purpose.** The operator console is a single button in the target application; the control-transfer mechanism behind it is real. Exceptional states are deterministic synthetic records rather than genuine bank failures, because each error contract has to be reproducible offline.

**Not built on purpose.** Desktop and legacy frameset adapters (designed; one adapter implemented). Tenant override resolution and route canonicalisation (designed). A searchable capability catalogue. Multi-run flakiness scoring. Queues, clusters, and scaling infrastructure — the brief says not to build these, and I agree.

**What I would build next, in order.**

1. **A draft → approved artifact lifecycle**, blocking unattended replay of unapproved drafts. Smallest change, largest safety return, and the natural home for a replay-confidence score.
2. **Base-plus-tenant override resolution and drift aggregation.** The schema is already shaped for it; what is missing is the resolver and the signal telling you when to write an override.
3. **A native desktop UI Automation adapter**, to prove the surface seam under load rather than in prose. This is the claim above that most deserves evidence.
4. **A searchable capability catalogue**, exposing artifacts as typed, discoverable tools an agent calls by name — the product surface this system exists to serve.
5. **One bounded, policy-checked LLM fallback** for a single failed control resolution during replay, recorded as evidence and requiring approval before it updates an artifact. Never open-ended, never in the decision loop.
