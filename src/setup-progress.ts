/** Shared, side-effect-free readiness and topic-gap policy for TNND web + extension. */
export type CheckState = "complete" | "incomplete" | "unknown";
export type SetupStepId = "account" | "identity" | "gemini" | "preferences";
export interface SetupStep { id: SetupStepId; label: string; href: string; state: CheckState; }
export interface SetupSnapshot {
  signedIn: boolean;
  identityApproved: boolean | null;
  geminiConfigured: boolean | null;
  preferencesConfigured: boolean | null;
}
export interface SetupProgress {
  percent: number | null;
  completed: number;
  steps: SetupStep[];
  next: SetupStep | null;
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function hasText(value: unknown): boolean { return typeof value === "string" && value.trim().length > 0; }
export function profileReadiness(profile: unknown): { identityApproved: boolean; preferencesConfigured: boolean } {
  const p = object(profile);
  const builder = object(p.identityBuilder);
  const dating = object(p.datingIntent);
  const style = object(p.textingStyle);
  return {
    identityApproved: builder.reviewStatus === "approved" && hasText(object(builder.analysis).summary),
    preferencesConfigured: hasText(dating.defaultGoal) && Object.keys(style).length > 0
  };
}
export function setupProgress(input: SetupSnapshot): SetupProgress {
  const flag = (value: boolean | null): CheckState => value === null ? "unknown" : value ? "complete" : "incomplete";
  const steps: SetupStep[] = [
    { id: "account", label: "Connect your TNND account", href: "#workspace-overview", state: input.signedIn ? "complete" : "incomplete" },
    { id: "identity", label: "Describe and approve your identity", href: "#identity-builder-panel", state: flag(input.identityApproved) },
    { id: "gemini", label: "Configure Gemini", href: "#ai-provider-form", state: flag(input.geminiConfigured) },
    { id: "preferences", label: "Choose conversation preferences", href: "#profile-settings", state: flag(input.preferencesConfigured) }
  ];
  const completed = steps.filter(step => step.state === "complete").length;
  return {
    percent: steps.some(step => step.state === "unknown") ? null : Math.round(100 * completed / steps.length),
    completed,
    steps,
    next: steps.find(step => step.state === "incomplete") ?? null
  };
}
export interface TopicConversation { currentTopic?: string | null; status?: string; lastMessageAt?: string | null; }
export interface TopicInsight { topic: string; messageCount: number; conversationCount: number; lastDiscussedAt?: string; }
export interface TopicMemory {
  reviewStatus?: string;
  structuredAnalysis?: {
    title?: string; category?: string; topics?: string[]; summary?: string;
    allowedForChat?: boolean;
  };
}
export interface StoryRecommendation {
  id: string; label: string; description: string; prompt: string;
  messageCount?: number; conversationCount?: number;
}
const categories = [
  { id: "travel", pattern: /\b(travel|trip|holiday|vacation|voyag\w*|vacance\w*|country|countries|destination)\b|سفر|رحل/, label: "Travel", prompt: "Describe a real travel moment: where, what happened, and why you remember it." },
  { id: "work", pattern: /\b(work|job|career|office|coding|developer|software|travail|boulot|m[eé]tier|profession|informatique|carri[eè]re)\b|خدم|عمل/, label: "Work", prompt: "Describe a memorable or funny true moment from work." },
  { id: "movies", pattern: /\b(movie|film|cinema|cin[eé]ma|series|s[eé]rie\w*|tv show|netflix|acteur)\b|فيلم|مسلسل/, label: "Movies and series", prompt: "Tell a real anecdote about a movie or series that stayed with you." },
  { id: "sports", pattern: /\b(sport|sports|football|soccer|basketball|fitness|gym|running|run|tennis|musculation|foot|match|entrainement|entraînement)\b|رياضة|كرة|جيم/, label: "Sport and fitness", prompt: "Share a true sport or fitness moment: a match, challenge, funny incident, or personal achievement." },
  { id: "music", pattern: /\b(music|musique|concert|song|chanson|singer|chanteur|rap|festival)\b|موسيقى|أغنية/, label: "Music", prompt: "Tell a genuine story about a song, concert or musical moment." },
  { id: "food", pattern: /\b(food|cuisine|cooking|cook|restaurant|recipe|recette|cuisiner|manger|plat|foodie)\b|طبخ|أكل/, label: "Food", prompt: "Share a real food, restaurant or cooking anecdote." },
  { id: "games", pattern: /\b(game|gaming|video games|jeu\w*|gaming|console|playstation)\b|لعبة|ألعاب/, label: "Games", prompt: "Share a real and memorable gaming moment." },
  { id: "pets", pattern: /\b(pet|cat|dog|animal|chat|chien|animaux)\b|قط|كلب|حيوان/, label: "Animals", prompt: "Tell a real personal animal or pet anecdote." }
] as const;
function recentEnough(timestamp: string | null | undefined, nowMs: number): boolean {
  if (!timestamp) return true;
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) && parsed <= nowMs && nowMs - parsed <= 60 * 86400_000;
}
function normalized(text: string): string {
  return text.trim().toLocaleLowerCase().replace(/\s+/g, " ").slice(0, 120);
}
/** Match a curated category, otherwise keep grounded, sufficiently frequent custom topics. */
function classified(raw: string): { id: string; label: string; prompt: string } | null {
  const topic = normalized(raw);
  if (!topic) return null;
  const category = categories.find(c => c.pattern.test(topic));
  if (category) return category;
  // Unknown/sensitive/broad topics should not trigger speculative personal prompts.
  if (topic.length < 4 || topic.length > 48 ||
      /\b(other|general|small talk|greeting|unknown|politic|politique|religion|health|medical|sex|santé|sante|politics)\b|سياس|دين|صحة/.test(topic)) return null;
  return { id: "topic:" + topic, label: topic, prompt: "Share a real anecdote about " + topic + ", if you want to." };
}
/** Historic topic frequency takes priority; old discussions still count. No extra AI calls. */
export function missingStoryRecommendations(
  conversations: TopicConversation[],
  memories: TopicMemory[],
  nowMs = Date.now(),
  insights: TopicInsight[] = [],
  avoidedTopics: string[] = []
): StoryRecommendation[] {
  const frequency: TopicInsight[] = insights.length
    ? insights.filter(i => Number.isFinite(i.messageCount) && i.messageCount > 0 && Number.isFinite(i.conversationCount) && i.conversationCount > 0)
    : conversations.filter(c => c.status !== "archived" && c.status !== "disabled" && recentEnough(c.lastMessageAt, nowMs))
      .map(c => ({ topic: c.currentTopic ?? "", messageCount: 1, conversationCount: 1 }));
  const groups = new Map<string, { item: ReturnType<typeof classified> & {}; occurrences: number; chats: number; recent: boolean }>();
  for (const insight of frequency) {
    const item = classified(insight.topic);
    if (!item) continue;
    if (item.id.startsWith("topic:") && (insight.messageCount < 6 || insight.conversationCount < 2)) continue;
    const previous = groups.get(item.id);
    const last = insight.lastDiscussedAt && recentEnough(insight.lastDiscussedAt, nowMs);
    groups.set(item.id, {
      item, occurrences: (previous?.occurrences ?? 0) + insight.messageCount,
      chats: (previous?.chats ?? 0) + insight.conversationCount,
      recent: Boolean(previous?.recent || last)
    });
  }
  const approved = memories.filter(m => m.reviewStatus === "approved" && m.structuredAnalysis?.allowedForChat !== false)
    .map(m => normalized([m.structuredAnalysis?.title, m.structuredAnalysis?.category, ...(m.structuredAnalysis?.topics ?? [])].filter(Boolean).join(" ")));
  const excluded = new Set(avoidedTopics.map(normalized));
  return [...groups.values()]
    .filter(group => !excluded.has(group.item.id))
    .filter(group => !approved.some(topic => {
      const match = classified(topic);
      return match?.id === group.item.id ||
        (group.item.id.startsWith("topic:") && topic.includes(group.item.id.slice(6)));
    }))
    .sort((a,b) => (b.occurrences * 2 + b.chats * 4 + (b.recent ? 2 : 0)) - (a.occurrences * 2 + a.chats * 4 + (a.recent ? 2 : 0)))
    .slice(0, 12)
    .map(group => ({
      id: group.item.id,
      label: group.item.label + " stories",
      description: "Discussed " + group.occurrences + " time(s) across " + group.chats + " conversation(s), without an approved related anecdote.",
      prompt: group.item.prompt,
      messageCount: group.occurrences,
      conversationCount: group.chats
    }));
}
