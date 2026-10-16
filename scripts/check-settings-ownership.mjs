import assert from "node:assert/strict";
import test from "node:test";
import { settingsToSaveLocally, withBrowserRuntimeControls } from "../src/settings-ownership.ts";
import { cacheBelongsToSession } from "../src/profile-cache-scope.ts";

function config() {
  return {
    tone: "playful", replyCount: 3, languages: { fr: 45, darija: 40, en: 15 },
    identity: { instagram: "@offline", whatsapp: "" },
    conversationFlowEnabled: true, conversationFlowOrder: "default",
    automation: {
      enabled: false, replyDelayMinSeconds: 20, replyDelayMaxSeconds: 60,
      openerDelayMinSeconds: 8, openerDelayMaxSeconds: 15,
      maxAutoRepliesPerDay: 40, maxFirstMessagesPerDay: 5,
      quietHoursEnabled: true, quietStart: "00:00", quietEnd: "08:00"
    }
  };
}
test("connected option saves never copy the Web profile into local fallback", () => {
  const local = config(), draft = structuredClone(local);
  draft.tone = "witty"; draft.identity.instagram = "@web";
  draft.automation.replyDelayMinSeconds = 35; draft.conversationFlowEnabled = false;
  const saved = settingsToSaveLocally(local, draft, true);
  assert.equal(saved.tone, "playful");
  assert.equal(saved.identity.instagram, "@offline");
  assert.equal(saved.automation.replyDelayMinSeconds, 35);
  assert.equal(saved.conversationFlowEnabled, false);
});
test("disconnected settings remain editable and reversible", () => {
  const draft = config(); draft.identity.instagram = "@newlocal";
  assert.deepEqual(settingsToSaveLocally(config(),draft,false),draft);
});
test("server profile can update style but cannot silently enable Tinder automation", () => {
  const local = config(), web = structuredClone(local);
  web.automation.enabled = true;
  web.automation.replyDelayMinSeconds = 1;
  web.automation.multiPartRepliesEnabled = true;
  web.tone = "witty";
  const result = withBrowserRuntimeControls(local,web);
  assert.equal(result.tone,"witty");
  assert.equal(result.automation.enabled,false);
  assert.equal(result.automation.replyDelayMinSeconds,20);
  assert.equal(result.automation.multiPartRepliesEnabled,true);
});
test("backend profile cache cannot cross accounts or expired sessions", () => {
  const cache={ userId:"A" };
  const session={token:"test-token",expiresAt:"2030-01-01T00:00:00Z",user:{id:"A"}};
  const now=Date.parse("2026-10-16T20:00:00Z");
  assert.equal(cacheBelongsToSession(cache,session,now),true);
  assert.equal(cacheBelongsToSession({userId:"B"},session,now),false);
  assert.equal(cacheBelongsToSession({},session,now),false);
  assert.equal(cacheBelongsToSession(cache,null,now),false);
  assert.equal(cacheBelongsToSession(cache,session,Date.parse("2031-01-01T00:00:00Z")),false);
});
test("extension options expose only extension controls when connected", async () => {
  const {readFileSync}=await import("node:fs");
  const {fileURLToPath}=await import("node:url");
  const {resolve,dirname}=await import("node:path");
  const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
  const options=readFileSync(resolve(root,"src/options.ts"),"utf8");
  const markup=readFileSync(resolve(root,"public/options.html"),"utf8");
  assert.match(options,/settingsToSaveLocally\(existingLocal, draft, backendConnected\)/);
  assert.match(options,/getConfig\(\{ includeBackendProfile: false \}\)/);
  assert.match(options,/localFallbackPanel"\)\.hidden = backendConnected/);
  for(const id of ["fallbackProfileBundle","fallbackContacts","fallbackGemini","fallbackConversationStyle","fallbackTextingStyle","fallbackLanguageMix","fallbackVocabulary"]){
    assert.ok(options.includes('"'+id+'"'));
  }
  assert.match(markup,/id="refreshFromWeb"/);
  assert.match(markup,/id="saveExtensionSettings"/);
});
