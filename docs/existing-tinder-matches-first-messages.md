# Start AI conversations with existing Tinder Matches

This is different from **Start AI on future matches** and **Start global existing chat runner**.

## First-time messages to matches already visible in Tinder

1. Update TNND and its Chrome extension; connect TNND/Gemini and enable automatic replies in extension Options.
2. Stop **Global existing chat runner** and **Future-match AI** first. Only one global worker can use Tinder's single web session.
3. Keep exactly **one** Tinder tab open. Select **Matches** (not **Messages**) in Tinder and wait for the match tiles to load.
4. In TNND extension popup, choose **Start AI on existing matches**. Review the number of visible match IDs and confirm that TNND may send first messages to eligible empty conversations.
5. TNND saves that list by exact Tinder conversation reference, then visits each matching tile through the same tab without forcing full Tinder reload. It checks the actual opened thread/composer and verifies the backend conversation is empty, not manually owned, archived or action-required. It records a one-time send attempt **before** calling Tinder Send.
6. Maximum **five** first-message attempts per day by default (configurable in TNND extension **Settings → Tinder auto-chat → First AI messages to Tinder matches / day**, 1–100). The same match is not attempted twice automatically, even after reopening the extension or if delivery is uncertain. It applies the separate **Time per conversation** setting (default 15s). If Matches is not accessible after Tinder switches tabs, the match is skipped with an actionable message; TNND will not guess a link or open a second Tinder tab.
7. When the batch has no remaining matches to attempt, or reaches the daily cap, TNND stops the first-message worker and **attempts to hand off** to **Global existing chat runner** on the same Tinder tab, so it can listen and answer incoming messages from AI-managed existing conversations. The handoff requires that those chats have been synchronized with TNND and authorized for AI; if none are eligible, the popup shows why automatic reply monitoring could not start.

## How the three delays differ

- **Minimum/Maximum reply delay (Options):** a random 20–60 seconds by default, before responding to a detected incoming message *inside one conversation*, and between the 2–3 bubbles of one opening turn.
- **Time per conversation (popup):** a separate minimum dwell, 10/15/30/60/120 seconds, before visiting the next chat.
- **First-message daily cap (Options):** five attempted first messages daily by default, configurable between 1 and 100. This applies across existing-match batches, future matches and manually started first AI messages; it is separate from the daily automatic-reply counter. The cap counts durable send claims, including uncertain delivery, and resets at UTC midnight.

## Stable-ID indexing

A Tinder conversation is keyed by `externalThreadId`, not the sidebar row position. Messages and matches may jump to the top of Tinder after an outgoing message. The existing-chat runner has a persistent account-scoped work index with last checked timestamps and unread hints; it inspects newly changed chats without using a list index. The work index is currently in Chrome extension local storage. Conversation messages and latest synchronized timestamps are stored in TNND's database.

## Already AI-managed match with no first message

A previous TNND run may have persisted an **AI managed + explicitly selected** conversation before the first Tinder Send action, leaving the chat empty. The existing-match opener now **reuses that active authorization** instead of treating it as an exclusion. It still verifies the backend and Tinder thread are the same, that the backend message history is empty and that the first-message attempt has not been claimed.

A match marked **manual, archived, moved-off-Tinder, disabled, paused, waiting-for-user/action-required or not explicitly AI-authorized** is *not* silently reactivated. The global batch never resets existing status/management to active to evade exclusions. If a match was skipped before any send attempt, clicking **Start AI on existing matches** again can requeue it after checking both send-attempt journals. Never clear extension storage to force retries.

## Troubleshooting: queued matches but none sent

If the popup shows many queued matches and `Global new-match automation was stopped or the tab is not authorized`, Tinder may have changed chats using SPA navigation while Chrome's `MessageSender.url` still refers to the original document. The updated extension verifies the **live Tinder tab URL** and stable thread ID instead, for both global first-message and subsequent reply permissions.

After installing/reloading TNND and refreshing the existing Tinder tab, click **Stop new-match AI** and then (with **Matches** visible) **Start AI on existing matches** to explicitly restart. Previously skipped IDs are restored only when neither the durable first-message claim journal nor the content send-attempt journal records an attempt. Matches with any uncertain/past send attempt remain excluded. Never clear `chrome.storage` or claim records manually; this could cause duplicates.

## Live verification

Check the first genuine Tinder match manually: a completed click is not guaranteed delivery. Pause at any sign of wrong conversation, unexpected message direction, duplicate attempts or Tinder restrictions. CI does not send Tinder messages.

## Verified empty transcript versus sidebar labels

For a Tinder chat with a visible `ol[aria-label="Messages"]` transcript, TNND now counts only visible message articles **inside that transcript**. If it has no message articles, a generic `Messages` sidebar label must not be counted as a chat message. A genuinely nonempty transcript still blocks the first-message opener. When Tinder does not expose the verified transcript, existing conservative fallback checks remain in place; do not bypass a `messages_present` warning blindly.

If the popup still reports `messages_present` on a visibly empty thread after rebuilding/reloading the extension and reconnecting Tinder, capture TNND's redacted selector diagnostics (candidate counts and selectors, no message texts) and report the exact Tinder view. This regression is only synthetic/static-tested in CI; live Tinder behavior requires supervised validation.

## Empty-match diagnosis: Send button mistaken for a message

A sanitized Tinder diagnostic showed a **genuinely empty match** with no `ol[aria-label="Messages"]` and zero message articles, but a `button[aria-label="Send message"]`. The previous broad fallback `[aria-label*="message"]` counted that Send control as one outgoing message and blocked the opener with `messages_present`.

TNND now excludes message composer form controls and navigation elements from fallback message candidates, and when the known `.chat` pane exists it ignores elements outside that pane. Existing verified message articles still count. The backend empty-history, conversation identity, management permission and durable no-retry checks remain mandatory; the patch does **not** bypass them. After updating, reload the Chrome extension and the Tinder tab, stop the previous new-match run and manually start the existing-match batch again. Only previously skipped matches with **no durable send attempt** may be requeued. Verify a first live send yourself; CI uses synthetic data only.

## Short, grounded opening messages (v0.2.16)

A first message to a match is now **one opener composed of two or three separate short Tinder bubbles**, not a long paragraph. Gemini is asked for a **single** candidate containing line breaks; TNND splits it into short bubbles, discards unsupported claims about unseen profile photos/bio or invented feelings (for example `ton profil m'a fait sourire`) and falls back to the neutral `Salut` / `Bien ou bien ?` if necessary. TNND does not claim to have inspected the match's profile when only their visible name/age were available.

The configured **minimum/maximum reply delay** (20–60s by default) is also used between bubbles in this *same* conversation. The separate time-per-conversation setting is not overridden. Immediately before each additional bubble, TNND confirms the same chat is open, that the previous bubble is really the last recognized outgoing message, and that the match has not replied. If any check fails or the runner is stopped, no further bubble is sent and the opener remains claimed as a single match attempt. Each successfully submitted bubble is synchronized individually; no automatic retries of partial/uncertain sends.

The **daily first-message quota is per match opened**, not per fragment; two or three consecutive opener bubbles consume only one of the five default daily attempts.
