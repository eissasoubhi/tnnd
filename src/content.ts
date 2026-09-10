import { getChatSettings, getConfig } from "./storage";
import { TinderDomAdapter } from "./tinder-adapter";
import type { AutomationConfig, GenerateRequest, GenerateResponse } from "./types";

const STATE_KEY = "tnnd.autoState";
const adapter = new TinderDomAdapter();
let busy = false;
let scanTimer: number | undefined;

interface AutoState {
  date: string;
  dailyCount: number;
  processed: Record<string, number>;
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

async function getState(): Promise<AutoState> {
  const raw = (await chrome.storage.local.get(STATE_KEY))[STATE_KEY] as AutoState | undefined;
  if (!raw || raw.date !== today()) return { date: today(), dailyCount: 0, processed: {} };
  return raw;
}

async function saveState(state: AutoState): Promise<void> {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  state.processed = Object.fromEntries(Object.entries(state.processed).filter(([, timestamp]) => timestamp >= cutoff));
  await chrome.storage.local.set({ [STATE_KEY]: state });
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

async function generateReply(context: string, threadKey: string): Promise<string> {
  const request: GenerateRequest = { type: "GENERATE_SUGGESTIONS", context, purpose: "auto", replyCount: 1, threadKey };
  const response = (await chrome.runtime.sendMessage(request)) as GenerateResponse;
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
  const config = await getConfig();
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

async function scan(): Promise<void> {
  if (busy) return;
  const config = await getConfig();
  if (!config.automation.enabled) return;
  if (config.automation.quietHoursEnabled && insideQuietHours(config.automation.quietStart, config.automation.quietEnd)) return;

  const snapshot = adapter.read();
  if (!snapshot) return;
  const chat = await getChatSettings(snapshot.threadKey);
  if (!chat.enabled) return;

  const state = await getState();
  if (state.processed[snapshot.latestIncomingKey]) return;
  if (state.dailyCount >= config.automation.maxAutoRepliesPerDay) return;

  busy = true;
  try {
    const delaySeconds = randomCadenceSeconds(config.automation);
    console.info(`TNND queued an automatic reply in ${delaySeconds.toFixed(1)}s.`);
    await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
    const currentSnapshot = adapter.read();
    if (!currentSnapshot || currentSnapshot.latestIncomingKey !== snapshot.latestIncomingKey || currentSnapshot.threadKey !== snapshot.threadKey) return;
    const latestChat = await getChatSettings(currentSnapshot.threadKey);
    if (!latestChat.enabled) return;
    const reply = await generateReply(currentSnapshot.context, currentSnapshot.threadKey);
    await adapter.send(reply);
    const freshState = await getState();
    freshState.processed[currentSnapshot.latestIncomingKey] = Date.now();
    freshState.dailyCount += 1;
    await saveState(freshState);
    console.info("TNND sent an automatic reply.");
  } catch (error) {
    console.warn("TNND auto-reply skipped", error);
  } finally {
    busy = false;
  }
}

function scheduleScan(): void {
  if (scanTimer) window.clearTimeout(scanTimer);
  scanTimer = window.setTimeout(() => void scan(), 900);
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!message || typeof message !== "object" || (message as { type?: string }).type !== "TNND_GET_DIAGNOSTICS") return false;
  void diagnosticSnapshot()
    .then((snapshot) => sendResponse({ ok: true, snapshot }))
    .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "Could not create diagnostics." }));
  return true;
});

const observer = new MutationObserver(scheduleScan);
observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
window.addEventListener("focus", scheduleScan);
chrome.storage.onChanged.addListener((_changes, area) => { if (area === "local") scheduleScan(); });
scheduleScan();
