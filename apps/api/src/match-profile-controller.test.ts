import assert from "node:assert/strict";
import test from "node:test";
import {
  handleConversationMatchProfileRequest,
  handleMatchProfileCaptureRequest,
  handleMatchProfilePromoteRequest,
  type MatchProfileControllerDeps
} from "./match-profile-controller.js";

const stored = {
  id: "profile-1",
  sourceCapture: {
    schemaVersion: 1 as const,
    source: "tinder-visible-profile" as const,
    captureMode: "read-only" as const,
    capturedAt: "2026-09-14T12:00:00.000Z",
    route: "/app/recs",
    visibleFields: { firstName: "Test" }
  },
  normalizedProfile: {
    schemaVersion: 1 as const,
    source: "tinder-visible-profile" as const,
    capturedAt: "2026-09-14T12:00:00.000Z",
    route: "/app/recs",
    fields: { firstName: "Test" },
    retention: { mode: "temporary" as const, reason: "pre-match-capture" as const, expiresAt: "2026-09-21T12:00:00.000Z" },
    conversationRef: null
  },
  conversationId: null,
  capturedAt: "2026-09-14T12:00:00.000Z",
  expiresAt: "2026-09-21T12:00:00.000Z",
  updatedAt: "2026-09-14T12:00:00.000Z"
};

function deps(overrides: Partial<MatchProfileControllerDeps> = {}): MatchProfileControllerDeps {
  return {
    save: async () => stored,
    getForConversation: async () => ({ ...stored, conversationId: "conversation-1" }),
    promote: async () => ({ ...stored, conversationId: "conversation-1", expiresAt: null }),
    ...overrides
  };
}

test("capture returns created profile and forwards conversation binding", async () => {
  let seenConversationId: string | null | undefined;
  const result = await handleMatchProfileCaptureRequest("user-1", { capture: stored.sourceCapture, conversationId: " conversation-1 " }, deps({
    save: async (_userId, _capture, options) => {
      seenConversationId = options?.conversationId;
      return { ...stored, conversationId: "conversation-1", expiresAt: null };
    }
  }));
  assert.equal(result.status, 201);
  assert.equal(seenConversationId, "conversation-1");
});

test("capture maps invalid source data to 400", async () => {
  const result = await handleMatchProfileCaptureRequest("user-1", {}, deps({
    save: async () => { throw new Error("invalid_match_profile_capture"); }
  }));
  assert.deepEqual(result, { status: 400, body: { error: "invalid_match_profile_capture" } });
});

test("conversation lookup is ownership-safe through service null result", async () => {
  const result = await handleConversationMatchProfileRequest("user-1", "conversation-2", deps({
    getForConversation: async () => null
  }));
  assert.equal(result.status, 404);
});

test("promotion requires both profile and conversation identifiers", async () => {
  const result = await handleMatchProfilePromoteRequest("user-1", "profile-1", {}, deps());
  assert.equal(result.status, 400);
});
