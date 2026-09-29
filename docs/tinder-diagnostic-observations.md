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

## Observed inbox and conversation signals

- A visible Messages sidebar can coexist with the primary Discovery route; route and sidebar state must stay independent.
- Real unread conversation anchors were observed with the structural class token `messageListItem--isNew`.
- A real conversation exposed a visible message composer and both incoming/outgoing message candidates.
- Raw thread identifiers, message/profile text, screenshots and DOM snapshots remain excluded from repository fixtures.

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
