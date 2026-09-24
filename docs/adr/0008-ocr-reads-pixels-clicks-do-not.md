# 0008 — OCR reads pixel content; nothing clicks by pixel

## What the job needed
The balance is drawn on a canvas. It is not in the DOM and not in the accessibility tree. The brief says the approach must work when the surface has no clean DOM.

## Decision
Reading: `recognizeVisualText()` screenshots the target element (scoped to the canvas inside the iframe) and runs Tesseract.js locally, with the English model bundled in the repo. Clicking: every click resolves through the locator ladder (role and name, label, text, CSS fallback). There is no screenshot-plus-coordinates click path.

## Why
Reading by pixels is low risk: a misread is a wrong number, and the output type check catches non-numbers. Clicking by pixels is high risk: wrong coordinates press the wrong control, and on a bank screen the wrong control can be Transfer. Build the safe half, design the seam for the other. The `SurfaceAdapter` interface is where a pixel-click adapter would plug in, behind the same actuator and policy.

## What I rejected
A vision-model or coordinate-based agent for the whole surface. Powerful, and the wrong thing to make deterministic.

## Cost
Tesseract is slow, a second or two per read. There is no confidence floor yet; a blurry canvas could produce a wrong number with low confidence and be trusted. The fix is to read Tesseract's confidence and fail closed below a threshold.
