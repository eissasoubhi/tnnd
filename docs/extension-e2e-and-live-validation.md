# Extension E2E and live validation

## Automated fixture

Run `npm run test:e2e` from the repository root with Node 22 after `npm install`.
The command installs its Playwright browser if needed. Playwright's Chrome-family Chromium build supports
loading the unpacked extension in headless mode. The command runs the existing root
regression/build checks, loads `dist/` as an unpacked MV3 extension in a fresh
Chrome profile, and runs Playwright against a fictional Tinder page. It binds
`127.0.0.1:4000` with a synthetic API before Chrome starts. If that port is in
use, the test stops rather than connecting to another API. It intercepts all
`https://tinder.com/` and `https://www.tinder.com/` requests with fixture HTML
and blocks other browser network requests. No Tinder account or credentials are
used. The temporary Chrome profile is deleted after the run.

On failure, inspect `artifacts/e2e/html/index.html`, `artifacts/e2e/junit.xml`
and retained Playwright traces under `artifacts/e2e/results/`. CI uploads this
directory even when the E2E step fails. Reports use synthetic data only.

This suite checks the built popup, content script, service worker, local state,
synthetic API requests, Stop latch, restart persistence, and mutual exclusion.
The existing `npm run build` checks still cover policy, quota, scheduler, send
gates and other extension functions. The Web and API test workflows remain
separate required checks. The fixture cannot prove Tinder accepts a Like or a
message, nor can it validate live selectors or delivery confirmation.

## Separate validation on a connected Tinder session

Only proceed after the owner explicitly authorizes the exact live action and
chooses a suitable test conversation. Do not export, copy, or paste cookies,
tokens, profile text, conversation contents, or unredacted screenshots into a
test artifact or issue. Do not alter Chrome storage, PostgreSQL ledgers, or
Tinder state to force eligibility.

1. Confirm a clean extension build, green E2E/Web/API CI, and one Tinder tab.
   Record extension version and a redacted time, not private page content.
2. With automation stopped, verify that popup and Web show the same connected
   account and that Discovery/Matches/Chats status is truthful. Check the
   approved redacted diagnostics against the existing selector regression
   fixtures. Stop if controls or identity are ambiguous.
3. Start Smart Auto Swipe only with explicit authorization for a real Like.
   Confirm the intended daily cap and priority. Verify Start, popup closure,
   Stop, browser restart, and manual resume without resetting attempt history.
   Reconcile the server attempt journal and local counters; treat an unknown
   outcome as unresolved rather than retrying.
4. Start Watch Conversations without automatic first messages. Verify that
   swipe and Matches sending modes refuse conflicting Starts, and that Stop
   prevents further actions. Observe a safe, consented test conversation
   before enabling any reply or first message action.
5. For a real send-confirmation test, obtain separate explicit approval for
   the recipient and exact send. Observe the external result and manual
   takeover behavior. Mark this release gate complete only with reliable
   real-world evidence; a fixture, DOM transition or queued action is not
   delivery confirmation.

Abort and leave automation stopped if account identity, permissions, selectors,
quota, server journal, or the visible result cannot be verified. Record only
redacted outcome codes, counts, and actions requiring human review.
