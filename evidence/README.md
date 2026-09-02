# Evidence

Synthetic-data-only evidence from the submitted challenged AltoroJ surface:

- real OpenAI-driven discovery log (`altoroj-final-openai-discovery.json`);
- saved capability artifact (`altoroj-example-artifact.json`, plus the versioned capabilities in `/capabilities/`);
- documented artifact review (`altoroj-final-artifact-review.json`);
- deterministic replay of that discovered artifact (`altoroj-final-discovered-replay.json`);
- two independent deterministic runs with the identical ordered step sequence
  (`altoroj-repeat-replay-a.json` and `altoroj-repeat-replay-b.json`);
- a live two-step discovery stop (`altoroj-max-steps-live.json`);
- live unexpected-dialog and recoverable-interstitial results
  (`altoroj-unexpected-dialog-live.json` and `altoroj-recoverable-live.json`);
- a live blocked replay whose `evidenceRef` points to its screenshot, redacted DOM, and metadata
  (`altoroj-failure-evidence-live.json`);
- one replay per exceptional state: validation, not-found, permission denial, session expiry, delayed service, unexpected dialog, dismissable interstitial (recoverable), and operator intervention;
- a repository secret scan and the redaction that keeps synthetic credentials out of artifacts,
  logs, and DOM snapshots (`secret-scan.json`). Allowlist refusal itself is not captured here as a
  run log; it is enforced in `src/safety/actuator.ts` and covered by `tests/policy.test.ts`, which
  asserts that an off-allowlist host, an off-allowlist route, and a risky control are each rejected
  before any surface action;
- same-session human handoff (`altoroj-handoff-live.json`), carrying the current v2
  intervention request, its screenshot/DOM `evidenceRef`, and the ownership timeline
  including the human's action and resumed result.

`failures/` holds the richer signal captured on every blocked result: a full-page screenshot, a DOM
snapshot of the main document and every live child frame, and a metadata file naming the step, the
error code, the URL and the title. Sensitive input values and password field values are stripped
before anything is written. Blocked results reference these files by `evidenceRef`.
