import { parseVisibleMatchHeading, type VisibleTinderMatchIdentity } from "./tinder-chat-identity.ts";
import type { TinderProfileCaptureInput } from "./tinder-match-profile-capture.ts";

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
  const heading = root?.querySelector<HTMLElement>("h1")
    ?? root?.closest(".chatProfile")?.querySelector<HTMLElement>("h1");
  if (!root || !heading || root.offsetParent === null) return null;
  const panelIdentity = parseVisibleMatchHeading(text(heading, 100));
  if (!panelIdentity.firstName || norm(panelIdentity.firstName) !== norm(identity.firstName)) return null;
  if (identity.age && panelIdentity.age && identity.age !== panelIdentity.age) return null;

  // Tinder renders separate cards for Looking For / About Me / Essentials.
  // Scoping everything to the first card would silently lose later fields.
  const cards = Array.from(root.querySelectorAll<HTMLElement>(CARD_SELECTOR));
  if (!cards.length) return null;
  const sectionFor = (labels: readonly string[]): HTMLElement | null =>
    cards.find(card => Array.from(card.querySelectorAll("h2"))
      .some(h => matchingHeading(h, labels))) ?? null;
  const sectionBody = (card: HTMLElement | null, limit: number): string => {
    if (!card) return "";
    const blocks = Array.from(card.querySelectorAll<HTMLElement>("p, li, [data-testid]"))
      .map(node => text(node, limit)).filter(Boolean);
    // Prefer explicit content nodes, never the label itself.
    const headingText = Array.from(card.querySelectorAll("h2")).map(node => norm(text(node, 80)));
    return (blocks.find(block => !headingText.includes(norm(block))) || "").slice(0, limit);
  };

  const goalCard = sectionFor(["looking for", "je recherche", "recherche"]);
  const relationshipGoal = sectionBody(goalCard, 120) || undefined;
  const bioCard = sectionFor(["about me", "a propos de moi", "à propos de moi"]);
  const bio = sectionBody(bioCard, 500) || undefined;
  const essentialsCard = sectionFor(["essentials", "essentiel", "l'essentiel"]);
  const heightCm = essentialsCard ? boundedHeight(text(essentialsCard, 700)) : undefined;

  const interestsCard = sectionFor(["interests", "centres d'interet", "centres d'intérêt"]);
  const interests = interestsCard
    ? Array.from(interestsCard.querySelectorAll("ul > li")).map(li => text(li, 100)).filter(Boolean).slice(0, 20)
    : [];
  const prompts: NonNullable<TinderProfileCaptureInput["prompts"]> = [];
  for (const card of cards) {
    const label = text(card.querySelector("h2"), 80);
    if (!["going out", "my weekends", "me & my phone"].includes(norm(label))) continue;
    for (const item of Array.from(card.querySelectorAll("ul > li"))) {
      const question = text(item.querySelector("h3"), 120);
      const answer = text(item.querySelector("h3")?.nextElementSibling, 120);
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
