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

/** Reject generic UI headings before accepting a displayed match name. */
export function parseVerifiedChatName(label: string): { firstName?: string; age?: number } {
  const parsed = parseVisibleMatchHeading(label);
  const value = parsed.firstName?.toLowerCase();
  if (!value || /^(?:messages?|matches?|chat|conversation|profile|tinder|new match|send message|online|loading|messages sent)$/i.test(value)) return {};
  return parsed;
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
  const candidates = anchor ? [
    ...Array.from(anchor.querySelectorAll<HTMLElement>("h2,h3,h4,strong")).map(element => element.innerText),
    ...anchor.innerText.split(/\n/)
  ] : [];
  const rowIdentity = candidates.map(parseVisibleMatchHeading).find(candidate => candidate.firstName);
  // The Tinder Messages list can virtualize its rows: the currently opened
  // match name is often present in the verified chat header although its row
  // has scrolled out of the sidebar. Never search unrelated page headings.
  const chat = document.querySelector<HTMLElement>(".chat");
  const verifiedOpenChat = chat && visible(chat)
    && Array.from(chat.querySelectorAll<HTMLElement>(
      'textarea[placeholder*="message" i],textarea[aria-label*="message" i],[contenteditable="true"][role="textbox"]'
    )).some(visible);
  const activeHeadings = verifiedOpenChat ? [
    ...Array.from(chat!.querySelectorAll<HTMLElement>(
      "header h1,header h2,header h3,.chatHeader h1,.chatHeader h2"
    )).filter(visible),
    ...Array.from(document.querySelectorAll<HTMLElement>(
      "aside .chatProfile .profileContent h1"
    )).filter(visible)
  ] : [];
  const headingIdentity = activeHeadings
    .map(heading => parseVerifiedChatName(heading.innerText))
    .find(identity => identity.firstName);
  // If a visible sidebar row and live header disagree, do not cross-assign
  // somebody else's name to the active conversation.
  if (rowIdentity?.firstName && headingIdentity?.firstName
      && rowIdentity.firstName !== headingIdentity.firstName) return {};
  const identity = rowIdentity?.firstName ? rowIdentity : headingIdentity;
  if (!identity?.firstName) return {};
  const age = identity.age ?? (rowIdentity?.firstName === headingIdentity?.firstName
    ? headingIdentity?.age : undefined);
  const photoUrl = anchor ? matchedPhoto(anchor) : undefined;
  return { firstName: identity.firstName, ...(age ? { age } : {}), ...(photoUrl ? { photoUrl } : {}) };
}
