type LoadResponse = { ok: true; cursor: string | null } | { ok: false; error?: string };
type SaveResponse = { ok: true; cursor: string } | { ok: false; error?: string };
type ClearResponse = { ok: true } | { ok: false; error?: string };

function runtimeError(message: string): Error {
  return new Error(message || "tinder_message_cursor_storage_failed");
}

export async function loadTinderMessageCursor(conversationRef: string): Promise<string | null> {
  const response = await chrome.runtime.sendMessage({ type: "TNND_GET_TINDER_MESSAGE_CURSOR", conversationRef }) as LoadResponse;
  if (!response?.ok) throw runtimeError(response?.error ?? "message_cursor_read_failed");
  return typeof response.cursor === "string" && response.cursor.trim() ? response.cursor.trim() : null;
}

export async function saveTinderMessageCursor(conversationRef: string, cursor: string): Promise<string> {
  const response = await chrome.runtime.sendMessage({ type: "TNND_SAVE_TINDER_MESSAGE_CURSOR", conversationRef, cursor }) as SaveResponse;
  if (!response?.ok) throw runtimeError(response?.error ?? "message_cursor_save_failed");
  return response.cursor;
}

export async function clearTinderMessageCursor(conversationRef: string): Promise<void> {
  const response = await chrome.runtime.sendMessage({ type: "TNND_CLEAR_TINDER_MESSAGE_CURSOR", conversationRef }) as ClearResponse;
  if (!response?.ok) throw runtimeError(response?.error ?? "message_cursor_clear_failed");
}
