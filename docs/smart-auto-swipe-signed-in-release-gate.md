# Smart Auto Swipe — signed-in release gate

Status: **blocked pending live, authorized browser QA**. Synthetic CI is necessary but does not establish that Tinder accepted any Like. Never label a UI card transition as a server-side receipt.

## Prerequisites

- Use only an account and automation scope explicitly authorized for this testing. Follow applicable Tinder terms; stop if permission is uncertain.
- Start TNND API and Web locally with migrations applied. Use a clean, current extension build and one signed-in Tinder tab on Discovery (`/app/recs`).
- Back up or export test account settings. Start with the smallest possible daily Like quota and a single short session.
- Do not attach chat content, full profile photos, access tokens, cookies, unredacted screenshots, or full browser diagnostics to issues or pull requests.
- Ensure the user can immediately press **Stop** and manually inspect the UI. The Web configuration checkbox alone must not arm the extension.

## Release gate: record pass / fail / blocked for each item

| Check | Expected result |
| --- | --- |
| Disabled and disarmed defaults | No Like is executed on extension load, Web settings save, browser restart, or sign-in. |
| Explicit Start / Stop | Start is available only to the trusted popup and only when guards pass; Stop always disarms, including during API outage. |
| One-tab and account ownership | A second Tinder tab, tab change, or account mismatch blocks execution. |
| Scheduler | Only the current daily time-zone slot starts; no catch-up burst; daily session and break limits hold. |
| Durable claim | One attempt is atomically reserved before any click. Concurrent devices cannot exceed the daily quota. |
| One-shot action | Exactly one authorized Like action is attempted per reservation; no retry on ambiguous or missing response. |
| UI transition | Record whether the top card visibly changed; report this as **UI-observed only**. |
| Platform acceptance | Do **not** infer Tinder backend acceptance from a changed card. Mark **unverified** unless independent, permitted evidence exists. |
| Uncertain outcome | A missing, failed or ambiguous action remains reserved and blocks further Likes pending review. |
| Reload / MV3 restart | No duplicate Like; active session is recovered paused and requires safe resumption. |
| Match modal | Modal/overlay interrupts the action and transfers no ownership until the UI is stable. |
| Existing conversation | In-flight send or generation cannot be interrupted. No simultaneous Swipe and Chat executor. |
| New match | No simultaneous Swipe and Match executor; configured priority and safe handoff are tested. |
| Per-chat daily budget | Only active handling counts; idle time excluded; quota respected at safe selection boundaries. |
| Dashboard | Counts originate from authenticated ledger; API failures display **unavailable**, not zero. Distinguish attempted, UI-observed and unresolved. |
| Day rollover | Account time zone governs daily counters; unresolved reservations survive midnight and block replay. |

## Test record template

- Extension version / commit SHA:
- API version / commit SHA:
- Browser and operating system:
- Account timezone (no personal identity):
- Consent/authorization checked (yes/no; **do not upload evidence**):
- Date/time and scenario:
- Initial session and quota:
- Attempt ID (redacted/truncated):
- Observed UI transition (yes/no/unknown):
- Backend receipt (verified/unverified):
- Server ledger delta (attempted / UI-observed / unresolved):
- Duplicate action detected (yes/no):
- Stop/restart behavior:
- Outcome (pass/fail/blocked), minimal reproduction steps:

## Current limits

The merged runner intentionally refuses to run when another activity runner is enabled. This conservative exclusivity is not the requested seamless priority-based handoff; it remains a release blocker. The Web Settings response may still say `runtime_not_implemented` even though an explicitly armed extension runner exists; it must not be presented as a verified live readiness signal. The signed-in browser QA above is still outstanding.

Do not declare the feature production-ready until the handoff and dashboard behavior are integrated, CI and release gates are green, and each live QA scenario is recorded with evidence appropriate for the authorized account.
