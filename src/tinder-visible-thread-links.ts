/** Tinder can keep /app/messages/<thread> in the browser URL while the user
 * toggles the left sidebar between Matches and Messages.
 * The sidebar DOM — not location.pathname — is the source of truth here.
 * Observing a newly displayed tile does not prove the match was just created.
 */
export type VisibleTinderSidebarTab = "matches" | "messages" | "unknown";

const MATCH_SELECTOR = 'a.matchListItem[href*="/app/messages/"]';
const MESSAGE_SELECTOR = 'a.messageListItem[href*="/app/messages/"]';

function visible(element: Element): boolean {
  return element instanceof HTMLElement && element.offsetParent !== null;
}

export function classifyVisibleTinderSidebarRows(matchRows: number, messageRows: number): VisibleTinderSidebarTab {
  if (matchRows > 0 && messageRows === 0) return "matches";
  if (messageRows > 0 && matchRows === 0) return "messages";
  // Unobserved/loading/mixed sidebar states are not grounds for enrollment.
  return "unknown";
}

export function detectVisibleTinderSidebarTab(root: ParentNode = document): VisibleTinderSidebarTab {
  const matches = Array.from(root.querySelectorAll(MATCH_SELECTOR)).filter(visible).length;
  const messages = Array.from(root.querySelectorAll(MESSAGE_SELECTOR)).filter(visible).length;
  return classifyVisibleTinderSidebarRows(matches, messages);
}

/** Visible, same-origin thread references from the *Matches* tile grid only.
 * Excludes Tinder's "Likes You" tile and all unrelated anchors.
 * Caller must require the Matches tab before arming a baseline.
 */
export function visibleTinderThreadRefs(root: ParentNode = document): string[] {
  if (detectVisibleTinderSidebarTab(root) !== "matches") return [];
  const seen = new Set<string>();
  for (const anchor of Array.from(root.querySelectorAll<HTMLAnchorElement>(MATCH_SELECTOR))) {
    if (!visible(anchor)) continue;
    try {
      const url = new URL(anchor.href, location.href);
      if (url.origin !== location.origin || !url.pathname.startsWith("/app/messages/")) continue;
      const ref = decodeURIComponent(url.pathname.slice("/app/messages/".length)).replace(/\/+$/, "").trim();
      if (ref && ref.length <= 512 && !ref.includes("/")) seen.add(ref);
    } catch { /* reject broken/non-Tinder URLs */ }
    if (seen.size >= 500) break;
  }
  return Array.from(seen);
}

/** Snapshot only Tinder Messages sidebar anchors currently loaded and visible.
 * This does not claim to include lazy-loaded or off-screen conversation rows.
 * No Tinder network requests, scrolling, or actions are performed.
 */
export function visibleTinderMessageThreadRefs(root: ParentNode = document): string[] {
  if (detectVisibleTinderSidebarTab(root) !== "messages") return [];
  const refs = new Set<string>();
  for (const anchor of Array.from(root.querySelectorAll<HTMLAnchorElement>(MESSAGE_SELECTOR))) {
    if (!visible(anchor)) continue;
    try {
      const url = new URL(anchor.href, location.href);
      if (url.origin !== location.origin || !url.pathname.startsWith("/app/messages/")) continue;
      const ref = decodeURIComponent(url.pathname.slice("/app/messages/".length)).replace(/\/+$/, "").trim();
      if (/^[a-zA-Z0-9_-]{3,512}$/.test(ref)) refs.add(ref);
    } catch { /* ignore broken or unrelated anchors */ }
    if (refs.size >= 500) break;
  }
  return [...refs];
}
