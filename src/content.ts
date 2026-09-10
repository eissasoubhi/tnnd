import { getConfig } from "./storage";
import { TinderDomAdapter } from "./tinder-adapter";
import type { GenerateRequest, GenerateResponse } from "./types";

const STATE_KEY = "tnnd.autoState";
const adapter = new TinderDomAdapter();
let busy = false;
let scanTimer: number | undefined;

interface AutoState {
  date: string;
  dailyCount: number;
  processed: Record<string, number>;
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

async function generateReply(context: string): Promise<string> {
  const request: GenerateRequest = { type: "GENERATE_SUGGESTIONS", context, purpose: "auto", replyCount: 1 };
  const response = (await chrome.runtime.sendMessage(request)) as GenerateResponse;
  if (!response.ok || !response.suggestions?.[0]) throw new Error(response.error ?? "TNND received no automatic reply.");
  return response.suggestions[0];
}

async function scan(): Promise<void> {
  if (busy) return;
  const config = await getConfig();
  if (!config.automation.enabled) return;
  if (config.automation.quietHoursEnabled && insideQuietHours(config.automation.quietStart, config.automation.quietEnd)) return;

  const snapshot = adapter.read();
  if (!snapshot) return;
  const state = await getState();
  if (state.processed[snapshot.latestIncomingKey]) return;
  if (state.dailyCount >= config.automation.maxAutoRepliesPerDay) return;

  busy = true;
  try {
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, config.automation.replyDelaySeconds) * 1000));
    const current = adapter.read();
    if (!current || current.latestIncomingKey !== snapshot.latestIncomingKey) return;
    const reply = await generateReply(current.context);
    await adapter.send(reply);
    const freshState = await getState();
    freshState.processed[current.latestIncomingKey] = Date.now();
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

const observer = new MutationObserver(scheduleScan);
observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
window.addEventListener("focus", scheduleScan);
chrome.storage.onChanged.addListener((_changes, area) => { if (area === "local") scheduleScan(); });
scheduleScan();
