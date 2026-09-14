import { getConversationMatchProfile, MatchProfileApiError } from "./match-profile-client.js";
import { buildMatchProfileViewModel, type MatchProfileRecord } from "./match-profile-view-model.js";

export type MatchProfilePanelOptions = {
  apiBase: string;
  token: string;
  conversationId: string;
};

export type MatchProfilePanel = {
  element: HTMLElement;
  load(): Promise<void>;
};

function text(tag: keyof HTMLElementTagNameMap, value: string, className?: string): HTMLElement {
  const element = document.createElement(tag);
  element.textContent = value;
  if (className) element.className = className;
  return element;
}

function fieldList(items: Array<{ label: string; value: string }>): HTMLElement {
  const list = document.createElement("dl");
  list.className = "match-profile-fields";
  for (const item of items) {
    const row = document.createElement("div");
    row.className = "match-profile-field";
    row.append(text("dt", item.label), text("dd", item.value));
    list.append(row);
  }
  return list;
}

function refreshButton(onReload: () => Promise<void>): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Reload stored profile";
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await onReload();
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  });
  return button;
}

function renderRecord(root: HTMLElement, record: MatchProfileRecord, onReload: () => Promise<void>): void {
  const model = buildMatchProfileViewModel(record);
  root.replaceChildren();

  const header = document.createElement("header");
  header.append(
    text("h3", model.title),
    text("p", model.freshnessLabel, "match-profile-freshness"),
    text("p", model.retentionLabel, "match-profile-retention"),
    refreshButton(onReload)
  );

  const normalized = document.createElement("section");
  normalized.append(text("h4", "Normalized profile"));
  normalized.append(model.fields.length ? fieldList(model.fields) : text("p", "No normalized fields available yet."));

  const source = document.createElement("details");
  source.append(text("summary", model.sourceLabel));
  source.append(model.sourceFields.length ? fieldList(model.sourceFields) : text("p", "No visible source fields available."));

  root.append(header, normalized, source);
}

function renderState(
  root: HTMLElement,
  message: string,
  state: "loading" | "empty" | "error",
  onReload?: () => Promise<void>
): void {
  root.replaceChildren(text("p", message, `match-profile-state match-profile-state-${state}`));
  if (onReload && state !== "loading") root.append(refreshButton(onReload));
}

export function createMatchProfilePanel(options: MatchProfilePanelOptions): MatchProfilePanel {
  const root = document.createElement("section");
  root.className = "match-profile-panel";
  root.setAttribute("aria-live", "polite");

  const panel: MatchProfilePanel = {
    element: root,
    async load() {
      renderState(root, "Loading MatchProfile…", "loading");
      try {
        const record = await getConversationMatchProfile(options.apiBase, options.token, options.conversationId);
        if (!record) {
          renderState(root, "No captured Tinder profile is linked to this conversation yet.", "empty", panel.load);
          return;
        }
        renderRecord(root, record, panel.load);
      } catch (error) {
        const message = error instanceof MatchProfileApiError
          ? `Unable to load MatchProfile (${error.status}).`
          : "Unable to load MatchProfile.";
        renderState(root, message, "error", panel.load);
      }
    }
  };

  return panel;
}
