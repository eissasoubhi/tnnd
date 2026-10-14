# TNND — Product Design Expert: initial code-based audit (2026-10-14)

Status: **source review and first improvement**, not a finished screen-by-screen visual audit. No live TNND browser flow or screenshots were captured in this review. Findings below are grounded in tracked code, not inferred screen appearance.

## Reviewed surfaces and evidence
- Extension settings `public/options.html`, popup `public/popup.html` and `src/popup.ts`.
- Daily opener policy `src/tinder-first-message-daily-limit.ts` and `scripts/check-first-message-daily-limit.mjs`.
- `src/tinder-global-new-match-runner.ts` for a shared cap and UTC date bucket.
- TNND web conversations `apps/web/src/conversation-panel.ts`, `apps/web/src/conversation-overrides-panel.ts`, draft guidance and match identity.
- Existing design constraints `docs/design/neo-bento.md` and `docs/design/PRODUCT_PROFILE.md`.

## Prioritized findings

| Priority | Surface / evidence | Problem and user impact | Action |
| --- | --- | --- | --- |
| P1 | Extension settings and popup daily opener copy | "First AI messages / day" can be misread as N back-and-forth turns to one match, N chat threads, or permission to re-open the same unmatched/unanswered thread tomorrow. The actual policy counts **one opener attempt per match**, across existing/future/manual start modes; it uses UTC date and may count uncertain sends. | **Fixed in this PR**: explain unit, scope, reset time, uncertain attempts, distinct reply cap and non-repeat rule; link input to help text. |
| P1 | Extension popup `startFirstMessage` feedback | "First message sent on Tinder" overstates verified delivery. The runtime acknowledges a send action, not independent recipient delivery. | **Fixed in this PR**: say send action completed, and explicitly state delivery is not independently confirmed. No sending gate changed. |
| P2 | Conversations `conversation-panel.ts` and management | Unknown display name fallback was French while surrounding UI is English; may produce confusing mixed-language hierarchy. Code evidence only. | **Addressed in follow-up PR**: use a neutral English fallback consistently, preserve user-saved names. |
| P2 | Conversation panels `conversation-panel.ts` and override draft panel | Technical "Topic Engine" and advanced controls compete with the primary task. Screen density and order need visual verification at desktop and mobile before refactoring. | Capture screens, inspect task hierarchy, keyboard focus and small screens. |
| P2 — to verify | Extension `public/popup.html` | Dense status blocks and 10–11px supporting text may be hard to scan in a 380px popup, but the actual CSS/contrast must be checked in rendered light and dark layouts before claiming a defect. | Review actual screenshots at popup 380px, settings at 390/1280, preview and injected UI. |

## Quality and security invariants
- No change to Tinder selectors, rate-limit logic, automated sends, message count, account/session or consent behavior.
- Maintain Neo Bento CSS, existing feature IDs and model interactions.
- Do not replace status with optimistic "delivered".
- Keep public root README empty.

## Follow-up visual audit (not yet executed)
1. **Web onboarding/Overview:** sign-out -> sign-in -> setup card -> next action. Validate text hierarchy and async states.
2. **Web Conversations:** list/search -> select chat -> identity/missing-message feedback -> draft/approve -> action-required handling. Confirm unsaved input state and meaningful actions.
3. **Web Identity/Memories/Settings:** editing, validation, save, review, privacy, empty/error modes.
4. **Extension:** popup connection -> settings daily cap -> preview -> authorized match start / read-only import, without actually sending a real Tinder message. Check compact scannability and keyboard operation.
5. Capture real browser screenshots at 1440, 840, 390/375 (light/dark); capture extension popup/settings/preview and inspect visual outcomes. Use existing CI visual artifacts only as test evidence, not as proof of real Tinder behavior.

## Checks to run
- `npm run test:first-message-daily-limit` and `npm run test:extension-neo-bento`, `npm run build`.
- CI web functional browser QA, extension visual QA and V1 release gate.
- Live acceptance testing only with deliberate user consent; no automated production sends during visual design review.


## Second targeted UX pass — conversations (2026-10-14)

- Source finding: the conversation temporary-instruction textarea had no associated accessible name; its placeholder was insufficient. A linked label and help text now explain scope without changing behavior.
- Source finding: "Live structured conversation context" overpromised real-time sync. Changed to "Based on synchronized conversation history".
- Source finding: English UI contained the French placeholder "Profil Tinder à synchroniser" in two separate panels. Unified as "Match name not yet synced".
- Updated `conversation-testing-ux.test.ts` with copy and semantic checks. Visual/browser accessibility verification remains pending.

## Third targeted UX pass — stale account data and reversible conversation filters

- **P1 (source review):** In-flight conversation list responses could overwrite the UI after sign-out/account switch. The list now validates request order **and account token**, hides previous account data immediately, and ignores stale detail responses. Failed list loads also clear stale details.
- **P2 (source review):** Distinguish zero synced conversations from an empty search. The toolbar now exposes a keyboard-friendly Clear filters button that restores all conversations.
- Signed-out state no longer presents invented/irrelevant `0 shown · 0 total` counters.
- Unit tests cover state labels and response guards; integration assertions protect wiring. Live browser session testing and screenshot-based UX audit remain pending.
