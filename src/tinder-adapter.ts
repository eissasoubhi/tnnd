function visible(element: Element): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
}

function normalize(value: string): string {
  return value.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function uniqueTexts(elements: Element[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const element of elements) {
    if (!visible(element)) continue;
    const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!text || text.length > 900 || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }

  return result;
}

export class TinderAdapter {
  getContextSnapshot(): string {
    const conversationSelectors = [
      '[data-testid*="message" i]',
      '[data-testid*="chat" i] [role="listitem"]',
      '[role="log"] > *',
      'main [class*="message" i]'
    ];

    const conversationElements = conversationSelectors.flatMap((selector) =>
      Array.from(document.querySelectorAll(selector))
    );
    const conversation = uniqueTexts(conversationElements).slice(-30);

    if (conversation.length >= 2) {
      return `Visible conversation:\n${conversation.join("\n")}`.slice(-7000);
    }

    const main = document.querySelector("main") ?? document.body;
    const pageText = (main.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!pageText) return "";
    return `Visible Tinder page/profile context:\n${pageText.slice(0, 5000)}`;
  }

  findComposer(): HTMLTextAreaElement | HTMLElement | null {
    const candidates = Array.from(
      document.querySelectorAll('textarea, [contenteditable="true"]')
    ).filter(visible);

    if (!candidates.length) return null;

    const scored = candidates.map((element) => {
      const placeholder = normalize(element.getAttribute("placeholder") ?? "");
      const aria = normalize(element.getAttribute("aria-label") ?? "");
      const combined = `${placeholder} ${aria}`;
      let score = 0;
      if (/message|chat|ecri|write|send|envoy/.test(combined)) score += 10;
      if (element.closest("main")) score += 2;
      return { element, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.element instanceof HTMLElement ? scored[0].element : null;
  }

  insertDraft(text: string): boolean {
    const composer = this.findComposer();
    if (!composer) return false;

    composer.focus();

    if (composer instanceof HTMLTextAreaElement) {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(composer, text);
      composer.dispatchEvent(new Event("input", { bubbles: true }));
      composer.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }

    composer.textContent = text;
    composer.dispatchEvent(
      new InputEvent("input", { bubbles: true, inputType: "insertText", data: text })
    );
    return true;
  }

  likeCurrentProfile(): boolean {
    const buttons = Array.from(document.querySelectorAll("button")).filter(visible);

    const match = buttons.find((button) => {
      const label = normalize(
        `${button.getAttribute("aria-label") ?? ""} ${button.getAttribute("title") ?? ""} ${button.textContent ?? ""}`
      );
      if (/super\s*like|superlike/.test(label)) return false;
      return /(^|\s)(like|j'aime|jaime|aimer)(\s|$)/.test(label);
    });

    if (!(match instanceof HTMLButtonElement)) return false;
    match.click();
    return true;
  }
}
