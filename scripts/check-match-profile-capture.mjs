import assert from "node:assert/strict";
import { buildProfileCaptureDedupeKey, buildReadOnlyProfileCapture, buildReadOnlyProfileSource, hasMeaningfulVisibleProfileFields, normalizeProfileCaptureSource } from "../src/tinder-match-profile-capture.ts";
import { confirmVisibleMatchProfileUpload, planVisibleMatchProfileSync } from "../src/tinder-match-profile-sync.ts";

const capturedAt = "2026-01-01T12:00:00.000Z";
const input = {
  route: "/app/recs/synthetic-profile",
  firstName: "Sam",
  age: 29,
  bio: "Loves hiking and coffee.",
  job: "Engineer",
  education: "University",
  location: "Nearby",
  interests: ["Hiking", "Coffee"],
  relationshipGoal: "Long-term relationship"
};
const source = buildReadOnlyProfileSource(input, capturedAt);
const capture = normalizeProfileCaptureSource(source);

assert.equal(source.schemaVersion, 1);
assert.equal(source.source, "tinder-visible-profile");
assert.equal(source.captureMode, "read-only");
assert.equal(source.capturedAt, capturedAt);
assert.equal(source.visibleFields.firstName, "Sam");
assert.equal(source.visibleFields.age, 29);
assert.equal(hasMeaningfulVisibleProfileFields(source), true);
assert.equal(capture.schemaVersion, 1);
assert.deepEqual(capture.sourceSnapshot, source);
assert.deepEqual(buildReadOnlyProfileCapture(input, capturedAt), capture);

const recaptured = buildReadOnlyProfileSource(input, "2026-01-01T12:05:00.000Z");
assert.equal(buildProfileCaptureDedupeKey(recaptured), buildProfileCaptureDedupeKey(source));
const changed = buildReadOnlyProfileSource({ ...input, bio: "Different visible bio" }, capturedAt);
assert.notEqual(buildProfileCaptureDedupeKey(changed), buildProfileCaptureDedupeKey(source));

const emptySource = buildReadOnlyProfileSource({ route: "/app/recs/empty", firstName: "   " }, capturedAt);
assert.equal(hasMeaningfulVisibleProfileFields(emptySource), false);
assert.equal(planVisibleMatchProfileSync(emptySource).status, "skipped-empty");

const firstDecision = planVisibleMatchProfileSync(source);
assert.equal(firstDecision.status, "upload");
assert.equal(firstDecision.nextState.lastUploadedDedupeKey, undefined);

const retryDecision = planVisibleMatchProfileSync(source, firstDecision.nextState);
assert.equal(retryDecision.status, "upload");
assert.equal(retryDecision.dedupeKey, firstDecision.dedupeKey);

const confirmedState = confirmVisibleMatchProfileUpload(firstDecision.nextState, firstDecision.dedupeKey);
assert.equal(confirmedState.lastUploadedDedupeKey, buildProfileCaptureDedupeKey(source));
assert.equal(planVisibleMatchProfileSync(recaptured, confirmedState).status, "skipped-unchanged");

const changedDecision = planVisibleMatchProfileSync(changed, confirmedState);
assert.equal(changedDecision.status, "upload");
assert.equal(changedDecision.nextState.lastUploadedDedupeKey, confirmedState.lastUploadedDedupeKey);
const changedConfirmed = confirmVisibleMatchProfileUpload(changedDecision.nextState, changedDecision.dedupeKey);
assert.notEqual(changedConfirmed.lastUploadedDedupeKey, confirmedState.lastUploadedDedupeKey);

console.log("Match profile capture contract checks passed.");
