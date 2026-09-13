import { readSession } from "./auth-client";
import { listConversations } from "./conversation-client";
import {
  clearConversationOverrides,
  getConversationOverrides,
  saveConversationOverrides
} from "./conversation-overrides-client";
import { mountConversationOverridesEditor } from "./conversation-overrides-editor";

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  })[char] ?? char);
}

function mountPanel(): { panel: HTMLElement; select: HTMLSelectElement; editor: HTMLElement; status: HTMLElement } | null {
  const grid = document.querySelector<HTMLElement>(".grid");
  if (!grid) return null;
  const panel = document.createElement("article");
  panel.className = "panel panel-wide";
  panel.innerHTML = `
    <div class="panel-heading">
      <div><p class="eyebrow">Per-chat control</p><h2>Conversation overrides</h2></div>
      <span class="pill" data-overrides-panel-status>Sign in required</span>
    </div>
    <p class="subtle">Override global defaults for one synchronized conversation. Empty fields continue to inherit the global profile.</p>
    <label>Conversation<select data-overrides-conversation disabled><option value="">Select a conversation</option></select></label>
    <div data-overrides-editor><p class="subtle">Choose a conversation to edit its overrides.</p></div>
  `;
  grid.prepend(panel);
  return {
    panel,
    select: panel.querySelector<HTMLSelectElement>("[data-overrides-conversation]")!,
    editor: panel.querySelector<HTMLElement>("[data-overrides-editor]")!,
    status: panel.querySelector<HTMLElement>("[data-overrides-panel-status]")!
  };
}

const elements = mountPanel();
let disposeEditor: (() => void) | null = null;

async function loadEditor(conversationId: string): Promise<void> {
  if (!elements) return;
  disposeEditor?.();
  disposeEditor = null;
  const session = readSession();
  if (!session || !conversationId) {
    elements.editor.innerHTML = '<p class="subtle">Choose a conversation to edit its overrides.</p>';
    return;
  }

  elements.status.textContent = "Loading overrides…";
  elements.editor.innerHTML = '<p class="subtle">Loading chat overrides…</p>';
  try {
    const overrides = await getConversationOverrides(session, conversationId);
    elements.status.textContent = "Ready";
    disposeEditor = mountConversationOverridesEditor(elements.editor, overrides, {
      onSave: async (next) => {
        await saveConversationOverrides(session, conversationId, next);
        elements.status.textContent = "Saved";
      },
      onClear: async () => {
        await clearConversationOverrides(session, conversationId);
        elements.status.textContent = "Cleared";
        await loadEditor(conversationId);
      }
    });
  } catch (error) {
    elements.status.textContent = "Unavailable";
    elements.editor.innerHTML = `<p class="subtle">${escapeHtml(error instanceof Error ? error.message : "Unable to load chat overrides.")}</p>`;
  }
}

async function refresh(): Promise<void> {
  if (!elements) return;
  disposeEditor?.();
  disposeEditor = null;
  const session = readSession();
  if (!session) {
    elements.status.textContent = "Sign in required";
    elements.select.disabled = true;
    elements.select.innerHTML = '<option value="">Select a conversation</option>';
    elements.editor.innerHTML = '<p class="subtle">Connect your TNND account to edit conversation overrides.</p>';
    return;
  }

  elements.status.textContent = "Loading…";
  try {
    const conversations = await listConversations(session);
    elements.select.innerHTML = conversations.length
      ? `<option value="">Select a conversation</option>${conversations.map((conversation) => `<option value="${escapeHtml(conversation.id)}">${escapeHtml(conversation.displayName)}</option>`).join("")}`
      : '<option value="">No synchronized conversations</option>';
    elements.select.disabled = conversations.length === 0;
    elements.status.textContent = `${conversations.length} available`;
    elements.editor.innerHTML = '<p class="subtle">Choose a conversation to edit its overrides.</p>';
  } catch (error) {
    elements.select.disabled = true;
    elements.status.textContent = "Unavailable";
    elements.editor.innerHTML = `<p class="subtle">${escapeHtml(error instanceof Error ? error.message : "Unable to load conversations.")}</p>`;
  }
}

elements?.select.addEventListener("change", () => void loadEditor(elements.select.value));
window.addEventListener("tnnd:auth-session-changed", () => void refresh());
void refresh();
