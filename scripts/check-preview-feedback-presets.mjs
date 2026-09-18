import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [presetSource, feedbackSource] = await Promise.all([
  readFile(new URL("../src/preview-presets.ts", import.meta.url), "utf8"),
  readFile(new URL("../apps/web/src/conversation-preview-feedback.ts", import.meta.url), "utf8")
]);

assert.match(presetSource, /savePreviewPreset/);
assert.match(presetSource, /deletePreviewPreset/);
assert.match(presetSource, /previewPresets/);
assert.match(feedbackSource, /ConversationPreviewFeedbackTag/);
assert.match(feedbackSource, /CONVERSATION_PREVIEW_PRESETS/);
assert.match(feedbackSource, /previewFeedbackInstruction/);

console.log("Preview feedback and named preset guard passed.");
