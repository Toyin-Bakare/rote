# 0002 — The capability is JSON data, not generated code

## What the job needed
A recording of a discovered workflow that a person can review, that can be versioned, that can be checked against a safety policy before it runs, and that could later be executed on a surface that is not a browser.

## Decision
The capability is a JSON file validated by a Zod schema: ordered steps, each naming a control by role, label, text or a CSS fallback; inputs as `{{placeholders}}`; a success checkpoint; a list of known outcomes; extraction rules for outputs.

## Why
Data can be validated at load time, diffed between versions, policy-checked before any action, and read by someone who has never used Playwright. Generated code hides the intent inside a language and can only be reviewed by reading a program. A raw transcript records what happened but not what was meant: no placeholders, no outcomes, no notion of a control's role.

## What I rejected
Generated Playwright scripts: fast to produce, impossible to policy-check without parsing code, and tied to one browser API. Raw event transcripts: tied to one account number and one session's ids.

## Cost
The engine has to interpret the file, so every new action type or checkpoint kind is an engine change. That is the right trade: the set of action kinds is small and stable; the set of workflows is not.
