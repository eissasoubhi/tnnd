import { readSession } from "./auth-client";
import { listConversations } from "./conversation-client";
import type { ConversationListItem } from "./conversation-contract";

export type ConversationTakeoverChoice =
  | "unmanaged"
  | "ai-managed"
  | "manual"
  | "moved-off-tinder"
  | "archived";

interface ConversationTakeoverDraft {
  version: 1;
  choices: Record<string, ConversationTakeoverChoice>;
}

const storageKey = "tnnd:web:conversation-takeover-draft:v1";

const choices: Array<{ value: ConversationTakeoverChoice; label: string; help: string }> = [
  { value: "unmanaged", label: "Decide later", help: "TNND can observe read-only but must not take over." },
  { value: "ai-managed", label: "Let AI continue", help: "Eligible for AI only after backend confirmation is implemented." },
  { value: "manual", label: "Keep manual", help: "You keep replying yourself on Tinder." },
  { value: "moved-off-tinder", label: "Moved off Tinder", help: "Conversation continued on WhatsApp, Instagram or another channel." },
  { value: "archived", label: "Archive", help: "Finished or no longer relevant." }
];

function loadDraft(): ConversationTakeoverDraft {
  const raw = sessionStorage.getItem(storageKey);
  if (!raw) return { version: 1, choices: {} };
  try {
    const parsed = JSON.parse(raw) as Partial<ConversationTakeoverDraft>;
    return parsed.version === 1 && parsed.choices && typeof parsed.choices === "object"
      ? { version: 1, choices: parsed.choices as Record<string, ConversationTakeoverChoice> }
      : { version: 1, choices: {} };
  } catch {
    return { version: 1, choices: {} };
  }
}

function saveDraft(draft: ConversationTakeoverDraft): void {
  sessionStorage.setItem(storageKey, JSON.stringify(draft));
  window.dispatchEvent(new CustomEvent("tnnd:conversation-takeover-draft", { detail: draft }));
}

function conversationLabel(conversation: ConversationListItem): string {
  return conversation.currentTopic?.trim() || conversation.displayName;
}

function buildRow(conversation: ConversationListItem, draft: ConversationTakeoverDraft): HTMLElement {
  const row = document.createElement("div");
  row.className = "card";
  row.style.marginTop = "0.75rem";

  const title = document.createElement("strong");
  title.textContent = conversationLabel(conversation);
  row.append(title);

  const meta = document.createElement("p");
  meta.textContent = `Current status: ${conversation.status}. Existing chats stay unmanaged unless you explicitly choose otherwise.`;
  row.append(meta);

  const select = document.createElement("select");
  select.setAttribute("aria-label", `Management choice for ${conversation.displayName}`);
  const selected = draft.choices[conversation.id] ?? "unmanaged";
  for (const choice of choices) {
    const option = document.createElement("option");
    option.value = choice.value;
    option.textContent = choice.label;
    option.selected = choice.value === selected;
    select.append(option);
  }
  row.append(select);

  const help = document.createElement("small");
  const refreshHelp = () => {
    help.textContent = choices.find((choice) => choice.value === select.value)?.help ?? "";
  };
  refreshHelp();
  row.append(help);

  select.addEventListener("change", () => {
    const next = select.value as ConversationTakeoverChoice;
    draft.choices[conversation.id] = next;
    saveDraft(draft);
    refreshHelp();
  });

  return row;
}

async function mount(): Promise<void> {
  const app = document.querySelector<HTMLElement>("#app");
  if (!app) return;
  const session = readSession();
  if (!session) return;

  const section = document.createElement("section");
  section.className = "panel";
  section.dataset.conversationTakeoverOnboarding = "true";

  const heading = document.createElement("h2");
  heading.textContent = "Review existing Tinder chats";
  section.append(heading);

  const intro = document.createElement("p");
  intro.textContent = "TNND will not automatically take over chats that already existed before setup. Review them and decide which ones may eventually be AI-managed.";
  section.append(intro);

  const safety = document.createElement("p");
  safety.textContent = "Safety default: every chat remains unmanaged. These choices are currently kept only as a session draft until the authenticated backend update API is wired; no AI takeover is enabled by this screen yet.";
  section.append(safety);

  const bulk = document.createElement("div");
  bulk.style.display = "flex";
  bulk.style.gap = "0.5rem";
  bulk.style.flexWrap = "wrap";
  section.append(bulk);

  const list = document.createElement("div");
  section.append(list);
  app.append(section);

  try {
    const conversations = await listConversations(session);
    const draft = loadDraft();

    const applyBulk = (choice: ConversationTakeoverChoice) => {
      for (const conversation of conversations) draft.choices[conversation.id] = choice;
      saveDraft(draft);
      list.replaceChildren(...conversations.map((conversation) => buildRow(conversation, draft)));
    };

    for (const option of [
      ["Keep all unmanaged", "unmanaged"],
      ["Keep all manual", "manual"],
      ["Archive all", "archived"]
    ] as const) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = option[0];
      button.addEventListener("click", () => applyBulk(option[1]));
      bulk.append(button);
    }

    if (!conversations.length) {
      const empty = document.createElement("p");
      empty.textContent = "No existing conversations found yet.";
      list.append(empty);
      return;
    }

    list.replaceChildren(...conversations.map((conversation) => buildRow(conversation, draft)));
  } catch (error) {
    const message = document.createElement("p");
    message.textContent = error instanceof Error ? error.message : "Unable to load existing conversations.";
    list.append(message);
  }
}

void mount();
