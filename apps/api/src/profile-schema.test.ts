import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultUserProfile, validateProfileEnvelope } from "./profile-schema.js";

test("new accounts start with a valid editable TNND profile", () => {
  const profile = createDefaultUserProfile();
  assert.deepEqual(profile, { kind: "tnnd-user-profile", schemaVersion: 1 });
  assert.deepEqual(validateProfileEnvelope(profile), { ok: true, profile });
});
