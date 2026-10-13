/** Tinder content scripts are invalidated when a locally unpacked MV3
 * extension is reloaded while the Tinder tab stays open. A Chrome message
 * "Receiving end does not exist" means there was NO listener, not that a
 * Tinder send succeeded. Never silently retry a potentially submitted send.
 */
export const TINDER_BRIDGE_MISSING =
  "TNND cannot reach its content script on Tinder. Reload the TNND extension at chrome://extensions, refresh the EXISTING Tinder tab once, and retry. No message was sent by this operation.";

export function isMissingTinderReceiver(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error ?? "");
  return /Receiving end does not exist|Could not establish connection.*Receiving end|No tab with id/i.test(text);
}

export function describeTinderBridgeError(error: unknown): string {
  return isMissingTinderReceiver(error)
    ? TINDER_BRIDGE_MISSING
    : error instanceof Error ? error.message : "Tinder connection failed.";
}

export async function assertTinderContentBridge(tabId: number): Promise<void> {
  try {
    // Read-only ping: available in Tinder's chat-bridge.ts on Matches and Messages.
    const response = await chrome.tabs.sendMessage(tabId, {
      type: "TNND_GET_THREAD_INFO"
    }) as { ok?: boolean } | undefined;
    if (response?.ok !== true) {
      throw new Error("TNND Tinder content script is not responding. Refresh the Tinder tab and retry.");
    }
  } catch (error) {
    throw new Error(describeTinderBridgeError(error));
  }
}
