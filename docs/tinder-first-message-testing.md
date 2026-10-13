# Start an AI-managed Tinder conversation (local test)

TNND has two distinct modes. Both require a connected TNND account, configured Gemini, an open, matching Tinder chat tab, and explicit AI-managed authorization. TNND cannot autonomously browse/swipe or message unrelated Tinder profiles.

## A. First message, only for a truly empty chat

1. In **TNND Web → Conversation management**, select the intended chat and save **AI managed** with the confirmation.
2. In **TNND Web → Conversations**, open that same chat and press **Resume** if it is Paused. It should be **Active**.
3. In the **TNND extension → Options**, activate **Enable automatic replies on Tinder**, set **First AI messages to Tinder matches / day** (default **5**, range 1–100), verify Gemini, and save. This cap is separate from **Maximum automatic replies / day**.
4. Open the exact Tinder conversation tab. In the popup, turn on **Automatic replies enabled for this chat** and save its settings.
5. Press **Start chat · Send first AI message** in the popup and explicitly confirm that a message will be sent.
6. TNND verifies the current thread URL, visible composer, no visible message bubbles, active backend AI-managed status, no persisted messages, quiet hours and daily limit before generating. It rechecks everything before the send.
7. One opener is now a **2–3 bubble turn** (e.g. `Salut` then `Bien ou bien ?`), not a single combined bubble. The AI must not invent reactions to the match's profile or photos. Each bubble is sent individually and synchronized with a unique message ID. The time **between bubbles in the same chat** uses extension Options → Minimum/Maximum reply delay (default 20–60 seconds), not the separate time-per-conversation navigation setting. After every gap, TNND rechecks the exact chat, latest outgoing bubble and all automation permissions; if the match answers, the chat changes, or a send cannot be verified, the rest of the opener is stopped. One durable first-message claim is recorded before any Tinder Send, covering the entire 2–3 bubble turn and counting as **one** daily opening attempt per match. Partial/uncertain sends are never automatically retried; inspect Tinder before doing anything else.

A chat that already contains messages is never eligible for a first-message opener.

## B. Continue an existing conversation

1. Keep the same **AI managed + Active** Web state and global/per-chat extension auto-reply toggles.
2. Keep Tinder open on that exact conversation. The extension monitors the currently loaded chat; it is not a 24/7 server agent.
3. When Tinder shows a new **incoming**, not-yet-answered message, TNND waits the configured delay, generates a reply and rechecks server-side authorization before sending.
4. Quiet hours, limits, paused/human-action-required states and explicit manual takeover still stop the automation.

## Automated tests

Use `npm run test:first-message`, `npm run build`, and `cd apps/api && npm test`. Synthetic CI never connects to or sends messages on a real Tinder account. Real-world sending and selector accuracy require the user's supervised confirmation on Tinder.
