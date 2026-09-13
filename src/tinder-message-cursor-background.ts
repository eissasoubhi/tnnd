const CURSOR_KEY = "tnnd.tinderMessageCursors";
const MAX_CURSORS = 100;

type CursorMap = Record<string, string>;

type CursorRequest =
  | { type: "TNND_GET_TINDER_MESSAGE_CURSOR"; conversationRef: string }
  | { type: "TNND_SAVE_TINDER_MESSAGE_CURSOR"; conversationRef: string; cursor: string }
  | { type: "TNND_CLEAR_TINDER_MESSAGE_CURSOR"; conversationRef: string };

function senderAllowed(sender: chrome.runtime.MessageSender): boolean {
  if (sender.id !== chrome.runtime.id) return false;
  const url = sender.url ?? "";
  return url.startsWith(`chrome-extension://${chrome.runtime.id}/`)
    || url.startsWith("https://tinder.com/")
    || url.startsWith("https://www.tinder.com/");
}

function normalizedValue(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 500) : "";
}

function normalizeMap(value: unknown): CursorMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([conversationRef, cursor]) => [normalizedValue(conversationRef), normalizedValue(cursor)] as const)
    .filter(([conversationRef, cursor]) => Boolean(conversationRef && cursor))
    .slice(-MAX_CURSORS);
  return Object.fromEntries(entries);
}

async function readMap(): Promise<CursorMap> {
  const raw = (await chrome.storage.local.get(CURSOR_KEY))[CURSOR_KEY];
  return normalizeMap(raw);
}

async function saveCursor(conversationRefValue: unknown, cursorValue: unknown): Promise<string> {
  const conversationRef = normalizedValue(conversationRefValue);
  const cursor = normalizedValue(cursorValue);
  if (!conversationRef || !cursor) throw new Error("invalid_tinder_message_cursor");
  const current = await readMap();
  const next = Object.fromEntries([...Object.entries(current).filter(([key]) => key !== conversationRef), [conversationRef, cursor]].slice(-MAX_CURSORS));
  await chrome.storage.local.set({ [CURSOR_KEY]: next });
  return cursor;
}

async function clearCursor(conversationRefValue: unknown): Promise<void> {
  const conversationRef = normalizedValue(conversationRefValue);
  if (!conversationRef) return;
  const current = await readMap();
  delete current[conversationRef];
  if (Object.keys(current).length) await chrome.storage.local.set({ [CURSOR_KEY]: current });
  else await chrome.storage.local.remove(CURSOR_KEY);
}

chrome.runtime.onMessage.addListener((message: CursorRequest, sender, sendResponse) => {
  if (!message || typeof message !== "object" || !("type" in message)) return false;
  if (!["TNND_GET_TINDER_MESSAGE_CURSOR", "TNND_SAVE_TINDER_MESSAGE_CURSOR", "TNND_CLEAR_TINDER_MESSAGE_CURSOR"].includes(message.type)) return false;
  if (!senderAllowed(sender)) {
    sendResponse({ ok: false, error: "unexpected_message_cursor_sender" });
    return false;
  }

  if (message.type === "TNND_GET_TINDER_MESSAGE_CURSOR") {
    void readMap()
      .then((cursors) => sendResponse({ ok: true, cursor: cursors[normalizedValue(message.conversationRef)] ?? null }))
      .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "message_cursor_read_failed" }));
    return true;
  }

  if (message.type === "TNND_SAVE_TINDER_MESSAGE_CURSOR") {
    void saveCursor(message.conversationRef, message.cursor)
      .then((cursor) => sendResponse({ ok: true, cursor }))
      .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "message_cursor_save_failed" }));
    return true;
  }

  void clearCursor(message.conversationRef)
    .then(() => sendResponse({ ok: true }))
    .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "message_cursor_clear_failed" }));
  return true;
});
