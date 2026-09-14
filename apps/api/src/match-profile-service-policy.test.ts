import assert from "node:assert/strict";
import test from "node:test";
import { isPromotableTemporaryMatchProfile } from "./match-profile-service.js";

test("temporary MatchProfiles can only be promoted before expiry", () => {
  const now = new Date("2026-09-14T16:00:00.000Z");

  assert.equal(isPromotableTemporaryMatchProfile(null, now), true);
  assert.equal(isPromotableTemporaryMatchProfile(new Date("2026-09-14T16:00:01.000Z"), now), true);
  assert.equal(isPromotableTemporaryMatchProfile(new Date("2026-09-14T16:00:00.000Z"), now), false);
  assert.equal(isPromotableTemporaryMatchProfile(new Date("2026-09-14T15:59:59.000Z"), now), false);
});
