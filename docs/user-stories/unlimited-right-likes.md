# TNND v0.2.40 — Unlimited Right Likes per day (TNND-side)

## Request and user experience
TNND no longer imposes its own **Right Likes per day** count cap. The Smart Auto Swipe settings panel replaces the numeric field with an informational note: **Right Likes per day: Unlimited in TNND**. Verified daily attempts remain visible as a count, not a fictional quota or Tinder acceptance receipt. The number is not a promise that Tinder itself allows unlimited Likes.

## Acceptance
- Default settings contain `maxRightSwipesPerDay: null` (unlimited). Existing saved numeric caps are normalized to `null` at read time; validated legacy client writes are canonicalized to `null`. No database migration is needed (JSON settings).
- The durable server attempt ledger never refuses a claim solely because of the **daily number** of recorded attempts; it still refuses duplicates, unknown outcomes, account conflicts, expired leases, invalid state and attempts by unauthorized devices.
- The extension's session scheduler, swipe planner and counters do not stop at any daily Like count. **Sessions per day**, **session duration**, **minimum break**, **inter-Like delays**, explicit Start/Stop, the auto-switch priority and safety gates remain unchanged.
- Daily counts are diagnostics only. The quota counter reports **limit `null`** and **reached `false`**. A session cap may still show as reached.
- No unused "daily-cap" automatic handoff can fire from a local Like count. A genuine Tinder platform limit/error still stops or defers operations according to the executor's existing verified safety checks; TNND does not bypass it.
- The popup and Web panel must not display `0 remaining` or `x / 50` as an application-defined Like quota.

## Non-goals
Not an exemption from Tinder rate limits, not an anti-bot bypass, not unlimited *sessions* or continuous automation, not an increase in message/opener limits. Neither the UI nor mock tests may claim Tinder accepted any Like.

## QA
Root build and unit regressions, API validation and ledger tests, Web typecheck/tests, Chrome simulated extension functional/visual QA. Check the compiled UI at desktop/mobile/light/dark. A live Tinder account test has **not** been performed.
