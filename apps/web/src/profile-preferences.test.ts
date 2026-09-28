import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ImportedProfile } from "./profile-import";
import { readEditablePreferences, writeEditablePreferences } from "./profile-preferences";

function profile(datingGoalDetails?: string): ImportedProfile {
  return {
    kind: "tnnd-user-profile",
    schemaVersion: 1,
    datingIntent: {
      defaultGoal: "open-to-see",
      defaultDisclosureStrategy: "progressive",
      ...(datingGoalDetails === undefined ? {} : { datingGoalDetails })
    },
    textingStyle: {}
  };
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

describe("structured texting preferences", () => {
  it("provides natural texting defaults for an empty profile", () => {
    const preferences = readEditablePreferences(profile());

    assert.deepEqual(
      {
        formality: preferences.formality,
        capitalization: preferences.capitalization,
        punctuationDensity: preferences.punctuationDensity,
        emojiFrequency: preferences.emojiFrequency,
        abbreviations: preferences.abbreviations,
        slangLevel: preferences.slangLevel,
        messageLength: preferences.messageLength,
        fragmentStyle: preferences.fragmentStyle,
        grammarStyle: preferences.grammarStyle,
        questionFrequency: preferences.questionFrequency,
        teasingStyle: preferences.teasingStyle,
        humorStyle: preferences.humorStyle,
        directness: preferences.directness,
        doubleTexting: preferences.doubleTexting,
        frenchStyle: preferences.frenchStyle,
        darijaStyle: preferences.darijaStyle,
        englishStyle: preferences.englishStyle
      },
      {
        formality: "very-casual",
        capitalization: "relaxed",
        punctuationDensity: "low",
        emojiFrequency: "low",
        abbreviations: "medium",
        slangLevel: "medium",
        messageLength: "short",
        fragmentStyle: "mixed",
        grammarStyle: "casual",
        questionFrequency: "medium",
        teasingStyle: "light",
        humorStyle: "playful",
        directness: "balanced",
        doubleTexting: "sometimes",
        frenchStyle: "casual",
        darijaStyle: "natural",
        englishStyle: "casual"
      }
    );
  });

  it("round-trips every structured texting and language control", () => {
    const current = profile();
    const updated = writeEditablePreferences(current, {
      ...readEditablePreferences(current),
      formality: "neutral",
      capitalization: "lowercase-heavy",
      punctuationDensity: "none",
      emojiFrequency: "none",
      abbreviations: "high",
      slangLevel: "high",
      messageLength: "very-short",
      fragmentStyle: "fragment-heavy",
      grammarStyle: "very-casual",
      questionFrequency: "low",
      teasingStyle: "bold",
      humorStyle: "dry",
      directness: "very-direct",
      doubleTexting: "comfortable",
      frenchStyle: "very-casual",
      darijaStyle: "darija-heavy",
      englishStyle: "neutral"
    });

    const roundTripped = readEditablePreferences(updated);
    assert.deepEqual(
      {
        formality: roundTripped.formality,
        capitalization: roundTripped.capitalization,
        punctuationDensity: roundTripped.punctuationDensity,
        emojiFrequency: roundTripped.emojiFrequency,
        abbreviations: roundTripped.abbreviations,
        slangLevel: roundTripped.slangLevel,
        messageLength: roundTripped.messageLength,
        fragmentStyle: roundTripped.fragmentStyle,
        grammarStyle: roundTripped.grammarStyle,
        questionFrequency: roundTripped.questionFrequency,
        teasingStyle: roundTripped.teasingStyle,
        humorStyle: roundTripped.humorStyle,
        directness: roundTripped.directness,
        doubleTexting: roundTripped.doubleTexting,
        frenchStyle: roundTripped.frenchStyle,
        darijaStyle: roundTripped.darijaStyle,
        englishStyle: roundTripped.englishStyle
      },
      {
        formality: "neutral",
        capitalization: "lowercase-heavy",
        punctuationDensity: "none",
        emojiFrequency: "none",
        abbreviations: "high",
        slangLevel: "high",
        messageLength: "very-short",
        fragmentStyle: "fragment-heavy",
        grammarStyle: "very-casual",
        questionFrequency: "low",
        teasingStyle: "bold",
        humorStyle: "dry",
        directness: "very-direct",
        doubleTexting: "comfortable",
        frenchStyle: "very-casual",
        darijaStyle: "darija-heavy",
        englishStyle: "neutral"
      }
    );
  });
});


describe("MatchProfile retention preference", () => {
  it("defaults temporary MatchProfile retention to seven days", () => {
    assert.equal(readEditablePreferences(profile()).temporaryMatchProfileRetentionDays, 7);
  });

  it("round-trips a bounded temporary retention value", () => {
    const current = profile();
    const updated = writeEditablePreferences(current, {
      ...readEditablePreferences(current),
      temporaryMatchProfileRetentionDays: 14
    });

    assert.equal(
      (updated.matchProfileCapture as Record<string, unknown>).temporaryRetentionDays,
      14
    );
    assert.equal(readEditablePreferences(updated).temporaryMatchProfileRetentionDays, 14);
  });

  it("falls back to seven days for out-of-range values", () => {
    const current = {
      ...profile(),
      matchProfileCapture: { temporaryRetentionDays: 99 }
    };
    assert.equal(readEditablePreferences(current).temporaryMatchProfileRetentionDays, 7);

    const updated = writeEditablePreferences(current, {
      ...readEditablePreferences(current),
      temporaryMatchProfileRetentionDays: 0
    });
    assert.equal(
      (updated.matchProfileCapture as Record<string, unknown>).temporaryRetentionDays,
      7
    );
  });
});
