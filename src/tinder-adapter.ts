export interface ConversationSnapshot {
  threadKey: string;
  context: string;
  latestIncomingKey: string;
  latestIncomingText: string;
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

function textOf(element: Element): string {
  return (element.textContent ?? "").replace(/\s+/g, " ").trim();
}

function findComposer(): HTMLElement | null {
  for (const selector of COMPOSER_SELECTORS) {
    const element = document.querySelector<HTMLElement>(selector);
    if (element && element.offsetParent !== null) return element;
  }
  return null;
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
