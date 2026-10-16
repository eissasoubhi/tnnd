import assert from "node:assert/strict";
import test from "node:test";
import { settingsToSaveLocally, withBrowserRuntimeControls } from "./settings-ownership.js";
import { DEFAULT_CONFIG } from "./storage.js";

test("signed-in browser saves automation, never copies edited Web profile back into local fallback", () => {
  const original = structuredClone(DEFAULT_CONFIG);
  const draft = structuredClone(DEFAULT_CONFIG);
  original.identity.instagram = "@offline-original";
  original.tone = "playful";
  original.languages.fr = 45;
  draft.identity.instagram = "@web-mirror";
  draft.tone = "witty";
  draft.languages.fr = 98;
  draft.automation.replyDelayMinSeconds = 35;
  draft.conversationFlowEnabled = false;
  draft.replyCount = 2;
  const updated = settingsToSaveLocally(original, draft, true);
  assert.equal(updated.identity.instagram, "@offline-original");
  assert.equal(updated.tone, "playful");
  assert.equal(updated.languages.fr, 45);
  assert.equal(updated.automation.replyDelayMinSeconds, 35);
  assert.equal(updated.replyCount, 2);
  assert.equal(updated.conversationFlowEnabled, false);
  assert.equal(original.automation.replyDelayMinSeconds, DEFAULT_CONFIG.automation.replyDelayMinSeconds);
});
test("disconnected mode retains explicit local profile editing", () => {
  const original = structuredClone(DEFAULT_CONFIG);
  const draft = structuredClone(DEFAULT_CONFIG);
  draft.identity.instagram = "@local";
  assert.deepEqual(settingsToSaveLocally(original,draft,false),draft);
});

test("Web profile can update style but never silently enable automation or override browser delays", () => {
  const local = structuredClone(DEFAULT_CONFIG);
  const web = structuredClone(DEFAULT_CONFIG);
  local.automation.enabled = false;
  local.automation.replyDelayMinSeconds = 33;
  web.tone = "witty";
  web.automation.enabled = true;
  web.automation.replyDelayMinSeconds = 1;
  web.automation.multiPartRepliesEnabled = true;
  const combined = withBrowserRuntimeControls(local, web);
  assert.equal(combined.tone, "witty");
  assert.equal(combined.automation.enabled, false);
  assert.equal(combined.automation.replyDelayMinSeconds, 33);
  assert.equal(combined.automation.multiPartRepliesEnabled, true);
});
