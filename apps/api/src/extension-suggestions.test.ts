import assert from "node:assert/strict";
import test from "node:test";
import { generateExtensionSuggestions, validateExtensionSuggestionRequest } from "./extension-suggestions.js";

test("validates bounded extension suggestion requests", () => {
  const result = validateExtensionSuggestionRequest({
    context: "Them: hi",
    purpose: "preview",
    count: 2,
    config: { tone: "playful" },
    chat: { stage: "discovery" }
  });
  assert.equal(result.count, 2);
  assert.equal(result.purpose, "preview");
});

test("accepts the opener purpose but rejects unknown generation purposes", () => {
  assert.equal(validateExtensionSuggestionRequest({ context:"No previous messages", purpose:"opener", count:1, config:{} }).purpose, "opener");
  assert.throws(() => validateExtensionSuggestionRequest({ context:"hi", purpose:"broadcast", count:1, config:{} }), /invalid_extension_generation_purpose/);
});

test("uses stored per-user Gemini settings without returning the API key", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const result = await generateExtensionSuggestions(
    "user-1",
    {
      context: "Them: salut",
      purpose: "manual",
      count: 1,
      config: { tone: "chill", languages: { fr: 80, darija: 20, en: 0 } }
    },
    async () => ({ provider: "gemini", model: "gemini-test", apiKey: "server-secret" }),
    async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: "[\"salut 😄\"]" }] } }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
    async () => ({ memories: [] })
  );

  assert.deepEqual(result, { suggestions: ["salut 😄"], model: "gemini-test" });
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.url, /gemini-test:generateContent$/);
  assert.equal(new Headers(calls[0]!.init?.headers).get("x-goog-api-key"), "server-secret");
  const body = JSON.parse(String(calls[0]!.init?.body));
  assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, "LOW");
  assert.equal(body.generationConfig.maxOutputTokens, 2048);
  assert.deepEqual(body.generationConfig.responseSchema, {
    type: "ARRAY",
    minItems: 1,
    maxItems: 1,
    items: { type: "STRING" }
  });
  assert.equal(JSON.stringify(result).includes("server-secret"), false);
});


test("classifies Gemini models unavailable for generation", async () => {
  await assert.rejects(
    () => generateExtensionSuggestions(
      "user-1",
      {
        context: "Them: salut",
        purpose: "preview",
        count: 1,
        config: { tone: "chill" }
      },
      async () => ({ provider: "gemini", model: "gemini-2.5-flash", apiKey: "server-secret" }),
      async () => new Response("", { status: 404 }),
      async () => ({ memories: [] })
    ),
    /gemini_model_unavailable/
  );
});


test("classifies truncated Gemini output before JSON parsing", async () => {
  await assert.rejects(
    () => generateExtensionSuggestions(
      "user-1",
      {
        context: "Them: salut",
        purpose: "preview",
        count: 1,
        config: { tone: "chill" }
      },
      async () => ({ provider: "gemini", model: "gemini-3.8-flash", apiKey: "server-secret" }),
      async () => new Response(JSON.stringify({
        candidates: [{
          finishReason: "MAX_TOKENS",
          content: { parts: [{ text: "[\"message cut off" }] }
        }]
      }), { status: 200, headers: { "content-type": "application/json" } }),
      async () => ({ memories: [] })
    ),
    /gemini_response_truncated/
  );
});

test("classifies malformed structured output without leaking parser details", async () => {
  await assert.rejects(
    () => generateExtensionSuggestions(
      "user-1",
      {
        context: "Them: salut",
        purpose: "preview",
        count: 1,
        config: { tone: "chill" }
      },
      async () => ({ provider: "gemini", model: "gemini-3.8-flash", apiKey: "server-secret" }),
      async () => new Response(JSON.stringify({
        candidates: [{ finishReason: "STOP", content: { parts: [{ text: "[\"unterminated" }] } }]
      }), { status: 200, headers: { "content-type": "application/json" } }),
      async () => ({ memories: [] })
    ),
    /gemini_invalid_suggestions/
  );
});


test("does not send client raw identity when server context is available", async () => {
  let body = "";
  await generateExtensionSuggestions(
    "user-1",
    {
      context: "Them: what do you do?",
      purpose: "preview",
      count: 1,
      config: { identity: { aboutMe: "VERY LONG RAW ABOUT ME" }, tone: "chill" }
    },
    async () => ({ provider: "gemini", model: "gemini-test", apiKey: "server-secret" }),
    async (_input, init) => {
      body = String(init?.body ?? "");
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: "[\"software\"]" }] } }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
    async () => ({
      userProfile: { identity: { summary: "software engineer" } },
      memories: []
    })
  );
  assert.equal(body.includes("VERY LONG RAW ABOUT ME"), false);
  assert.equal(body.includes("software engineer"), true);
});


test("extension generation honors stored adaptive style and proactive topic exclusions", async () => {
  let body = "";
  await generateExtensionSuggestions(
    "user-1",
    { context: "Them: I like football", purpose: "manual", count: 1, config: { messageLength: "short", humorLevel: 60 } },
    async () => ({ provider: "gemini", model: "gemini-test", apiKey: "secret" }),
    async (_input, init) => {
      body = String(init?.body ?? "");
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '["Nice!"]' }] } }] }), { status: 200 });
    },
    async () => ({
      userProfile: {
        textingStyle: { messageLength: "auto-adaptive", teasingStyle: "auto-adaptive", doubleTexting: "auto-adaptive" },
        topicEngine: { avoidedTopics: ["sports"] }
      },
      memories: []
    })
  );
  assert.match(body, /Auto-adaptive relative to the saved user baseline/);
  assert.match(body, /Do not proactively raise/);
  assert.match(body, /sports/);
});

test("extension flow uses the last observed exchange and allows the match to redirect", async () => {
  let submitted = "";
  const input = validateExtensionSuggestionRequest({
    context: "You: Salut\nYou: Ça va ?\nThem: Ça va, tu fais quoi ce weekend ?",
    purpose: "auto", count: 1, config: { conversationFlowEnabled: true },
    threadKey: "tinder-thread-123"
  });
  assert.equal(input.threadKey, "tinder-thread-123");
  await generateExtensionSuggestions(
    "u-test", { ...input, threadKey: undefined },
    async () => ({ provider: "gemini", model: "gemini-test", apiKey: "secret" }),
    async (_, init) => {
      submitted = String(init?.body ?? "");
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '["Ça va, et toi ?"]' }] } }] }), { status: 200 });
    },
    async () => ({ memories: [] })
  );
  assert.match(submitted, /Adaptive Conversation Flow/);
  assert.match(submitted, /ANSWER IT FIRST/);
  assert.match(submitted, /location/);
  assert.doesNotMatch(submitted, /apiKey[\\s\\S]*secret/);
});
test("extension flow is optional and disabled for users who opt out", async () => {
  let submitted = "";
  await generateExtensionSuggestions(
    "u-test", { context: "Them: Salut", purpose: "auto", count: 1, config: { conversationFlowEnabled: false } },
    async () => ({ provider: "gemini", model: "gemini-test", apiKey: "secret" }),
    async (_, init) => {
      submitted = String(init?.body ?? "");
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '["Salut"]' }] } }] }), { status: 200 });
    },
    async () => ({ memories: [] })
  );
  assert.doesNotMatch(submitted, /Adaptive Conversation Flow/);
});
test("thread references are bounded and cannot be arbitrary objects", () => {
  assert.throws(() => validateExtensionSuggestionRequest({
    context: "Them: Bonjour", purpose: "auto", count: 1, config: {}, threadKey: { foo: "bar" }
  }), /invalid_extension_generation_thread/);
  assert.throws(() => validateExtensionSuggestionRequest({
    context: "Them: Bonjour", purpose: "auto", count: 1, config: {}, threadKey: "x".repeat(513)
  }), /invalid_extension_generation_thread/);
});


test("automatic extension prompt reacts to French hhh as a gentle laughter cue, not a dialect instruction", async () => {
  let sentPrompt = "";
  const result = await generateExtensionSuggestions(
    "user-1",
    {
      context: "Me: Tu as des bonnes adresses ?\nThem: Je découvre plein de librairies mais je reviens toujours à ma préférée hhh",
      purpose: "auto",
      count: 1,
      config: { tone: "natural", languages: { fr: 90, darija: 10, en: 0 } }
    },
    async () => ({ provider: "gemini", model: "gemini-test", apiKey: "server-secret" }),
    async (_input, init) => {
      const payload = JSON.parse(String(init?.body));
      sentPrompt = payload.contents[0].parts[0].text;
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: '["Ah, une vraie fidèle de cette librairie alors 😄"]' }] } }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
    async () => ({ memories: [] })
  );
  assert.equal(result.suggestions.length, 1);
  assert.match(sentPrompt, /'hhh' is a small 'haha'/);
  assert.match(sentPrompt, /respond to THAT hook/);
  assert.doesNotMatch(sentPrompt, /Prefer natural Latin-script Darija/);
});


test("direct Darija AI identity question blocks automatic generation before any provider call", async () => {
  let settingsLoaded = false;
  let modelCalled = false;
  await assert.rejects(() => generateExtensionSuggestions(
    "test-user",
    {
      purpose: "auto",
      count: 1,
      context: "Me: Je travaille comme dev\\nThem: Nta Rak iA",
      config: {}
    },
    async () => {
      settingsLoaded = true;
      return { provider: "gemini", model: "gemini-test", apiKey: "secret" };
    },
    async () => {
      modelCalled = true;
      return new Response("");
    },
    async () => ({ memories: [] })
  ), /human_ai_identity_review_required/);
  assert.equal(settingsLoaded, false);
  assert.equal(modelCalled, false);
});

test("AI identity question in an older message is not a new automatic-blocking event", async () => {
  let called = false;
  const result = await generateExtensionSuggestions(
    "test-user",
    {
      purpose: "auto", count: 1,
      context: "Them: nta ia\\nMe: Je t'explique ce que j'utilise\\nThem: Tu veux parler de quoi ?",
      config: {}
    },
    async () => ({ provider: "gemini", model: "test", apiKey: "secret" }),
    async () => {
      called = true;
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: '["On peut parler de nos passions."]' }] } }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
    async () => ({ memories: [] })
  );
  assert.equal(called, true);
  assert.equal(result.suggestions.length, 1);
});
