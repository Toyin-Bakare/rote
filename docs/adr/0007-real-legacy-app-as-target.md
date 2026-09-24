# 0007 — A real legacy app (AltoroJ) as the target, made hostile on purpose

## What the job needed
The brief says to expect legacy, server-rendered apps with framesets, nested tables, non-semantic markup, no test ids, and content that is not in the DOM. Ground rules forbid a real bank and real member data.

## Decision
AltoroJ, IBM's 2008 Java demo bank (Apache 2.0), run in Docker so no host Java is needed. Then modified: a nested iframe for the account console, session-changing ids on the login and console controls, a balance drawn on a canvas, and nine synthetic account records that trigger each condition the brief names. `CHALLENGE_VARIANT.md` lists every change.

## Why
A real legacy app has the legacy problems for free: table layouts, JSP rendering, no ids. I only had to add the hostilities the brief names that AltoroJ lacked. Testing against code I did not write is a stronger claim than passing tests on an app built to pass them.

## What I rejected
Writing my own mock bank. Faster and fully controllable, which is exactly the problem.

## Cost
Docker is a prerequisite and the container takes a minute to build. The demo bank must be running before replay; tests do not start it. Two login shortcuts in the adapter are tuned to this app.
