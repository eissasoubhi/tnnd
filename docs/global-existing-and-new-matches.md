# Global existing conversations vs. new matches

Two independent workflows, preserving per-chat controls.

## 1. Existing conversations (implemented)

TNND Web → **Conversation management** → **Existing conversations · global AI takeover**:

- **Start existing chats**: inspect the eligible/blocked/excluded counts, confirm explicitly, bulk-enroll already synced conversations with messages (100 per server transaction), and Resume eligible paused chats one at a time.
- **Stop existing chats**: confirm, then pause server automation for already AI-managed existing chats. Their AI-managed selections remain saved and can be Resumed individually.
- Explicitly manual, archived/moved-off Tinder, disabled, unsynced, empty-history, and human-action-blocked chats are skipped when starting.
- This never sends a Tinder message itself. It enables backend permissions for the pre-existing per-chat auto-reply engine. The engine still only processes the **currently open and recognized** Tinder conversation when the global extension auto-reply switch is on.
- Keep manual single-chat Start/Resume/Pause/Disable and Tinder popup per-chat enabled settings.

## 2. Future matches (read-only detection foundation, NOT sending)

Open Tinder **Messages** and the TNND extension popup:

- **Start detecting future matches** records a baseline of verified, visible, same-origin thread links after confirmation.
- Links appearing later are tracked as **newly observed**, not guaranteed newly created Tinder matches. DOM lazy loading can make an old chat appear for the first time.
- **Stop detection** turns off monitoring without changing existing conversation automation.
- No automatic first messages are sent by this detector. The pre-existing first-message button still works individually with its strict permission, empty-chat and duplicate-send gates.

**Next implementation milestone before any bulk new-match first message:** obtain a sanitized live Tinder DOM diagnostic from the user showing both the Matches tab and the Messages sidebar, with a known newly created match, and validate real creation-time evidence and stable thread identity. Only then connect a throttled, stateful, opt-in queue to the first-message send gate; never infer true match creation from a previously unseen link. Do not auto-send from fixture selectors alone.

## Verification

`npm run build`, `npm run test:new-match-observation`, `cd apps/web && npm test`, `cd apps/api && npm test`.

CI uses synthetic records, not real Tinder sending.
