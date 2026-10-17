import assert from "node:assert/strict";
import {
  emptyConversationFocusLedger, validConversationFocusLedger, readConversationFocusLedger,
  startConversationFocus, stopConversationFocus, heartbeatConversationFocus,
  remainingConversationFocusSeconds, canFocusConversation
} from "../src/tinder-smart-swipe-chat-focus-budget.ts";
import { DEFAULT_SMART_AUTO_SWIPE_CONFIG } from "../src/tinder-smart-auto-swipe-policy.ts";
const config = { ...DEFAULT_SMART_AUTO_SWIPE_CONFIG, maxActiveChatSecondsPerConversationPerDay: 1800 };
const now = Date.parse("2026-10-16T08:00:00Z");
const tz = "Europe/Paris";
let ledger = readConversationFocusLedger(undefined, now, tz);
assert.ok(ledger);
assert.equal(validConversationFocusLedger(ledger), true);
const thread = "conversation-1";
let tick = now;
ledger = startConversationFocus(ledger, thread, tick);
for (let i = 0; i < 20; i++) { tick += 30000; ledger = heartbeatConversationFocus(ledger, thread, tick, config); }
assert.equal(remainingConversationFocusSeconds(ledger, thread, config), 1200);
ledger = stopConversationFocus(ledger);
tick += 3600000; // idle hour must not count
ledger = startConversationFocus(ledger, thread, tick);
for (let i = 0; i < 40; i++) { tick += 30000; ledger = heartbeatConversationFocus(ledger, thread, tick, config); }
assert.equal(remainingConversationFocusSeconds(ledger, thread, config), 0);
assert.equal(canFocusConversation(ledger, thread, config), false);
assert.equal(canFocusConversation(ledger, "conversation-2", config), true);
assert.equal(remainingConversationFocusSeconds(ledger, thread, { ...config, maxActiveChatSecondsPerConversationPerDay: null }), Infinity);
assert.equal(heartbeatConversationFocus(startConversationFocus(emptyConversationFocusLedger("2026-10-16"), thread, now), thread, now+600000, config).spentMsByThread[thread], 30000);
assert.equal(readConversationFocusLedger(ledger, Date.parse("2026-10-17T08:00:00Z"), tz).spentMsByThread[thread], undefined);
assert.equal(readConversationFocusLedger({ ...ledger, spentMsByThread: { [thread]: -1 } }, now, tz), null);
assert.equal(readConversationFocusLedger({ ...ledger, dayKey: "garbage" }, now, tz), null);
assert.equal(heartbeatConversationFocus(ledger, thread, tick-1, config).activeThread, null);
console.log("Per-conversation daily focus budget checks passed.");
