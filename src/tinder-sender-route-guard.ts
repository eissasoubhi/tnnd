/** Chrome's MessageSender.url is the ORIGINAL document URL, not necessarily
 * the live SPA location after Tinder's client-side route changes.
 * Compare a content-script request to Chrome's CURRENT tab URL instead.
 */
export function senderMatchesLiveTinderThread(
  senderUrl: string | undefined,
  liveTabUrl: string | undefined,
  ref: string,
  frameId: number | undefined
): boolean {
  if (!ref || ref.length > 512 || ref.includes("/") || !liveTabUrl || !senderUrl) return false;
  if (frameId !== undefined && frameId !== 0) return false;
  try {
    const sender = new URL(senderUrl);
    const live = new URL(liveTabUrl);
    const allowed = ["https://tinder.com", "https://www.tinder.com"];
    if (!allowed.includes(sender.origin) || sender.origin !== live.origin) return false;
    const prefix = "/app/messages/";
    if (!live.pathname.startsWith(prefix)) return false;
    return decodeURIComponent(live.pathname.slice(prefix.length)).replace(/\/+$/, "") === ref;
  } catch {
    return false;
  }
}

export async function currentAuthorizedTinderThread(
  sender: chrome.runtime.MessageSender,
  ref: string
): Promise<boolean> {
  if (sender.id !== chrome.runtime.id || typeof sender.tab?.id !== "number") return false;
  try {
    const liveTab = await chrome.tabs.get(sender.tab.id);
    if (liveTab.id !== sender.tab.id) return false;
    return senderMatchesLiveTinderThread(sender.url, liveTab.url, ref, sender.frameId);
  } catch { return false; }
}
