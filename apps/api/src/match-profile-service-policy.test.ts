import assert from "node:assert/strict";
import test from "node:test";
import { parseMatchProfileSourceCapture } from "./match-profile-contract.js";
import { isPromotableTemporaryMatchProfile, sameMatchProfileCaptureContent } from "./match-profile-service.js";

test("temporary MatchProfiles can only be promoted before expiry", () => {
  const now = new Date("2026-09-14T16:00:00.000Z");

  assert.equal(isPromotableTemporaryMatchProfile(null, now), true);
  assert.equal(isPromotableTemporaryMatchProfile(new Date("2026-09-14T16:00:01.000Z"), now), true);
  assert.equal(isPromotableTemporaryMatchProfile(new Date("2026-09-14T16:00:00.000Z"), now), false);
  assert.equal(isPromotableTemporaryMatchProfile(new Date("2026-09-14T15:59:59.000Z"), now), false);
});

test("MatchProfile content dedupe ignores capture timestamp but detects visible changes", () => {
  const first = parseMatchProfileSourceCapture({
    schemaVersion: 1,
    source: "tinder-visible-profile",
    captureMode: "read-only",
    capturedAt: "2026-09-14T16:00:00.000Z",
    route: "/app/recs/synthetic",
    visibleFields: { firstName: "Sam", age: 29, interests: ["Hiking"] }
  });
  const recaptured = parseMatchProfileSourceCapture({
    ...first,
    capturedAt: "2026-09-14T16:05:00.000Z"
  });
  const changed = parseMatchProfileSourceCapture({
    ...first,
    capturedAt: "2026-09-14T16:05:00.000Z",
    visibleFields: { ...first.visibleFields, interests: ["Hiking", "Coffee"] }
  });

  assert.equal(sameMatchProfileCaptureContent(first, recaptured), true);
  assert.equal(sameMatchProfileCaptureContent(first, changed), false);
});
