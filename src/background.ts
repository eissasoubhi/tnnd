import "./web-diagnostic-background";
import "./tinder-checkpoint-background";
import "./tinder-message-cursor-background";
import "./tinder-unread-observation-background";
import "./tinder-new-match-background";
import "./tinder-global-new-match-runner";
import "./tinder-smart-swipe-runtime-background";
import "./tinder-smart-swipe-automation-background";
import { newMatchSendPermission } from "./tinder-new-match-background";
import { currentAuthorizedTinderThread } from "./tinder-sender-route-guard";
import "./tinder-global-existing-runner";
import "./unified-controller-background";
import "./tinder-read-only-bulk-sync-background";
import { generateSuggestions } from "./gemini";
import { loadTinderConversationManagement } from "./tinder-backend-management";
import { syncConversationDelta } from "./conversation-sync";
import { syncObservedMatchProfile } from "./tinder-match-profile-runtime";
import { buildReadOnlyProfileSource, hasMeaningfulVisibleProfileFields, type TinderProfileCaptureInput } from "./tinder-match-profile-capture";
import type { VisibleTinderMatchIdentity } from "./tinder-chat-identity";
import { mayAutomaticallySendToTinder } from "./tinder-auto-send-gate";
import { generateBackendSuggestions } from "./backend-session";
import { getApiKey, getBackendSession, getChatSettings, getConfig, lockStorageToTrustedContexts, resolveEffectiveConfig } from "./storage";
import type { AppConfig, GenerateRequest, GenerateResponse, PreviewOverrides } from "./types";
import { hasReachedFirstMessageDailyLimit } from "./tinder-first-message-daily-limit";

const AUTO_STATE_KEY = "tnnd.autoState";
const FIRST_MESSAGE_CLAIMS_KEY = "tnnd.firstMessageAttempts.v1";
const pendingFirstMessageClaims = new Set<string>();
/** Backed by authenticated server facts and saved user opt-in rules.
 * Never let a profile guess or generic long-term label trigger a pause.
 */
async function matchScreeningAllowsSend(conversationId: string): Promise<boolean> {
  const session = await getBackendSession();
  if (!session) return false;
  const api = `http://127.0.0.1:4000/api/v1/conversations/${encodeURIComponent(conversationId)}`;
  const detail = await fetch(api, { headers: { authorization: `Bearer ${session.token}` } });
  if (!detail.ok) return false;
  const json = await detail.json() as { conversation?: { matchScreening?: { action?: string } } };
  const action = json.conversation?.matchScreening?.action;
  if (action !== "continue" && action !== "clarify" && action !== "pause") return false;
  if (action !== "pause") return true;
  // Persist the user-authorized pause, never bypass manual/permission gates.
  await fetch(api, {
    method: "PATCH",
    headers: { authorization: `Bearer ${session.token}`, "content-type": "application/json" },
    body: JSON.stringify({ status: "paused" })
  }).catch(() => null);
  return false;
}


function normalizeFirstMessageClaims(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([ref, timestamp]) => ref.length > 0 && ref.length <= 512 && typeof timestamp === "number" && Number.isFinite(timestamp))
    .slice(-1000)) as Record<string, number>;
}

async function checkFirstMessagePermission(ref: string, ignoreOwnClaim = false): Promise<{
  ok: boolean; allowed: boolean; reason?: string; savedMessageCount?: number;
}> {
  const raw = await chrome.storage.local.get(FIRST_MESSAGE_CLAIMS_KEY);
  const claims = normalizeFirstMessageClaims(raw[FIRST_MESSAGE_CLAIMS_KEY]);
  if (claims[ref]) return { ok: true, allowed: false, reason: "already_attempted" };
  if (!ignoreOwnClaim && pendingFirstMessageClaims.has(ref)) return { ok: true, allowed: false, reason: "claim_in_progress" };
  const config = await getConfig();
  if (hasReachedFirstMessageDailyLimit(claims, config.automation.maxFirstMessagesPerDay)) {
    return { ok: true, allowed: false, reason: "daily_limit" };
  }
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
  const screeningAllows = savedMessageCount === 0 && await matchScreeningAllowsSend(backend.conversationId);
  return { ok: true, allowed: savedMessageCount === 0 && screeningAllows, savedMessageCount,
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
  | { type: "TNND_GET_EXISTING_REPLY_MODE_PERMISSION" }
  | { type: "TNND_GET_BACKEND_AUTO_SEND_PERMISSION"; conversationRef: string }
  | { type: "TNND_GET_FIRST_MESSAGE_PERMISSION"; conversationRef: string }
  | { type: "TNND_GET_NEW_MATCH_SEND_PERMISSION"; conversationRef: string }
  | { type: "TNND_CLAIM_FIRST_MESSAGE"; conversationRef: string }
  | { type: "TNND_SYNC_VISIBLE_MATCH_IDENTITY"; conversationRef: string; identity: VisibleTinderMatchIdentity; profile?: TinderProfileCaptureInput }
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
  // Reset only the daily quota at midnight. Historical processed evidence
  // must survive so reopening an old chat never re-sends to the same message.
  const processed = candidate.processed && typeof candidate.processed === "object"
    ? Object.fromEntries(
        Object.entries(candidate.processed)
          .filter(([key, timestamp]) => Boolean(key) && typeof timestamp === "number" && Number.isFinite(timestamp))
          .slice(-5000)
      )
    : {};
  return {
    date: today(),
    dailyCount: candidate.date === today() && typeof candidate.dailyCount === "number" && Number.isFinite(candidate.dailyCount)
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
  // Avoid automatic expiration: unanswered messages may be months old. Keep
  // the 5000 most recent fingerprints, without storing message text. 
  state.processed = Object.fromEntries(Object.entries(state.processed).slice(-5000));
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
      // The content script only captures the visibly OPEN profile matching the
      // exact Tinder route and sidebar identity. Do not trust arbitrary values
      // when the sender's current thread does not match.
      const observed = message.profile;
      const verified = observed?.route === `/app/messages/${senderRef}`
        && observed.firstName === message.identity.firstName
        && (message.identity.age === undefined || observed.age === message.identity.age);
      const source = buildReadOnlyProfileSource({
        route: `/app/messages/${senderRef}`,
        firstName: message.identity.firstName,
        age: message.identity.age,
        photoUrl: message.identity.photoUrl,
        ...(verified && observed ? {
          bio: observed.bio,
          relationshipGoal: observed.relationshipGoal,
          heightCm: observed.heightCm,
          interests: observed.interests,
          prompts: observed.prompts
        } : {})
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

  if (message.type === "TNND_GET_EXISTING_REPLY_MODE_PERMISSION") {
    // The Matches-only selection prevents unsolicited existing-chat sends,
    // without disabling manual first messages or modifying per-chat consent.
    void chrome.storage.local.get("tnnd.globalExistingRunner.v2")
      .then(stored => {
        const state = stored["tnnd.globalExistingRunner.v2"] as
          { enabled?: boolean; mode?: string; manualActivity?: string } | undefined;
        sendResponse({ ok: true, allowed: !(state?.enabled === true &&
          state.mode === "watcher" && state.manualActivity === "new-match") });
      }).catch(() => sendResponse({ ok: false, allowed: false }));
    return true;
  }

  if (message.type === "TNND_GET_CHAT_AUTOMATION") {
    void getChatSettings(message.threadKey)
      .then((chat) => sendResponse({ ok: true, enabled: chat.enabled }))
      .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "Could not load TNND chat configuration." }));
    return true;
  }

  if (message.type === "TNND_GET_NEW_MATCH_SEND_PERMISSION") {
    const ref = message.conversationRef?.trim();
    void (async () => {
      if (!ref || !await currentAuthorizedTinderThread(sender, ref)) {
        return { ok: true, allowed: false, reason: "live_tinder_thread_mismatch" };
      }
      return { ok: true, allowed: await newMatchSendPermission(ref, sender.tab!.id!) };
    })().then(sendResponse).catch(() => sendResponse({ ok: true, allowed: false, reason: "permission_check_failed" }));
    return true;
  }

  if (message.type === "TNND_GET_FIRST_MESSAGE_PERMISSION" || message.type === "TNND_CLAIM_FIRST_MESSAGE") {
    const ref = message.conversationRef?.trim();
    void (async () => {
      if (!ref || !await currentAuthorizedTinderThread(sender, ref)) {
        return { ok: true, allowed: false, claimed: false, reason: "wrong_live_thread" };
      }
      if (message.type === "TNND_GET_FIRST_MESSAGE_PERMISSION") {
        return checkFirstMessagePermission(ref);
      }
      // In-memory lock serializes claims across Tinder tabs in this worker.
      // Persistent record survives reload/crash and forbids blind retries.
      if (pendingFirstMessageClaims.has(ref)) {
        return { ok: true, claimed: false, reason: "already_attempted" };
      }
      if (pendingFirstMessageClaims.size > 0) {
        return { ok: true, claimed: false, reason: "claim_in_progress" };
      }
      pendingFirstMessageClaims.add(ref);
      try {
        const checked = await checkFirstMessagePermission(ref, true);
        if (!checked.allowed) return { ok: true, claimed: false, reason: checked.reason };
        // Validate again after asynchronous DB reads; a different Tinder
        // conversation might have been opened while checks were running.
        if (!await currentAuthorizedTinderThread(sender, ref)) {
          return { ok: true, claimed: false, reason: "thread_changed_during_claim" };
        }
        const stored = await chrome.storage.local.get(FIRST_MESSAGE_CLAIMS_KEY);
        const entries = normalizeFirstMessageClaims(stored[FIRST_MESSAGE_CLAIMS_KEY]);
        if (entries[ref]) return { ok: true, claimed: false, reason: "already_attempted" };
        // Validate the live cap after asynchronous authorization reads.
        const currentConfig = await getConfig();
        if (hasReachedFirstMessageDailyLimit(entries, currentConfig.automation.maxFirstMessagesPerDay)) {
          return { ok: true, claimed: false, reason: "daily_limit" };
        }
        const attempts = { ...entries, [ref]: Date.now() };
        await chrome.storage.local.set({ [FIRST_MESSAGE_CLAIMS_KEY]: attempts });
        return { ok: true, claimed: true };
      } finally { pendingFirstMessageClaims.delete(ref); }
    })().then(sendResponse).catch(() => sendResponse({ ok: true, allowed: false, claimed: false, reason: "permission_check_failed" }));
    return true;
  }

  if (message.type === "TNND_GET_BACKEND_AUTO_SEND_PERMISSION") {
    const ref = message.conversationRef?.trim();
    // The sender's document URL can be an OLD SPA chat after Tinder navigates.
    // Trust only the current Chrome tab route + main-frame + origin.
    void (async () => {
      if (!ref || !await currentAuthorizedTinderThread(sender, ref)) {
        return { ok: true, allowed: false };
      }
      const backend = await loadTinderConversationManagement(ref);
      return { ok: true, allowed: mayAutomaticallySendToTinder(backend)
        && Boolean(backend.conversationId) && await matchScreeningAllowsSend(backend.conversationId!) };
    })().then(sendResponse).catch(() => sendResponse({ ok: true, allowed: false }));
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
            chat,
            ...(message.threadKey ? { threadKey: message.threadKey } : {})
          })
        : await generateSuggestions(apiKey, config, message.context, purpose, count, chat);
      sendResponse({ ok: true, suggestions } satisfies GenerateResponse);
    } catch (error) {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : "Unknown TNND error." } satisfies GenerateResponse);
    }
  })();
  return true;
});