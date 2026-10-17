import { TinderDomAdapter } from "./tinder-adapter";
import { observeSwipeDiscoveryControls } from "./tinder-swipe-discovery-evidence";
import { executeReservedTinderRightLike } from "./tinder-swipe-live-action";
import { redactDiagnosticInlineStyle } from "./tinder-diagnostic-inline-style-redaction";
import { readVisibleTinderMatchIdentity, type VisibleTinderMatchIdentity } from "./tinder-chat-identity";
import { readVisibleTinderProfilePanel } from "./tinder-visible-profile-panel";
import { detectVisibleTinderSidebarTab, visibleTinderThreadRefs, visibleTinderMessageThreadRefs } from "./tinder-visible-thread-links";
import { firstMessageAttemptKey, firstMessageBlocker, firstMessageContext } from "./tinder-first-message";
import { groundedOpenerFragments, sameOpenerThreadUninterrupted } from "./tinder-opener-fragments";
import { openerDelaySeconds, openerTypingDelaySeconds } from "./tinder-opener-timing";
import { naturalReplyBubbles } from "./tinder-reply-bubbles";
import { classifyConversationBoundary, type ConversationBoundary } from "./conversation-boundary-policy";
import { automaticReplyHold, hasUnexpectedScriptMix, replyNeedsHumanReview } from "./conversation-reply-safety";
import { syncConversationDelta, syncObservedConversationBoundary } from "./conversation-sync";
import { observeTinderRuntime } from "./tinder-runtime-observation";
import { readCurrentTinderUiState } from "./tinder-runtime-state";
import { isInboxReadableTinderState } from "./tinder-state-machine";
import type { TinderScheduledJob } from "./tinder-scheduler";
import { executeUnreadAwareTinderStep } from "./tinder-unread-executor";
import { tinderThreadKeyFromPath } from "./tinder-thread-identity";
import { selectVisibleTinderChatLink } from "./tinder-spa-conversation-navigation";
import { discoverUnreadThreadCandidates } from "./tinder-unread-queue";
import type { AutomationConfig, GenerateRequest, GenerateResponse } from "./types";
import { sendRuntimeMessageSafely } from "./extension-context";

const adapter = new TinderDomAdapter();
let busy = false;
let scanTimer: number | undefined;
let runtimeReadBusy = false;
let lastNewMatchObservation = "";
let lastNewMatchObservationAt = 0;
let lastBulkCollectionFingerprint = "";
let lastBulkCollectionAt = 0;
let lastAutoImportRef: string | null = null;
let lastAutoImportAt = 0;
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
  selectors: ReturnType<TinderDomAdapter["diagnose"]> & { swipeControls: ReturnType<typeof observeSwipeDiscoveryControls> };
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
  return response.state;
}

async function saveState(state: AutoState): Promise<boolean> {
  state.processed = Object.fromEntries(Object.entries(state.processed).slice(-5000));
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
      if (name === "style") {
        element.setAttribute(attr.name, redactDiagnosticInlineStyle(attr.value));
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
    selectors: { ...adapter.diagnose(), swipeControls: observeSwipeDiscoveryControls(document, location.pathname, !readCurrentTinderUiState().boundedActionAllowed) },
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
  const profile = readVisibleTinderProfilePanel(ref, identity);
  const fingerprint = JSON.stringify({ ref, identity, profile });
  if (fingerprint === lastIdentityFingerprint || Date.now() - lastIdentityAttemptAt < 30000) return;
  identitySyncBusy = true;
  lastIdentityAttemptAt = Date.now();
  try {
    // Update the runner name immediately, independent of an API sync delay.
    void sendRuntimeMessage({ type: "TNND_EXISTING_RUNNER_IDENTITY",
      conversationRef: ref, firstName: identity.firstName, age: identity.age });
    const result = await sendRuntimeMessage<{ ok: boolean; synced?: boolean }>({
      type: "TNND_SYNC_VISIBLE_MATCH_IDENTITY", conversationRef: ref, identity,
      ...(profile ? { profile } : {})
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
  await sendRuntimeMessage({ type: "TNND_WATCHER_MATCHES_SEEN", refs });
}

/** Only sends opaque, observed conversation refs when a human is browsing
 * the Messages sidebar. Background stores them only during an explicit
 * opt-in collection session tied to the same TNND user and Tinder tab.
 */
async function observeBulkCollection(): Promise<void> {
  if (!hasLiveExtensionContext() || detectVisibleTinderSidebarTab() !== "messages") return;
  const refs = visibleTinderMessageThreadRefs();
  if (!refs.length) return;
  const fingerprint = JSON.stringify(refs);
  if (fingerprint === lastBulkCollectionFingerprint && Date.now() - lastBulkCollectionAt < 30_000) return;
  lastBulkCollectionFingerprint = fingerprint;
  lastBulkCollectionAt = Date.now();
  await sendRuntimeMessage({ type: "TNND_BULK_SYNC_OBSERVE_REFS", refs });
}

/** This signal contains only the observed thread ref, never message text.
 * The background verifies the logged-in account's explicit Web setting
 * before fetching visible messages from this exact current Tinder tab.
 */
async function notifyOpenedThreadForOptInSync(): Promise<void> {
  if (!hasLiveExtensionContext() || busy || spaNavigationBusy) return;
  const ref = currentConversationRef();
  if (!ref || !adapter.diagnose().composerFound) return;
  if (ref === lastAutoImportRef && Date.now()-lastAutoImportAt < 20_000) return;
  lastAutoImportRef = ref;
  lastAutoImportAt = Date.now();
  await sendRuntimeMessage({type:"TNND_IMPORT_OPENED_THREAD_OBSERVED",ref});
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

const lastWatchedIncomingEvidence = new Map<string, string>();
let lastExistingRunnerEventKey = "";
let lastExistingRunnerEventAt = 0;
/** Telemetry contains only operational metadata, never Tinder message text. */
function reportExistingRunner(phase: "incoming" | "waiting" | "generating" | "sending" | "sent" | "skipped" | "error", detail: string): void {
  const ref = currentConversationRef();
  if (!ref || !hasLiveExtensionContext()) return;
  const key = `${ref}:${phase}:${detail}`;
  if (phase !== "sent" && phase !== "incoming" && lastExistingRunnerEventKey === key && Date.now() - lastExistingRunnerEventAt < 45_000) return;
  lastExistingRunnerEventKey = key;
  lastExistingRunnerEventAt = Date.now();
  void sendRuntimeMessage({ type: "TNND_EXISTING_RUNNER_EVENT", ref, phase, detail }).catch(() => undefined);
}

function boundaryDescription(boundary: ConversationBoundary): string {
  if (boundary.kind === "off-tinder") return "Match proposed/confirmed continuing on " + (boundary.platform ?? "another app") + " · Tinder auto-replies stopped. No outside message sent.";
  if (boundary.kind === "do-not-contact") return "Contact stop requested · Tinder auto-replies disabled.";
  return "Mutual goodbyes · no additional Tinder reply. A new incoming message can reopen the conversation.";
}

async function autoReplyPausedAfterGlobalStop(conversationRef: string): Promise<boolean> {
  const response = await sendRuntimeMessage<{ ok: boolean; paused?: boolean }>({
    type: "TNND_EXISTING_RUNNER_TAB_PAUSED", ref: conversationRef
  });
  return response?.paused === true;
}

async function scan(): Promise<void> {
  // Never infer message sender from stale DOM during a React route change.
  if (spaNavigationBusy || Date.now() < spaNavigationSettlesAt || busy || !hasLiveExtensionContext()) return;

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

    const inspection = adapter.inspectUnanswered();
    const snapshot = inspection.snapshot;
    if (!snapshot) {
      const explanation = {
        "composer-missing": "Tinder chat composer not ready; waiting for chat to load.",
        "no-messages": "No readable Tinder message bubbles. Cannot identify old unanswered messages; check Tinder DOM diagnostics.",
        "unrecognized-direction": "Message direction uncertain. Refusing to send until incoming/outgoing messages can be identified.",
        "already-replied": "Last visible message was sent by you · no unanswered message here.",
        "no-incoming": "No incoming message found in the visible chat.",
        "unanswered": "Last incoming message could not be read safely; no reply sent."
      }[inspection.status] ?? "Cannot identify an unanswered message.";
      reportExistingRunner(inspection.status === "unrecognized-direction" ? "skipped" : "waiting", explanation);
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
    // Signal each distinct verified incoming bubble from the OPEN chat, even
    // if the scheduled reply delay has not elapsed. Only a keyed operational
    // notification is sent, never message text or its fingerprint.
    const incomingEvidence = snapshot.latestIncomingKey;
    if (lastWatchedIncomingEvidence.get(conversationRef) !== incomingEvidence) {
      lastWatchedIncomingEvidence.set(conversationRef, incomingEvidence);
      if (lastWatchedIncomingEvidence.size > 100) {
        lastWatchedIncomingEvidence.delete(lastWatchedIncomingEvidence.keys().next().value!);
      }
      reportExistingRunner("incoming", "New reply in the current conversation.");
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
    const visible = adapter.readVisibleMessages().map(message => ({
      direction: message.direction === "them" ? "incoming" as const : "outgoing" as const,
      text: message.text
    }));
    const boundary = classifyConversationBoundary(visible);
    if (boundary.kind !== "continue") {
      // Record before completing the local one-shot. If the API is unreachable,
      // still never generate/send; try to persist again during the next scan.
      if (!state.processed[snapshot.latestIncomingKey]) {
        try {
          const persisted = await syncObservedConversationBoundary(conversationRef, visible);
          if (persisted.boundary.kind !== boundary.kind) {
            reportExistingRunner("skipped", "Server could not confirm the ending · no Tinder reply.");
            return;
          }
          state.processed[snapshot.latestIncomingKey] = Date.now();
          if (!await saveState(state)) return;
        } catch {
          reportExistingRunner("skipped", "Chat appears finished. Backend status could not sync; no Tinder reply. Will retry.");
          return;
        }
      }
      reportExistingRunner("skipped", boundaryDescription(boundary));
      return;
    }
    const hold = automaticReplyHold(visible);
    if (hold) {
      // A match's consecutive messages belong to one turn: the latest "hhh"
      // must not hide an earlier question about AI. Nor should "ok ça marche"
      // trigger a final unnecessary joke. Never consume the reply quota.
      if (!state.processed[snapshot.latestIncomingKey]) {
        state.processed[snapshot.latestIncomingKey] = Date.now();
        if (!await saveState(state)) return;
      }
      reportExistingRunner(hold === "ai-identity" ? "skipped" : "waiting", hold === "ai-identity"
        ? "The match asked whether AI is involved · no automatic reply. Respond personally and truthfully, then review Action Center."
        : "The match acknowledged the previous message · conversation left in peace.");
      return;
    }
    if (state.processed[snapshot.latestIncomingKey] ||
        (snapshot.legacyIncomingKey && state.processed[snapshot.legacyIncomingKey])) {
      reportExistingRunner("waiting", "The last incoming message was already handled · waiting for another.");
      return;
    }
    if (state.dailyCount >= config.automation.maxAutoRepliesPerDay) {
      reportExistingRunner("waiting", "Daily reply limit reached.");
      return;
    }

    busy = true;
    const delaySeconds = randomCadenceSeconds(config.automation);
    console.info(`TNND queued an automatic reply in ${delaySeconds.toFixed(1)}s.`);
    reportExistingRunner("waiting", `Unanswered incoming message found (old or new) · replying after ${Math.ceil(delaySeconds)}s.`);
    await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
    if (!hasLiveExtensionContext()) return;

    const currentSnapshot = adapter.read();
    if (!currentSnapshot || currentSnapshot.latestIncomingKey !== snapshot.latestIncomingKey || currentSnapshot.threadKey !== snapshot.threadKey) return;
    if (currentConversationRef() !== conversationRef || !await backendAllowsAutomaticReply(conversationRef)) return;
    const stillEnabled = await getChatAutomationEnabled(currentSnapshot.threadKey);
    if (stillEnabled !== true) return;

    const recheckMessages = adapter.readVisibleMessages().map(message => ({
      direction: message.direction === "them" ? "incoming" as const : "outgoing" as const,
      text: message.text
    }));
    if (classifyConversationBoundary(recheckMessages).kind !== "continue" || automaticReplyHold(recheckMessages)) {
      reportExistingRunner("skipped", "Conversation now needs no automatic reply · pending generation cancelled.");
      return;
    }
    reportExistingRunner("generating", "Preparing an AI reply with Gemini…");
    const reply = await generateReply(currentSnapshot.context, currentSnapshot.threadKey);
    if (!reply || !hasLiveExtensionContext()) return;
    // Back-end state or the Tinder tab can change while Gemini is generating.
    // Re-authorize immediately before the irreversible send operation.
    if (currentConversationRef() !== conversationRef
      || tinderThreadKeyFromPath(location.pathname) !== currentSnapshot.threadKey
      || !await backendAllowsAutomaticReply(conversationRef) || await autoReplyPausedAfterGlobalStop(conversationRef)) return;
    if (await getChatAutomationEnabled(currentSnapshot.threadKey) !== true) return;
    // A match may have sent a newer message or the user may have replied
    // while Gemini generated; never send an obsolete answer.
    const finalSnapshot = adapter.read();
    if (!finalSnapshot || finalSnapshot.latestIncomingKey !== currentSnapshot.latestIncomingKey
      || finalSnapshot.threadKey !== currentSnapshot.threadKey) {
      reportExistingRunner("skipped", "Visible conversation changed while generating · reply cancelled.");
      return;
    }
    const finalMessages = adapter.readVisibleMessages().map(message => ({
      direction: message.direction === "them" ? "incoming" as const : "outgoing" as const,
      text: message.text
    }));
    const finalHold = automaticReplyHold(finalMessages);
    const finalBoundary = classifyConversationBoundary(finalMessages);
    if (finalBoundary.kind !== "continue" || finalHold || replyNeedsHumanReview(reply) || hasUnexpectedScriptMix(reply, finalMessages)) {
      const processed = await getState();
      if (!processed) return;
      processed.processed[finalSnapshot.latestIncomingKey] = Date.now();
      if (!await saveState(processed)) return;
      reportExistingRunner("skipped", finalBoundary.kind !== "continue" ? boundaryDescription(finalBoundary) : finalHold === "ai-identity" || replyNeedsHumanReview(reply)
        ? "Possible AI disclosure or deceptive denial · reply blocked. Human review required."
        : finalHold === "acknowledgement"
          ? "Match closed this exchange · no follow-up sent."
          : "Mixed Arabic/Latin-script reply held for manual review.");
      return;
    }
    const freshState = await getState();
    if (!freshState || freshState.dailyCount >= config.automation.maxAutoRepliesPerDay
      || freshState.processed[finalSnapshot.latestIncomingKey]
      || (finalSnapshot.legacyIncomingKey && freshState.processed[finalSnapshot.legacyIncomingKey])) return;
    // Durable one-shot send claim BEFORE touching Tinder. A failed/uncertain
    // click must never be automatically retried on an ancient unanswered chat.
    freshState.processed[finalSnapshot.latestIncomingKey] = Date.now();
    freshState.dailyCount += 1;
    if (!await saveState(freshState)) return;
    const bubbles = naturalReplyBubbles(reply,{
      enabled: config.automation.multiPartRepliesEnabled === true,
      minCharacters: config.automation.multiPartMinCharacters
    });
    reportExistingRunner("sending", "One-time reply attempt recorded · clicking Tinder Send…");
    let sentParts = 0;
    for (const [index, part] of bubbles.entries()) {
      if (index > 0) {
        // The follow-up bubble is a continuation of ONE claimed reply, not a
        // second independent automatic response. A new incoming bubble,
        // manual intervention, account/permission change aborts the rest.
        const entropy=new Uint32Array(1);
        crypto.getRandomValues(entropy);
        const gap=openerDelaySeconds({
          openerDelayMinSeconds: config.automation.multiPartDelayMinSeconds ?? 3,
          openerDelayMaxSeconds: config.automation.multiPartDelayMaxSeconds ?? 10
        },entropy[0]/0x100000000);
        await new Promise(resolve=>setTimeout(resolve,gap*1000));
        const fresh = adapter.read();
        const freshConfig = await getContentConfig();
        if (!fresh || fresh.threadKey !== currentSnapshot.threadKey
          || currentConversationRef() !== conversationRef
          || fresh.latestIncomingKey !== currentSnapshot.latestIncomingKey
          || !sameOpenerThreadUninterrupted(adapter.readVisibleMessages(), bubbles[index-1])
          || !freshConfig?.automation.enabled
          || !await backendAllowsAutomaticReply(conversationRef)
          || await autoReplyPausedAfterGlobalStop(conversationRef)
          || await getChatAutomationEnabled(currentSnapshot.threadKey) !== true) {
          reportExistingRunner("skipped", "Multi-bubble reply interrupted: newer message, manual intervention or permissions changed. No retry.");
          break;
        }
      }
      await adapter.send(part);
      sentParts++;
    }
    if (sentParts > 0) reportExistingRunner("sent", sentParts === bubbles.length
      ? "Tinder reply bubbles sent; no duplicate retry."
      : "Partial reply sent; remaining bubbles cancelled. No retry.");
    console.info("TNND attempted one reply to the last unanswered message.");
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
  let sentParts = 0;
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
      // Daily openers are gated by durable first-message claims in background.
      belowDailyLimit: permission?.reason !== "daily_limit",
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
    // One generation/one authorization; output is 2–3 safe sequential bubbles.
    const openerParts = groundedOpenerFragments(opener);

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
      || freshState.processed[firstMessageAttemptKey(conversationRef)]) {
      return { ok: false, error: "The chat or permissions changed. First message not sent." };
    }

    if (mode === "global-new") {
      const global = await sendRuntimeMessage<{ ok: boolean; allowed?: boolean }>({ type: "TNND_GET_NEW_MATCH_SEND_PERMISSION", conversationRef });
      if (!global?.allowed) return { ok: false, error: "New-match mode was stopped before Tinder send." };
    }
    const attemptedAt = Date.now();
    freshState.processed[firstMessageAttemptKey(conversationRef)] = attemptedAt;
    // Openers count against the independent durable first-message quota.
    if (!await saveState(freshState)) return { ok: false, error: "Could not record the opener attempt safely; nothing sent." };
    // No automatic retry even if Tinder's UI acknowledgement is ambiguous.
    const claim = await sendRuntimeMessage<{ ok: boolean; claimed?: boolean; reason?: string }>({
      type: "TNND_CLAIM_FIRST_MESSAGE", conversationRef
    });
    if (!claim?.ok || !claim.claimed) return { ok: false, error: `First message not sent: ${claim?.reason ?? "claim_failed"}.` };
    const partial = (reason: string): { ok: boolean; sent: boolean; error: string } => ({
      ok: true,
      sent: sentParts > 0,
      error: `${sentParts}/${openerParts.length} opener bubbles sent. ${reason} No automatic retry; check the Tinder conversation.`
    });
    for (const [index, part] of openerParts.entries()) {
      if (index > 0) {
        // Estimate the time to type the NEXT bubble, not fixed idle time.
        // Short bubbles move on quickly, longer sentences take longer.
        // Reply delays and optional multipart-reply timing stay separate.
        const entropy = new Uint32Array(1);
        crypto.getRandomValues(entropy);
        const gap = openerTypingDelaySeconds(part, config.automation, entropy[0] / 0x100000000);
        await new Promise((resolve) => setTimeout(resolve, gap * 1000));
        if (!hasLiveExtensionContext()
          || currentConversationRef() !== conversationRef
          || expectedThreadKey !== tinderThreadKeyFromPath(location.pathname)
          || !adapter.diagnose().composerFound) return partial("Tinder tab or chat changed.");
        // Only our immediately previous outbound bubble may be the latest.
        // An incoming response, manual send, or unknown transcript stops.
        if (!sameOpenerThreadUninterrupted(adapter.readVisibleMessages(), openerParts[index - 1])) {
          return partial("Another message appeared or the previous bubble was not verified.");
        }
        const continuing = await getContentConfig();
        if (!continuing?.automation.enabled
          || (continuing.automation.quietHoursEnabled
            && insideQuietHours(continuing.automation.quietStart, continuing.automation.quietEnd))
          || await getChatAutomationEnabled(threadKey) !== true
          || !await backendAllowsAutomaticReply(conversationRef)) return partial("AI management or automation was paused.");
        if (mode === "global-new") {
          const global = await sendRuntimeMessage<{ ok: boolean; allowed?: boolean }>({
            type: "TNND_GET_NEW_MATCH_SEND_PERMISSION", conversationRef
          });
          if (!global?.allowed) return partial("New-match runner was stopped.");
        }
        if (currentConversationRef() !== conversationRef
          || !sameOpenerThreadUninterrupted(adapter.readVisibleMessages(), openerParts[index - 1])) {
          return partial("Chat content changed before the next bubble.");
        }
      }
      await adapter.send(part);
      sentParts++;
      try {
        // Distinct stable message keys: one opener quota claim per match,
        // but each actual Tinder bubble is synchronized as its own message.
        await syncConversationDelta(conversationRef, [{
          externalMessageId: `tnnd-opener-${attemptedAt}-${index + 1}`,
          direction: "outgoing",
          text: part,
          sentAt: new Date().toISOString()
        }], null);
      } catch {
        return partial("Tinder accepted a send action but backend sync could not be confirmed.");
      }
    }
    return { ok: true, sent: true };
  } catch (error) {
    return { ok: sentParts > 0, sent: sentParts > 0, error: `Opener ${sentParts > 0 ? `partially sent (${sentParts} bubble(s))` : "not confirmed"}. No automatic retry. Check Tinder: ${error instanceof Error ? error.message : "unknown error"}` };
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

/** React/Tinder handles the click internally. This content script stays alive
 * across a SPA transition, unlike chrome.tabs.update({url}) full navigations.
 */
let spaNavigationBusy = false;
let spaNavigationSettlesAt = 0;
async function navigateExistingSpa(ref: string, expectedRef: string | null): Promise<{
  ok: boolean; error?: string; currentRef?: string; identity?: VisibleTinderMatchIdentity
}> {
  if (spaNavigationBusy || busy) return { ok: false, error: "conversation_processing_in_progress" };
  if (!/^[a-zA-Z0-9_-]{3,512}$/.test(ref)) return { ok: false, error: "invalid_thread_ref" };
  if (currentConversationRef() !== expectedRef) return { ok: false, error: "unexpected_current_thread" };
  if (currentConversationRef() === ref) return { ok: true, currentRef: ref,
    identity: readVisibleTinderMatchIdentity(ref) };
  const anchor = selectVisibleTinderChatLink(document, ref, location.origin);
  if (!anchor) return { ok: false, error: "thread_not_in_visible_sidebar" };
  spaNavigationBusy = true;
  try {
    spaNavigationSettlesAt = Date.now() + 1800;
    anchor.click();
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      if (currentConversationRef() === ref && adapter.diagnose().composerFound) {
        spaNavigationSettlesAt = Date.now() + 1200;
        // A premature scan during SPA settling would return without retrying.
        // Schedule once more after the new chat DOM has had time to render.
        window.setTimeout(scheduleScan, 1300);
        return { ok: true, currentRef: ref, identity: readVisibleTinderMatchIdentity(ref) };
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    return { ok: false, error: "spa_navigation_not_confirmed" };
  } finally { spaNavigationBusy = false; }
}

/** For first messages to existing matches, use the actual visible Tinder
 * Matches tile. The selected match moves in Tinder's UI; the queue keys by
 * stable Tinder thread ID, never by tile position.
 */
async function navigateMatchSpa(ref: string): Promise<{ ok: boolean; error?: string; currentRef?: string }> {
  if (spaNavigationBusy || busy) return { ok: false, error: "conversation_processing_in_progress" };
  if (!/^[a-zA-Z0-9_-]{3,512}$/.test(ref)) return { ok: false, error: "invalid_thread_ref" };
  spaNavigationBusy = true;
  try {
    if (detectVisibleTinderSidebarTab() !== "matches") {
      const choices = Array.from(document.querySelectorAll<HTMLElement>(
        '[role="tab"],button'
      )).filter(el => el.getClientRects().length > 0
        && el.textContent?.trim().toLowerCase() === "matches");
      if (choices.length !== 1) return { ok: false, error: "matches_tab_not_accessible" };
      choices[0].click();
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline && detectVisibleTinderSidebarTab() !== "matches") {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      if (detectVisibleTinderSidebarTab() !== "matches") return { ok: false, error: "matches_sidebar_not_loaded" };
    }
    const tiles = Array.from(document.querySelectorAll<HTMLAnchorElement>('a.matchListItem[href*="/app/messages/"]'));
    const tile = tiles.find(link => {
      if (!link.isConnected || !link.getClientRects().length) return false;
      try {
        const url = new URL(link.href, location.origin);
        return url.origin === location.origin
          && decodeURIComponent(url.pathname) === "/app/messages/" + ref;
      } catch { return false; }
    });
    if (!tile) return { ok: false, error: "match_tile_not_loaded" };
    spaNavigationSettlesAt = Date.now() + 1800;
    tile.click();
    const deadline = Date.now() + 8500;
    while (Date.now() < deadline) {
      if (currentConversationRef() === ref && adapter.diagnose().composerFound) {
        spaNavigationSettlesAt = Date.now() + 1200;
        window.setTimeout(scheduleScan, 1300);
        return { ok: true, currentRef: ref };
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    return { ok: false, error: "match_navigation_not_confirmed" };
  } finally { spaNavigationBusy = false; }
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!message || typeof message !== "object") return false;
  const input = message as { type?: unknown; ref?: unknown };
  if (input.type !== "TNND_MATCH_SPA_NAVIGATE") return false;
  if (sender.id !== chrome.runtime.id || typeof input.ref !== "string") {
    sendResponse({ ok: false, error: "untrusted_match_navigation_request" });
    return false;
  }
  void navigateMatchSpa(input.ref).then(sendResponse)
    .catch(() => sendResponse({ ok: false, error: "match_navigation_failed" }));
  return true;
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!message || typeof message !== "object") return false;
  const input = message as { type?: unknown; ref?: unknown; expectedRef?: unknown };
  if (input.type !== "TNND_EXISTING_SPA_NAVIGATE") return false;
  if (sender.id !== chrome.runtime.id || typeof input.ref !== "string"
    || (input.expectedRef !== null && typeof input.expectedRef !== "string")) {
    sendResponse({ ok: false, error: "untrusted_or_invalid_navigation_request" });
    return false;
  }
  void navigateExistingSpa(input.ref, input.expectedRef)
    .then(sendResponse).catch(() => sendResponse({ ok: false, error: "spa_navigation_failed" }));
  return true;
});

/** Read-only bulk import cannot navigate away from a human's unsent draft,
 * from an in-flight send, or from a thread changed manually in Tinder. */
chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!message || typeof message !== "object") return false;
  const input = message as { type?: unknown; ref?: unknown; expectedRef?: unknown };
  if (input.type !== "TNND_BULK_SYNC_READONLY_NAVIGATE") return false;
  if (sender.id !== chrome.runtime.id || !hasLiveExtensionContext()
    || typeof input.ref !== "string"
    || (input.expectedRef !== null && typeof input.expectedRef !== "string")) {
    sendResponse({ ok: false, error: "untrusted_bulk_sync_navigation" });
    return false;
  }
  const composer = document.querySelector<HTMLElement>(
    'textarea[placeholder*="message" i],textarea[aria-label*="message" i],[contenteditable="true"][role="textbox"]'
  );
  const text = composer instanceof HTMLTextAreaElement ? composer.value : composer?.innerText ?? "";
  if (text.trim()) {
    sendResponse({ ok: false, error: "unsent_message_draft_present" });
    return false;
  }
  void navigateExistingSpa(input.ref, input.expectedRef).then(sendResponse)
    .catch(() => sendResponse({ ok: false, error: "bulk_navigation_failed" }));
  return true;
});

/** One physical, bounded scroll of the *verified chat transcript* to load
 * older history via Tinder's own UI. No private Tinder API, no guessing
 * scroll containers, no keystrokes or send operations.
 */
function verifiedChatHistoryScroller(ref:string): HTMLElement | null {
  if (currentConversationRef() !== ref) return null;
  const chat = document.querySelector<HTMLElement>(".chat");
  const composer = chat?.querySelector<HTMLElement>(
    'textarea[placeholder*="message" i],textarea[aria-label*="message" i],[contenteditable="true"][role="textbox"]'
  );
  const list = chat?.querySelector<HTMLElement>('ol[aria-label="Messages" i]');
  if (!list || list.getClientRects().length === 0 || !composer || composer.getClientRects().length === 0) return null;
  let node: HTMLElement | null = list;
  for(let i=0;node && chat!.contains(node) && i<12;node=node.parentElement,i++){
    const overflow=getComputedStyle(node).overflowY;
    if(node.clientHeight>100 && node.scrollHeight>node.clientHeight+12
      && (overflow==="auto" || overflow==="scroll")) return node;
  }
  return null;
}
chrome.runtime.onMessage.addListener((message:unknown,sender,sendResponse)=>{
  if(!message || typeof message!=="object")return false;
  const input=message as {type?:unknown;ref?:unknown};
  if(input.type!=="TNND_IMPORT_SCROLL_OLDER_PAGE" && input.type!=="TNND_IMPORT_RESTORE_LATEST")return false;
  const ref=input.ref;
  if(sender.id!==chrome.runtime.id || !hasLiveExtensionContext() || typeof ref!=="string"
    || !/^[a-zA-Z0-9_-]{3,512}$/.test(ref) || busy || spaNavigationBusy
    || currentConversationRef()!==ref) {
    sendResponse({ok:false,error:"history_scroll_context_changed"});return false;
  }
  const composer=document.querySelector<HTMLElement>(
    'textarea[placeholder*="message" i],textarea[aria-label*="message" i],[contenteditable="true"][role="textbox"]'
  );
  const draft=composer instanceof HTMLTextAreaElement ? composer.value : composer?.innerText ?? "";
  if(draft.trim()){
    sendResponse({ok:false,error:"unsent_message_draft_present"});return false;
  }
  const scroller=verifiedChatHistoryScroller(ref);
  if(!scroller){sendResponse({ok:false,error:"verified_scroll_container_missing"});return false;}
  const before=scroller.scrollTop;
  scroller.scrollTop = input.type==="TNND_IMPORT_RESTORE_LATEST"
    ? scroller.scrollHeight : Math.max(0,before-Math.max(180,Math.floor(scroller.clientHeight*.55)));
  void new Promise(resolve=>setTimeout(resolve,450)).then(()=>{
    if(currentConversationRef()!==ref){sendResponse({ok:false,error:"history_scroll_context_changed"});return;}
    sendResponse({ok:true,moved:Math.abs(before-scroller.scrollTop)>1,
      atTop:scroller.scrollTop<=2});
  });
  return true;
});

/** Bounded SPA sidebar navigation: never reload Tinder, switch Chrome
 * tabs, or leave the open chat while its composer/send is in progress. */
async function navigateWatcherSidebar(
  target: "matches" | "messages", expectedRef: string | null
): Promise<{ ok: boolean; error?: string; sidebar?: string; refs?: string[] }> {
  if (!hasLiveExtensionContext() || busy || spaNavigationBusy)
    return { ok: false, error: "conversation_processing_in_progress" };
  if (currentConversationRef() !== expectedRef)
    return { ok: false, error: "unexpected_current_thread" };
  // A human-typed but unsent draft is also an active conversation: do not
  // replace their focused sidebar or interrupt manual takeover.
  if (target === "matches") {
    const draft = document.querySelector<HTMLElement>(
      'textarea[placeholder*="message" i],textarea[aria-label*="message" i],[contenteditable="true"][role="textbox"]'
    );
    const draftText = draft instanceof HTMLTextAreaElement ? draft.value : draft?.innerText ?? "";
    if (draftText.trim()) return { ok: false, error: "unsent_message_draft_present" };
  }
  if (detectVisibleTinderSidebarTab() === target) {
    return { ok: true, sidebar: target,
      ...(target === "matches" ? { refs: visibleTinderThreadRefs() } : {}) };
  }
  const labels = target === "matches"
    ? ["matches", "matchs"] : ["messages"];
  const choices = Array.from(document.querySelectorAll<HTMLElement>('button,[role="tab"]'))
    .filter(el => el.isConnected && el.getClientRects().length > 0
      && labels.includes((el.textContent ?? "").replace(/\s+/g, " ").toLowerCase().trim()));
  if (choices.length !== 1) return { ok: false, error: "sidebar_tab_not_confidently_identified" };
  spaNavigationBusy = true;
  try {
    spaNavigationSettlesAt = Date.now() + 1000;
    choices[0]!.click();
    const until = Date.now() + 4500;
    while (Date.now() < until && detectVisibleTinderSidebarTab() !== target) {
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    if (detectVisibleTinderSidebarTab() !== target)
      return { ok: false, error: "sidebar_switch_not_confirmed" };
    // A manual route change during the switch invalidates the operation.
    if (currentConversationRef() !== expectedRef)
      return { ok: false, error: "conversation_changed_during_sidebar_switch" };
    return { ok: true, sidebar: target,
      ...(target === "matches" ? { refs: visibleTinderThreadRefs() } : {}) };
  } finally {
    spaNavigationBusy = false;
    window.setTimeout(scheduleScan, 400);
  }
}
chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!message || typeof message !== "object") return false;
  const input = message as { type?: unknown; target?: unknown; expectedRef?: unknown };
  if (input.type !== "TNND_WATCHER_SELECT_SIDEBAR") return false;
  if (sender.id !== chrome.runtime.id
    || !["messages","matches"].includes(String(input.target))
    || (input.expectedRef !== null && typeof input.expectedRef !== "string")) {
    sendResponse({ ok: false, error: "invalid_watcher_sidebar_request" });
    return false;
  }
  void navigateWatcherSidebar(input.target as "matches"|"messages", input.expectedRef as string|null)
    .then(sendResponse).catch(() => sendResponse({ ok: false, error: "sidebar_navigation_failed" }));
  return true;
});

// Read-only snapshot for a watcher started after the sidebar was already
// rendered. No message text, profile details or send permissions are exposed.
chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!message || typeof message !== "object"
    || (message as { type?: string }).type !== "TNND_WATCHER_READ_MATCHES") return false;
  if (sender.id !== chrome.runtime.id || !hasLiveExtensionContext()) {
    sendResponse({ ok: false, error: "match_watch_snapshot_not_authorized" });
    return false;
  }
  if (detectVisibleTinderSidebarTab() !== "matches") {
    sendResponse({ ok: false, reason: "select_matches_tab" });
    return false;
  }
  sendResponse({ ok: true, refs: visibleTinderThreadRefs() });
  return false;
});
chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!message || typeof message !== "object"
    || (message as { type?: string }).type !== "TNND_WATCHER_READ_UNREAD") return false;
  if (sender.id !== chrome.runtime.id || !hasLiveExtensionContext()) {
    sendResponse({ ok: false, error: "watcher_snapshot_not_authorized" });
    return false;
  }
  const refs = discoverUnreadThreadCandidates().map(candidate => candidate.conversationRef);
  sendResponse({ ok: true, refs });
  return false;
});

let lastSwipePulseAt = 0;
let lastUnreadFingerprint = "";
window.setInterval(() => {
  if (!hasLiveExtensionContext() || spaNavigationBusy || busy) return;
  if (location.pathname === "/app/recs" && Date.now() - lastSwipePulseAt >= 2300) {
    lastSwipePulseAt = Date.now();
    void sendRuntimeMessage({ type: "TNND_SMART_SWIPE_AUTOMATION_TICK" }).catch(() => undefined);
  }
  const ref = currentConversationRef();
  const unreadRefs = discoverUnreadThreadCandidates().map(item => item.conversationRef);
  const fingerprint = JSON.stringify([...unreadRefs].sort());
  if (fingerprint !== lastUnreadFingerprint) {
    lastUnreadFingerprint = fingerprint;
    if (unreadRefs.length) void sendRuntimeMessage({
      type: "TNND_EXISTING_RUNNER_UNREAD", refs: unreadRefs
    }).catch(() => undefined);
  }
  if (ref) {
    void sendRuntimeMessage({ type: "TNND_EXISTING_RUNNER_TICK", ref }).catch(() => undefined);
    void sendRuntimeMessage({ type: "TNND_MATCH_RUNNER_TICK", ref }).catch(() => undefined);
  }
}, 2500);

function scheduleScan(): void {
  if (!hasLiveExtensionContext()) return;
  void observeRuntimeReadMode();
  void observeVisibleIdentity().catch(() => undefined);
  void observeNewMatchLinks().catch(() => undefined);
  void observeBulkCollection().catch(() => undefined);
  void notifyOpenedThreadForOptInSync().catch(() => undefined);
  if (scanTimer) window.clearTimeout(scanTimer);
  scanTimer = window.setTimeout(() => {
    if (!hasLiveExtensionContext()) return;
    void scan();
  }, 900);
}

// Executed only after the background worker claims a durable account/device
// attempt. Content reports only outcome codes, never private Tinder card data.
chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
  if (!message || typeof message !== "object" ||
      (message as { type?: unknown }).type !== "TNND_SMART_SWIPE_EXECUTE_RESERVED") return false;
  const attemptId = (message as { attemptId?: unknown }).attemptId;
  if (sender.id !== chrome.runtime.id || !hasLiveExtensionContext() ||
      typeof attemptId !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(attemptId)) {
    respond({ ok: false, error: "invalid_reserved_attempt" });
    return false;
  }
  void executeReservedTinderRightLike()
    .then(outcome => respond({ ok: true, outcome }))
    .catch(() => respond({ ok: false, error: "swipe_action_failed" }));
  return true;
});

// Read-only, privacy-safe Discovery control snapshot. Never clicks Tinder.
chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!message || typeof message !== "object" ||
      (message as { type?: unknown }).type !== "TNND_SMART_SWIPE_OBSERVE") return false;
  if (sender.id !== chrome.runtime.id || !hasLiveExtensionContext()) {
    sendResponse({ ok: false, error: "extension_context_unavailable" });
    return false;
  }
  const ui = readCurrentTinderUiState();
  sendResponse({
    ok: true,
    evidence: observeSwipeDiscoveryControls(document, location.pathname, !ui.boundedActionAllowed)
  });
  return false;
});

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