import assert from "node:assert/strict";
import test from "node:test";
import { preferenceSections } from "./preference-sections";

test("durable web preferences are grouped with no duplicate field ownership", () => {
  const ids = preferenceSections.flatMap(section => [...section.ids]);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(preferenceSections.map(section => section.title)).size, preferenceSections.length);
  assert.ok(preferenceSections.some(section => section.ids.includes("origin-city")));
  assert.ok(preferenceSections.some(section => section.ids.includes("target-cities")));
  assert.ok(preferenceSections.some(section => section.ids.includes("multi-part-replies")));
  assert.ok(preferenceSections.some(section => section.ids.includes("pause-on-marriage")));
});

test("advanced and safety-specific controls do not overload the default form", () => {
  const advanced = ["Languages & culture", "Multi-bubble replies", "Match screening", "Writing details", "Privacy & retention"];
  for (const group of preferenceSections) {
    if (advanced.includes(group.title)) assert.equal(group.expanded, false, group.title);
  }
  assert.deepEqual(preferenceSections.filter(group => group.expanded).map(group => group.title),
    ["Dating intentions", "Your locations & Tinder Passport", "Message style & auto-adapt"]);
});
