# Tinder diagnostic observations

This file preserves only sanitized structural observations from user-triggered TNND diagnostic bundles. It intentionally excludes screenshots, raw DOM snapshots, thread identifiers, profile/message text, session data, tokens and other personal data.

## Observed route states

- `/app/recs` -> Discovery (`recs` context).
- `/app/explore` -> Discovery (`explore-catalog` context).
- `/app/explore/<category>` -> Discovery (`explore-category` context).
- `/app/matches` -> Inbox.
- `/app/messages` -> Inbox-compatible route.
- `/app/messages/<thread>` -> Conversation.

Route state and visible layout are not always the same thing. Tinder can keep Discovery visible while a Messages sidebar is present, so sidebar state must remain orthogonal to the primary route state.

## Observed UI sub-states

- Discovery may have a normal profile card or an expanded profile view.
- Discovery may be covered by a visible blocking modal, including match-related and subscription/paywall flows.
- A hidden/off-screen `role="dialog"` element is not sufficient evidence of a blocking modal. Visibility must be checked before gating actions.
- Conversation pages expose a visible message composer and a message list; Send can be present but disabled when the composer is empty.

## Orchestrator rules derived from diagnostics

1. Detect the primary route state.
2. Detect sidebar state independently.
3. Detect profile card vs expanded profile when on Discovery.
4. Detect only *visible* blocking overlays/modals.
5. Do not execute bounded Tinder actions while a blocking overlay is visible.
6. Persist/checkpoint after each bounded action before scheduling the next task.
7. Treat `/app/explore/<category>` as a Discovery stack, not as an unknown route.
8. Keep diagnostics and regression fixtures synthetic/redacted; never commit real screenshots, raw Tinder DOM, profile text, message content, auth/session material or real thread IDs.

## Regression coverage

`fixtures/tinder-state-regression.json` is the executable synthetic source for these observations. The root build runs `scripts/check-tinder-state-machine.mjs` so the known route/sub-state behavior does not silently regress.


## 2026-09 V1 diagnostic sequence

A five-step user-triggered redacted diagnostic sequence confirmed these additional structural facts without retaining raw profile/message text or real thread identifiers:

- Discovery can remain on `/app/recs` while a Messages sidebar is visibly open; that state is inbox-readable without forcing navigation to `/app/matches`.
- Visible unread conversation anchors use the exact class token `messageListItem--isNew` and route to `/app/messages/<thread>`.
- The observed conversation used `textarea[placeholder*="message" i]` as its visible composer.
- The redacted conversation sample produced 7 visible message candidates, with direction classification resolving all 7 (1 outgoing, 6 incoming).
- Thread identity is derived from the stable conversation pathname rather than `document.title`.

Only synthetic placeholders and aggregate counts belong in regression fixtures; real thread IDs, screenshots and raw DOM remain outside the repository.
