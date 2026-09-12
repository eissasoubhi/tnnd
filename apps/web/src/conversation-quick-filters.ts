const labelToStatus = new Map<string, string>([
  ["Active", "active"],
  ["Waiting for them", "waiting-for-them"],
  ["Waiting for you", "waiting-for-user"],
  ["Action required", "action-required"],
  ["Paused", "paused"]
]);

const boundCards = new WeakSet<Element>();

function applyFilter(status: string): void {
  const filter = document.querySelector<HTMLSelectElement>("#conversation-status-filter");
  if (!filter) return;
  filter.value = status;
  filter.dispatchEvent(new Event("change", { bubbles: true }));
  filter.focus();
}

function bindCard(card: HTMLElement): void {
  if (boundCards.has(card)) return;
  const label = card.querySelector("span")?.textContent?.trim() ?? "";
  const status = labelToStatus.get(label);
  if (!status) return;

  boundCards.add(card);
  card.dataset.conversationQuickFilter = status;
  card.setAttribute("role", "button");
  card.setAttribute("tabindex", "0");
  card.setAttribute("aria-label", `Filter conversations by ${label}`);
  card.addEventListener("click", () => applyFilter(status));
  card.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    applyFilter(status);
  });
}

function bindCards(): void {
  document.querySelectorAll<HTMLElement>("#conversation-operational-summary .conversation-stat").forEach(bindCard);
}

const observer = new MutationObserver(bindCards);
observer.observe(document.documentElement, { childList: true, subtree: true });
bindCards();
