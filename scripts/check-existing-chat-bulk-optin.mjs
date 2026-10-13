import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { partitionExistingChatPermissions } from "../src/tinder-existing-chat-settings-policy.ts";

test("globally ready includes default/no-settings chats but preserves individually disabled opt-outs", () => {
  const settings = new Map([
    ["srim", { enabled: false }],
    ["youssra", { enabled: true }],
    ["nawal", { enabled: false }]
  ]);
  const result = partitionExistingChatPermissions(
    ["srim", "youssra", "half-moon", "nawal", "srim"], settings
  );
  assert.deepEqual(result, { ready: ["youssra", "half-moon"], disabled: ["srim", "nawal"] });
});

test("bulk reactivation is explicitly confirmed and only targets server eligible existing threads", async () => {
  const runner = await readFile(new URL("../src/tinder-global-existing-runner.ts", import.meta.url), "utf8");
  const popup = await readFile(new URL("../src/popup.ts", import.meta.url), "utf8");
  assert.match(runner, /eligibleExistingThreadRefs\(records, summaries\)/);
  assert.match(runner, /partitionExistingChatPermissions\(authorized, settingsByRef\)/);
  assert.match(runner, /TNND_GLOBAL_EXISTING_PREFLIGHT/);
  assert.match(runner, /enablePreviouslyDisabled === true/);
  assert.match(runner, /if \(enablePreviouslyDisabled\)/);
  assert.match(runner, /getChatSettings\(threadKey\)/);
  assert.match(runner, /saveChatSettings\(threadKey, \{ \.\.\.settings, enabled: true \}\)/);
  assert.ok(runner.indexOf("const tab = await findSingleTinderTab()")
    < runner.indexOf("if (enablePreviouslyDisabled)"));
  assert.match(popup, /TNND_GLOBAL_EXISTING_PREFLIGHT/);
  assert.match(popup, /window\.confirm\(/);
  assert.match(popup, /enablePreviouslyDisabled: includeDisabled/);
  assert.match(popup, /Manual\/archived\/blocked chats stay excluded/);
});

test("existing manual and archived chats never appear in global eligibility, even if requested in bulk", async () => {
  const policy = await readFile(new URL("../src/tinder-global-existing-policy.ts", import.meta.url), "utf8");
  assert.match(policy, /record\.managementState !== "ai-managed"/);
  assert.match(policy, /!record\.explicitlySelected/);
  assert.match(policy, /ELIGIBLE_STATUSES/);
});
