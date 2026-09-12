export interface ConversationSnapshot {
  threadKey: string;
  context: string;
  latestIncomingKey: string;
  latestIncomingText: string;
}

export type TinderViewState = "discovery" | "inbox" | "conversation" | "unknown";

export interface TinderNavigationCandidate {
  kind: "discovery" | "inbox" | "conversation" | "unknown";
  tag: string;
  href: string | null;
  ariaLabel: string | null;
  testId: string | null;
  visible: boolean;
}

export interface TinderSelectorDiagnostics {
  view: TinderViewState;
  viewSignals: string[];
  composerSelector: string | null;
  composerFound: boolean;
  messageSelectorMatches: Array<{ selector: string; count: number }>;
  visibleCandidateCount: number;
  directionCounts: { me: number; them: number; unknown: number };
  sendButtonFound: boolean;
  navigationCandidates: TinderNavigationCandidate[];
  threadKeyHash: string;
}

type Direction = "me" | "them" | "unknown";

const COMPOSER_SELECTORS = [
  'textarea[placeholder*="message" i]',
  'textarea[aria-label*="message" i]',
  '[contenteditable="true"][role="textbox"]'
];

const MESSAGE_SELECTORS = [
  '[data-testid*="message" i]',
  '[data-testid*="chat" i] [role="listitem"]',
  '[aria-label*="message" i]'
];

const INBOX_SELECTORS = [
  'a[href*="/app/messages" i]',
  'a[href*="/messages" i]',
  '[data-testid*="matchList" i]',
  '[data-testid*="messageList" i]',
  '[aria-label*="messages" i]',
  '[aria-label*="matches" i]'
];

const DISCOVERY_SELECTORS = [
  'a[href*="/app/recs" i]',
  '[data-testid*="recs" i]',
  '[aria-label*="like" i]',
  '[aria-label*="nope" i]',
  'button[aria-label*="like" i]',
  'button[aria-label*="nope" i]'
];

function textOf(element: Element): string {
  return (element.textContent ?? "").replace(/\s+/g, " ").trim();
}

function visible(element: Element | null): element is HTMLElement {
  return element instanceof HTMLElement && element.offsetParent !== null;
}

function findComposerMatch(): { element: HTMLElement; selector: string } | null {
  for (const selector of COMPOSER_SELECTORS) {
    const element = document.querySelector<HTMLElement>(selector);
    if (visible(element)) return { element, selector };
  }
  return null;
}

function findComposer(): HTMLElement | null {
  return findComposerMatch()?.element ?? null;
}

function directionOf(element: HTMLElement): Direction {
  let current: HTMLElement | null = element;
  const tokens: string[] = [];
  for (let i = 0; current && i < 3; i++, current = current.parentElement) {
    tokens.push(current.className?.toString() ?? "", current.getAttribute("data-testid") ?? "", current.getAttribute("aria-label") ?? "");
  }
  const hint = tokens.join(" ").toLowerCase();
  if (/outgoing|sent|sender|from-me|mine|self/.test(hint)) return "me";
  if (/incoming|received|from-match|receiver/.test(hint)) return "them";

  const root = document.querySelector("main") ?? document.body;
  const rootRect = root.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  const center = rect.left + rect.width / 2;
  const rootCenter = rootRect.left + rootRect.width / 2;
  const threshold = Math.max(24, rootRect.width * 0.08);
  if (center > rootCenter + threshold) return "me";
  if (center < rootCenter - threshold) return "them";
  return "unknown";
}

function candidateMessages(composer: HTMLElement): HTMLElement[] {
  const seen = new Set<HTMLElement>();
  const result: HTMLElement[] = [];
  for (const selector of MESSAGE_SELECTORS) {
    for (const element of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
      if (seen.has(element) || element.contains(composer) || composer.contains(element) || element.offsetParent === null) continue;
      const text = textOf(element);
      if (!text || text.length > 1200) continue;
      seen.add(element);
      result.push(element);
    }
  }
  return result.slice(-40);
}

function simpleHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function setComposerValue(composer: HTMLElement, value: string): void {
  if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) {
    const proto = composer instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    setter?.call(composer, value);
  } else {
    composer.focus();
    composer.textContent = value;
  }
  composer.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
  composer.dispatchEvent(new Event("change", { bubbles: true }));
}

function findSendButton(composer: HTMLElement): HTMLButtonElement | null {
  const scope = composer.closest("form") ?? composer.parentElement?.parentElement ?? document;
  const buttons = Array.from(scope.querySelectorAll<HTMLButtonElement>("button"));
  return buttons.find((button) => {
    if (button.disabled || button.offsetParent === null) return false;
    const hint = `${button.getAttribute("aria-label") ?? ""} ${button.textContent ?? ""}`.toLowerCase();
    return /send|envoyer/.test(hint) || button.type === "submit";
  }) ?? null;
}

function anyVisible(selectors: string[]): string | null {
  for (const selector of selectors) {
    if (Array.from(document.querySelectorAll(selector)).some((element) => visible(element))) return selector;
  }
  return null;
}

function detectView(composer: HTMLElement | null): { view: TinderViewState; signals: string[] } {
  const signals: string[] = [];
  const path = location.pathname.toLowerCase();

  if (composer) {
    signals.push("visible-message-composer");
    if (/message|chat|match/.test(path)) signals.push(`path:${path}`);
    return { view: "conversation", signals };
  }

  const discoverySelector = anyVisible(DISCOVERY_SELECTORS);
  const inboxSelector = anyVisible(INBOX_SELECTORS);

  if (/\/app\/recs|\/recs|\/swipe/.test(path)) signals.push(`path:${path}`);
  if (/\/app\/messages|\/messages|\/matches/.test(path)) signals.push(`path:${path}`);
  if (discoverySelector) signals.push(`discovery-selector:${discoverySelector}`);
  if (inboxSelector) signals.push(`inbox-selector:${inboxSelector}`);

  const looksDiscovery = Boolean(discoverySelector) || /\/app\/recs|\/recs|\/swipe/.test(path);
  const looksInbox = Boolean(inboxSelector) || /\/app\/messages|\/messages|\/matches/.test(path);

  if (looksDiscovery && !looksInbox) return { view: "discovery", signals };
  if (looksInbox && !looksDiscovery) return { view: "inbox", signals };
  if (looksDiscovery && looksInbox) {
    if (/\/app\/recs|\/recs|\/swipe/.test(path)) return { view: "discovery", signals };
    if (/\/app\/messages|\/messages|\/matches/.test(path)) return { view: "inbox", signals };
  }
  return { view: "unknown", signals };
}

function classifyNavigationCandidate(element: HTMLElement): TinderNavigationCandidate["kind"] {
  const hint = [
    element.getAttribute("href"),
    element.getAttribute("aria-label"),
    element.getAttribute("data-testid"),
    element.getAttribute("role")
  ].filter(Boolean).join(" ").toLowerCase();
  if (/recs|discover|swipe|like|nope/.test(hint)) return "discovery";
  if (/messages|matches|inbox/.test(hint)) return "inbox";
  if (/chat|conversation/.test(hint)) return "conversation";
  return "unknown";
}

function navigationCandidates(): TinderNavigationCandidate[] {
  const selector = "a[href],button,[role='button'],[data-testid],[aria-label]";
  const candidates: TinderNavigationCandidate[] = [];
  for (const element of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
    if (!visible(element)) continue;
    const kind = classifyNavigationCandidate(element);
    if (kind === "unknown") continue;
    const href = element instanceof HTMLAnchorElement ? element.href : element.getAttribute("href");
    let safeHref: string | null = null;
    if (href) {
      try {
        const parsed = new URL(href, location.href);
        safeHref = parsed.origin === location.origin ? parsed.pathname : parsed.origin;
      } catch {
        safeHref = null;
      }
    }
    candidates.push({
      kind,
      tag: element.tagName.toLowerCase(),
      href: safeHref,
      ariaLabel: element.getAttribute("aria-label"),
      testId: element.getAttribute("data-testid"),
      visible: true
    });
    if (candidates.length >= 30) break;
  }
  return candidates;
}

export class TinderDomAdapter {
  read(): ConversationSnapshot | null {
    const composer = findComposer();
    if (!composer) return null;
    const messages = candidateMessages(composer)
      .map((element) => ({ text: textOf(element), direction: directionOf(element) }))
      .filter((message) => message.direction !== "unknown");
    if (!messages.length) return null;

    const latestIncomingIndex = messages.map((m) => m.direction).lastIndexOf("them");
    if (latestIncomingIndex < 0) return null;
    const latest = messages[latestIncomingIndex];
    if (messages.slice(latestIncomingIndex + 1).some((m) => m.direction === "me")) return null;

    const context = messages.slice(-24).map((message) => `${message.direction === "me" ? "Me" : "Them"}: ${message.text}`).join("\n");
    const threadKey = `${location.pathname}|${document.title}`;
    return {
      threadKey,
      context,
      latestIncomingText: latest.text,
      latestIncomingKey: simpleHash(`${threadKey}|${latestIncomingIndex}|${latest.text}|${messages.length}`)
    };
  }

  diagnose(): TinderSelectorDiagnostics {
    const match = findComposerMatch();
    const candidates = match ? candidateMessages(match.element) : [];
    const directionCounts = { me: 0, them: 0, unknown: 0 };
    for (const element of candidates) directionCounts[directionOf(element)] += 1;
    const detected = detectView(match?.element ?? null);
    return {
      view: detected.view,
      viewSignals: detected.signals,
      composerSelector: match?.selector ?? null,
      composerFound: Boolean(match),
      messageSelectorMatches: MESSAGE_SELECTORS.map((selector) => ({
        selector,
        count: document.querySelectorAll(selector).length
      })),
      visibleCandidateCount: candidates.length,
      directionCounts,
      sendButtonFound: Boolean(match && findSendButton(match.element)),
      navigationCandidates: navigationCandidates(),
      threadKeyHash: simpleHash(`${location.pathname}|${document.title}`)
    };
  }

  async send(message: string): Promise<void> {
    const composer = findComposer();
    if (!composer) throw new Error("TNND could not find the Tinder message composer.");
    setComposerValue(composer, message);
    await new Promise((resolve) => setTimeout(resolve, 250));
    const button = findSendButton(composer);
    if (!button) throw new Error("TNND could not find the Tinder send button.");
    button.click();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const remaining = composer instanceof HTMLInputElement || composer instanceof HTMLTextAreaElement ? composer.value.trim() : textOf(composer);
    if (remaining === message.trim()) throw new Error("Tinder did not confirm the message send; TNND will not retry automatically.");
  }
}
