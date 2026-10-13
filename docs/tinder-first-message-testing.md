# Start an AI-managed Tinder conversation (local test)

TNND has two distinct modes. Both require a connected TNND account, configured Gemini, an open, matching Tinder chat tab, and explicit AI-managed authorization. TNND cannot autonomously browse/swipe or message unrelated Tinder profiles.

## A. First message, only for a truly empty chat

1. In **TNND Web → Conversation management**, select the intended chat and save **AI managed** with the confirmation.
2. In **TNND Web → Conversations**, open that same chat and press **Resume** if it is Paused. It should be **Active**.
3. In the **TNND extension → Options**, activate **Enable automatic replies on Tinder**, set **First AI messages to Tinder matches / day** (default **5**, range 1–100), verify Gemini, and save. This cap is separate from **Maximum automatic replies / day**.
4. Open the exact Tinder conversation tab. In the popup, turn on **Automatic replies enabled for this chat** and save its settings.
5. Press **Start chat · Send first AI message** in the popup and explicitly confirm that a message will be sent.
6. TNND verifies the current thread URL, visible composer, no visible message bubbles, active backend AI-managed status, no persisted messages, quiet hours and daily limit before generating. It rechecks everything before the send.
7. Only **one opener** may be attempted. The attempt is recorded **before clicking Send** and cannot be automatically retried if delivery is uncertain. If an error occurs, inspect Tinder before doing anything further.

A chat that already contains messages is never eligible for a first-message opener.

## B. Continue an existing conversation

1. Keep the same **AI managed + Active** Web state and global/per-chat extension auto-reply toggles.
2. Keep Tinder open on that exact conversation. The extension monitors the currently loaded chat; it is not a 24/7 server agent.
3. When Tinder shows a new **incoming**, not-yet-answered message, TNND waits the configured delay, generates a reply and rechecks server-side authorization before sending.
4. Quiet hours, limits, paused/human-action-required states and explicit manual takeover still stop the automation.

## Automated tests

Use `npm run test:first-message`, `npm run build`, and `cd apps/api && npm test`. Synthetic CI never connects to or sends messages on a real Tinder account. Real-world sending and selector accuracy require the user's supervised confirmation on Tinder.
