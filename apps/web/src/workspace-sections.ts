export const workspaceViews = ["overview", "conversations", "identity", "memories", "actions", "analytics", "settings"] as const;
export type WorkspaceView = typeof workspaceViews[number];

export const workspaceCopy: Record<WorkspaceView, { title: string; subtitle: string; label: string }> = {
  overview: { label: "Overview", title: "Your conversation universe.", subtitle: "A quick view of your conversations, setup and next steps." },
  conversations: { label: "Conversations", title: "Conversations, under control.", subtitle: "Search chats, inspect the context and choose who manages each conversation." },
  identity: { label: "Identity", title: "Make TNND sound like you.", subtitle: "Manage your approved identity and help TNND understand your natural writing style." },
  memories: { label: "Memories", title: "Your real stories, ready when needed.", subtitle: "Build a library of approved anecdotes that give replies a personal touch." },
  actions: { label: "Action Center", title: "Everything needing your attention.", subtitle: "Review requests and important decisions without losing conversation context." },
  analytics: { label: "Analytics", title: "Insights that help you improve.", subtitle: "Track activity and understand how TNND uses your approved memories." },
  settings: { label: "Settings", title: "Make TNND work your way.", subtitle: "Tune your communication style, languages, AI provider and account settings." }
};

const groups: Record<string, WorkspaceView> = {
  "workspace-overview": "overview",
  "setup-guidance-panel": "overview",
  "first-run-guide-panel": "overview",
  "conversation-panel": "conversations",
  "conversation-management-panel": "conversations",
  "conversation-takeover-panel": "conversations",
  "identity-builder-panel": "identity",
  "texting-style-learning-panel": "identity",
  "texting-style-examples": "identity",
  "personal-memory-panel": "memories",
  "action-center-section": "actions",
  "analytics-panel": "analytics",
  "profile-settings": "settings",
  "profile-import-panel": "settings",
  "ai-provider-panel": "settings",
  "auth-panel": "settings",
  "account-privacy-panel": "settings"
};

export function groupForPanelId(id: string): WorkspaceView {
  // Unknown future panels are discoverable from Settings rather than silently dropped.
  return groups[id] ?? "settings";
}

export function viewForHash(hash: string, parentPanelId = ""): WorkspaceView {
  const clean = decodeURIComponent(hash.replace(/^#/, ""));
  if (clean in groups) return groups[clean];
  if (parentPanelId in groups) return groups[parentPanelId];
  const fragment = clean.replace(/-panel$/, "");
  return workspaceViews.includes(fragment as WorkspaceView) ? fragment as WorkspaceView : "overview";
}
