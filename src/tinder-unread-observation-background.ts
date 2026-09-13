import { isUnreadObservationState, type TinderUnreadObservationState } from "./tinder-unread-observation-state";

const UNREAD_OBSERVATION_KEY = "tnnd.tinderUnreadObservationState";

type UnreadObservationRequest =
  | { type: "TNND_GET_TINDER_UNREAD_OBSERVATIONS" }
  | { type: "TNND_SAVE_TINDER_UNREAD_OBSERVATIONS"; state: unknown }
  | { type: "TNND_CLEAR_TINDER_UNREAD_OBSERVATIONS" };

function senderAllowed(sender: chrome.runtime.MessageSender): boolean {
  if (sender.id !== chrome.runtime.id) return false;
  const url = sender.url ?? "";
  return url.startsWith(`chrome-extension://${chrome.runtime.id}/`)
    || url.startsWith("https://tinder.com/")
    || url.startsWith("https://www.tinder.com/");
}

async function readState(): Promise<TinderUnreadObservationState | null> {
  const raw = (await chrome.storage.local.get(UNREAD_OBSERVATION_KEY))[UNREAD_OBSERVATION_KEY];
  return isUnreadObservationState(raw) ? raw : null;
}

async function saveState(value: unknown): Promise<TinderUnreadObservationState> {
  if (!isUnreadObservationState(value)) throw new Error("invalid_tinder_unread_observation_state");
  const state: TinderUnreadObservationState = {
    ...value,
    entries: value.entries.slice(0, 50)
  };
  await chrome.storage.local.set({ [UNREAD_OBSERVATION_KEY]: state });
  return state;
}

async function clearState(): Promise<void> {
  await chrome.storage.local.remove(UNREAD_OBSERVATION_KEY);
}

chrome.runtime.onMessage.addListener((message: UnreadObservationRequest, sender, sendResponse) => {
  if (!message || typeof message !== "object" || !("type" in message)) return false;
  if (!["TNND_GET_TINDER_UNREAD_OBSERVATIONS", "TNND_SAVE_TINDER_UNREAD_OBSERVATIONS", "TNND_CLEAR_TINDER_UNREAD_OBSERVATIONS"].includes(message.type)) return false;
  if (!senderAllowed(sender)) {
    sendResponse({ ok: false, error: "unexpected_unread_observation_sender" });
    return false;
  }

  if (message.type === "TNND_GET_TINDER_UNREAD_OBSERVATIONS") {
    void readState()
      .then((state) => sendResponse({ ok: true, state }))
      .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "unread_observation_read_failed" }));
    return true;
  }

  if (message.type === "TNND_SAVE_TINDER_UNREAD_OBSERVATIONS") {
    void saveState(message.state)
      .then((state) => sendResponse({ ok: true, state }))
      .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "unread_observation_save_failed" }));
    return true;
  }

  void clearState()
    .then(() => sendResponse({ ok: true }))
    .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "unread_observation_clear_failed" }));
  return true;
});
