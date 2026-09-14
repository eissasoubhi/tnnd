import assert from "node:assert/strict";
import { buildReadOnlyProfileCapture, buildReadOnlyProfileSource, hasMeaningfulVisibleProfileFields, normalizeProfileCaptureSource } from "../src/tinder-match-profile-capture.ts";

const capturedAt = "2026-01-01T12:00:00.000Z";
const input = {
  route: "/app/recs/synthetic-profile",
  firstName: "  Sam  ",
  age: 29,
  bio: "  Loves   hiking and coffee.  ",
  job: "Engineer",
  education: "University",
  location: "Nearby",
  interests: ["Hiking", " Coffee ", "", "Hiking"],
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
assert.equal(source.visibleFields.bio, "Loves hiking and coffee.");
assert.deepEqual(source.visibleFields.interests, ["Hiking", "Coffee", "Hiking"]);
assert.equal(hasMeaningfulVisibleProfileFields(source), true);

assert.equal(capture.schemaVersion, 1);
assert.equal(capture.source, "tinder-visible-profile");
assert.equal(capture.capturedAt, capturedAt);
assert.deepEqual(capture.sourceSnapshot, source);
assert.deepEqual(capture.fields, source.visibleFields);

const compatibilityCapture = buildReadOnlyProfileCapture(input, capturedAt);
assert.deepEqual(compatibilityCapture, capture);

const invalid = buildReadOnlyProfileCapture({
  route: "x".repeat(700),
  age: 17,
  bio: "x".repeat(700),
  interests: Array.from({ length: 25 }, (_, index) => `interest-${index}`)
}, capturedAt);

assert.equal(invalid.route.length, 512);
assert.equal(invalid.fields.age, undefined);
assert.equal(invalid.fields.bio?.length, 500);
assert.equal(invalid.fields.interests?.length, 20);
assert.equal(invalid.sourceSnapshot.captureMode, "read-only");

const emptySource = buildReadOnlyProfileSource({ route: "/app/recs/empty", firstName: "   ", interests: ["", "   "] }, capturedAt);
assert.equal(hasMeaningfulVisibleProfileFields(emptySource), false);
assert.deepEqual(emptySource.visibleFields, {
  firstName: undefined,
  age: undefined,
  bio: undefined,
  job: undefined,
  education: undefined,
  location: undefined,
  interests: undefined,
  relationshipGoal: undefined
});

console.log("Match profile capture contract checks passed.");
