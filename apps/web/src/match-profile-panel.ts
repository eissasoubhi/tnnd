import { getConversationMatchProfile, MatchProfileApiError, promoteMatchProfile } from "./match-profile-client.js";
import { buildMatchProfileViewModel, type MatchProfileRecord } from "./match-profile-view-model.js";

export type MatchProfilePanelOptions = {
  apiBase: string;
  token: string;
  conversationId: string;
  temporaryProfile?: MatchProfileRecord | null;
};

export type MatchProfilePanel = {
  element: HTMLElement;
  load(): Promise<void>;
};

export function canPromoteTemporaryMatchProfile(record: MatchProfileRecord, now = new Date()): boolean {
  if (record.conversationId || record.normalizedProfile.retention.mode !== "temporary") return false;
  const expiresAt = record.expiresAt ?? record.normalizedProfile.retention.expiresAt;
  return !expiresAt || Date.parse(expiresAt) > now.getTime();
}

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
  button.title = "Reload the latest MatchProfile already stored by TNND. This does not capture Tinder again.";
  button.addEventListener("click", async () => {
    button.disabled = true;
    try { await onReload(); } finally { if (button.isConnected) button.disabled = false; }
  });
  return button;
}

function renderRecord(root: HTMLElement, record: MatchProfileRecord, onReload: () => Promise<void>): void {
  const model = buildMatchProfileViewModel(record);
  root.replaceChildren();
  const header = document.createElement("header");
  header.append(text("h3", model.title), text("p", model.freshnessLabel, `match-profile-freshness match-profile-freshness-${model.freshnessState}`), text("p", model.retentionLabel, "match-profile-retention"), refreshButton(onReload));
  const normalized = document.createElement("section");
  normalized.append(text("h4", "Normalized profile"));
  normalized.append(model.fields.length ? fieldList(model.fields) : text("p", "No normalized fields available yet."));
  const source = document.createElement("details");
  source.append(text("summary", model.sourceLabel));
  source.append(model.sourceFields.length ? fieldList(model.sourceFields) : text("p", "No visible source fields available."));
  root.append(header, normalized, source);
}

function renderState(root: HTMLElement, message: string, state: "loading" | "empty" | "error", onReload?: () => Promise<void>): void {
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
        if (record) { renderRecord(root, record, panel.load); return; }
        const temporary = options.temporaryProfile;
        if (temporary && temporary.normalizedProfile.retention.mode === "temporary" && !temporary.conversationId) {
          if (!canPromoteTemporaryMatchProfile(temporary)) {
            root.replaceChildren(text("p", "The available temporary Tinder capture has expired. Refresh it from Tinder before linking it to this conversation.", "match-profile-state match-profile-state-empty"), refreshButton(panel.load));
            return;
          }
          root.replaceChildren(text("p", "A temporary Tinder capture is available. Link it only if it belongs to this conversation.", "match-profile-state"));
          const promote = document.createElement("button");
          promote.type = "button";
          promote.textContent = "Link profile to this conversation";
          promote.title = "Promote this temporary capture to durable conversation-linked retention.";
          promote.addEventListener("click", async () => {
            if (!window.confirm("Link this temporary Tinder profile to the selected conversation? This makes its retention durable.")) return;
            promote.disabled = true;
            try {
              const linked = await promoteMatchProfile(options.apiBase, options.token, temporary.id, options.conversationId);
              renderRecord(root, linked, panel.load);
            } catch (error) {
              renderState(root, error instanceof MatchProfileApiError ? `Unable to link MatchProfile (${error.status}).` : "Unable to link MatchProfile.", "error", panel.load);
            }
          });
          root.append(promote, refreshButton(panel.load));
          return;
        }
        renderState(root, "No captured Tinder profile is linked to this conversation yet.", "empty", panel.load);
      } catch (error) {
        renderState(root, error instanceof MatchProfileApiError ? `Unable to load MatchProfile (${error.status}).` : "Unable to load MatchProfile.", "error", panel.load);
      }
    }
  };
  return panel;
}
