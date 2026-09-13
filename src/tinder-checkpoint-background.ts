import { canResumeCheckpoint, type TinderSchedulerCheckpoint } from "./tinder-scheduler";

const CHECKPOINT_KEY = "tnnd.tinderSchedulerCheckpoint";

type CheckpointRequest =
  | { type: "TNND_GET_TINDER_CHECKPOINT" }
  | { type: "TNND_SAVE_TINDER_CHECKPOINT"; checkpoint: unknown }
  | { type: "TNND_CLEAR_TINDER_CHECKPOINT" };

function senderAllowed(sender: chrome.runtime.MessageSender): boolean {
  if (sender.id !== chrome.runtime.id) return false;
  const url = sender.url ?? "";
  return url.startsWith(`chrome-extension://${chrome.runtime.id}/`)
    || url.startsWith("https://tinder.com/")
    || url.startsWith("https://www.tinder.com/");
}

async function readCheckpoint(): Promise<TinderSchedulerCheckpoint | null> {
  const raw = (await chrome.storage.local.get(CHECKPOINT_KEY))[CHECKPOINT_KEY];
  return canResumeCheckpoint(raw) ? raw : null;
}

async function saveCheckpoint(value: unknown): Promise<TinderSchedulerCheckpoint> {
  if (!canResumeCheckpoint(value)) throw new Error("invalid_tinder_scheduler_checkpoint");
  await chrome.storage.local.set({ [CHECKPOINT_KEY]: value });
  return value;
}

async function clearCheckpoint(): Promise<void> {
  await chrome.storage.local.remove(CHECKPOINT_KEY);
}

chrome.runtime.onMessage.addListener((message: CheckpointRequest, sender, sendResponse) => {
  if (!message || typeof message !== "object" || !("type" in message)) return false;
  if (!["TNND_GET_TINDER_CHECKPOINT", "TNND_SAVE_TINDER_CHECKPOINT", "TNND_CLEAR_TINDER_CHECKPOINT"].includes(message.type)) return false;
  if (!senderAllowed(sender)) {
    sendResponse({ ok: false, error: "unexpected_checkpoint_sender" });
    return false;
  }

  if (message.type === "TNND_GET_TINDER_CHECKPOINT") {
    void readCheckpoint()
      .then((checkpoint) => sendResponse({ ok: true, checkpoint }))
      .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "checkpoint_read_failed" }));
    return true;
  }

  if (message.type === "TNND_SAVE_TINDER_CHECKPOINT") {
    void saveCheckpoint(message.checkpoint)
      .then((checkpoint) => sendResponse({ ok: true, checkpoint }))
      .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "checkpoint_save_failed" }));
    return true;
  }

  void clearCheckpoint()
    .then(() => sendResponse({ ok: true }))
    .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "checkpoint_clear_failed" }));
  return true;
});
