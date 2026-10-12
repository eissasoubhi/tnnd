import { getBackendProfileCache, getBackendSession } from "./storage";
import { missingStoryRecommendations, profileReadiness, setupProgress, type TopicConversation, type TopicMemory } from "./setup-progress";

const WEB_BASE = "http://127.0.0.1:5173/";
const API_BASE = "http://127.0.0.1:4000";
let sequence = 0;
/** The extension shows the server's setup state; it never maintains a second editable identity. */
export async function renderExtensionSetupProgress(): Promise<void> {
  const root = document.getElementById("tnnd-setup-progress");
  if (!root) return;
  const generation = ++sequence;
  const session = await getBackendSession();
  if (generation !== sequence) return;
  const cache = session ? await getBackendProfileCache() : null;
  let gemini: boolean | null = session ? null : false;
  if (session) {
    try {
      const response = await fetch(`${API_BASE}/api/v1/ai/provider-settings`, {
        headers: { authorization: `Bearer ${session.token}` }
      });
      if (response.ok) {
        const data = await response.json() as { configured?: boolean };
        gemini = typeof data.configured === "boolean" ? data.configured : null;
      }
    } catch { /* Keep unknown; do not imply Gemini is missing on network failure. */ }
  }
  if (generation !== sequence) return;
  const readiness = cache ? profileReadiness(cache.profile) : null;
  const progress = setupProgress({
    signedIn: Boolean(session),
    identityApproved: session ? readiness?.identityApproved ?? null : false,
    geminiConfigured: gemini,
    preferencesConfigured: session ? readiness?.preferencesConfigured ?? null : false
  });
  root.replaceChildren();
  const heading = document.createElement("h2");
  heading.textContent = progress.percent === null ? `Setup · ${progress.completed}/4 verified` : `Setup · ${progress.percent}%`;
  root.append(heading);
  const bar = document.createElement("progress");
  bar.max = 100;
  if (progress.percent !== null) bar.value = progress.percent;
  bar.style.width = "100%";
  bar.setAttribute("aria-label", "TNND setup completion");
  root.append(bar);
  const list = document.createElement("ol");
  list.style.paddingLeft = "18px";
  list.style.marginBottom = "0";
  for (const step of progress.steps) {
    const row = document.createElement("li");
    row.style.padding = "4px 0";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary";
    button.style.padding = "5px 8px";
    button.style.fontSize = "11px";
    button.textContent = `${step.state === "complete" ? "✓" : step.state === "unknown" ? "?" : "○"} ${step.label}`;
    button.addEventListener("click", () => { void chrome.tabs.create({ url: `${WEB_BASE}${step.href}` }); });
    row.append(button);
    list.append(row);
  }
  root.append(list);
  const hint = document.createElement("p");
  hint.className = "muted";
  hint.textContent = "Identity and preferences are managed on TNND Web. Reopen the extension to refresh.";
  root.append(hint);
  if (!session) return;
  try {
    const headers = { authorization: `Bearer ${session.token}` };
    const [conversationsResponse, memoriesResponse] = await Promise.all([
      fetch(`${API_BASE}/api/v1/conversations`, { headers }),
      fetch(`${API_BASE}/api/v1/personal-memories`, { headers })
    ]);
    if (!conversationsResponse.ok || !memoriesResponse.ok) return;
    const conversationsData = await conversationsResponse.json() as { conversations?: TopicConversation[] };
    const memoriesData = await memoriesResponse.json() as { memories?: TopicMemory[] };
    if (generation !== sequence) return;
    const ideas = missingStoryRecommendations(conversationsData.conversations ?? [], memoriesData.memories ?? []);
    if (!ideas.length) return;
    const title = document.createElement("h2");
    title.style.marginTop = "14px";
    title.textContent = "Story suggestions (optional)";
    root.append(title);
    for (const idea of ideas.slice(0, 3)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary";
      button.style.margin = "4px 6px 4px 0";
      button.style.fontSize = "11px";
      button.textContent = `Add: ${idea.label}`;
      button.title = idea.description;
      button.addEventListener("click", () => {
        void chrome.tabs.create({ url: `${WEB_BASE}#personal-memory-panel` });
      });
      root.append(button);
    }
  } catch { /* Optional enrichment is non-blocking when offline. */ }
}
