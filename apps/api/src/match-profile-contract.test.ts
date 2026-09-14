import assert from "node:assert/strict";
import test from "node:test";
import { normalizeMatchProfile, parseMatchProfileSourceCapture } from "./match-profile-contract.js";

const source = {
  schemaVersion: 1,
  source: "tinder-visible-profile",
  captureMode: "read-only",
  capturedAt: "2026-09-14T12:00:00.000Z",
  route: "/app/recs/example",
  visibleFields: {
    firstName: "  Sam  ",
    age: 29,
    bio: "  Coffee   and hiking  ",
    interests: [" Hiking ", "", "Coffee"]
  }
};

test("normalizes a bounded read-only MatchProfile source capture", () => {
  const parsed = parseMatchProfileSourceCapture(source);
  assert.equal(parsed.captureMode, "read-only");
  assert.equal(parsed.visibleFields.firstName, "Sam");
  assert.equal(parsed.visibleFields.bio, "Coffee and hiking");
  assert.deepEqual(parsed.visibleFields.interests, ["Hiking", "Coffee"]);
});

test("keeps pre-match captures temporary", () => {
  const parsed = parseMatchProfileSourceCapture(source);
  const profile = normalizeMatchProfile(parsed, { now: new Date("2026-09-14T12:00:00.000Z") });
  assert.equal(profile.retention.mode, "temporary");
  assert.equal(profile.retention.reason, "pre-match-capture");
  assert.equal(profile.retention.expiresAt, "2026-09-21T12:00:00.000Z");
  assert.equal(profile.conversationRef, null);
});

test("promotes captures to durable only when linked to a conversation", () => {
  const parsed = parseMatchProfileSourceCapture(source);
  const profile = normalizeMatchProfile(parsed, { conversationRef: "conversation-123" });
  assert.equal(profile.retention.mode, "durable");
  assert.equal(profile.retention.reason, "conversation-linked");
  assert.equal(profile.retention.expiresAt, null);
  assert.equal(profile.conversationRef, "conversation-123");
});

test("rejects non read-only or malformed source envelopes", () => {
  assert.throws(() => parseMatchProfileSourceCapture({ ...source, captureMode: "interactive" }), /invalid_match_profile_capture/);
  assert.throws(() => parseMatchProfileSourceCapture({ ...source, capturedAt: "not-a-date" }), /invalid_match_profile_captured_at/);
});
