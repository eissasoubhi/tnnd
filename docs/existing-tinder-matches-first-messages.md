# Start AI conversations with existing Tinder Matches

This is different from **Start AI on future matches** and **Start global existing chat runner**.

## First-time messages to matches already visible in Tinder

1. Update TNND and its Chrome extension; connect TNND/Gemini and enable automatic replies in extension Options.
2. Stop **Global existing chat runner** and **Future-match AI** first. Only one global worker can use Tinder's single web session.
3. Keep exactly **one** Tinder tab open. Select **Matches** (not **Messages**) in Tinder and wait for the match tiles to load.
4. In TNND extension popup, choose **Start AI on existing matches**. Review the number of visible match IDs and confirm that TNND may send first messages to eligible empty conversations.
5. TNND saves that list by exact Tinder conversation reference, then visits each matching tile through the same tab without forcing full Tinder reload. It checks the actual opened thread/composer and verifies the backend conversation is empty, not manually owned, archived or action-required. It records a one-time send attempt **before** calling Tinder Send.
6. Maximum **five** first-message attempts per day. The same match is not attempted twice automatically, even after reopening the extension or if delivery is uncertain. It applies the separate **Time per conversation** setting (default 15s). If Matches is not accessible after Tinder switches tabs, the match is skipped with an actionable message; TNND will not guess a link or open a second Tinder tab.
7. When the batch has no remaining matches to attempt, or reaches the daily cap, TNND stops the first-message worker and **attempts to hand off** to **Global existing chat runner** on the same Tinder tab, so it can listen and answer incoming messages from AI-managed existing conversations. The handoff requires that those chats have been synchronized with TNND and authorized for AI; if none are eligible, the popup shows why automatic reply monitoring could not start.

## How the three delays differ

- **Minimum/Maximum reply delay (Options):** a random 20–60 seconds by default, before responding to a detected incoming message *inside one conversation*.
- **Time per conversation (popup):** a separate minimum dwell, 10/15/30/60/120 seconds, before visiting the next chat.
- **First-message daily cap:** maximum five attempted initial matches daily. This is a safety/rate-limit cap rather than a delay.

## Stable-ID indexing

A Tinder conversation is keyed by `externalThreadId`, not the sidebar row position. Messages and matches may jump to the top of Tinder after an outgoing message. The existing-chat runner has a persistent account-scoped work index with last checked timestamps and unread hints; it inspects newly changed chats without using a list index. The work index is currently in Chrome extension local storage. Conversation messages and latest synchronized timestamps are stored in TNND's database.

## Live verification

Check the first genuine Tinder match manually: a completed click is not guaranteed delivery. Pause at any sign of wrong conversation, unexpected message direction, duplicate attempts or Tinder restrictions. CI does not send Tinder messages.
