import { readSession } from "./auth-client";
import {
  clearConversationOverrides,
  getConversationOverrides,
  saveConversationOverrides
} from "./conversation-overrides-client";
import { mountConversationOverridesEditor } from "./conversation-overrides-editor";
import { summarizeOverrideProvenance } from "./conversation-overrides-provenance";
import type { ConversationOverridesPayload } from "./conversation-overrides-model";

function escapeHtml(value: string): string {
  return value.replace(/[&<>'\"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '\"': "&quot;"
  })[char] ?? char);
}

function selectedConversationId(): string | null {
  return document.querySelector<HTMLElement>(".conversation-row.selected")?.dataset.conversationId ?? null;
}

function provenanceText(overrides: ConversationOverridesPayload): string {
  const summary = summarizeOverrideProvenance(overrides);
  if (!summary.overriddenFields.length) {
    return "Effective configuration: all values currently inherit the global TNND profile.";
  }
  const languages = summary.nestedLanguageFields.length
    ? ` Language overrides: ${summary.nestedLanguageFields.join(", ")}.`
    : "";
  return `Effective configuration: ${summary.overriddenFields.join(", ")} come from this chat; all other values inherit the global profile.${languages}`;
}

function installStyles(): void {
  if (document.querySelector("#tnnd-inline-overrides-styles")) return;
  const style = document.createElement("style");
  style.id = "tnnd-inline-overrides-styles";
  style.textContent = `
    .conversation-inline-overrides{display:grid;gap:9px;padding:11px;margin-bottom:12px;border:1px solid var(--border,#d4d4d8);border-radius:10px;background:rgba(127,127,127,.04)}
    .conversation-inline-overrides-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
    .conversation-inline-overrides-heading>div{display:grid;gap:3px}
    .conversation-inline-overrides [data-inline-overrides-provenance]{margin:0}
  `;
  document.head.append(style);
}

let disposeEditor: (() => void) | null = null;
let mountedConversationId: string | null = null;
let mountGeneration = 0;

async function mountInlineEditor(): Promise<void> {
  const detail = document.querySelector<HTMLElement>("#conversation-detail");
  const conversationId = selectedConversationId();
  if (!detail || !conversationId) return;

  const existing = detail.querySelector<HTMLElement>(".conversation-inline-overrides");
  if (existing?.dataset.conversationId === conversationId && mountedConversationId === conversationId) return;

  disposeEditor?.();
  disposeEditor = null;
  mountedConversationId = conversationId;
  const generation = ++mountGeneration;
  existing?.remove();

  const section = document.createElement("section");
  section.className = "conversation-inline-overrides";
  section.dataset.conversationId = conversationId;
  section.setAttribute("aria-label", "Conversation-specific overrides");
  section.innerHTML = `
    <div class="conversation-inline-overrides-heading">
      <div>
        <strong>Conversation overrides</strong>
        <small>Only set what should differ from your global profile.</small>
      </div>
      <span class="pill" data-inline-overrides-status>Loading…</span>
    </div>
    <p class="subtle" data-inline-overrides-provenance>Resolving effective configuration…</p>
    <div data-inline-overrides-editor><p class="subtle">Loading chat overrides…</p></div>
  `;

  const messages = detail.querySelector(".conversation-messages");
  if (messages) detail.insertBefore(section, messages);
  else detail.append(section);

  const status = section.querySelector<HTMLElement>("[data-inline-overrides-status]")!;
  const provenance = section.querySelector<HTMLElement>("[data-inline-overrides-provenance]")!;
  const editor = section.querySelector<HTMLElement>("[data-inline-overrides-editor]")!;
  const session = readSession();
  if (!session) {
    status.textContent = "Sign in required";
    editor.innerHTML = '<p class="subtle">Connect your TNND account to edit this conversation.</p>';
    return;
  }

  try {
    const overrides = await getConversationOverrides(session, conversationId);
    if (generation !== mountGeneration || !section.isConnected) return;
    provenance.textContent = provenanceText(overrides);
    status.textContent = "Ready";
    disposeEditor = mountConversationOverridesEditor(editor, overrides, {
      onSave: async (next) => {
        const saved = await saveConversationOverrides(session, conversationId, next);
        if (!section.isConnected) return;
        provenance.textContent = provenanceText(saved);
        status.textContent = "Saved";
      },
      onClear: async () => {
        await clearConversationOverrides(session, conversationId);
        if (!section.isConnected) return;
        provenance.textContent = provenanceText({});
        status.textContent = "Cleared";
        disposeEditor?.();
        disposeEditor = mountConversationOverridesEditor(editor, {}, {
          onSave: async (next) => {
            const saved = await saveConversationOverrides(session, conversationId, next);
            provenance.textContent = provenanceText(saved);
            status.textContent = "Saved";
          },
          onClear: async () => {
            await clearConversationOverrides(session, conversationId);
            provenance.textContent = provenanceText({});
            status.textContent = "Cleared";
          }
        });
      }
    });
  } catch (error) {
    if (generation !== mountGeneration || !section.isConnected) return;
    status.textContent = "Unavailable";
    editor.innerHTML = `<p class="subtle">${escapeHtml(error instanceof Error ? error.message : "Unable to load chat overrides.")}</p>`;
  }
}

function installInlineController(): void {
  installStyles();
  const detail = document.querySelector<HTMLElement>("#conversation-detail");
  if (!detail) return;
  let scheduled = false;
  const scheduleMount = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      void mountInlineEditor();
    });
  };
  const observer = new MutationObserver(scheduleMount);
  observer.observe(detail, { childList: true, subtree: false });
  scheduleMount();
  window.addEventListener("tnnd:auth-session-changed", scheduleMount);
}

installInlineController();
