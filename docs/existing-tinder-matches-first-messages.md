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

- **Minimum/Maximum reply delay (Options):** a random 20–60 seconds by default, before responding to a detected incoming message *inside one conversation*. Opener bubbles use the separate opening-bubble delay (3–10 seconds by default).
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

## Short, grounded opening messages (v0.2.17)

A first message to a match is now **one opener composed of two or three separate short Tinder bubbles**, not a long paragraph. Gemini is asked for a **single** candidate containing line breaks; TNND splits it into short bubbles, discards unsupported claims about unseen profile photos/bio or invented feelings (for example `ton profil m'a fait sourire`) and falls back to the neutral `Salut` / `Bien ou bien ?` if necessary. TNND does not claim to have inspected the match's profile when only their visible name/age were available.

The opener always begins with a short simple greeting (`Salut`, `Hello`, `Hi`, or `Salut cv?`). Separate **minimum/maximum opening-bubble gap** settings (3–10s by default) control the short pauses between first-message bubbles. The **minimum/maximum reply delay** (20–60s by default) is reserved for responding to an incoming match message. The separate time-per-conversation setting is not overridden. Immediately before each additional bubble, TNND confirms the same chat is open, that the previous bubble is really the last recognized outgoing message, and that the match has not replied. If any check fails or the runner is stopped, no further bubble is sent and the opener remains claimed as a single match attempt. Each successfully submitted bubble is synchronized individually; no automatic retries of partial/uncertain sends.

The **daily first-message quota is per match opened**, not per fragment; two or three consecutive opener bubbles consume only one of the five default daily attempts.


## Adaptive Conversation Flow (v0.2.18)

The default progression is **salutation → prendre des nouvelles → ville/origine → quotidien/travail → centres d’intérêt → discussion libre**. It is **not a questionnaire**. The latest match message or a directly asked question takes priority over the next discovery suggestion. TNND never asks a question it already asked or that a high-confidence persisted **match** fact answers. Manual takeover, human-action pauses and all original per-chat send permissions still apply.

TNND already saves chat messages, topic state and verified conversation facts in the backend. The new Conversation Flow state is **derived on demand from this history**, so it survives restarts and does not require another Gemini call or a second user-memory table. If a fact is uncertain or not yet synchronized, the stage is a *suggestion*, not a claim of knowing the answer. Outgoing questions count as covered to prevent interrogation.

You can inspect the per-conversation stage and known facts in **TNND Web → Conversations → Conversation Flow**. In **TNND extension → Options → Tinder auto-chat**, enable/disable the flow and select the preferred discovery order (ville first, travail first or centres d’intérêt first). Existing **Extra instructions** remain in force and are not erased or duplicated. The saved user profile still has authority over identity; no claims are made about a match photo or biography without evidence.

Extension generation includes an authenticated Tinder thread reference, enabling the backend to use that exact user-scoped conversation's synced history; if no conversation exists yet, it falls back to observed messages rather than inventing a stored match memory. ChatGPT is not connected to Tinder directly: test drafts manually before enabling automation.


## Reply watcher · version 0.2.20

In **TNND extension → Existing conversations**, click **Watch new replies** to enter a separate watcher mode. Unlike the existing backlog runner, the watcher only opens AI-managed, enabled, non-paused Tinder chats with new evidence: a visible unread badge or a newer backend-synchronized incoming message. It does **not** scan all conversations or bulk-enable disabled chats. The catch-up runner remains separate; only one mode can run at a time.

With Tinder open, the content script observes unread sidebar hints and sends a wake-up event. At startup and after service-worker wakeup, the watcher requests a read-only snapshot of currently visible unread threads; a Chrome alarm provides a 30-second fallback. The persistent account-scoped index keeps pending work and avoids reprocessing a checked incoming-message version. Existing authenticated backend management, per-chat approvals, reply caps, quiet hours and the independent **20–60 second incoming reply delay** still apply.

The watcher displays **Waiting / New replies / Processing / Paused / Disconnected** and a confirmed pending count. Stop it with **Stop watcher**. It needs an open Tinder tab, a functioning local API and live authorization. It cannot see Tinder conversations that are not currently rendered, cannot monitor while Chrome/Tinder are unavailable, and does not guarantee instant sends. This does not affect the 5-first-match-openers/day quota or 3–10 second opener-fragment delay.


## Conversation focus · watcher bug fix in 0.2.21

While **Watch new replies** is running, the current authorized Tinder chat stays in focus for **3 minutes after the latest observed incoming reply or outgoing send**. Every new reply refreshes this inactivity window. Other waiting matches remain indexed and are processed when the current exchange has been idle; messages and sending continue only if existing permissions allow. When starting the watcher from an already open, eligible conversation, that conversation is followed first instead of immediately visiting other matches. The shorter chat-switching dwell and the configurable reply delay are unrelated to this focus lease. The catch-up runner's rotation is unchanged. This does not guarantee that off-screen Tinder messages are visible or that matches respond in any time window.


## MatchProfile topics after first acquaintance

If the currently authenticated match already has a saved, conversation-linked Tinder MatchProfile, the **same Gemini generation request** used by both the extension's existing-chat auto replies and TNND Web drafts may include a few optional topics from verified, non-sensitive profile fields (interests, lifestyle answers, or a short bio fallback). This only activates after the initial greeting/check-in and relevant acquaintance questions are already covered in Conversation Flow; it never adds profile hooks to first-message openers. **A match's latest question, refusal or actual topic always comes first**. One relevant hook at most, not a list of generic questions; already discussed interests and user-avoided subjects are skipped. No extra AI calls, duplicate per-chat memories or external data lookups. Height, photos, physical appearance and relationship labels are not suggested as icebreakers. If the profile is missing/unsynchronized, chat continues normally. Restart the API after pulling backend changes.


## Unified watcher · 0.2.22

**Watch conversations + matches** now watches three *separate* categories in the same single Tinder session: (1) verified incoming replies to existing AI-managed conversations, (2) **existing** Tinder Matches tiles without conversations, and (3) **future** newly arriving Tinder Matches tiles. The conversation reply queue and the active-chat follow lease are unchanged: while a match replies, their chat stays in focus, and match discovery **never** navigates away to open a match. Match IDs are recorded in a bounded per-account read-only inventory, distinct from the sending/first-opener queues. The first visible Tinder Matches view establishes the existing-match baseline; a potential new tile must appear at the very top ahead of that baseline twice, at least 15 seconds apart, before it is classified as future/new. Lazy-loaded old tiles remain existing, and an empty/hidden UI does not erase saved matches.

Open the **Matches** tab in Tinder at least once while the watcher is active; new match observations only happen when Tinder actually renders that panel. The watcher cannot detect offscreen or hidden matches until visible, and does not force-switch Tinder's sidebar while an exchange is active. The extension popup shows confirmed counts for existing/new matches and candidates under verification.

**Important:** match discovery is read-only. Watcher Start does **not** automatically authorize, create or send first messages to matches. To send first messages, explicitly use the existing **Start AI on existing matches** or **Start AI on future matches** controls after stopping the watcher, retaining their existing daily cap, one-attempt-per-match journals, manual exclusions, no-duplicate behavior, and Tinder SPA verified-empty checks. These modes cannot run simultaneously in one Tinder tab. The watcher can run even when there are zero eligible AI-managed conversations, to detect visible matches.


## Explicit auto Matches cycle · 0.2.23

With Tinder opened in exactly one Chrome tab, the watcher has two Start modes: **Watch conversations + matches** (existing read-only Match detection) and **Auto-watch + send first messages** (requires a new explicit confirmation; enabling the former NEVER silently enables latter after upgrade).

The auto cycle follows the active conversation for up to 3 minutes of inactivity, renews on each new incoming reply or outbound send, and prioritizes all queued unread conversation replies. When the queue is empty, it switches *within the same Tinder SPA* to Matches, observes tiles twice at least 16 seconds apart, and returns to Messages. It will not check Matches more often than **once every 5 minutes after the latest incoming message or preceding scan**, and only when no active conversation/reply/draft is in progress. At most **one** currently verified visible new or existing match may be offered an AI first message per visit; newly confirmed matches are preferred. Another scan can process another match only after the next idle interval. User-selected global automatic replies, per-chat gates, management policy, proven EMPTY conversation, daily first-message quota (default 5), and persistent per-match attempt journaling are all mandatory. Failures/unknown deliveries are not automatically retried. A service-worker restart recovers the sidebar but never repeats an in-flight first-message attempt.

Stopping watcher disables future automatic opener permissions. If Tinder sidebar switching cannot be verified or a manual unsent draft exists, it does not force the switch. The Matches sidebar requires visible elements; Tinder changes can require refreshing UI selectors. A newly received reply during a Matches check causes return to Messages before an opener; messages arriving during an irreversible Send are processed after the send finishes. Never open a second Tinder session or reload the page. On Chrome/Tinder closed this is not a 24/7 remote watcher. Browser and live-Tinder end-to-end validation remain necessary.


## Location, contacts, missing-personal-facts, long replies · v0.2.24

**Identity locations** in Web → Preferences: set origin city, usual residence, current city (change on each trip), origin neighborhood and residence neighborhood separately from Tinder Passport target cities. The fields are persisted in the authenticated user profile, included in the compact AI identity context and synced to the browser profile cache. The fields start blank unless the user fills them; no city or neighborhood is inferred from Tinder. Questions about exact unknown neighborhoods must become a blocking Action Center item instead of an invented claim.

**Social contacts:** accepted incoming conversation messages are screened after authenticated sync for social platforms and handles shared alone in the next bubble, such as "Ta Instagram ?" / a plausible handle. A non-blocking, deduplicated info action stores the supplied handle and links to the source conversation. No automated external contact. The Action Center shows the alert; this is not an operating-system push notification.

**Missing personal detail:** during auto generation, when the latest match message asks an exact missing user location (especially a Casablanca neighborhood), the API creates a blocking human action and marks the conversation action-required rather than generating or sending an invented answer. Provide the verified data in Profile → Location and resolve the action before resuming. Unknown biographical facts must not be invented. Manual drafts are preview only.

**Two-bubble replies:** Web → Preferences → Long replies lets the user opt in with a minimum length between 90 and 400 characters (default 150). The auto-reply pipeline still generates one response and records a single durable per-incoming-message claim, but occasionally splits it at a natural sentence boundary into two Tinder bubbles spaced 3–10 seconds apart. Before the second bubble, recheck no new incoming/manual reply, route or permission change. If uncertain, cancel the rest without replay. First-match openers retain their independent bubble logic.
