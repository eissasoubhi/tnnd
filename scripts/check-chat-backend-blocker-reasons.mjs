import assert from "node:assert/strict";
import test from "node:test";
import {
  explainBackendReplyDenial, explainSemanticCheckFailure
} from "../src/chat-auto-reply-diagnostics.ts";

test("backend denied replies show actionable differences without ever granting permission", () => {
  assert.match(explainBackendReplyDenial("ai_management_not_selected"), /non sélectionnée/);
  assert.match(explainBackendReplyDenial("ai_management_not_enabled"), /non activée/);
  assert.match(explainBackendReplyDenial("conversation_not_synced"), /synchronise-la/);
  assert.match(explainBackendReplyDenial("wrong_live_tinder_thread"), /changé/);
  assert.match(explainBackendReplyDenial("conversation_status_blocks_automation"), /Statut/);
  assert.match(explainBackendReplyDenial("match_screening_blocks_or_unavailable"), /Filtrage/);
  assert.match(explainBackendReplyDenial("backend_permission_check_failed"), /backend/);
});

test("Gemini configuration and provider errors are identifiable, never leak upstream messages", () => {
  assert.match(explainSemanticCheckFailure("conversation_ai_provider_not_configured"), /AI provider/);
  assert.match(explainSemanticCheckFailure("conversation_ai_provider_unavailable"), /Test connection/);
  assert.match(explainSemanticCheckFailure("invalid_or_expired_session"), /expirée/);
  assert.match(explainSemanticCheckFailure("conversation_semantic_check_unavailable"), /API/);
  const secret = "Bearer secret-token-123";
  assert.doesNotMatch(explainBackendReplyDenial(secret), /secret-token/);
  assert.doesNotMatch(explainSemanticCheckFailure(secret), /secret-token/);
  assert.doesNotMatch(explainSemanticCheckFailure({ message: secret }), /secret-token/);
});

test("scanner retains both initial and post-generation backend authorization gates", async () => {
  const { readFile } = await import("node:fs/promises");
  const read = file => readFile(new URL("../" + file, import.meta.url), "utf8");
  const [content, background, api] = await Promise.all([
    "src/content.ts", "src/background.ts", "apps/api/src/main.ts"
  ].map(read));
  assert.match(content, /await backendAutomaticReplyPermission\(conversationRef\)/);
  assert.match(content, /if \(!backendPermission\.allowed\)/);
  assert.match(content, /backendAllowsAutomaticReply\(conversationRef\)/);
  assert.match(content, /explainSemanticCheckFailure\(code\)/);
  assert.match(background, /currentAuthorizedTinderThread\(sender, ref\)/);
  assert.match(background, /mayAutomaticallySendToTinder\(backend\)/);
  assert.match(background, /matchScreeningAllowsSend\(backend\.conversationId\)/);
  assert.match(api, /publicObservedBoundaryFailure\(error\)/);
});
