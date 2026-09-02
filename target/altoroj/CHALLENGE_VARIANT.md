# AltoroJ Challenge Variant

## Attribution and modifications

This directory contains [AltoroJ](https://github.com/AppSecDev/AltoroJ) by AppSecDev, an
open-source sample banking application licensed under the Apache License 2.0. It is third-party
work, not mine. The upstream `LICENSE` and `README.md` are retained here unchanged.

Per Apache 2.0 section 4(b), this file is the notice that the source in this directory has been
modified. The changes below were made by Toyin Bakare for this project; everything else is as
published upstream.

This directory is the submission's single AltoroJ target with all automation challenges enabled.

Structural changes:

- Login control IDs and visible field names are derived from the server session.
- The authenticated account workflow is hosted inside a nested iframe.
- Account controls inside the iframe also use per-session identifiers.
- The balance label and value are painted onto a canvas and are absent from rendered DOM text and the accessibility tree.
- The account record is supplied through a dynamically identified legacy-frame control.
- Synthetic records deterministically expose validation, not-found, permission-denied, session-expired, delayed-service, dismissable-interstitial, unexpected-dialog, and operator-intervention states.

Scenario records:

| Record | Result |
|---|---|
| `800002` | Successful canvas-only balance |
| `ABC` | Validation error |
| `999999` | Account not found |
| `403403` | Permission denied |
| `408408` | Session expired |
| `503503` | Delayed service unavailable |
| `888888` | Same-session human intervention |
| `777777` | Dismissable maintenance interstitial (recoverable) |
| `555555` | Unexpected browser dialog: unposted transaction hold |

These changes intentionally test session-independent grounding, nested-context discovery, visual observation, classified failures, and human handoff. The untouched development baseline is not part of the curated submission.
