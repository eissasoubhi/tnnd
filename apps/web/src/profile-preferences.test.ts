import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ImportedProfile } from "./profile-import";
import { readEditablePreferences, writeEditablePreferences } from "./profile-preferences";

function profile(datingGoalDetails?: string): ImportedProfile {
  return {
    schemaVersion: 1,
    datingIntent: {
      defaultGoal: "open-to-see",
      defaultDisclosureStrategy: "progressive",
      ...(datingGoalDetails === undefined ? {} : { datingGoalDetails })
    },
    textingStyle: {}
  } as ImportedProfile;
}

describe("dating goal details preferences", () => {
  it("reads an existing optional detail", () => {
    assert.equal(readEditablePreferences(profile("Take things slowly")).datingGoalDetails, "Take things slowly");
  });

  it("preserves an existing detail for legacy callers that omit the field", () => {
    const current = profile("Keep it light");
    const preferences = readEditablePreferences(current);
    delete preferences.datingGoalDetails;

    const updated = writeEditablePreferences(current, preferences);

    assert.equal((updated.datingIntent as Record<string, unknown>).datingGoalDetails, "Keep it light");
  });

  it("trims a supplied detail and clears whitespace-only values", () => {
    const current = profile("Old detail");
    const preferences = readEditablePreferences(current);

    const updated = writeEditablePreferences(current, {
      ...preferences,
      datingGoalDetails: "  New detail  "
    });
    assert.equal((updated.datingIntent as Record<string, unknown>).datingGoalDetails, "New detail");

    const cleared = writeEditablePreferences(updated, {
      ...preferences,
      datingGoalDetails: "   "
    });
    assert.equal((cleared.datingIntent as Record<string, unknown>).datingGoalDetails, undefined);
  });
});
