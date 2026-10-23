/** TNND Web stores its authentication in per-tab sessionStorage. Opening a
 * fresh popup link with target=_blank, even on the same origin, looks like a
 * logout because that new tab does not have the original tab's session.
 * Never copy tokens into URLs, extension storage or another origin.
 */
export const DEFAULT_TNND_WEB_ORIGIN = "http://127.0.0.1:5173";
export type TnndWebSection = "#workspace-settings-section" | "#smart-swipe-activity";

export function tnndWebSection(value: string): TnndWebSection | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" || url.port !== "5173" ||
        !["localhost", "127.0.0.1"].includes(url.hostname) ||
        url.pathname !== "/" || url.search ||
        !["#workspace-settings-section", "#smart-swipe-activity"].includes(url.hash))
      return null;
    return url.hash as TnndWebSection;
  } catch { return null; }
}

export interface TnndWebTab {
  id?: number;
  url?: string;
  windowId?: number;
  active?: boolean;
  lastAccessed?: number;
  incognito?: boolean;
}

export function isTnndWebOrigin(url: unknown): url is string {
  if (typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" && parsed.port === "5173" &&
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
  } catch { return false; }
}

/** Within the current browsing context, prefer the active/most-recent Web
 * tab. Crucially, keep that exact tab and hostname instead of opening a new
 * tab or silently switching 127.0.0.1 to localhost.
 */
export function pickTnndWebTab(
  tabs: readonly TnndWebTab[], incognito = false
): TnndWebTab | null {
  const valid = tabs.filter(tab =>
    Number.isSafeInteger(tab.id) && (tab.id ?? -1) >= 0 &&
    isTnndWebOrigin(tab.url) &&
    (tab.incognito === undefined || tab.incognito === incognito)
  );
  return valid.sort((a, b) =>
    Number(Boolean(b.active)) - Number(Boolean(a.active)) ||
    (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0)
  )[0] ?? null;
}

export function tnndWebTabUrl(existingUrl: string, section: TnndWebSection): string {
  if (!isTnndWebOrigin(existingUrl)) throw new Error("invalid_tnnd_web_origin");
  const target = new URL(existingUrl);
  target.hash = section;
  return target.href;
}
