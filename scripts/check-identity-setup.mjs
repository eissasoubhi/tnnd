import { strict as assert } from "node:assert";
import { applyServerProfile } from "../src/server-effective-config.ts";
const DEFAULT_CONFIG = {
  model: "gemini-3.8-flash", tone: "playful", messageLength: "short",
  flirtLevel: 2, humorLevel: 50, emojiLevel: "low", replyCount: 3,
  preferredWords: "", avoidedWords: "", extraInstructions: "",
  languages: { fr: 45, darija: 40, en: 15 }, textingStyle: { formality: "casual" },
  identity: { firstName: "", age: "", city: "", origin: "", occupation: "", interests: "", aboutMe: "", instagram: "", whatsapp: "", contactPreference: "instagram-first" },
  automation: { enabled: false, quietHoursEnabled: false, quietStart: "00:00", quietEnd: "08:00", maxAutoRepliesPerDay: 40 }
};
import { profileReadiness, setupProgress, missingStoryRecommendations } from "../src/setup-progress.ts";

const profile = {
  identity: { firstName: "Aissa", age: "35" },
  identityBuilder: { reviewStatus: "approved", analysis: { summary: "Calm and easygoing traveler", interests: ["travel", "fitness"] } },
  datingIntent: { defaultGoal: "open-to-see" },
  textingStyle: { formality: "casual" }
};
const synced = applyServerProfile(DEFAULT_CONFIG, profile);
assert.equal(synced.identity.aboutMe, "Calm and easygoing traveler");
assert.equal(synced.identity.interests, "travel, fitness");
assert.equal(synced.identity.firstName, "Aissa");
assert.equal(profileReadiness(profile).identityApproved, true);
assert.equal(profileReadiness(profile).preferencesConfigured, true);
assert.equal(setupProgress({ signedIn: true, identityApproved: true, geminiConfigured: true, preferencesConfigured: true }).percent, 100);
assert.deepEqual(missingStoryRecommendations([{ currentTopic: "vacances", status: "active" }], []).map(r=>r.id), ["travel"]);
assert.equal(applyServerProfile(DEFAULT_CONFIG, { identity: { aboutMe: "Existing legacy about" } }).identity.aboutMe, "Existing legacy about");
console.log("Identity sync + readiness regression checks passed");
