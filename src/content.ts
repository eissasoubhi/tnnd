import { TinderDomAdapter } from "./tinder-adapter";
import { readVisibleTinderMatchIdentity } from "./tinder-chat-identity";
import { detectVisibleTinderSidebarTab, visibleTinderThreadRefs } from "./tinder-visible-thread-links";
import { firstMessageAttemptKey, firstMessageBlocker, firstMessageContext } from "./tinder-first-message";
import { syncConversationDelta } from "./conversation-sync";
import { observeTinderRuntime } from "./tinder-runtime-observation";
import { readCurrentTinderUiState } from "./tinder-runtime-state";
import { isInboxReadableTinderState } from "./tinder-state-machine";
import type { TinderScheduledJob } from "./tinder-scheduler";
import { executeUnreadAwareTinderStep } from "./tinder-unread-executor";
import { tinderThreadKeyFromPath } from "./tinder-thread-identity";
import type { AutomationConfig, GenerateRequest, GenerateResponse } from "./types";
import { sendRuntimeMessageSafely } from "./extension-context";

const adapter = new TinderDomAdapter();
let busy = false;
let scanTimer: number | undefined;
let runtimeReadBusy = false;
let lastNewMatchObservation = "";
let lastNewMatchObservationAt = 0;
let identitySyncBusy = false;
let lastIdentityFingerprint = "";
let lastIdentityAttemptAt = 0;
let contentRuntimeAlive = true;
let observer: MutationObserver | null = null;
let runtimeObservedJobs: TinderScheduledJob[] = [];
const runtimeProcessedThreadRefs = new Set<string>();

interface AutoState {
  date: string;
  dailyCount: number;
  processed: Record<string, number>;
}

interface ContentConfig {
  model: string;
  tone: string;
  messageLength: string;
  flirtLevel: number;
  humorLevel: number;
  emojiLevel: string;
  languages: { fr: number; darija: number; en: number };
  automation: AutomationConfig;
}

interface DiagnosticSnapshot {
  generatedAt: string;
  page: {
    url: string;
    title: string;
    viewport: { width: number; height: number; devicePixelRatio: number };
    document: { width: number; height: number };
  };
  selectors: ReturnType<TinderDomAdapter["diagnose"]>;
  resources: Array<{
    name: string;
    initiatorType: string;
    duration: number;
    transferSize: number;
    encodedBodySize: number;
  }>;
  config: {
    model: string;
    tone: string;
    messageLength: string;
    flirtLevel: number;
    humorLevel: number;
    emojiLevel: string;
    languages: { fr: number; darija: number; en: number };
    automation: {
      enabled: boolean;
      replyDelayMinSeconds?: number;
      replyDelayMaxSeconds?: number;
      quietHoursEnabled: boolean;
      maxAutoRepliesPerDay: number;
    };
  };
  domHtml: string;
  domTruncated: boolean;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function stopContentRuntime(): void {
  if (!contentRuntimeAlive) return;
  contentRuntimeAlive = false;
  if (scanTimer !== undefined) {
    window.clearTimeout(scanTimer);
    scanTimer = undefined;
  }
  observer?.disconnect();
  window.removeEventListener("focus", scheduleScan);
}

function hasLiveExtensionContext(): boolean {
  if (!contentRuntimeAlive) return false;
  try {
    if (!chrome.runtime?.id) {
      stopContentRuntime();
      return false;
    }
    return true;
  } catch {
    stopContentRuntime();
    return false;
  }
}

async function sendRuntimeMessage<T>(message: unknown): Promise<T | null> {
  if (!hasLiveExtensionContext()) return null;
  return sendRuntimeMessageSafely<T>(
    message,
    (payload) => chrome.runtime.sendMessage(payload) as Promise<T>,
    stopContentRuntime
  );
}

async function getContentConfig(): Promise<ContentConfig | null> {
  const response = await sendRuntimeMessage<{ ok: boolean; config?: ContentConfig; error?: string }>({ type: "TNND_GET_CONTENT_CONFIG" });
  if (!response) return null;
  if (!response.ok || !response.config) throw new Error(response.error ?? "Could not load TNND configuration.");
  return response.config;
}

async function backendAllowsAutomaticReply(conversationRef: string): Promise<boolean> {
  const response = await sendRuntimeMessage<{ ok: boolean; allowed?: boolean }>({
    type: "TNND_GET_BACKEND_AUTO_SEND_PERMISSION", conversationRef
  });
  return response?.ok === true && response.allowed === true;
}

async function getChatAutomationEnabled(threadKey: string): Promise<boolean | null> {
  const response = await sendRuntimeMessage<{ ok: boolean; enabled?: boolean; error?: string }>({ type: "TNND_GET_CHAT_AUTOMATION", threadKey });
  if (!response) return null;
  if (!response.ok) throw new Error(response.error ?? "Could not load TNND chat configuration.");
  return response.enabled !== false;
}

async function getState(): Promise<AutoState | null> {
  const response = await sendRuntimeMessage<{ ok: boolean; state?: AutoState; error?: string }>({ type: "TNND_GET_AUTO_STATE" });
  if (!response) return null;
  if (!response.ok || !response.state) throw new Error(response.error ?? "Could not load TNND automation state.");
  return response.state.date === today() ? response.state : { date: today(), dailyCount: 0, processed: {} };
}

async function saveState(state: AutoState): Promise<boolean> {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  state.processed = Object.fromEntries(Object.entries(state.processed).filter(([, timestamp]) => timestamp >= cutoff));
  const response = await sendRuntimeMessage<{ ok: boolean; error?: string }>({ type: "TNND_SAVE_AUTO_STATE", state });
  if (!response) return false;
  if (!response.ok) throw new Error(response.error ?? "Could not save TNND automation state.");
  return true;
}

function minutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function insideQuietHours(start: string, end: string): boolean {
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  const s = minutes(start);
  const e = minutes(end);
  if (s === e) return false;
  return s < e ? current >= s && current < e : current >= s || current < e;
}

function cadenceWindow(config: AutomationConfig): [number, number] {
  const legacy = Number(config.replyDelaySeconds);
  const rawMin = Number(config.replyDelayMinSeconds);
  const rawMax = Number(config.replyDelayMaxSeconds);
  const fallbackMin = Number.isFinite(legacy) ? Math.max(0, legacy - 15) : 20;
  const fallbackMax = Number.isFinite(legacy) ? Math.max(fallbackMin, legacy + 15) : 60;
  const min = Number.isFinite(rawMin) ? Math.max(0, rawMin) : fallbackMin;
  const max = Number.isFinite(rawMax) ? Math.max(0, rawMax) : fallbackMax;
  return min <= max ? [min, max] : [max, min];
}

function randomCadenceSeconds(config: AutomationConfig): number {
  const [min, max] = cadenceWindow(config);
  if (min === max) return min;
  const bucket = new Uint32Array(1);
  crypto.getRandomValues(bucket);
  const unit = bucket[0] / 0x100000000;
  return min + unit * (max - min);
}

async function generateReply(context: string, threadKey: string): Promise<string | null> {
  const request: GenerateRequest = { type: "GENERATE_SUGGESTIONS", context, purpose: "auto", replyCount: 1, threadKey };
  const response = await sendRuntimeMessage<GenerateResponse>(request);
  if (!response) return null;
  if (!response.ok || !response.suggestions?.[0]) throw new Error(response.error ?? "TNND received no automatic reply.");
  return response.suggestions[0];
}

function safeUrl(value: string): string {
  try {
    const url = new URL(value, location.href);
    if (url.protocol !== "http:" && url.protocol !== "https:") return `[${url.protocol.replace(":", "")}]`;
    return `${url.origin}${url.pathname}`;
  } catch {
    return "[redacted-url]";
  }
}

function sanitizeDom(): { html: string; truncated: boolean } {
  const clone = document.documentElement.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("script,style,noscript,template").forEach((node) => node.remove());

  for (const element of Array.from(clone.querySelectorAll<HTMLElement>("*"))) {
    if (element instanceof HTMLInputElement) {
      element.value = "";
      element.removeAttribute("value");
    }
    if (element instanceof HTMLTextAreaElement) element.textContent = "";
    if (element.getAttribute("contenteditable") === "true") element.textContent = "[redacted-contenteditable]";

    for (const attr of Array.from(element.attributes)) {
      const name = attr.name.toLowerCase();
      if (/token|auth|session|cookie|secret|password|credential/.test(name)) {
        element.removeAttribute(attr.name);
        continue;
      }
      if (["href", "src", "action", "poster"].includes(name)) {
        element.setAttribute(attr.name, safeUrl(attr.value));
        continue;
      }
      if (["alt", "title", "placeholder"].includes(name)) {
        element.setAttribute(attr.name, "[redacted-text]");
        continue;
      }
      if (name === "aria-label" && !/message|send|envoyer|chat|conversation|match|button|input|textbox/i.test(attr.value)) {
        element.setAttribute(attr.name, "[redacted-label]");
      }
    }
  }

  const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    if (current instanceof Text && current.data.trim()) textNodes.push(current);
    current = walker.nextNode();
  }
  for (const node of textNodes) node.data = "[text]";

  const full = `<!doctype html>\n${clone.outerHTML}`;
  const maxLength = 1_500_000;
  return { html: full.slice(0, maxLength), truncated: full.length > maxLength };
}

async function diagnosticSnapshot(): Promise<DiagnosticSnapshot> {
  const config = await getContentConfig();
  if (!config) throw new Error("TNND extension context is no longer available.");
  const dom = sanitizeDom();
  const resources = (performance.getEntriesByType("resource") as PerformanceResourceTiming[]).slice(-500).map((entry) => ({
    name: safeUrl(entry.name),
    initiatorType: entry.initiatorType,
    duration: Math.round(entry.duration * 100) / 100,
    transferSize: entry.transferSize,
    encodedBodySize: entry.encodedBodySize
  }));

  return {
    generatedAt: new Date().toISOString(),
    page: {
      url: safeUrl(location.href),
      title: "[redacted-title]",
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }
    },
    selectors: adapter.diagnose(),
    resources,
    config: {
      model: config.model,
      tone: config.tone,
      messageLength: config.messageLength,
      flirtLevel: config.flirtLevel,
      humorLevel: config.humorLevel,
      emojiLevel: config.emojiLevel,
      languages: { ...config.languages },
      automation: {
        enabled: config.automation.enabled,
        replyDelayMinSeconds: config.automation.replyDelayMinSeconds,
        replyDelayMaxSeconds: config.automation.replyDelayMaxSeconds,
        quietHoursEnabled: config.automation.quietHoursEnabled,
        maxAutoRepliesPerDay: config.automation.maxAutoRepliesPerDay
      }
    },
    domHtml: dom.html,
    domTruncated: dom.truncated
  };
}

function currentConversationRef(): string | null {
  const prefix = "/app/messages/";
  if (!location.pathname.startsWith(prefix) || location.pathname.length <= prefix.length) return null;
  try {
    return decodeURIComponent(location.pathname.slice(prefix.length)).trim() || null;
  } catch {
    return null;
  }
}

/** Match metadata is captured from the active, matched sidebar row only.
 * No Tinder interaction or AI takeover happens here. */
async function observeVisibleIdentity(): Promise<void> {
  const ref = currentConversationRef();
  if (!ref || identitySyncBusy || !hasLiveExtensionContext()) return;
  const identity = readVisibleTinderMatchIdentity(ref);
  if (!identity.firstName) return;
  const fingerprint = JSON.stringify({ ref, identity });
  if (fingerprint === lastIdentityFingerprint || Date.now() - lastIdentityAttemptAt < 30000) return;
  identitySyncBusy = true;
  lastIdentityAttemptAt = Date.now();
  try {
    const result = await sendRuntimeMessage<{ ok: boolean; synced?: boolean }>({
      type: "TNND_SYNC_VISIBLE_MATCH_IDENTITY", conversationRef: ref, identity
    });
    if (result?.ok && result.synced) lastIdentityFingerprint = fingerprint;
  } finally { identitySyncBusy = false; }
}

async function observeNewMatchLinks(): Promise<void> {
  if (!hasLiveExtensionContext()) return;
  // Tinder often retains the opened chat's URL while showing Matches.
  // Only observe actual visible match tiles, never Messages/sidebar anchors.
  if (detectVisibleTinderSidebarTab() !== "matches") return;
  const refs = visibleTinderThreadRefs();
  if (!refs.length) return;
  const fingerprint = JSON.stringify(refs);
  if (fingerprint === lastNewMatchObservation && Date.now() - lastNewMatchObservationAt < 30_000) return;
  lastNewMatchObservation = fingerprint;
  lastNewMatchObservationAt = Date.now();
  await sendRuntimeMessage({ type: "TNND_NEW_MATCH_LINKS_SEEN", refs });
}

async function observeRuntimeReadMode(): Promise<void> {
  if (runtimeReadBusy || !hasLiveExtensionContext()) return;
  const observation = observeTinderRuntime(adapter);
  if (!observation.readOnlyStepAllowed) return;
  const diagnosticsInboxReadable = observation.route.state === "inbox"
    || (observation.route.state === "discovery" && observation.diagnostics.sidebarState === "messages");
  if (!diagnosticsInboxReadable && observation.route.state !== "conversation") return;

  runtimeReadBusy = true;
  try {
    const uiState = readCurrentTinderUiState();
    if (uiState.state !== observation.route.state || uiState.path !== observation.route.path || !uiState.boundedActionAllowed) return;

    if (isInboxReadableTinderState(uiState)) {
      const job: TinderScheduledJob = { id: "runtime-observe-inbox", kind: "scan-inbox" };
      const result = await executeUnreadAwareTinderStep(
        uiState,
        job,
        adapter,
        {
          navigate: () => {
            throw new Error("observe_mode_navigation_blocked");
          }
        },
        runtimeObservedJobs
      );
      runtimeObservedJobs = result.discoveredJobs;
      console.debug(`TNND observe/read mode discovered ${runtimeObservedJobs.length} unread thread candidate(s).`);
      return;
    }

    const conversationRef = currentConversationRef();
    if (!conversationRef || runtimeProcessedThreadRefs.has(conversationRef)) return;
    const job = runtimeObservedJobs.find((candidate) => candidate.kind === "process-thread" && candidate.conversationRef === conversationRef);
    if (!job) return;

    const result = await executeUnreadAwareTinderStep(
      uiState,
      job,
      adapter,
      {
        navigate: () => {
          throw new Error("observe_mode_navigation_blocked");
        }
      },
      runtimeObservedJobs
    );
    if (!result.execution.completed) return;

    runtimeProcessedThreadRefs.add(conversationRef);
    runtimeObservedJobs = runtimeObservedJobs.filter((candidate) => candidate.id !== job.id);
    console.debug(`TNND observe/read mode processed one manually opened unread thread; ${runtimeObservedJobs.length} candidate(s) remain.`);
  } catch (error) {
    console.debug("TNND observe/read mode skipped", error);
  } finally {
    runtimeReadBusy = false;
  }
}

let lastExistingRunnerEventKey = "";
let lastExistingRunnerEventAt = 0;
/** Telemetry contains only operational metadata, never Tinder message text. */
function reportExistingRunner(phase: "waiting" | "generating" | "sending" | "sent" | "skipped" | "error", detail: string): void {
  const ref = currentConversationRef();
  if (!ref || !hasLiveExtensionContext()) return;
  const key = `${ref}:${phase}:${detail}`;
  if (phase !== "sent" && lastExistingRunnerEventKey === key && Date.now() - lastExistingRunnerEventAt < 45_000) return;
  lastExistingRunnerEventKey = key;
  lastExistingRunnerEventAt = Date.now();
  void sendRuntimeMessage({ type: "TNND_EXISTING_RUNNER_EVENT", ref, phase, detail }).catch(() => undefined);
}

async function autoReplyPausedAfterGlobalStop(conversationRef: string): Promise<boolean> {
  const response = await sendRuntimeMessage<{ ok: boolean; paused?: boolean }>({
    type: "TNND_EXISTING_RUNNER_TAB_PAUSED", ref: conversationRef
  });
  return response?.paused === true;
}

async function scan(): Promise<void> {
  if (busy || !hasLiveExtensionContext()) return;

  try {
    const config = await getContentConfig();
    if (!config || !contentRuntimeAlive) return;
    if (!config.automation.enabled) {
      reportExistingRunner("skipped", "Automatic replies disabled in extension Options.");
      return;
    }
    if (config.automation.quietHoursEnabled && insideQuietHours(config.automation.quietStart, config.automation.quietEnd)) {
      reportExistingRunner("waiting", "Quiet hours active; no messages will be sent.");
      return;
    }

    const snapshot = adapter.read();
    if (!snapshot) {
      reportExistingRunner("waiting", "Chat opened · waiting for a new incoming message.");
      return;
    }
    const conversationRef = currentConversationRef();
    // Never send from a loosely classified Tinder view: route identity must
    // match the chat snapshot and the backend must authorize this precise chat.
    if (conversationRef && await autoReplyPausedAfterGlobalStop(conversationRef)) {
      reportExistingRunner("skipped", "Runner was stopped · no more auto replies on this tab until manually re-enabled.");
      return;
    }
    if (!conversationRef || tinderThreadKeyFromPath(location.pathname) !== snapshot.threadKey) {
      reportExistingRunner("skipped", "Thread identity mismatch; no message sent.");
      return;
    }
    if (!await backendAllowsAutomaticReply(conversationRef)) {
      reportExistingRunner("skipped", "AI management not authorized by TNND backend.");
      return;
    }
    const chatAutomationEnabled = await getChatAutomationEnabled(snapshot.threadKey);
    if (chatAutomationEnabled !== true) {
      reportExistingRunner("skipped", "Automatic replies explicitly disabled for this chat.");
      return;
    }

    const state = await getState();
    if (!state) return;
    if (state.processed[snapshot.latestIncomingKey]) {
      reportExistingRunner("waiting", "Latest incoming message already handled · waiting for the next one.");
      return;
    }
    if (state.dailyCount >= config.automation.maxAutoRepliesPerDay) {
      reportExistingRunner("waiting", "Daily reply limit reached.");
      return;
    }

    busy = true;
    const delaySeconds = randomCadenceSeconds(config.automation);
    console.info(`TNND queued an automatic reply in ${delaySeconds.toFixed(1)}s.`);
    reportExistingRunner("waiting", `Incoming message detected · waiting ${Math.ceil(delaySeconds)}s before reply.`);
    await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
    if (!hasLiveExtensionContext()) return;

    const currentSnapshot = adapter.read();
    if (!currentSnapshot || currentSnapshot.latestIncomingKey !== snapshot.latestIncomingKey || currentSnapshot.threadKey !== snapshot.threadKey) return;
    if (currentConversationRef() !== conversationRef || !await backendAllowsAutomaticReply(conversationRef)) return;
    const stillEnabled = await getChatAutomationEnabled(currentSnapshot.threadKey);
    if (stillEnabled !== true) return;

    reportExistingRunner("generating", "Preparing an AI reply with Gemini…");
    const reply = await generateReply(currentSnapshot.context, currentSnapshot.threadKey);
    if (!reply || !hasLiveExtensionContext()) return;
    // Back-end state or the Tinder tab can change while Gemini is generating.
    // Re-authorize immediately before the irreversible send operation.
    if (currentConversationRef() !== conversationRef
      || tinderThreadKeyFromPath(location.pathname) !== currentSnapshot.threadKey
      || !await backendAllowsAutomaticReply(conversationRef) || await autoReplyPausedAfterGlobalStop(conversationRef)) return;
    if (await getChatAutomationEnabled(currentSnapshot.threadKey) !== true) return;
    reportExistingRunner("sending", "AI reply ready · attempting Tinder send…");
    await adapter.send(reply);
    reportExistingRunner("sent", "Tinder send action completed · verify delivery in the conversation.");
    const freshState = await getState();
    if (!freshState) return;
    freshState.processed[currentSnapshot.latestIncomingKey] = Date.now();
    freshState.dailyCount += 1;
    await saveState(freshState);
    console.info("TNND sent an automatic reply.");
  } catch (error) {
    if (contentRuntimeAlive) {
      reportExistingRunner("error", error instanceof Error ? error.message : "Automatic reply failed.");
      console.warn("TNND auto-reply skipped", error);
    }
  } finally {
    busy = false;
  }
}

/** One explicitly confirmed first message, never triggered by the observation loop.
 * Send attempts are persisted before clicking Tinder, so uncertain sends are
 * never repeated automatically. Live Tinder selector verification is required. */
async function startFirstMessage(expectedThreadKey: string, mode: "individual" | "global-new" = "individual"): Promise<{ ok: boolean; error?: string; sent?: boolean }> {
  if (busy) return { ok: false, error: "TNND is already processing a message. Try again later." };
  busy = true;
  try {
    const conversationRef = currentConversationRef();
    const config = await getContentConfig();
    const threadKey = tinderThreadKeyFromPath(location.pathname);
    const state = await getState();
    if (!conversationRef || !config || !state) return { ok: false, error: "Open the Tinder chat and connect TNND first." };

    if (mode === "global-new") {
      const global = await sendRuntimeMessage<{ ok: boolean; allowed?: boolean }>({ type: "TNND_GET_NEW_MATCH_SEND_PERMISSION", conversationRef });
      if (!global?.allowed) return { ok: false, error: "Global new-match automation was stopped or the tab is not authorized." };
    }
    const permission = await sendRuntimeMessage<{ ok: boolean; allowed?: boolean; savedMessageCount?: number; reason?: string }>({
      type: "TNND_GET_FIRST_MESSAGE_PERMISSION", conversationRef
    });
    const perChatEnabled = await getChatAutomationEnabled(threadKey);
    const check = () => firstMessageBlocker({
      sameThread: expectedThreadKey === threadKey && currentConversationRef() === conversationRef,
      composerFound: adapter.diagnose().composerFound,
      visibleMessageCandidates: adapter.diagnose().visibleCandidateCount,
      savedConversationMessages: permission?.savedMessageCount ?? 0,
      aiManagedAndActive: permission?.ok === true && permission.allowed === true,
      globalAutomationEnabled: config.automation.enabled,
      chatAutomationEnabled: perChatEnabled === true,
      insideQuietHours: config.automation.quietHoursEnabled && insideQuietHours(config.automation.quietStart, config.automation.quietEnd),
      belowDailyLimit: state.dailyCount < config.automation.maxAutoRepliesPerDay,
      alreadyAttempted: Boolean(state.processed[firstMessageAttemptKey(conversationRef)])
    });
    const blocker = check();
    if (blocker) return { ok: false, error: `First message blocked: ${permission?.reason ?? blocker}. Confirm AI managed, Resume and extension automation settings; check that this chat is empty.` };

    const identity = readVisibleTinderMatchIdentity(conversationRef);
    const response = await sendRuntimeMessage<GenerateResponse>({
      type: "GENERATE_SUGGESTIONS",
      purpose: "opener",
      replyCount: 1,
      threadKey,
      context: firstMessageContext(identity.firstName, identity.age)
    });
    const opener = response?.suggestions?.[0]?.trim();
    if (!response?.ok || !opener) return { ok: false, error: response?.error ?? "Gemini did not return a first message." };

    // Re-check all gates after generation. A newly received message or status
    // change must stop the opener before any irreversible Tinder action.
    const freshPermission = await sendRuntimeMessage<{ ok: boolean; allowed?: boolean }>({
      type: "TNND_GET_FIRST_MESSAGE_PERMISSION", conversationRef
    });
    const freshConfig = await getContentConfig();
    const freshState = await getState();
    if (!freshConfig || !freshState || !freshPermission?.allowed
      || expectedThreadKey !== tinderThreadKeyFromPath(location.pathname)
      || currentConversationRef() !== conversationRef
      || !adapter.diagnose().composerFound
      || adapter.diagnose().visibleCandidateCount !== 0
      || !freshConfig.automation.enabled
      || (freshConfig.automation.quietHoursEnabled && insideQuietHours(freshConfig.automation.quietStart, freshConfig.automation.quietEnd))
      || await getChatAutomationEnabled(threadKey) !== true
      || freshState.dailyCount >= freshConfig.automation.maxAutoRepliesPerDay
      || freshState.processed[firstMessageAttemptKey(conversationRef)]) {
      return { ok: false, error: "The chat or permissions changed. First message not sent." };
    }

    if (mode === "global-new") {
      const global = await sendRuntimeMessage<{ ok: boolean; allowed?: boolean }>({ type: "TNND_GET_NEW_MATCH_SEND_PERMISSION", conversationRef });
      if (!global?.allowed) return { ok: false, error: "New-match mode was stopped before Tinder send." };
    }
    const attemptedAt = Date.now();
    freshState.processed[firstMessageAttemptKey(conversationRef)] = attemptedAt;
    freshState.dailyCount += 1;
    if (!await saveState(freshState)) return { ok: false, error: "Could not record the opener attempt safely; nothing sent." };
    // No automatic retry even if Tinder's UI acknowledgement is ambiguous.
    const claim = await sendRuntimeMessage<{ ok: boolean; claimed?: boolean; reason?: string }>({
      type: "TNND_CLAIM_FIRST_MESSAGE", conversationRef
    });
    if (!claim?.ok || !claim.claimed) return { ok: false, error: `First message not sent: ${claim?.reason ?? "claim_failed"}.` };
    await adapter.send(opener);
    try {
      await syncConversationDelta(conversationRef, [{
        externalMessageId: `tnnd-opener-${attemptedAt}`,
        direction: "outgoing",
        text: opener,
        sentAt: new Date(attemptedAt).toISOString()
      }], null);
    } catch {
      return { ok: true, sent: true, error: "Sent on Tinder, but server history sync failed. Re-import the visible chat." };
    }
    return { ok: true, sent: true };
  } catch (error) {
    return { ok: false, error: `First message not confirmed. Check Tinder before retrying: ${error instanceof Error ? error.message : "unknown error"}` };
  } finally {
    busy = false;
  }
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!message || typeof message !== "object") return false;
  const input = message as { type?: unknown; threadKey?: unknown };
  if (input.type !== "TNND_START_FIRST_MESSAGE" && input.type !== "TNND_AUTO_START_NEW_MATCH") return false;
  if (sender.id !== chrome.runtime.id || typeof input.threadKey !== "string") {
    sendResponse({ ok: false, error: "Untrusted first-message request." });
    return false;
  }
  void startFirstMessage(input.threadKey, input.type === "TNND_AUTO_START_NEW_MATCH" ? "global-new" : "individual").then(sendResponse);
  return true;
});

function scheduleScan(): void {
  if (!hasLiveExtensionContext()) return;
  void observeRuntimeReadMode();
  void observeVisibleIdentity().catch(() => undefined);
  void observeNewMatchLinks().catch(() => undefined);
  if (scanTimer) window.clearTimeout(scanTimer);
  scanTimer = window.setTimeout(() => {
    if (!hasLiveExtensionContext()) return;
    void scan();
  }, 900);
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!message || typeof message !== "object" || (message as { type?: string }).type !== "TNND_GET_DIAGNOSTICS") return false;
  void diagnosticSnapshot()
    .then((snapshot) => sendResponse({ ok: true, snapshot }))
    .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "Could not create diagnostics." }));
  return true;
});

observer = new MutationObserver(scheduleScan);
observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
window.addEventListener("focus", scheduleScan);
window.setInterval(() => { void observeNewMatchLinks().catch(() => undefined); }, 30_000);
scheduleScan();