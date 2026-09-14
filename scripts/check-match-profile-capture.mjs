import assert from "node:assert/strict";
import { buildReadOnlyProfileCapture } from "../src/tinder-match-profile-capture.ts";

const capturedAt = "2026-01-01T12:00:00.000Z";
const capture = buildReadOnlyProfileCapture({
  route: "/app/recs/synthetic-profile",
  firstName: "  Sam  ",
  age: 29,
  bio: "  Loves   hiking and coffee.  ",
  job: "Engineer",
  education: "University",
  location: "Nearby",
  interests: ["Hiking", " Coffee ", "", "Hiking"],
  relationshipGoal: "Long-term relationship"
}, capturedAt);

assert.equal(capture.schemaVersion, 1);
assert.equal(capture.source, "tinder-visible-profile");
assert.equal(capture.capturedAt, capturedAt);
assert.equal(capture.fields.firstName, "Sam");
assert.equal(capture.fields.age, 29);
assert.equal(capture.fields.bio, "Loves hiking and coffee.");
assert.deepEqual(capture.fields.interests, ["Hiking", "Coffee", "Hiking"]);

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

console.log("Match profile capture contract checks passed.");
