import { describe, expect, it } from "vitest";
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
    expect(readEditablePreferences(profile("Take things slowly")).datingGoalDetails).toBe("Take things slowly");
  });

  it("preserves an existing detail for legacy callers that omit the field", () => {
    const current = profile("Keep it light");
    const preferences = readEditablePreferences(current);
    delete preferences.datingGoalDetails;

    const updated = writeEditablePreferences(current, preferences);

    expect((updated.datingIntent as Record<string, unknown>).datingGoalDetails).toBe("Keep it light");
  });

  it("trims a supplied detail and clears whitespace-only values", () => {
    const current = profile("Old detail");
    const preferences = readEditablePreferences(current);

    const updated = writeEditablePreferences(current, {
      ...preferences,
      datingGoalDetails: "  New detail  "
    });
    expect((updated.datingIntent as Record<string, unknown>).datingGoalDetails).toBe("New detail");

    const cleared = writeEditablePreferences(updated, {
      ...preferences,
      datingGoalDetails: "   "
    });
    expect((cleared.datingIntent as Record<string, unknown>).datingGoalDetails).toBeUndefined();
  });
});
