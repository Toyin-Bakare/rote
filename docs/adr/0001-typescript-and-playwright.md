# 0001 — TypeScript with Playwright, not Python

## What the job needed
Drive a legacy web app with iframes, no test ids and controls that only make sense by their visible label. Do it reliably enough that the same recipe works run after run. Two untyped things enter the system as JSON: the model's response during discovery and the capability file during replay. Both must be checked before they are trusted.

## Decision
TypeScript on Node 20, Playwright for the browser, Zod for the schema.

## Why
Playwright, over Puppeteer and Selenium: auto-waiting on every action, role and label locators from the accessibility tree, first-class iframe support, and a persistent browser context that survives a human taking over. Puppeteer and Selenium can do these with more code and more flakiness.

TypeScript, over Python: one Zod schema for a step is used three ways. The compiler derives the type for the code. `parse()` validates the capability file at runtime. The same schema is the model's required response format. With `strict` on, changing the schema makes the compiler list every function that no longer matches, before anything runs.

## What I rejected
Python with Playwright and Pydantic gets the runtime half and the response-format half. The compile-time check is available through mypy or pyright, but it is a separate tool that has to be enforced in CI rather than part of the build. That is a discipline gap, not a capability gap. Java and Go were rejected because their Playwright bindings are weaker and the schema story is heavier.

## Cost
The brief left the language open. I did not check the job description first; it names Python. The design does not depend on the language: the recipe, the policy and the evidence are all JSON, and the four interfaces are shapes. A Python port is a rewrite of the engine behind the same contracts, and every artifact in the repo works unchanged.
