import { strToU8, zipSync } from "fflate";
import { loginBackend, logoutBackend, validateBackendSession } from "./backend-session";
import { getChatSettings, saveChatSettings } from "./storage";
import { renderSyncStatus } from "./sync-status-panel";
import type { ChatSettings, ConversationStage, Tone } from "./types";

type TinderViewState = "discovery" | "inbox" | "conversation" | "unknown";

interface DiagnosticSelectors {
  view?: TinderViewState;
  viewSignals?: string[];
  [key: string]: unknown;
}

interface DiagnosticPage {
  url?: string;
  [key: string]: unknown;
}

interface DiagnosticSnapshot {
  generatedAt: string;
  page: DiagnosticPage;
  selectors: DiagnosticSelectors;
  resources: unknown;
  config: unknown;
  domHtml: string;
  domTruncated: boolean;
}

interface DiagnosticResponse {
  ok: boolean;
  snapshot?: DiagnosticSnapshot;
  error?: string;
}

interface DiagnosticTraceEntry {
  step: number;
  capturedAt: string;
  view: TinderViewState;
  previousView: TinderViewState | null;
  path: string;
  signalCount: number;
}

interface ThreadInfoResponse {
  ok: boolean;
  threadKey?: string | null;
  threadKeyHash?: string;
}

const DIAGNOSTIC_TRACE_KEY = "tnnd.diagnosticTrace.v1";
const version = document.getElementById("extensionVersion")!;
const status = document.getElementById("status")!;
const diagnosticView = document.getElementById("diagnosticView")!;
const diagnosticViewEvidence = document.getElementById("diagnosticViewEvidence")!;
const diagnosticSequence = document.getElementById("diagnosticSequence")!;
const resetDiagnosticSequence = document.getElementById("resetDiagnosticSequence") as HTMLButtonElement;
const exportButton = document.getElementById("exportDiagnostics") as HTMLButtonElement;
const openSettings = document.getElementById("openSettings") as HTMLButtonElement;
const openPreview = document.getElementById("openPreview") as HTMLButtonElement;
const backendLoggedOut = document.getElementById("backendLoggedOut")!;
const backendLoggedIn = document.getElementById("backendLoggedIn")!;
const backendAccount = document.getElementById("backendAccount")!;
const backendEmail = document.getElementById("backendEmail") as HTMLInputElement;
const backendPassword = document.getElementById("backendPassword") as HTMLInputElement;
const backendLogin = document.getElementById("backendLogin") as HTMLButtonElement;
const backendLogout = document.getElementById("backendLogout") as HTMLButtonElement;
const backendAuthStatus = document.getElementById("backendAuthStatus")!;
const chatEditor = document.getElementById("chatEditor")!;
const chatUnavailable = document.getElementById("chatUnavailable")!;
const chatEnabled = document.getElementById("chatEnabled") as HTMLInputElement;
const chatAlias = document.getElementById("chatAlias") as HTMLInputElement;
const chatStage = document.getElementById("chatStage") as HTMLSelectElement;
const chatTone = document.getElementById("chatTone") as HTMLSelectElement;
const chatGoal = document.getElementById("chatGoal") as HTMLInputElement;
const chatInstructions = document.getElementById("chatInstructions") as HTMLTextAreaElement;
const chatFlirtLevel = document.getElementById("chatFlirtLevel") as HTMLInputElement;
const chatHumorLevel = document.getElementById("chatHumorLevel") as HTMLInputElement;
const chatLangFr = document.getElementById("chatLangFr") as HTMLInputElement;
const chatLangDarija = document.getElementById("chatLangDarija") as HTMLInputElement;
const chatLangEn = document.getElementById("chatLangEn") as HTMLInputElement;
const saveChat = document.getElementById("saveChat") as HTMLButtonElement;
const chatStatus = document.getElementById("chatStatus")!;
let currentThreadKey: string | null = null;

version.textContent = `v${chrome.runtime.getManifest().version}`;

function isTinderUrl(value?: string): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "tinder.com" || url.hostname === "www.tinder.com");
  } catch {
    return false;
  }
}

function displayView(view: TinderViewState | undefined, signals: string[] = []): void {
  const resolved = view ?? "unknown";
  diagnosticView.textContent = resolved;
  diagnosticView.dataset.view = resolved;
  diagnosticViewEvidence.textContent = signals.length
    ? `${signals.length} detection signal${signals.length === 1 ? "" : "s"}`
    : "No reliable detection signal yet";
}

function tracePath(value?: string): string {
  if (!value) return "[unknown-path]";
  try {
    const url = new URL(value);
    return url.pathname || "/";
  } catch {
    return "[unknown-path]";
  }
}

async function readDiagnosticTrace(): Promise<DiagnosticTraceEntry[]> {
  const raw = (await chrome.storage.local.get(DIAGNOSTIC_TRACE_KEY))[DIAGNOSTIC_TRACE_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is DiagnosticTraceEntry => Boolean(entry) && typeof entry === "object").slice(-20);
}

async function saveDiagnosticTrace(trace: DiagnosticTraceEntry[]): Promise<void> {
  await chrome.storage.local.set({ [DIAGNOSTIC_TRACE_KEY]: trace.slice(-20) });
}

function renderDiagnosticSequence(trace: DiagnosticTraceEntry[]): void {
  if (!trace.length) {
    diagnosticSequence.textContent = "Sequence: no captured steps yet";
    return;
  }
  const last = trace[trace.length - 1];
  diagnosticSequence.textContent = `Sequence: ${trace.length} step${trace.length === 1 ? "" : "s"} · last ${last.view}`;
}

async function refreshDiagnosticSequence(): Promise<void> {
  renderDiagnosticSequence(await readDiagnosticTrace());
}

async function fetchDiagnosticSnapshot(): Promise<DiagnosticSnapshot> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !isTinderUrl(tab.url)) throw new Error("Open Tinder in the active tab, then click TNND again.");
  const response = await chrome.tabs.sendMessage(tab.id, { type: "TNND_GET_DIAGNOSTICS" }) as DiagnosticResponse;
  if (!response?.ok || !response.snapshot) throw new Error(response?.error ?? "The Tinder content script did not return diagnostics.");
  return response.snapshot;
}

async function loadDiagnosticView(): Promise<void> {
  try {
    const snapshot = await fetchDiagnosticSnapshot();
    displayView(snapshot.selectors.view, snapshot.selectors.viewSignals);
  } catch {
    displayView("unknown");
    diagnosticViewEvidence.textContent = "Reload Tinder once after updating TNND";
  }
}

function optionalNumber(input: HTMLInputElement, min: number, max: number): number | undefined {
  if (!input.value.trim()) return undefined;
  const value = Number(input.value);
  if (!Number.isFinite(value)) return undefined;
  return Math.min(max, Math.max(min, value));
}

function applyChatSettings(settings: ChatSettings): void {
  chatEnabled.checked = settings.enabled;
  chatAlias.value = settings.alias;
  chatStage.value = settings.stage;
  chatTone.value = settings.tone ?? "";
  chatGoal.value = settings.goal;
  chatInstructions.value = settings.instructions;
  chatFlirtLevel.value = settings.flirtLevel === undefined ? "" : String(settings.flirtLevel);
  chatHumorLevel.value = settings.humorLevel === undefined ? "" : String(settings.humorLevel);
  chatLangFr.value = settings.languages?.fr === undefined ? "" : String(settings.languages.fr);
  chatLangDarija.value = settings.languages?.darija === undefined ? "" : String(settings.languages.darija);
  chatLangEn.value = settings.languages?.en === undefined ? "" : String(settings.languages.en);
}

function readChatSettings(): ChatSettings {
  const fr = optionalNumber(chatLangFr, 0, 100);
  const darija = optionalNumber(chatLangDarija, 0, 100);
  const en = optionalNumber(chatLangEn, 0, 100);
  const languages = fr === undefined && darija === undefined && en === undefined
    ? undefined
    : { ...(fr === undefined ? {} : { fr }), ...(darija === undefined ? {} : { darija }), ...(en === undefined ? {} : { en }) };

  return {
    enabled: chatEnabled.checked,
    alias: chatAlias.value.trim(),
    stage: chatStage.value as ConversationStage,
    goal: chatGoal.value.trim(),
    instructions: chatInstructions.value.trim(),
    tone: chatTone.value ? chatTone.value as Tone : undefined,
    flirtLevel: optionalNumber(chatFlirtLevel, 0, 3),
    humorLevel: optionalNumber(chatHumorLevel, 0, 100),
    languages
  };
}

function showBackendSession(email: string | null): void {
  backendLoggedOut.classList.toggle("hidden", Boolean(email));
  backendLoggedIn.classList.toggle("hidden", !email);
  backendAccount.textContent = email ? `Connected as ${email}` : "";
}

async function refreshBackendAuth(): Promise<void> {
  try {
    const session = await validateBackendSession();
    showBackendSession(session?.user.email ?? null);
    backendAuthStatus.textContent = session ? "TNND account session is active." : "Connect your TNND account to enable server sync.";
  } catch (error) {
    showBackendSession(null);
    backendAuthStatus.textContent = error instanceof Error ? error.message : "Could not validate TNND session.";
  } finally {
    await renderSyncStatus();
  }
}

async function loadCurrentChat(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !isTinderUrl(tab.url)) return;
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "TNND_GET_THREAD_INFO" }) as ThreadInfoResponse;
    if (!response?.ok || !response.threadKey) return;
    currentThreadKey = response.threadKey;
    applyChatSettings(await getChatSettings(currentThreadKey));
    chatUnavailable.classList.add("hidden");
    chatEditor.classList.remove("hidden");
    chatStatus.textContent = response.threadKeyHash ? `Local thread ${response.threadKeyHash}` : "Current conversation detected.";
  } catch {
    chatStatus.textContent = "Reload the Tinder page once after updating TNND.";
  }
}

function screenshotBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",", 2)[1] ?? "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function downloadZip(files: Record<string, Uint8Array>, view: TinderViewState, step: number): void {
  const zipped = zipSync(files, { level: 6 });
  const blob = new Blob([zipped], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `tnnd-diagnostics-step-${String(step).padStart(2, "0")}-${view}-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function exportDiagnostics(): Promise<void> {
  exportButton.disabled = true;
  status.textContent = "Collecting redacted diagnostics…";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !isTinderUrl(tab.url)) throw new Error("Open Tinder in the active tab, then click TNND again.");

    const response = await chrome.tabs.sendMessage(tab.id, { type: "TNND_GET_DIAGNOSTICS" }) as DiagnosticResponse;
    if (!response?.ok || !response.snapshot) throw new Error(response?.error ?? "The Tinder content script did not return diagnostics.");
    const snapshot = response.snapshot;
    const view = snapshot.selectors.view ?? "unknown";
    const signals = snapshot.selectors.viewSignals ?? [];
    displayView(view, signals);

    const trace = await readDiagnosticTrace();
    const traceEntry: DiagnosticTraceEntry = {
      step: trace.length + 1,
      capturedAt: new Date().toISOString(),
      view,
      previousView: trace.at(-1)?.view ?? null,
      path: tracePath(snapshot.page.url),
      signalCount: signals.length
    };
    const nextTrace = [...trace, traceEntry].slice(-20).map((entry, index) => ({ ...entry, step: index + 1 }));
    await saveDiagnosticTrace(nextTrace);
    renderDiagnosticSequence(nextTrace);

    let screenshot: Uint8Array | null = null;
    let screenshotError = "";
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
      screenshot = screenshotBytes(dataUrl);
    } catch (error) {
      screenshotError = error instanceof Error ? error.message : "Visible-tab screenshot was unavailable.";
    }

    const metadata = {
      kind: "tnnd-diagnostics",
      schemaVersion: 3,
      extensionVersion: chrome.runtime.getManifest().version,
      exportedAt: new Date().toISOString(),
      diagnosticStep: traceEntry.step,
      tinderView: view,
      previousTinderView: traceEntry.previousView,
      viewSignals: signals,
      domTruncated: snapshot.domTruncated,
      screenshotIncluded: Boolean(screenshot),
      screenshotError: screenshotError || undefined,
      privacy: "DOM text/form values and sensitive attributes are redacted. Cookies, auth headers, tokens, request/response bodies, localStorage and sessionStorage are not exported. A screenshot can still visibly contain profile/chat content because it represents the active page."
    };

    const files: Record<string, Uint8Array> = {
      "metadata.json": strToU8(JSON.stringify(metadata, null, 2)),
      "navigation-trace.json": strToU8(JSON.stringify({ schemaVersion: 1, steps: nextTrace }, null, 2)),
      "page.json": strToU8(JSON.stringify(snapshot.page, null, 2)),
      "selectors.json": strToU8(JSON.stringify(snapshot.selectors, null, 2)),
      "resources.json": strToU8(JSON.stringify(snapshot.resources, null, 2)),
      "config-summary.json": strToU8(JSON.stringify(snapshot.config, null, 2)),
      "dom-redacted.html": strToU8(snapshot.domHtml)
    };
    if (screenshot) files["screenshot-visible.png"] = screenshot;
    downloadZip(files, view, traceEntry.step);
    status.textContent = screenshot
      ? `Diagnostic step ${traceEntry.step} exported for ${view} with visible screenshot.`
      : `Diagnostic step ${traceEntry.step} exported for ${view}. Screenshot was unavailable; the rest of the bundle is included.`;
  } finally {
    exportButton.disabled = false;
  }
}

backendLogin.addEventListener("click", () => {
  void (async () => {
    const email = backendEmail.value.trim();
    const password = backendPassword.value;
    if (!email || !password) throw new Error("Enter your TNND email and password.");
    backendLogin.disabled = true;
    backendAuthStatus.textContent = "Connecting to TNND…";
    const session = await loginBackend({ email, password });
    backendPassword.value = "";
    showBackendSession(session.user.email);
    backendAuthStatus.textContent = "TNND account connected.";
    await renderSyncStatus();
  })().catch((error) => {
    backendAuthStatus.textContent = error instanceof Error ? error.message : "Could not connect to TNND.";
  }).finally(() => {
    backendLogin.disabled = false;
  });
});

backendLogout.addEventListener("click", () => {
  void (async () => {
    backendLogout.disabled = true;
    backendAuthStatus.textContent = "Disconnecting…";
    await logoutBackend();
    showBackendSession(null);
    backendAuthStatus.textContent = "TNND account disconnected.";
    await renderSyncStatus();
  })().catch((error) => {
    backendAuthStatus.textContent = error instanceof Error ? error.message : "Could not disconnect TNND.";
  }).finally(() => {
    backendLogout.disabled = false;
  });
});

saveChat.addEventListener("click", () => {
  void (async () => {
    if (!currentThreadKey) throw new Error("No Tinder conversation is currently detected.");
    saveChat.disabled = true;
    chatStatus.textContent = "Saving chat instructions…";
    await saveChatSettings(currentThreadKey, readChatSettings());
    chatStatus.textContent = "Chat-specific instructions saved.";
  })().catch((error) => {
    chatStatus.textContent = error instanceof Error ? error.message : "Could not save chat settings.";
  }).finally(() => {
    saveChat.disabled = false;
  });
});

resetDiagnosticSequence.addEventListener("click", () => {
  void chrome.storage.local.remove(DIAGNOSTIC_TRACE_KEY).then(() => {
    renderDiagnosticSequence([]);
    status.textContent = "Diagnostic sequence reset. Start again from the discovery view.";
  });
});
openSettings.addEventListener("click", () => void chrome.runtime.openOptionsPage());
openPreview.addEventListener("click", () => void chrome.tabs.create({ url: chrome.runtime.getURL("preview.html") }));
exportButton.addEventListener("click", () => void exportDiagnostics().catch((error) => {
  status.textContent = error instanceof Error ? error.message : "Could not export diagnostics.";
  exportButton.disabled = false;
}));
void refreshBackendAuth();
void loadCurrentChat();
void loadDiagnosticView();
void refreshDiagnosticSequence();