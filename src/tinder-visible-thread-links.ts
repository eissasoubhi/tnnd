/** Only collect same-origin links visible in the Tinder Messages sidebar.
 * A visible thread link is not evidence that a match was created recently. */
export function visibleTinderThreadRefs(root: ParentNode = document): string[] {
  const seen = new Set<string>();
  for (const anchor of Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href*="/app/messages/"]'))) {
    if (anchor.offsetParent === null) continue;
    try {
      const url = new URL(anchor.href, location.href);
      if (url.origin !== location.origin || !url.pathname.startsWith("/app/messages/")) continue;
      const ref = decodeURIComponent(url.pathname.slice("/app/messages/".length)).replace(/\/+$/, "").trim();
      if (ref && ref.length <= 512) seen.add(ref);
    } catch { /* ignore broken/untrusted URLs */ }
    if (seen.size >= 500) break;
  }
  return Array.from(seen);
}
