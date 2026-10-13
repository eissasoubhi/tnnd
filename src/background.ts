import "./web-diagnostic-background";
import "./tinder-checkpoint-background";
import "./tinder-message-cursor-background";
import "./tinder-unread-observation-background";
import { generateSuggestions } from "./gemini";
import { loadTinderConversationManagement } from "./tinder-backend-management";
import { syncConversationDelta } from "./conversation-sync";
import { syncObservedMatchProfile } from "./tinder-match-profile-runtime";
import { buildReadOnlyProfileSource, hasMeaningfulVisibleProfileFields } from "./tinder-match-profile-capture";
import type { VisibleTinderMatchIdentity } from "./tinder-chat-identity";
import { mayAutomaticallySendToTinder } from "./tinder-auto-send-gate";
import { generateBackendSuggestions } from "./backend-session";
import { getApiKey, getBackendSession, getChatSettings, getConfig, lockStorageToTrustedContexts, resolveEffectiveConfig } from "./storage";
import type { AppConfig, GenerateRequest, GenerateResponse, PreviewOverrides } from "./types";

const AUTO_STATE_KEY = "tnnd.autoState";
const FIRST_MESSAGE_CLAIMS_KEY = "tnnd.firstMessageAttempts.v1";
const pendingFirstMessageClaims = new Set<string>();

function senderThreadRef(sender: chrome.runtime.MessageSender): string | null {
  try {
    const url = new URL(sender.url ?? "");
    if (!["https://tinder.com", "https://www.tinder.com"].includes(url.origin)) return null;
    if (!url.pathname.startsWith("/app/messages/")) return null;
    return decodeURIComponent(url.pathname.slice("/app/messages/".length)).replace(/\/+$/, "");
  } catch { return null; }
}

function normalizeFirstMessageClaims(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([ref, timestamp]) => ref.length > 0 && ref.length <= 512 && typeof timestamp === "number" && Number.isFinite(timestamp))
    .slice(-1000)) as Record<string, number>;
}

async function checkFirstMessagePermission(ref: string): Promise<{
  ok: boolean; allowed: boolean; reason?: string; savedMessageCount?: number;
}> {
  const raw = await chrome.storage.local.get(FIRST_MESSAGE_CLAIMS_KEY);
  if (normalizeFirstMessageClaims(raw[FIRST_MESSAGE_CLAIMS_KEY])[ref]) return { ok: true, allowed: false, reason: "already_attempted" };
  if (pendingFirstMessageClaims.has(ref)) return { ok: true, allowed: false, reason: "claim_in_progress" };
  const backend = await loadTinderConversationManagement(ref);
  if (!backend.conversationId || backend.conversationStatus !== "active" || !mayAutomaticallySendToTinder(backend)) {
    return { ok: true, allowed: false, reason: "ai_management_not_active" };
  }
  const session = await getBackendSession();
  if (!session) return { ok: true, allowed: false, reason: "not_connected" };
  const response = await fetch(`http://127.0.0.1:4000/api/v1/conversations/${encodeURIComponent(backend.conversationId)}`, {
    headers: { authorization: `Bearer ${session.token}` }
  });
  if (!response.ok) return { ok: true, allowed: false, reason: "backend_unavailable" };
  const payload = await response.json() as { conversation?: { messages?: unknown[] } };
  if (!Array.isArray(payload?.conversation?.messages)) return { ok: true, allowed: false, reason: "unknown_backend_history" };
  const savedMessageCount = payload.conversation.messages.length;
  return { ok: true, allowed: savedMessageCount === 0, savedMessageCount,
    ...(savedMessageCount ? { reason: "backend_history_present" } : {}) };
}



interface AutoState {
  date: string;
  dailyCount: number;
  processed: Record<string, number>;
}

type TrustedContentRequest =
  | { type: "TNND_GET_CONTENT_CONFIG" }
  | { type: "TNND_GET_CHAT_AUTOMATION"; threadKey: string }
  | { type: "TNND_GET_BACKEND_AUTO_SEND_PERMISSION"; conversationRef: string }
  | { type: "TNND_GET_FIRST_MESSAGE_PERMISSION"; conversationRef: string }
  | { type: "TNND_CLAIM_FIRST_MESSAGE"; conversationRef: string }
  | { type: "TNND_SYNC_VISIBLE_MATCH_IDENTITY"; conversationRef: string; identity: VisibleTinderMatchIdentity }
  | { type: "TNND_GET_AUTO_STATE" }
  | { type: "TNND_SAVE_AUTO_STATE"; state: AutoState };

void lockStorageToTrustedContexts();
chrome.runtime.onInstalled.addListener(() => void lockStorageToTrustedContexts());
chrome.action.onClicked.addListener(() => void chrome.runtime.openOptionsPage());

function senderAllowed(sender: chrome.runtime.MessageSender): boolean {
  if (sender.id !== chrome.runtime.id) return false;
  const url = sender.url ?? "";
  return url.startsWith(`chrome-extension://${chrome.runtime.id}/`) || url.startsWith("https://tinder.com/") || url.startsWith("https://www.tinder.com/");
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultAutoState(): AutoState {
  return { date: today(), dailyCount: 0, processed: {} };
}

function normalizeAutoState(value: unknown): AutoState {
  if (!value || typeof value !== "object") return defaultAutoState();
  const candidate = value as Partial<AutoState>;
  if (candidate.date !== today()) return defaultAutoState();
  const processed = candidate.processed && typeof candidate.processed === "object"
    ? Object.fromEntries(
        Object.entries(candidate.processed)
          .filter(([key, timestamp]) => Boolean(key) && typeof timestamp === "number" && Number.isFinite(timestamp))
          .slice(-5000)
      )
    : {};
  return {
    date: candidate.date,
    dailyCount: typeof candidate.dailyCount === "number" && Number.isFinite(candidate.dailyCount)
      ? Math.max(0, Math.floor(candidate.dailyCount))
      : 0,
    processed
  };
}

async function getAutoState(): Promise<AutoState> {
  const raw = (await chrome.storage.local.get(AUTO_STATE_KEY))[AUTO_STATE_KEY];
  return normalizeAutoState(raw);
}

async function saveAutoState(value: unknown): Promise<AutoState> {
  const state = normalizeAutoState(value);
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  state.processed = Object.fromEntries(Object.entries(state.processed).filter(([, timestamp]) => timestamp >= cutoff));
  await chrome.storage.local.set({ [AUTO_STATE_KEY]: state });
  return state;
}

async function getContentConfig() {
  const config = await getConfig();
  return {
    model: config.model,
    tone: config.tone,
    messageLength: config.messageLength,
    flirtLevel: config.flirtLevel,
    humorLevel: config.humorLevel,
    emojiLevel: config.emojiLevel,
    languages: { ...config.languages },
    automation: { ...config.automation }
  };
}

function applyPreviewOverrides(config: AppConfig, overrides?: PreviewOverrides): AppConfig {
  if (!overrides) return config;
  return {
    ...config,
    tone: overrides.tone ?? config.tone,
    messageLength: overrides.messageLength ?? config.messageLength,
    flirtLevel: overrides.flirtLevel ?? config.flirtLevel,
    humorLevel: overrides.humorLevel ?? config.humorLevel,
    emojiLevel: overrides.emojiLevel ?? config.emojiLevel,
    languages: { ...config.languages, ...(overrides.languages ?? {}) },
    preferredWords: overrides.preferredWords ?? config.preferredWords,
    avoidedWords: overrides.avoidedWords ?? config.avoidedWords,
    extraInstructions: overrides.extraInstructions ?? config.extraInstructions
  };
}

chrome.runtime.onMessage.addListener((message: GenerateRequest | TrustedContentRequest, sender, sendResponse) => {
  if (!message || typeof message !== "object" || !("type" in message)) return false;
  if (!senderAllowed(sender)) {
    sendResponse({ ok: false, error: "TNND rejected a request from an unexpected page." });
    return false;
  }

  if (message.type === "TNND_SYNC_VISIBLE_MATCH_IDENTITY") {
    // Identity comes only from the Tinder tab showing this exact conversation.
    // This path never enables AI management, generation, or sending.
    const senderRef = (() => {
      try {
        const url = new URL(sender.url ?? "");
        if (!["https://tinder.com", "https://www.tinder.com"].includes(url.origin)) return null;
        return url.pathname.startsWith("/app/messages/") ? decodeURIComponent(url.pathname.slice(14)).replace(/\/+$/, "") : null;
      } catch { return null; }
    })();
    if (!senderRef || senderRef !== message.conversationRef || !message.identity?.firstName) {
      sendResponse({ ok: false, error: "tinder_thread_identity_mismatch" });
      return false;
    }
    void (async () => {
      const session = await getBackendSession();
      if (!session) return { ok: true, synced: false, reason: "not-connected" };
      const source = buildReadOnlyProfileSource({
        route: `/app/messages/${senderRef}`,
        firstName: message.identity.firstName,
        age: message.identity.age,
        photoUrl: message.identity.photoUrl
      });
      if (!source.visibleFields.firstName || !hasMeaningfulVisibleProfileFields(source)) return { ok: false, error: "invalid_visible_identity" };
      const existing = await loadTinderConversationManagement(senderRef);
      const conversationId = existing.conversationId
        ?? (await syncConversationDelta(senderRef, [], "paused")).conversationId;
      const result = await syncObservedMatchProfile(session, `chat-${senderRef}`, source, { conversationId });
      return { ok: true, synced: true, result: result.status };
    })().then(sendResponse).catch(error => sendResponse({ ok: false, error: error instanceof Error ? error.message : "identity_sync_failed" }));
    return true;
  }

  if (message.type === "TNND_GET_CONTENT_CONFIG") {
    void getContentConfig()
      .then((config) => sendResponse({ ok: true, config }))
      .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "Could not load TNND content configuration." }));
    return true;
  }

  if (message.type === "TNND_GET_CHAT_AUTOMATION") {
    void getChatSettings(message.threadKey)
      .then((chat) => sendResponse({ ok: true, enabled: chat.enabled }))
      .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "Could not load TNND chat configuration." }));
    return true;
  }

  if (message.type === "TNND_GET_FIRST_MESSAGE_PERMISSION" || message.type === "TNND_CLAIM_FIRST_MESSAGE") {
    const ref = message.conversationRef?.trim();
    const senderRef = senderThreadRef(sender);
    if (!ref || senderRef !== ref) {
      sendResponse({ ok: true, allowed: false, reason: "wrong_thread" });
      return false;
    }
    if (message.type === "TNND_GET_FIRST_MESSAGE_PERMISSION") {
      void checkFirstMessagePermission(ref).then(sendResponse)
        .catch(() => sendResponse({ ok: true, allowed: false, reason: "backend_unavailable" }));
    } else {
      // In-memory lock serializes claims across Tinder tabs in this worker.
      // Persistent record survives reload/crash and forbids blind retries.
      if (pendingFirstMessageClaims.has(ref)) {
        sendResponse({ ok: true, claimed: false, reason: "already_attempted" });
        return false;
      }
      pendingFirstMessageClaims.add(ref);
      void (async () => {
        try {
          const checked = await checkFirstMessagePermission(ref);
          if (!checked.allowed) return { ok: true, claimed: false, reason: checked.reason };
          const stored = await chrome.storage.local.get(FIRST_MESSAGE_CLAIMS_KEY);
          const entries = normalizeFirstMessageClaims(stored[FIRST_MESSAGE_CLAIMS_KEY]);
          if (entries[ref]) return { ok: true, claimed: false, reason: "already_attempted" };
          const attempts = { ...entries, [ref]: Date.now() };
          await chrome.storage.local.set({ [FIRST_MESSAGE_CLAIMS_KEY]: attempts });
          return { ok: true, claimed: true };
        } finally { pendingFirstMessageClaims.delete(ref); }
      })().then(sendResponse).catch(() => sendResponse({ ok: true, claimed: false, reason: "claim_failed" }));
    }
    return true;
  }

  if (message.type === "TNND_GET_BACKEND_AUTO_SEND_PERMISSION") {
    const ref = message.conversationRef?.trim();
    const senderPath = (() => {
      try { return new URL(sender.url ?? "").pathname; } catch { return ""; }
    })();
    const expectedRef = senderPath.startsWith("/app/messages/")
      ? decodeURIComponent(senderPath.slice("/app/messages/".length)).trim()
      : "";
    if (!ref || !expectedRef || expectedRef !== ref) {
      sendResponse({ ok: true, allowed: false });
      return false;
    }
    // Service worker has explicit localhost host permission. Keep the
    // authorization lookup outside Tinder's page/CORS context.
    void loadTinderConversationManagement(ref)
      .then((backend) => sendResponse({ ok: true, allowed: mayAutomaticallySendToTinder(backend) }))
      .catch(() => sendResponse({ ok: true, allowed: false }));
    return true;
  }

  if (message.type === "TNND_GET_AUTO_STATE") {
    void getAutoState()
      .then((state) => sendResponse({ ok: true, state }))
      .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "Could not load TNND automation state." }));
    return true;
  }

  if (message.type === "TNND_SAVE_AUTO_STATE") {
    void saveAutoState(message.state)
      .then((state) => sendResponse({ ok: true, state }))
      .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "Could not save TNND automation state." }));
    return true;
  }

  if (message.type !== "GENERATE_SUGGESTIONS") return false;

  void (async () => {
    try {
      const [backendSession, apiKey, baseConfig, chat] = await Promise.all([
        getBackendSession(),
        getApiKey(),
        getConfig(),
        getChatSettings(message.threadKey ?? "")
      ]);
      const purpose = message.purpose ?? "manual";
      if (purpose === "auto" && !chat.enabled) throw new Error("Automatic replies are disabled for this conversation.");
      const effective = resolveEffectiveConfig(baseConfig, chat);
      const config = purpose === "preview" ? applyPreviewOverrides(effective, message.previewOverrides) : effective;
      const count = message.replyCount ?? config.replyCount;
      const suggestions = backendSession
        ? await generateBackendSuggestions(backendSession, {
            context: message.context,
            purpose,
            count,
            config,
            chat
          })
        : await generateSuggestions(apiKey, config, message.context, purpose, count, chat);
      sendResponse({ ok: true, suggestions } satisfies GenerateResponse);
    } catch (error) {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : "Unknown TNND error." } satisfies GenerateResponse);
    }
  })();
  return true;
});