import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SMART_SWIPE, defaultSmartSwipeSettings, validateSmartSwipeSettings
} from "./smart-auto-swipe-settings.js";

test("smart swipe defaults are automatic-only scheduling, disabled until user consent", () => {
  const defaults = defaultSmartSwipeSettings();
  assert.equal(defaults.enabled, false);
  // Saved preferences do not imply an operational Like executor.
  assert.equal(defaults.maxActiveChatSecondsPerConversationPerDay, null);
  assert.deepEqual(defaults.priority, ["swipe", "new-match", "active-chat"]);
  assert.deepEqual(validateSmartSwipeSettings(defaults), { ok: true, settings: defaults });
  assert.notEqual(defaults.priority, DEFAULT_SMART_SWIPE.priority);
});
test("smart swipe persisted settings reject invalid quotas, priorities and unknown modes", () => {
  const good = defaultSmartSwipeSettings();
  for (const item of [
    { ...good, sessionsPerDay: 0 },
    { ...good, priority: ["swipe", "swipe", "active-chat"] },
    { ...good, swipeDelayMinSeconds: 6, swipeDelayMaxSeconds: 2 },
    { ...good, sessionDurationMinSeconds: 1000, sessionDurationMaxSeconds: 500 },
    { ...good, timeZone: "Unknown/Zone" },
    { ...good, mode: "manual" },
    { ...good, maxActiveChatSecondsPerConversationPerDay: -1 },
    { ...good, maxRightSwipesPerDay: 1001 }
  ]) assert.equal(validateSmartSwipeSettings(item).ok, false);
  assert.equal(validateSmartSwipeSettings({
    ...good, maxActiveChatSecondsPerConversationPerDay: 1800,
    priority: ["active-chat", "swipe", "new-match"], timeZone: "Europe/Paris"
  }).ok, true);
});
