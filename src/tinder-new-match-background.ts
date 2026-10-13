import {
  armNewMatchObservation, armExistingMatches, emptyNewMatchState, isNewMatchObservationState,
  observeNewMatchLinks, stopNewMatchObservation
} from "./tinder-new-match-observation";

import { getBackendSession, getConfig } from "./storage";
import { finishNewMatchAttempt } from "./tinder-new-match-observation";
import { recoverVerifiedPreSendFailures } from "./tinder-first-message-recovery";
const KEY = "tnnd.newMatchLinkObservation.v3";

type Request =
  | { type: "TNND_NEW_MATCH_OBSERVATION_STATE" }
  | { type: "TNND_NEW_MATCH_OBSERVATION_START"; refs: string[] }
  | { type: "TNND_EXISTING_MATCHES_START"; refs: string[]; tabId: number }
  | { type: "TNND_NEW_MATCH_OBSERVATION_STOP" }
  | { type: "TNND_NEW_MATCH_LINKS_SEEN"; refs: string[] };

function trusted(sender: chrome.runtime.MessageSender): boolean {
  if (sender.id !== chrome.runtime.id) return false;
  const url = sender.url ?? "";
  return url.startsWith(`chrome-extension://${chrome.runtime.id}/`)
    || url.startsWith("https://tinder.com/") || url.startsWith("https://www.tinder.com/");
}
function popupSender(sender: chrome.runtime.MessageSender): boolean {
  return sender.url === `chrome-extension://${chrome.runtime.id}/popup.html`;
}
function tinderSender(sender: chrome.runtime.MessageSender): boolean {
  try {
    const url = new URL(sender.url ?? "");
    return (url.origin === "https://tinder.com" || url.origin === "https://www.tinder.com")
      && (url.pathname === "/app/messages" || url.pathname === "/app/matches" || url.pathname === "/app/recs"
        || url.pathname.startsWith("/app/messages/"));
  } catch { return false; }
}

export async function readNewMatchState() {
  const value = (await chrome.storage.local.get(KEY))[KEY];
  return isNewMatchObservationState(value) ? value : emptyNewMatchState();
}
export async function saveNewMatchState(value: ReturnType<typeof emptyNewMatchState>) {
  await chrome.storage.local.set({ [KEY]: value });
  return value;
}
let pendingWrite = Promise.resolve();
function serialized<T>(job: () => Promise<T>): Promise<T> {
  const result = pendingWrite.then(job, job);
  pendingWrite = result.then(() => undefined, () => undefined);
  return result;
}

/** Protected service worker queue operations, never directly exposed to Tinder pages. */
export async function newMatchSendPermission(ref: string, tabId: number): Promise<boolean> {
  const state = await readNewMatchState();
  const session = await getBackendSession();
  const stored = (await chrome.storage.local.get("tnnd.newMatchOwnedTab.v1"))["tnnd.newMatchOwnedTab.v1"] as { tabId?: number; ref?: string; userId?: string } | undefined;
  return Boolean(state.enabled && state.autoSendEnabled && session?.user.id === state.userId
    && state.pendingRefs.includes(ref) && stored?.tabId === tabId && stored?.ref === ref && stored?.userId === session?.user.id);
}
export async function updateNewMatchAttempt(ref: string, sent: boolean, result: string): Promise<void> {
  await serialized(async () => {
    const state = await readNewMatchState();
    await saveNewMatchState(finishNewMatchAttempt(state, ref, sent, result));
  });
}
chrome.runtime.onMessage.addListener((message: Request, sender, respond) => {
  if (!message || typeof message !== "object" || !("type" in message)) return false;
  const types = ["TNND_NEW_MATCH_OBSERVATION_STATE", "TNND_NEW_MATCH_OBSERVATION_START", "TNND_EXISTING_MATCHES_START", "TNND_NEW_MATCH_OBSERVATION_STOP", "TNND_NEW_MATCH_LINKS_SEEN"];
  if (!types.includes(message.type)) return false;
  if (!trusted(sender)) { respond({ ok: false, error: "untrusted_sender" }); return false; }
  if (message.type === "TNND_NEW_MATCH_OBSERVATION_STATE") {
    void readNewMatchState().then(state => respond({ ok: true, state })).catch(() => respond({ ok: false, error: "read_failed" }));
    return true;
  }
  if (message.type === "TNND_NEW_MATCH_OBSERVATION_START" && popupSender(sender)) {
    void serialized(async () => {
      if (!Array.isArray(message.refs) || message.refs.length < 2 || message.refs.length > 500) throw new Error("Select the Tinder Matches tab with at least two loaded match tiles before starting.");
      const existingRunner = (await chrome.storage.local.get("tnnd.globalExistingRunner.v2"))["tnnd.globalExistingRunner.v2"] as { enabled?: boolean } | undefined;
      if (existingRunner?.enabled) throw new Error("Global existing chats are running. Stop that runner before starting new-match AI: Tinder supports a single tab.");
      const session = await getBackendSession();
      const config = await getConfig();
      if (!session) throw new Error("Connect your TNND account before enabling new-match messages.");
      if (!config.automation.enabled) throw new Error("Enable automatic replies in TNND Options first.");
      const next = await saveNewMatchState(armNewMatchObservation(message.refs, session.user.id));
      await chrome.alarms.create("tnnd.globalNewMatches.cycle", { periodInMinutes: 1 });
      return next;
    }).then(state => respond({ ok: true, state }))
      .catch(error => respond({ ok: false, error: error instanceof Error ? error.message : "arm_failed" }));
    return true;
  }
  if (message.type === "TNND_EXISTING_MATCHES_START" && popupSender(sender)) {
    void serialized(async () => {
      if (!Array.isArray(message.refs) || message.refs.length < 1 || message.refs.length > 500) throw new Error("Select Matches to see the existing Tinder match tiles.");
      const existing = (await chrome.storage.local.get("tnnd.globalExistingRunner.v2"))["tnnd.globalExistingRunner.v2"] as { enabled?: boolean } | undefined;
      if (existing?.enabled) throw new Error("Stop global existing conversations before launching first messages to existing matches.");
      const session = await getBackendSession();
      const config = await getConfig();
      if (!session || !config.automation.enabled) throw new Error("Connect TNND and enable automatic replies in Options first.");
      const tinder = await chrome.tabs.query({ url: ["https://tinder.com/*", "https://www.tinder.com/*"] });
      if (tinder.length !== 1 || tinder[0].id !== message.tabId) throw new Error("Only one existing Tinder tab can be used for this batch.");
      const prior = await readNewMatchState();
      // Previous versions counted a denied SPA permission as a failed match,
      // before any Tinder Send. Recover only when BOTH send journals prove that
      // no first-message request was ever attempted. A fresh Start click is
      // explicit consent, never an automatic background retry.
      const journal = await chrome.storage.local.get([
        "tnnd.firstMessageAttempts.v1", "tnnd.autoState", "tnnd.newMatchDailyAttempts.v1"
      ]);
      const claims = journal["tnnd.firstMessageAttempts.v1"];
      const auto = journal["tnnd.autoState"];
      const durable = new Set<string>(
        claims && typeof claims === "object" && !Array.isArray(claims) ? Object.keys(claims) : []
      );
      const processed = new Set<string>(
        auto && typeof auto === "object" && auto.processed
          && typeof auto.processed === "object" ? Object.keys(auto.processed) : []
      );
      const recovery = prior.userId === session.user.id
        ? recoverVerifiedPreSendFailures(prior, durable, processed)
        : { prior, recovered: [] as string[] };
      const daily = journal["tnnd.newMatchDailyAttempts.v1"] as { date?: string; refs?: string[] } | undefined;
      if (recovery.recovered.length && daily && Array.isArray(daily.refs)) {
        const recovered = new Set(recovery.recovered);
        await chrome.storage.local.set({
          "tnnd.newMatchDailyAttempts.v1": {
            ...daily, refs: daily.refs.filter(ref => !recovered.has(ref))
          }
        });
      }
      const state = await saveNewMatchState({
        ...armExistingMatches(message.refs, session.user.id, recovery.prior),
        ...(recovery.recovered.length ? {
          lastResult: `${recovery.recovered.length} previously skipped matches safely restored; no prior Send attempt found.`
        } : {})
      });
      await chrome.storage.local.set({ "tnnd.newMatchOwnedTab.v1": { tabId: message.tabId, userId: session.user.id, ref: null } });
      await chrome.alarms.create("tnnd.globalNewMatches.cycle", { periodInMinutes: 0.5 });
      return state;
    }).then(state => respond({ ok: true, state }))
      .catch(error => respond({ ok: false, error: error instanceof Error ? error.message : "start_existing_matches_failed" }));
    return true;
  }
  if (message.type === "TNND_NEW_MATCH_OBSERVATION_STOP" && popupSender(sender)) {
    void serialized(async () => {
      const next = await saveNewMatchState(stopNewMatchObservation(await readNewMatchState()));
      await chrome.alarms.clear("tnnd.globalNewMatches.cycle");
      const ownedKey = "tnnd.newMatchOwnedTab.v1";
      const owned = (await chrome.storage.local.get(ownedKey))[ownedKey] as { tabId?: number; ref?: string } | undefined;
      if (owned?.tabId) {
        try {
          const tab = await chrome.tabs.get(owned.tabId);
          // Never close the user\'s sole Tinder tab on Stop. Keep the existing
          // session and chat visible; the worker permission is revoked below.
          void tab;
        } catch { /* already closed */ }
      }
      await chrome.storage.local.remove(ownedKey);
      return next;
    })
      .then(state => respond({ ok: true, state }))
      .catch(() => respond({ ok: false, error: "stop_failed" }));
    return true;
  }
  if (message.type === "TNND_NEW_MATCH_LINKS_SEEN" && tinderSender(sender)) {
    void serialized(async () => {
      if (!Array.isArray(message.refs) || message.refs.length > 500) throw new Error("invalid_refs");
      const state = await readNewMatchState();
      const session = await getBackendSession();
      if (!state.enabled || !session || session.user.id !== state.userId) return state;
      return saveNewMatchState(observeNewMatchLinks(state, message.refs));
    }).then(state => respond({ ok: true, pendingCount: state.pendingRefs.length }))
      .catch(() => respond({ ok: false, error: "observe_failed" }));
    return true;
  }
  respond({ ok: false, error: "unexpected_sender_for_operation" });
  return false;
});
