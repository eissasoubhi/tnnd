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
export interface TopicMemory {
  reviewStatus?: string;
  structuredAnalysis?: {
    title?: string; category?: string; topics?: string[]; summary?: string;
    allowedForChat?: boolean;
  };
}
export interface StoryRecommendation { id: string; label: string; description: string; prompt: string; }
const categories = [
  { id: "travel", pattern: /\b(travel|trip|holiday|vacation|voyag\w*|vacance\w*|voyage|country|countries|destination|safar|sfr)\b|سفر|رحل/, label: "Your travel stories", description: "Travel came up in a conversation, but no approved travel anecdote was found.", prompt: "Share a real travel moment you remember: where, what happened, and why it stayed with you." },
  { id: "work", pattern: /\b(work|job|career|office|coding|developer|software|travail|boulot|m[eé]tier|profession|informatique|carri[eè]re)\b|خدم|عمل/, label: "Your work stories", description: "Work came up in a conversation, but no approved work anecdote was found.", prompt: "Share a real funny or memorable moment from your work or career." },
  { id: "movies", pattern: /\b(movie|film|cinema|cin[eé]ma|series|s[eé]rie\w*|tv show|netflix|acteur)\b|فيلم|مسلسل/, label: "Your movie & series stories", description: "Movies or shows came up, but no related approved personal memory was found.", prompt: "Share a genuine movie or series memory, opinion, or funny moment." }
] as const;
function recentEnough(timestamp: string | null | undefined, nowMs: number): boolean {
  if (!timestamp) return true;
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) && parsed <= nowMs && nowMs - parsed <= 60 * 86400_000;
}
export function missingStoryRecommendations(
  conversations: TopicConversation[],
  memories: TopicMemory[],
  nowMs = Date.now()
): StoryRecommendation[] {
  const activeTopics = conversations.filter(c => c.status !== "archived" && c.status !== "disabled" && recentEnough(c.lastMessageAt, nowMs))
    .map(c => (c.currentTopic ?? "").toLocaleLowerCase()).filter(Boolean);
  const approvedTopics = memories.filter(m => m.reviewStatus === "approved" && m.structuredAnalysis?.allowedForChat !== false)
    .map(m => [m.structuredAnalysis?.title, m.structuredAnalysis?.category, ...(m.structuredAnalysis?.topics ?? [])].filter(Boolean).join(" ").toLocaleLowerCase());
  return categories.filter(category => activeTopics.some(topic => category.pattern.test(topic))
    && !approvedTopics.some(topic => category.pattern.test(topic)))
    .map(({ id, label, description, prompt }) => ({ id, label, description, prompt }));
}
