import assert from "node:assert/strict";
import test from "node:test";
import { groupForPanelId, viewForHash, workspaceCopy } from "./workspace-sections";

test("each visible navigation target opens its own workspace section", () => {
  assert.equal(viewForHash("#workspace-overview"), "overview");
  assert.equal(viewForHash("#conversation-panel"), "conversations");
  assert.equal(viewForHash("#identity-builder-panel"), "identity");
  assert.equal(viewForHash("#personal-memory-panel"), "memories");
  assert.equal(viewForHash("#action-center-section"), "actions");
  assert.equal(viewForHash("#analytics-panel"), "analytics");
  assert.equal(viewForHash("#profile-settings"), "settings");
});
test("deep links and dynamically appended panels are placed consistently", () => {
  assert.equal(viewForHash("#ai-provider-form", "ai-provider-panel"), "settings");
  assert.equal(viewForHash("#memory-source", "personal-memory-panel"), "memories");
  assert.equal(viewForHash("#setup-story-suggestions", "setup-guidance-panel"), "overview");
  assert.equal(groupForPanelId("conversation-management-panel"), "conversations");
  assert.equal(groupForPanelId("conversation-takeover-panel"), "conversations");
  assert.equal(groupForPanelId("texting-style-examples"), "identity");
  assert.equal(groupForPanelId("some-future-feature"), "settings");
});
test("all sections have useful headings and text", () => {
  for (const section of Object.values(workspaceCopy)) {
    assert.ok(section.title.length > 8);
    assert.ok(section.subtitle.length > 8);
  }
});
