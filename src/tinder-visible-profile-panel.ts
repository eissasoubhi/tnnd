import { parseVisibleMatchHeading, type VisibleTinderMatchIdentity } from "./tinder-chat-identity";
import type { TinderProfileCaptureInput } from "./tinder-match-profile-capture";

/** Verified against an Oct 2026 redacted Tinder diagnostic:
 * opened conversation owns aside .chatProfile .profileContent, whose
 * profile cards use h2 headings and answer lists use h3 headings.
 * An unrelated profile or unrecognized panel must return null.
 */
const PROFILE_SELECTOR = "aside .chatProfile .profileContent";
const CARD_SELECTOR = ".profileCard__card";
const ROUTE_PREFIX = "/app/messages/";

function text(node: Element | null | undefined, maxLength = 500): string {
  const value = (node instanceof HTMLElement ? node.innerText : node?.textContent ?? "")
    .replace(/\s+/g, " ").trim();
  if (!value || /^\[(text|redacted(?:-[a-z-]+)?)\]$/i.test(value)) return "";
  return value.slice(0, maxLength);
}
function norm(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
function matchingHeading(heading: Element, values: readonly string[]): boolean {
  return values.includes(norm(text(heading, 80)));
}
function currentRef(pathname: string): string {
  if (!pathname.startsWith(ROUTE_PREFIX)) return "";
  try { return decodeURIComponent(pathname.slice(ROUTE_PREFIX.length)).replace(/\/+$/, ""); }
  catch { return ""; }
}
function valueForHeading(root: Element, headings: readonly string[]): Element | null {
  const heading = Array.from(root.querySelectorAll("h2"))
    .find(node => matchingHeading(node, headings));
  return heading?.parentElement?.nextElementSibling ?? null;
}
function boundedHeight(value: string): number | undefined {
  const found = /\b(1\d{2}|2[0-2]\d|230)\s*(?:cm|centim[eè]tres?)\b/i.exec(value);
  const cm = found ? Number(found[1]) : undefined;
  return cm && cm >= 100 && cm <= 230 ? cm : undefined;
}
export function readVisibleTinderProfilePanel(
  conversationRef: string,
  identity: VisibleTinderMatchIdentity,
  doc: Document = document,
  pathname = location.pathname
): TinderProfileCaptureInput | null {
  if (!identity.firstName || !conversationRef || currentRef(pathname) !== conversationRef) return null;
  const root = doc.querySelector<HTMLElement>(PROFILE_SELECTOR);
  const card = root?.querySelector<HTMLElement>(CARD_SELECTOR);
  const heading = root?.querySelector<HTMLElement>("h1");
  if (!root || !card || !heading || root.offsetParent === null) return null;
  const panelIdentity = parseVisibleMatchHeading(text(heading, 100));
  if (!panelIdentity.firstName || norm(panelIdentity.firstName) !== norm(identity.firstName)) return null;
  if (identity.age && panelIdentity.age && identity.age !== panelIdentity.age) return null;

  const lookingFor = valueForHeading(card, ["looking for", "je recherche", "recherche"]);
  const goalLabel = lookingFor?.querySelector("span:last-child") ?? lookingFor?.lastElementChild;
  const relationshipGoal = text(goalLabel, 120) || undefined;
  const bio = text(valueForHeading(card, ["about me", "a propos de moi", "à propos de moi"]), 500) || undefined;
  const essentials = Array.from(card.querySelectorAll("section"))
    .find(section => Array.from(section.querySelectorAll("h2")).some(h => matchingHeading(h, ["essentials", "essentiel", "l'essentiel"])));
  const heightCm = essentials ? boundedHeight(text(essentials, 700)) : undefined;
  const interestsRoot = Array.from(card.querySelectorAll("section"))
    .find(section => Array.from(section.querySelectorAll("h2")).some(h => matchingHeading(h, ["interests", "centres d'interet", "centres d'intérêt"])));
  const interests = interestsRoot
    ? Array.from(interestsRoot.querySelectorAll("ul > li")).map(li => text(li, 100)).filter(Boolean).slice(0, 20)
    : [];
  const prompts: NonNullable<TinderProfileCaptureInput["prompts"]> = [];
  for (const section of Array.from(card.querySelectorAll("section"))) {
    const label = text(section.querySelector("h2"), 80);
    if (!["going out", "my weekends", "me & my phone"].includes(norm(label))) continue;
    for (const item of Array.from(section.querySelectorAll("ul > li"))) {
      const question = text(item.querySelector("h3"), 120);
      const answer = text(item.querySelector("h3")?.nextElementSibling?.lastElementChild, 120);
      if (question && answer && prompts.length < 24) prompts.push({ section: label, question, answer });
    }
  }
  // Never derive height from a photo or hometown from a kilometre distance.
  if (!relationshipGoal && !bio && !heightCm && !interests.length && !prompts.length) return null;
  return {
    route: pathname.slice(0, 512),
    firstName: identity.firstName,
    age: identity.age ?? panelIdentity.age,
    photoUrl: identity.photoUrl,
    relationshipGoal, bio, heightCm,
    ...(interests.length ? { interests } : {}),
    ...(prompts.length ? { prompts } : {})
  };
}
