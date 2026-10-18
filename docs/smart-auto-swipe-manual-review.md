# Smart Auto Swipe: safely recovering an uncertain Like

**This is an operator-controlled audit process, not proof of Tinder acceptance.**
A changed Discovery card does not establish server-side Like acceptance. A
missing transition can mean the Like did or did not execute. Never retry the
same attempt automatically and never convert an unknown result to confirmed.

## Before reviewing

1. Update TNND API/Web/extension; apply migration `0024` to the *intended* local
   PostgreSQL database using `docker compose exec api npm run migrate`.
   Preserve Docker volumes. Never run `docker compose down -v`.
2. In the extension click **Stop swiping** and confirm **Automation: stopped**.
3. Open Tinder Discovery manually. Look at the currently visible card and any
   recent matches. If you cannot assess whether continuing would risk interacting
   with the same card again, **leave automatic Likes disabled** and request
   assistance. No private screenshots/IDs are required in issue reports.
4. In TNND Web → Settings → Smart Auto Swipe → Recent attempts, review only the
   specific `uncertain` row. The UI asks for explicit confirmation and does not
   send Tinder actions. Acknowledgement means *reviewed, outcome remains UNKNOWN*.

## What review changes, and what it does not

- The database **retains `status='uncertain'`**, the original timestamp, any
  recorded technical reason, and the consumed attempt/quota slot. It adds
  `reviewed_at` and `review_kind='acknowledged_unknown_no_retry'` for audit.
- Review closes a per-account, per-device durable rearm gate so that other
  currently armed installations cannot opportunistically resume.
- Unreviewed `reserved` or `uncertain` rows anywhere on the account still
  block new claims; review is only offered for an older `uncertain` row.
- The old attempt ID is **never reused**.
- It does **not** confirm that Tinder accepted the original Like.

## Starting again, only after manual inspection

1. Explicitly enable scheduling in TNND Web if disabled, then Save.
2. With one Discovery tab and other Tinder automation runners stopped, use the
   extension popup's **Start automatic swiping**. This is a separate deliberate
   user action; changing Web preferences or reviewing a row must not trigger it.
3. The extension requires an authenticated account-day count proof before it
   can discard *one matching local reserved counter* (only the local pending
   counter, **not** the PostgreSQL attempt row or quota slot). It then requests
   account/device-specific reauthorization. Corrupt, cross-device, missing,
   conflicting or unavailable proofs refuse Start. Do not reset local storage
   manually to bypass this check.
4. Inspect `Refresh swipe status` and `Today and recent attempts`. Stop
   immediately if another unverified outcome or modal appears; confirm no
   duplicate action after extension/service-worker restart.
5. Release is still blocked until the Swipe/Matches/Chats coordination and
   signed-in acceptance checks are independently verified. CI alone is not
   proof that Tinder accepted a Like.

## Tests (synthetic only)

- Root CI executes `test:smart-swipe-auto-runner` including checked
  reconciliation proof and Start/Stop invariants.
- API CI exercises authentication boundaries and migration list integrity.
- Web CI validates the strict history model, reviewed markers and unknown
  status semantics.
- Browser QA needs user-provided evidence of UI status and attempt counters,
  without profile content, cookies, credentials, bearer tokens or private logs.
