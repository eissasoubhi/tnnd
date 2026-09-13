import { readSession } from "./auth-client";
import { listConversations } from "./conversation-client";
import type { ConversationListItem } from "./conversation-contract";
import {
  listConversationManagement,
  saveConversationManagement,
  type ConversationManagementState
} from "./conversation-management-client";

export type ConversationTakeoverChoice = ConversationManagementState;

interface ConversationTakeoverDraft {
  version: 1;
  choices: Record<string, ConversationTakeoverChoice>;
}

const storageKey = "tnnd:web:conversation-takeover-draft:v1";

const choices: Array<{ value: ConversationTakeoverChoice; label: string; help: string }> = [
  { value: "unmanaged", label: "Decide later", help: "TNND may observe read-only but cannot take over this chat." },
  { value: "ai-managed", label: "Let AI continue", help: "After you save and confirm, this chat becomes eligible for AI-managed processing." },
  { value: "manual", label: "Keep manual", help: "You keep replying yourself on Tinder." },
  { value: "moved-off-tinder", label: "Moved off Tinder", help: "Conversation continued on WhatsApp, Instagram or another channel. Tinder automation stays off." },
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
    draft.choices[conversation.id] = select.value as ConversationTakeoverChoice;
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
  intro.textContent = "TNND never takes over chats that existed before setup by default. Review them and explicitly decide what TNND may manage.";
  section.append(intro);

  const safety = document.createElement("p");
  safety.textContent = "Safety default: existing chats remain unmanaged until these decisions are saved. Unread status alone never authorizes AI takeover.";
  section.append(safety);

  const bulk = document.createElement("div");
  bulk.style.display = "flex";
  bulk.style.gap = "0.5rem";
  bulk.style.flexWrap = "wrap";
  section.append(bulk);

  const list = document.createElement("div");
  section.append(list);

  const actions = document.createElement("div");
  actions.style.display = "flex";
  actions.style.gap = "0.75rem";
  actions.style.alignItems = "center";
  actions.style.marginTop = "1rem";
  section.append(actions);

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.textContent = "Save chat decisions";
  actions.append(saveButton);

  const status = document.createElement("span");
  status.setAttribute("role", "status");
  actions.append(status);

  app.append(section);

  try {
    const [conversations, persistedManagement] = await Promise.all([
      listConversations(session),
      listConversationManagement(session)
    ]);
    const persistedById = new Map(persistedManagement.map((record) => [record.conversationId, record]));
    const draft = loadDraft();

    for (const conversation of conversations) {
      if (!draft.choices[conversation.id]) {
        draft.choices[conversation.id] = persistedById.get(conversation.id)?.managementState ?? "unmanaged";
      }
    }
    saveDraft(draft);

    const render = () => {
      list.replaceChildren(...conversations.map((conversation) => buildRow(conversation, draft)));
    };

    const applyBulk = (choice: ConversationTakeoverChoice) => {
      for (const conversation of conversations) draft.choices[conversation.id] = choice;
      saveDraft(draft);
      render();
      status.textContent = "Unsaved changes.";
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
      saveButton.disabled = true;
      return;
    }

    render();

    saveButton.addEventListener("click", async () => {
      const updates = conversations.map((conversation) => ({
        conversationId: conversation.id,
        managementState: draft.choices[conversation.id] ?? "unmanaged"
      }));
      const aiManagedCount = updates.filter((update) => update.managementState === "ai-managed").length;
      if (aiManagedCount > 0) {
        const confirmed = window.confirm(
          `Enable AI-managed processing for ${aiManagedCount} selected chat${aiManagedCount === 1 ? "" : "s"}? TNND will use the existing conversation context before continuing.`
        );
        if (!confirmed) {
          status.textContent = "Nothing saved.";
          return;
        }
      }

      saveButton.disabled = true;
      status.textContent = "Saving…";
      try {
        const saved = await saveConversationManagement(session, updates);
        for (const record of saved) draft.choices[record.conversationId] = record.managementState;
        sessionStorage.removeItem(storageKey);
        status.textContent = `Saved ${saved.length} chat decision${saved.length === 1 ? "" : "s"}.`;
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : "Unable to save chat decisions.";
      } finally {
        saveButton.disabled = false;
      }
    });
  } catch (error) {
    const message = document.createElement("p");
    message.textContent = error instanceof Error ? error.message : "Unable to load existing conversations.";
    list.append(message);
    saveButton.disabled = true;
  }
}

void mount();
