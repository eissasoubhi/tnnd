/** A small deterministic Conversation Flow derived from persisted messages/facts.
 * We do NOT store a second, potentially stale memory or call Gemini for stage
 * classification. The authenticated conversation history is the durable source.
 *
 * Flow is guidance, never permission to send or a scripted questionnaire.
 * A matching question, a refusal or a new topic always takes priority.
 */
export const DEFAULT_FLOW_ORDER = [
  "greeting", "check-in", "location", "occupation", "interests", "free-conversation"
] as const;
export type ConversationFlowStep = typeof DEFAULT_FLOW_ORDER[number];
export type ConversationFlowProgress = "covered" | "next" | "later";
export interface FlowMessage { direction: "incoming" | "outgoing"; text: string; }
export interface FlowFact { subject: "match" | "user" | "shared"; key: string; value: string; confidence: number; }
export interface ConversationFlowStage { id: ConversationFlowStep; status: ConversationFlowProgress; reason: "asked" | "known" | "mentioned" | "next" | "later"; }
export interface ConversationFlowState {
  stage: ConversationFlowStep;
  stages: ConversationFlowStage[];
  known: Array<{ key: string; value: string }>;
  respondToLatestFirst: boolean;
}
export interface ConversationFlowSettings {
  enabled?: boolean;
  order?: readonly ConversationFlowStep[];
}

const conversationTopics = ["location", "occupation", "interests"] as const;
type FlowTopic = typeof conversationTopics[number];

function normalized(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}
function matchesTopic(text: string, topic: FlowTopic): boolean {
  const t = normalized(text);
  if (topic === "location") {
    return /\b(t.es d.ou|tu es d.ou|tu viens d.ou|tu habites ou|tu vis ou|d.ou viens.tu|where (are you from|do you live)|whereabouts are you from)\b/i.test(t);
  }
  if (topic === "occupation") {
    return /\b(tu fais quoi (dans la vie|comme boulot|de beau au travail)|tfq dans la vie|tu travailles dans quoi|tu bosses dans quoi|what do you do (for (a )?living|for work)|what.s your job)\b/i.test(t);
  }
  return /\b(t.aimes faire quoi|tu aimes faire quoi|tes passions|tes loisirs|tu fais quoi (le week.end|en dehors du boulot)|what do you (like to do|do for fun)|hobbies|interests)\b/i.test(t);
}
function factTopic(key: string): FlowTopic | null {
  const k = normalized(key).replace(/[_-]/g, " ");
  if (/\b(city|ville|location|lieu|residence|hometown|country|pays|origin|origine|lives in)\b/.test(k)) return "location";
  if (/\b(job|work|travail|metier|profession|occupation|employer|career|etudes|studies)\b/.test(k)) return "occupation";
  if (/\b(hobby|loisir|interest|interet|passion|sport|activity|activite)\b/.test(k)) return "interests";
  return null;
}
function explicitIncomingTopic(message: string, topic: FlowTopic): boolean {
  const t = normalized(message);
  if (topic === "location") return /\b(j.habite|je vis|je viens de|je suis de|j.suis de|i live in|i.m from|i am from)\b/.test(t);
  if (topic === "occupation") return /\b(je travaille|je bosse|je suis (un|une) |je fais des etudes|i work (as|in|at)|i.m (a|an) |i study)\b/.test(t);
  return /\b(j.aime|j.adore|je kiffe|mes passions|j.fais du|i (love|like|enjoy)|my hobby|my hobbies)\b/.test(t);
}
function checkIn(text: string): boolean {
  return /\b(ca va|cv\s*\?|bien ou bien|comment (ca va|vas.tu|tu vas)|how are you|how.s (it going|your day)|you good)\b/i.test(normalized(text));
}
function greeting(text: string): boolean {
  return /^(salut|hello|hi|hey|bonjour|coucou|salam|bonsoir|slt)\b/i.test(normalized(text));
}
function isQuestion(text: string): boolean {
  const t = normalized(text);
  return text.includes("?") || /^(pourquoi|comment|ou|quand|quoi|qui|tu |t.es|do you |what |where |how |why |are you |can you )\b/.test(t);
}

/** A custom order may reorder discovery topics, but must keep greeting and
 * check-in first and free conversation last. Invalid stored settings fallback.
 */
export function flowOrder(settings?: ConversationFlowSettings): ConversationFlowStep[] {
  const core = settings?.order?.filter((step): step is FlowTopic =>
    conversationTopics.includes(step as FlowTopic)) ?? [];
  const unique = [...new Set(core)];
  const discovery = unique.length === conversationTopics.length
    ? unique : [...conversationTopics];
  return ["greeting", "check-in", ...discovery, "free-conversation"];
}

export function deriveConversationFlow(
  messages: readonly FlowMessage[],
  facts: readonly FlowFact[] = [],
  settings?: ConversationFlowSettings
): ConversationFlowState {
  // Keep source facts strictly match-scoped; the user's own occupation/city
  // must never become a fact about the match.
  const trusted = facts.filter(f => f.subject === "match" && f.confidence >= 0.7
    && f.key.trim() && f.value.trim()).slice(0, 30);
  const known = trusted.filter(f => factTopic(f.key) !== null)
    .slice(0, 8).map(f => ({ key: f.key.slice(0, 60), value: f.value.slice(0, 120) }));
  const recent = messages.slice(-80);
  const outgoing = recent.filter(message => message.direction === "outgoing").map(message => message.text);
  const incoming = recent.filter(message => message.direction === "incoming").map(message => message.text);
  const covered: Partial<Record<ConversationFlowStep, ConversationFlowStage["reason"]>> = {};
  if (outgoing.some(greeting)) covered.greeting = "asked";
  if (outgoing.some(checkIn) || incoming.some(checkIn)) covered["check-in"] = "asked";
  for (const topic of conversationTopics) {
    if (trusted.some(f => factTopic(f.key) === topic)) covered[topic] = "known";
    else if (incoming.some(text => explicitIncomingTopic(text, topic))) covered[topic] = "mentioned";
    else if (outgoing.some(text => matchesTopic(text, topic))) covered[topic] = "asked";
  }
  const order = flowOrder(settings);
  const current = order.find(stage => stage !== "free-conversation" && !covered[stage]) ?? "free-conversation";
  const last = recent.at(-1);
  const respondToLatestFirst = Boolean(last?.direction === "incoming" && isQuestion(last.text));
  return {
    stage: current,
    stages: order.map(id => ({
      id, status: covered[id] ? "covered" : id === current ? "next" : "later",
      reason: covered[id] ?? (id === current ? "next" : "later")
    })),
    known,
    respondToLatestFirst
  };
}

const labels: Record<ConversationFlowStep, string> = {
  greeting: "brief greeting", "check-in": "ask how the match is doing",
  location: "location, only if not already known or asked",
  occupation: "everyday life/work, only if not already known or asked",
  interests: "interests and activities, only if not already known or asked",
  "free-conversation": "follow naturally from shared interests and the current topic"
};

export function conversationFlowGuidance(state: ConversationFlowState): string {
  const covered = state.stages.filter(step => step.status === "covered")
    .map(step => step.id).join(", ");
  const facts = state.known.map(f => f.key + ": " + f.value).join("; ");
  return [
    "Adaptive Conversation Flow (suggestion ONLY, never a fixed questionnaire):",
    "Default direction: greeting -> check-in -> location -> everyday life/work -> interests -> free conversation.",
    "Already covered/mentioned (do not ask again): " + (covered || "nothing confirmed"),
    "Next optional discovery direction: " + labels[state.stage] + ".",
    facts ? "Verified MATCH facts from persisted conversation: " + facts : "",
    state.respondToLatestFirst
      ? "The match's latest message asks a question. ANSWER IT FIRST and stay on that topic; do not push the next flow stage."
      : "React to the match's latest message and topic first. Only explore the next stage if it fits naturally.",
    "Do not invent facts, feelings or profile observations. Do not ask several questions at once; do not force or repeat steps. A refusal or topic change overrides the flow.",
    "If the user provided Extra instructions or per-chat instructions, retain their wording/style and use this only to avoid repetition."
  ].filter(Boolean).join("\n");
}
