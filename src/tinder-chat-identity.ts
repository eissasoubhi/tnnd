/** Read only the explicitly opened Tinder thread's visible sidebar row.
 * Never derive a profile from a route ID, a different match, or a photo.
 * Selector coverage must still be verified against live, redacted diagnostics. */
export interface VisibleTinderMatchIdentity {
  firstName?: string;
  age?: number;
  photoUrl?: string;
}

const THREAD_PREFIX = "/app/messages/";
const PHOTO_HOST = /(^|\.)(?:gotinder|tinder)\.com$/i;

export function safeTinderPhotoUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim() || value.length > 1600) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || !PHOTO_HOST.test(url.hostname)) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

export function parseVisibleMatchHeading(value: unknown): { firstName?: string; age?: number } {
  if (typeof value !== "string" || /[\r\n]/.test(value)) return {};
  const normalized = value.replace(/\s+/g, " ").trim();
  const matched = /^(.+?)(?:\s+(\d{2,3}))?$/.exec(normalized);
  if (!matched) return {};
  const firstName = matched[1].trim();
  if (firstName.length < 2 || firstName.length > 80 || !/^[\p{L}][\p{L}\p{M}\p{N} ._'’\-]{0,79}$/u.test(firstName)) return {};
  const possibleAge = matched[2] ? Number(matched[2]) : undefined;
  return {
    firstName,
    ...(possibleAge && possibleAge >= 18 && possibleAge <= 120 ? { age: possibleAge } : {})
  };
}

function exactThreadAnchor(anchor: HTMLAnchorElement, conversationRef: string): boolean {
  try {
    const url = new URL(anchor.href, location.href);
    return url.origin === location.origin
      && url.pathname.startsWith(THREAD_PREFIX)
      && decodeURIComponent(url.pathname.slice(THREAD_PREFIX.length)).replace(/\/+$/, "") === conversationRef;
  } catch {
    return false;
  }
}

function visible(element: Element): boolean {
  return element instanceof HTMLElement && element.offsetParent !== null;
}

function matchedPhoto(anchor: HTMLAnchorElement): string | undefined {
  const images = Array.from(anchor.querySelectorAll<HTMLImageElement>("img"));
  for (const image of images) {
    if (!visible(image)) continue;
    const safe = safeTinderPhotoUrl(image.currentSrc || image.getAttribute("src"));
    if (safe) return safe;
  }
  // Tinder can render circular avatars through a CSS background, not an img.
  const elements = [anchor, ...Array.from(anchor.querySelectorAll<HTMLElement>("div,span")).slice(0, 15)];
  for (const element of elements) {
    if (!visible(element)) continue;
    const background = getComputedStyle(element).backgroundImage;
    const match = /^url\(["']?(https:\/\/[^"')]+)["']?\)$/.exec(background);
    const safe = safeTinderPhotoUrl(match?.[1]);
    if (safe) return safe;
  }
  return undefined;
}

export function readVisibleTinderMatchIdentity(conversationRef: string): VisibleTinderMatchIdentity {
  if (!conversationRef.trim() || !location.pathname.startsWith(THREAD_PREFIX)) return {};
  const currentRef = (() => {
    try { return decodeURIComponent(location.pathname.slice(THREAD_PREFIX.length)).replace(/\/+$/, ""); }
    catch { return ""; }
  })();
  if (conversationRef !== currentRef) return {};

  const anchor = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/app/messages/"]'))
    .find(candidate => visible(candidate) && exactThreadAnchor(candidate, conversationRef));
  if (!anchor) return {};

  const identityCandidates = [
    ...Array.from(anchor.querySelectorAll<HTMLElement>("h2,h3,h4,strong")).map(element => element.innerText),
    ...anchor.innerText.split(/\n/)
  ];
  const identity = identityCandidates.map(parseVisibleMatchHeading).find(candidate => candidate.firstName);
  if (!identity?.firstName) return {};

  // Age is accepted from this row, or from a visible conversation heading that
  // repeats exactly the SAME name (e.g. "Srim 30").
  let age = identity.age;
  if (!age) {
    for (const heading of Array.from(document.querySelectorAll<HTMLElement>("h1,h2,h3"))) {
      if (!visible(heading) || anchor.contains(heading)) continue;
      const parsed = parseVisibleMatchHeading(heading.innerText);
      if (parsed.firstName === identity.firstName && parsed.age) { age = parsed.age; break; }
    }
  }
  const photoUrl = matchedPhoto(anchor);
  return { firstName: identity.firstName, ...(age ? { age } : {}), ...(photoUrl ? { photoUrl } : {}) };
}
