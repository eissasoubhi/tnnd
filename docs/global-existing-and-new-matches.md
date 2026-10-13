# Global existing conversations vs. new matches

Two independent workflows, preserving per-chat controls.

## 1. Existing conversations (implemented)

TNND Web → **Conversation management** → **Existing conversations · global AI takeover**:

- **Start existing chats**: inspect the eligible/blocked/excluded counts, confirm explicitly, bulk-enroll already synced conversations with messages (100 per server transaction), and Resume eligible paused chats one at a time.
- **Stop existing chats**: confirm, then pause server automation for already AI-managed existing chats. Their AI-managed selections remain saved and can be Resumed individually.
- Explicitly manual, archived/moved-off Tinder, disabled, unsynced, empty-history, and human-action-blocked chats are skipped when starting.
- This enrollment does not send Tinder messages itself. To visit more than one chat, use the **extension popup → Existing conversations → Start global existing chat runner**. The runner opens an inactive, dedicated Tinder tab, cycles only active AI-managed chats with actual saved messages, and lets the per-chat extension engine independently validate each new incoming reply. Stop closes the managed Tinder tab and clears the recurring alarm. Chrome must remain open; browser timer throttling can delay processing.
- Keep manual single-chat Start/Resume/Pause/Disable and Tinder popup per-chat enabled settings. Enable **automatic replies on Tinder** in extension Options before starting the dedicated runner. Runtime checks still enforce per-chat permission, quiet hours, and daily limits. The background runner never sends messages directly.

## 2. Future matches (read-only detection foundation, NOT sending)

Open Tinder **Messages** and the TNND extension popup:

- **Start detecting future matches** records a baseline of verified, visible, same-origin thread links after confirmation.
- Links appearing later are tracked as **newly observed**, not guaranteed newly created Tinder matches. DOM lazy loading can make an old chat appear for the first time.
- **Stop detection** turns off monitoring without changing existing conversation automation.
- No automatic first messages are sent by this detector. The pre-existing first-message button still works individually with its strict permission, empty-chat and duplicate-send gates.

**Next implementation milestone before any bulk new-match first message:** obtain a sanitized live Tinder DOM diagnostic from the user showing both the Matches tab and the Messages sidebar, with a known newly created match, and validate real creation-time evidence and stable thread identity. Only then connect a throttled, stateful, opt-in queue to the first-message send gate; never infer true match creation from a previously unseen link. Do not auto-send from fixture selectors alone.

## Verification

`npm run build`, `npm run test:new-match-observation`, `npm run test:global-existing-runner`, `cd apps/web && npm test`, `cd apps/api && npm test`.

CI uses synthetic records, not real Tinder sending.
