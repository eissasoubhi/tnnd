# TNND global AI: existing conversations and future matches

These are **two independently controlled modes**. Individual per-chat controls remain effective for both. None is enabled by installing the extension.

## Existing conversations — Start/Stop

1. TNND Web → Conversation management → **Start existing chats**. Review eligible/blocked counts and confirm. Chats marked Manual, Archived, Disabled, unsynced or requiring human attention are excluded.
2. In the extension, enable the global automatic-reply switch and connect your TNND account. Per-chat automatic replies that were explicitly set to OFF remain excluded by default. At global Start, the popup shows counts and asks for a **separate confirmation** if you want to re-enable those AI-managed chats in bulk. If you decline, they remain OFF; chats marked Manual/archived/blocked/disabled in TNND Web are always excluded.
3. Extension popup → **Start global existing chat runner**. TNND **reuses the existing Tinder tab** (rather than creating a competing Tinder session); if no Tinder tab exists, it opens one. That tab is navigated through previously synced, active, explicitly AI-managed conversations. On each visit TNND first checks whether the last visible message is **incoming and not followed by your own reply**, even if that incoming message is days or weeks old. It tries one AI response to that last unanswered message, then uses the same flow for future incoming messages. It does not send a new message after your last outgoing message. It re-checks authorization and the message before sending, and retains fingerprints across days to avoid repeats. If message bubbles cannot be read or their sender is uncertain, the live runner reports a specific skip/wait reason; export a redacted Tinder diagnostics ZIP to repair selectors rather than guessing. If several Tinder tabs exist, close the extras manually before starting.
4. Stop with **Stop global existing runner**. TNND keeps the Tinder tab open and blocks any pending auto-reply on that current runner chat before the send action. To resume individual automation on that chat without restarting the runner, open its TNND popup, enable **Automatic replies enabled for this chat**, and click **Save chat instructions**. If a Tinder send action was already submitted before Stop, delivery cannot be recalled. Other individual chat settings are preserved; Chrome must stay open.
5. Live feedback is visible in the extension popup **Existing conversations · live AI runner** and TNND Web **Conversation management → Global AI runner · live activity**. They show current stage, chat, visited count, send-action count, skip/errors and bounded recent event history. The extension Web status bridge is read-only and automatically refreshes every three seconds. **A send-action completion does not prove delivery by Tinder**.
6. A single Tinder session cannot operate both global runners concurrently. Stop **New-match AI** before starting the existing-chats runner, or vice versa.

## Future matches — separately enabled first AI message

1. Open Tinder → **Matches** in the left sidebar. Let at least two existing match tiles load.
2. Extension popup → **Start AI on future matches**. Confirm that this mode may send first Tinder messages, up to **five per day**.
3. TNND records all *currently visible* match tiles as the baseline. They do not receive new messages because of this action. Leave Tinder's **Matches** sidebar visible in a tab with Chrome running. A new match tile must appear **at the front**, ahead of known tiles and remain visible on two scans at least 15 seconds apart. A profile tile appearing in the middle/end of the list is treated as old/lazy-loaded and **not** queued.
4. A queued match is visited in a separate worker tab and linked to its exact Tinder conversation. TNND refuses sending unless the composer is found, the server message history is empty, existing manual/moved/archived choices are absent, and the account and per-chat settings permit AI. Gemini composes one opener using only observed profile details; a single durable send claim prevents duplicate attempts.
5. After the first sent message, the match is AI managed on TNND; the normal conversation flow can answer future incoming messages. If Tinder refuses or the send status is uncertain, TNND does not blindly retry. Check Tinder and the extension popup status.
6. **Stop new-match AI** turns off this mode and its alarm; the existing-chat runner remains independently controlled.

A newly displayed match tile cannot prove the match was created at that precise moment. The top-insertion and repeated-presence checks significantly narrow this ambiguity, but only a live Tinder test with a genuinely new match can validate real behavior. Do not start unsupervised at first: verify the first successful sending and check for unexpected Tinder UI changes or rate limits.

The two provided user diagnostic ZIPs showed that Tinder keeps a conversation URL while switching the left sidebar, with `a.messageListItem` rows on Messages and `a.matchListItem` tiles on Matches. The URLs, names, images and other private contents are **not** committed to this repository.

## Automated validation

Run `npm run build`, `npm run test:new-match-observation`, `npm run test:global-new-match-runner`, and `cd apps/web && npm test`.

For old pending replies, **Start global existing chat runner** is sufficient once existing chat AI management and extension settings are enabled. You should see “Unanswered incoming message found (old or new)” followed by Gemini generation and a single send attempt. For an unknown transcript, the runner explains whether it could not see message bubbles, could not determine direction, or detected that you already replied. Sending is claimed **before** clicking Tinder; failures/uncertain sends are not automatically retried. \n\nCI does **not** message real Tinder matches. Extension popup and tab state must be validated manually with Tinder.
