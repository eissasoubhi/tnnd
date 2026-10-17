import { getBackendSession } from "./storage";
import {
  readConversationFocusLedger, startConversationFocus,
  heartbeatConversationFocus, stopConversationFocus,
  remainingConversationFocusSeconds
} from "./tinder-smart-swipe-chat-focus-budget";
import type { SmartAutoSwipeConfig } from "./tinder-smart-auto-swipe-policy";

const KEY = "tnnd.smartSwipeFocusedChat.v1:";
const API = "http://127.0.0.1:4000";
interface Settings extends SmartAutoSwipeConfig { timeZone: string }
let cached: { userId: string; untilMs: number; settings: Settings } | null = null;
let serialized: Promise<void> = Promise.resolve();
async function configuredFor(userId: string): Promise<Settings | null> {
  const now = Date.now();
  if (cached && cached.userId === userId && cached.untilMs > now) return cached.settings;
  const session = await getBackendSession();
  if (!session || session.user.id !== userId) return null;
  const response = await fetch(API + "/api/v1/automation/smart-swipe", {
    headers: { authorization: "Bearer " + session.token }, cache: "no-store"
  });
  if (!response.ok) return null;
  const data = await response.json() as { settings?: Settings };
  if (!data.settings || typeof data.settings.timeZone !== "string") return null;
  cached = { userId, untilMs: now + 15_000, settings: data.settings };
  return data.settings;
}

export function isObservedFocusedChat(
  state: {
    enabled: boolean; mode: string; activeConversationRef: string | null;
    activeConversationUntil: string | null; phase: string;
  }, ref: string, nowMs: number
): boolean {
  if (!state.enabled || state.mode !== "watcher" || state.activeConversationRef !== ref ||
      !state.activeConversationUntil || Date.parse(state.activeConversationUntil) <= nowMs)
    return false;
  // The waiting phase is idle, even when the watcher keeps a chat open.
  return ["incoming", "generating", "sending", "checking"].includes(state.phase);
}
function serialize<T>(job: () => Promise<T>): Promise<T> {
  const run = serialized.then(job, job);
  serialized = run.then(() => undefined, () => undefined);
  return run;
}

/** Called by the existing trusted Tinder-content heartbeat.
 * Max 30 sec per heartbeat; never count idle time between checks.
 */
export async function observeSmartSwipeConversationFocus(
  userId: string,
  ref: string,
  state: {
    enabled: boolean; mode: string; activeConversationRef: string | null;
    activeConversationUntil: string | null; phase: string;
  },
  nowMs = Date.now()
): Promise<void> {
  if (!userId || !ref) return;
  return serialize(async () => {
    const settings = await configuredFor(userId);
    if (!settings?.enabled || settings.maxActiveChatSecondsPerConversationPerDay === null) return;
    const key = KEY + userId;
    const stored = (await chrome.storage.local.get(key))[key];
    const ledger = readConversationFocusLedger(stored, nowMs, settings.timeZone);
    if (!ledger) throw new Error("invalid_smart_swipe_chat_focus_ledger");
    const focused = isObservedFocusedChat(state, ref, nowMs);
    const next = !focused
      ? stopConversationFocus(ledger)
      : ledger.activeThread === ref
        ? heartbeatConversationFocus(ledger, ref, nowMs, settings)
        : startConversationFocus(stopConversationFocus(ledger), ref, nowMs);
    if (!next) throw new Error("invalid_focused_chat");
    await chrome.storage.local.set({ [key]: next });
  });
}

/** Fails closed for a corrupt/unavailable budget while the Smart Swipe policy
 * is enabled; does not alter the independent chat runner if it is disabled.
 */
export async function smartSwipeChatBudgetDecision(
  userId: string, ref: string, nowMs = Date.now()
): Promise<"allowed" | "exhausted" | "unavailable"> {
  const settings = await configuredFor(userId);
  if (!settings) return "unavailable";
  if (!settings.enabled || settings.maxActiveChatSecondsPerConversationPerDay === null) return "allowed";
  const stored = (await chrome.storage.local.get(KEY + userId))[KEY + userId];
  const ledger = readConversationFocusLedger(stored, nowMs, settings.timeZone);
  if (!ledger) return "unavailable";
  return remainingConversationFocusSeconds(ledger, ref, settings) > 0 ? "allowed" : "exhausted";
}
