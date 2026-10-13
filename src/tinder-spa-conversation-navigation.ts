/** SPA navigation must use only a currently rendered Tinder Messages link.
 * Never emulate a click by pushing history or constructing synthetic events.
 * A missing link is an explicit error, not permission for a full page reload.
 */
export function validTinderChatLink(href: string, ref: string, origin: string): boolean {
  if (!ref || ref.includes("/") || ref.length > 512) return false;
  try {
    const url = new URL(href, origin);
    return url.origin === origin && decodeURIComponent(url.pathname) === "/app/messages/" + ref;
  } catch { return false; }
}

export function selectVisibleTinderChatLink(
  root: ParentNode, ref: string, origin: string
): HTMLAnchorElement | null {
  const anchors = Array.from(root.querySelectorAll<HTMLAnchorElement>('a.messageListItem[href*="/app/messages/"]'));
  return anchors.find(anchor =>
    validTinderChatLink(anchor.href, ref, origin) &&
    anchor.isConnected && anchor.getClientRects().length > 0
  ) ?? null;
}
