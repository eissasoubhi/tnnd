import {
  armNewMatchObservation, emptyNewMatchState, isNewMatchObservationState,
  observeNewMatchLinks, stopNewMatchObservation
} from "./tinder-new-match-observation";

const KEY = "tnnd.newMatchLinkObservation.v2";

type Request =
  | { type: "TNND_NEW_MATCH_OBSERVATION_STATE" }
  | { type: "TNND_NEW_MATCH_OBSERVATION_START"; refs: string[] }
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

async function read() {
  const value = (await chrome.storage.local.get(KEY))[KEY];
  return isNewMatchObservationState(value) ? value : emptyNewMatchState();
}
async function write(value: ReturnType<typeof emptyNewMatchState>) {
  await chrome.storage.local.set({ [KEY]: value });
  return value;
}
let pendingWrite = Promise.resolve();
function serialized<T>(job: () => Promise<T>): Promise<T> {
  const result = pendingWrite.then(job, job);
  pendingWrite = result.then(() => undefined, () => undefined);
  return result;
}

chrome.runtime.onMessage.addListener((message: Request, sender, respond) => {
  if (!message || typeof message !== "object" || !("type" in message)) return false;
  const types = ["TNND_NEW_MATCH_OBSERVATION_STATE", "TNND_NEW_MATCH_OBSERVATION_START", "TNND_NEW_MATCH_OBSERVATION_STOP", "TNND_NEW_MATCH_LINKS_SEEN"];
  if (!types.includes(message.type)) return false;
  if (!trusted(sender)) { respond({ ok: false, error: "untrusted_sender" }); return false; }
  if (message.type === "TNND_NEW_MATCH_OBSERVATION_STATE") {
    void read().then(state => respond({ ok: true, state })).catch(() => respond({ ok: false, error: "read_failed" }));
    return true;
  }
  if (message.type === "TNND_NEW_MATCH_OBSERVATION_START" && popupSender(sender)) {
    void serialized(async () => {
      if (!Array.isArray(message.refs) || !message.refs.length || message.refs.length > 500) throw new Error("Open the Tinder Messages inbox with visible conversation links before starting.");
      return write(armNewMatchObservation(message.refs));
    }).then(state => respond({ ok: true, state }))
      .catch(error => respond({ ok: false, error: error instanceof Error ? error.message : "arm_failed" }));
    return true;
  }
  if (message.type === "TNND_NEW_MATCH_OBSERVATION_STOP" && popupSender(sender)) {
    void serialized(async () => write(stopNewMatchObservation(await read())))
      .then(state => respond({ ok: true, state }))
      .catch(() => respond({ ok: false, error: "stop_failed" }));
    return true;
  }
  if (message.type === "TNND_NEW_MATCH_LINKS_SEEN" && tinderSender(sender)) {
    void serialized(async () => {
      if (!Array.isArray(message.refs) || message.refs.length > 500) throw new Error("invalid_refs");
      const state = await read();
      if (!state.enabled) return state;
      return write(observeNewMatchLinks(state, message.refs));
    }).then(state => respond({ ok: true, pendingCount: state.pendingRefs.length }))
      .catch(() => respond({ ok: false, error: "observe_failed" }));
    return true;
  }
  respond({ ok: false, error: "unexpected_sender_for_operation" });
  return false;
});
