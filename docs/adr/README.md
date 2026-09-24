# Architecture decision records

One page per decision. Each says what the job needed, what I chose, what I rejected, and what it cost. They were written after the code, from the reasoning in REPORT.md.

| # | Decision |
|---|---|
| [0001](0001-typescript-and-playwright.md) | TypeScript with Playwright, not Python |
| [0002](0002-capability-is-data-not-code.md) | The capability is JSON data, not generated code |
| [0003](0003-no-model-in-replay.md) | No model in replay, enforced by a build-failing test |
| [0004](0004-outcomes-live-in-the-file.md) | Three result kinds declared in the capability, not the engine |
| [0005](0005-one-process-one-gate.md) | One process, one browser, one gate for every action |
| [0006](0006-risky-actions-are-blocked.md) | Risky actions are blocked, not flagged |
| [0007](0007-real-legacy-app-as-target.md) | A real legacy app (AltoroJ) as the target, made hostile on purpose |
| [0008](0008-ocr-reads-pixels-clicks-do-not.md) | OCR reads pixel content; nothing clicks by pixel |
