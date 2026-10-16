import assert from "node:assert/strict";
import test from "node:test";
import { cacheBelongsToSession, type BackendProfileCache, type BackendSession } from "./storage.js";

const session: BackendSession = {
  token: "example-token",
  expiresAt: "2030-01-01T00:00:00.000Z",
  user: { id: "account-a", email: "nobody@example.invalid" }
};
const cache: BackendProfileCache = {
  userId: "account-a", profile: { identity: { city: "Example" } },
  updatedAt: "2026-10-16T00:00:00.000Z", syncedAt: "2026-10-16T00:00:00.000Z"
};
test("server profile cache is only usable for its active account", () => {
  const now = Date.parse("2026-10-16T00:00:00.000Z");
  assert.equal(cacheBelongsToSession(cache, session, now), true);
  assert.equal(cacheBelongsToSession({ ...cache, userId: "account-b" }, session, now), false);
  assert.equal(cacheBelongsToSession({ ...cache, userId: undefined }, session, now), false);
  assert.equal(cacheBelongsToSession(cache, null, now), false);
  assert.equal(cacheBelongsToSession(cache, session, Date.parse("2031-01-01T00:00:00.000Z")), false);
});
