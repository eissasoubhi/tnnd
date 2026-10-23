# TNND — single-button extension rebuild (incremental delivery)

## Product contract
The **primary extension popup control** is a single Start/Stop button:
- **Démarrer** when every engine is stopped;
- **Arrêter** when an engine is active.

**Phase 4 amendment (2026-10-23):** the user explicitly requested three manual
activity buttons directly below that primary control: **Swipe | Matches | Chat**.
These dispatch commands to the same exclusive worker controller; they are not
settings forms or separate engine controls. Selection stays manual until Stop.
The next ordinary Démarrer uses saved TNND Web priorities. A read-only status
line reflects actual service-worker ownership; verbose configuration remains in
TNND Web. See `docs/user-stories/manual-mode-switch.md`.

TNND Web owns user priorities, quotas, scheduling rules, per-conversation
budgets, identity and authorization. Do not delete historical PostgreSQL
attempts, per-chat permissions or local safety state as part of the visual
rebuild.

## Phase 1 — one real Start / Stop (this PR)
- Keep old popup sources temporarily for safe rollback and the existing
  regression suite. Chrome's **manifest points to launcher.html**; old
  buttons are no longer visible from the extension toolbar.
- Button calls a single worker control. On Start, fetch authoritative Web
  priority and activate **one eligible existing engine only**: Swipe on the
  currently visible Discovery route, or the existing conversations/Matches
  watcher when automatic replies are enabled. New-match priority explicitly
  enables that watcher's separate protected opener mode.
- Stop calls existing engine Stop paths; the Swipe stop latch is persisted,
  and unresolved attempts remain blocked until reviewed.
- No Start is reported as successful without worker acknowledgement AND a
  running engine. Refresh must inspect actual ownership, not a stale flag.
- One fictional-browser Playwright test must click the real launcher, verify
  the manifest entry, Stop and reload, and test initial Swipe/Matches priority
  using the compiled extension/service worker. No Tinder account or Likes.

**Not delivered in Phase 1:** reactive switch between activities based on
actual unread/match availability, live acceptance of Tinder Likes, cross-activity
retry scheduling, or a signed-in browser acceptance report. Merely reading a
priority does not mean the full orchestrator is ready.

## Phase 2 — deterministic activity planner (separate, small PR)
- Consume Web priorities and actual observed pending work, not guess from the
  open Tinder route. Use one account+tab worker lease and a state machine:
  STOPPED → OBSERVING → SWIPE / REPLY / NEW_MATCH → IDLE / PAUSED / ERROR.
- Finish in-flight message operations before handoff. Protect shared quotas and
  per-conversation budgets.
- Expose read-only planner facts to TNND Web, not new popup controls.
- Playwright must cover every priority permutation, interruption, no work,
  timeout, extension reload and STOP during start.

## Phase 3 — acceptance and regression gates
- Run browser E2E (actual Chrome MV3 popup → service worker → fictional Tinder
  tabs → synthetic API/PostgreSQL) on every PR.
- Test durable Stop, blocked/uncertain attempts, quota rollover, API outage,
  version mismatch, old browser reloading and human takeover.
- With explicit authorization, check signed-in Chrome separately and publish
  only redacted counters/status. Do not infer server Like acceptance from
  a card change or a successful synthetic test.
- Treat both existing Chat Watcher and Swipe as **unverified on live Tinder**
  until separately demonstrated in the browser.

**Merge policy:** one behavior slice per PR, mandatory green CI, no deletion of
user data, no regression gate removed merely to obtain green checks.

## Phase 4 — explicit manual activity override (2026-10-23)

- Add accessible three-button selector to the single launcher beneath Stop.
- Use only one authenticated worker entrypoint with strict activity validation.
- For switching, preflight new activity without disrupting the old one, stop the old engine, verify disarm, recheck Swipe ledger, then start the new engine.
- Lock Matches first-message watch or Chat queue watch while selected; do not change Web priority or database permissions. Auto handoff on Swipe cap stays reserved for automatic (non-manual) mode.
- Show the *confirmed* active mode after any rejection/restart. Preserve emergency Stop and installed-build version provenance.
- Unit and fictional-browser CI validate safety. Signed-in acceptance with a real Tinder session is still a separate release gate.
