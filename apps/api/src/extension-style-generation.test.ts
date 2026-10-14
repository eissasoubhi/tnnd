import assert from "node:assert/strict";
import test from "node:test";
import { generateExtensionSuggestions } from "./extension-suggestions.js";

test("extension's actual Gemini prompt follows the match's recent language and stops repeated haha", async () => {
  let body = "";
  const result = await generateExtensionSuggestions(
    "fixture-user",
    {
      context: "Them: cette semaine c juste la routine\nMe: haha tu fais quoi\nThem: oui wakha kaydouz mzyan hhh",
      purpose: "manual",
      count: 1,
      config: { languages: { fr: 45, darija: 40, en: 15 } }
    },
    async () => ({ provider: "gemini", model: "fixture", apiKey: "dummy" }),
    async (_, init) => {
      body = String(init?.body);
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '["grave haha, et toi ?"]' }] } }] }), { status: 200 });
    },
    async () => ({ userProfile: { textingStyle: { autoAdapt: { languages: true } } }, memories: [] })
  );
  assert.match(body, /Prefer natural Latin-script Darija/);
  assert.match(body, /Do NOT put any laugh token/);
  assert.deepEqual(result.suggestions, ["grave, et toi ?"]);
});

test("fixed language preference remains fixed while outgoing laughter is still de-duplicated", async () => {
  let body = "";
  const result = await generateExtensionSuggestions(
    "fixture-user",
    {
      context: "Them: wakha kaydouz mzyan\nMe: haha déjà\nThem: fin ghadi daba?",
      purpose: "manual", count: 1,
      config: { languages: { fr: 90, darija: 10, en: 0 } },
      chat: { languages: { fr: 100, darija: 0, en: 0 } }
    },
    async () => ({ provider: "gemini", model: "fixture", apiKey: "dummy" }),
    async (_, init) => {
      body = String(init?.body);
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '["haha bien sûr"]' }] } }] }), { status: 200 });
    },
    async () => ({ memories: [] })
  );
  assert.match(body, /fixed or manually overridden language choices/);
  assert.doesNotMatch(body, /Prefer natural Latin-script Darija/);
  assert.deepEqual(result.suggestions, ["bien sûr"]);
});
