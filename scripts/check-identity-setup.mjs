import { strict as assert } from "node:assert";
import { applyServerProfile } from "../src/server-effective-config.ts";
import { DEFAULT_CONFIG } from "../src/storage.ts";
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
