import assert from "node:assert/strict";
import test from "node:test";
import { deriveConversationFlow, conversationFlowGuidance, flowOrder } from "./conversation-flow.js";

const outgoing = (text: string) => ({ direction: "outgoing" as const, text });
const incoming = (text: string) => ({ direction: "incoming" as const, text });

test("default flow begins with greeting, tracks progress without any external AI call", () => {
  const empty = deriveConversationFlow([]);
  assert.equal(empty.stage, "greeting");
  assert.deepEqual(empty.known, []);
  const started = deriveConversationFlow([outgoing("Salut"), outgoing("Bien ou bien ?")]);
  assert.equal(started.stage, "location");
  assert.equal(started.stages.find(stage => stage.id === "check-in")?.status, "covered");
  const explored = deriveConversationFlow([
    outgoing("salut"), outgoing("ça va ?"), incoming("Oui et toi ?"),
    outgoing("ça va aussi"), outgoing("T'es d'où ?"),
    incoming("Je viens de Lyon"), outgoing("tu fais quoi dans la vie ?")
  ]);
  assert.equal(explored.stage, "interests");
  assert.equal(explored.stages.find(stage => stage.id === "location")?.reason, "mentioned");
  assert.equal(explored.stages.find(stage => stage.id === "occupation")?.reason, "asked");
});

test("persisted match facts skip answered steps, never substitute the user's own facts", () => {
  const base = [outgoing("Salut"), outgoing("ca va")];
  const facts = [
    { subject: "user" as const, key: "city", value: "Paris", confidence: 0.99 },
    { subject: "match" as const, key: "hometown", value: "Lyon", confidence: 0.94 },
    { subject: "match" as const, key: "profession", value: "Développeuse", confidence: 0.87 },
    { subject: "match" as const, key: "hobbies", value: "Voyages", confidence: 0.42 }
  ];
  const state = deriveConversationFlow(base, facts);
  assert.equal(state.stage, "interests");
  assert.deepEqual(state.known.map(x => x.value), ["Lyon", "Développeuse"]);
  assert.equal(state.stages.find(x => x.id === "interests")?.status, "next");
});

test("latest question overrides suggested discovery step; no scripted interrogation", () => {
  const flow = deriveConversationFlow([
    outgoing("Salut"), incoming("Salut"), outgoing("Bien ou bien?"),
    incoming("Ça va, tu fais quoi ce weekend ?")
  ]);
  assert.equal(flow.respondToLatestFirst, true);
  assert.match(conversationFlowGuidance(flow), /ANSWER IT FIRST/);
  assert.match(conversationFlowGuidance(flow), /do not ask several questions/i);
  assert.equal(deriveConversationFlow([incoming("Je viens de Rabat")]).stage, "greeting");
});

test("flow order is configurable but bounded, never trusts arbitrary stage names", () => {
  assert.deepEqual(flowOrder(), ["greeting", "check-in", "location", "occupation", "interests", "free-conversation"]);
  assert.deepEqual(flowOrder({ order: ["occupation", "interests", "location"] }),
    ["greeting", "check-in", "occupation", "interests", "location", "free-conversation"]);
  assert.deepEqual(flowOrder({ order: ["location", "location", "interests"] }),
    ["greeting", "check-in", "location", "occupation", "interests", "free-conversation"]);
});

test("failed or unseen message history does not become fabricated knowledge", () => {
  const s = deriveConversationFlow([outgoing("Salut"), outgoing("Bien ou bien ?")],
    [{ subject: "match", key: "city", value: "Marseille", confidence: 0.3 }]);
  assert.equal(s.stage, "location");
  assert.equal(s.known.length, 0);
  assert.doesNotMatch(conversationFlowGuidance(s), /Marseille/);
});


test("authenticated detail route serializes conversationFlow along with saved messages", async () => {
  // Regression: the underlying getConversation returned flow, but main.ts
  // manually selected response fields and silently omitted it.
  const main = await (await import("node:fs/promises")).readFile(new URL("./main.ts", import.meta.url), "utf8");
  const detailRoute = main.slice(
    main.indexOf('if (request.method === "GET" && url.pathname.startsWith("/api/v1/conversations/"))'),
    main.indexOf('if ((request.method === "GET" || request.method === "POST") && url.pathname === "/api/v1/human-actions")')
  );
  assert.match(detailRoute, /const conversation = await getConversation\(session\.user\.id, conversationId\)/);
  assert.match(detailRoute, /conversation:\s*\{/);
  assert.match(detailRoute, /messages: conversation\.messages/);
  assert.match(detailRoute, /topicState: conversation\.topicState/);
  assert.match(detailRoute, /conversationFlow: conversation\.conversationFlow/);
  assert.doesNotMatch(detailRoute, /listConversations\(/);
});
