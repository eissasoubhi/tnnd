import assert from "node:assert/strict";
import test from "node:test";
import { handleSaveAiProviderSettingsRequest } from "./ai-provider-settings-controller.js";

test("AI provider settings controller validates required fields", async () => {
  const missingModel = await handleSaveAiProviderSettingsRequest("user-1", { apiKey: "secret" }, async () => {
    throw new Error("must_not_save");
  });
  assert.deepEqual(missingModel, { status: 400, body: { error: "ai_model_required" } });

  const missingKey = await handleSaveAiProviderSettingsRequest("user-1", { model: "gemini-2.5-flash" }, async () => {
    throw new Error("must_not_save");
  });
  assert.deepEqual(missingKey, { status: 400, body: { error: "ai_api_key_required" } });
});

test("AI provider settings controller persists secrets without returning them", async () => {
  let captured: { userId: string; model: string; apiKey: string } | undefined;
  const result = await handleSaveAiProviderSettingsRequest(
    "user-1",
    { model: " gemini-2.5-flash ", apiKey: " test-secret " },
    async (userId, input) => {
      captured = { userId, ...input };
      return { provider: "gemini", model: input.model, configured: true, updatedAt: "2026-09-20T00:00:00.000Z" };
    }
  );

  assert.deepEqual(captured, { userId: "user-1", model: "gemini-2.5-flash", apiKey: "test-secret" });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    provider: "gemini",
    model: "gemini-2.5-flash",
    configured: true,
    updatedAt: "2026-09-20T00:00:00.000Z"
  });
  assert.equal("apiKey" in result.body, false);
});
