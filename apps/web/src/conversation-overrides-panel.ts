import { readSession } from "./auth-client";
import { generateConversationReply, type ConversationGeneration } from "./conversation-generation-client";
import {
  clearConversationOverrides,
  getConversationOverrides,
  saveConversationOverrides
} from "./conversation-overrides-client";
import { resolveEffectiveConversationConfig, summarizeEffectiveConversationConfig } from "./conversation-effective-config";
import { mountConversationOverridesEditor } from "./conversation-overrides-editor";
import { summarizeOverrideProvenance } from "./conversation-overrides-provenance";
import type { ConversationOverridesPayload } from "./conversation-overrides-model";
import { fetchProfile } from "./profile-client";
import type { ImportedProfile } from "./profile-import";

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
  if (!summary.overriddenFields.length) return "All values currently inherit the global TNND profile.";
  const languages = summary.nestedLanguageFields.length
    ? ` Language overrides: ${summary.nestedLanguageFields.join(", ")}.`
    : "";
  return `${summary.overriddenFields.join(", ")} come from this chat; all other values inherit the global profile.${languages}`;
}

function effectiveText(profile: ImportedProfile | null, overrides: ConversationOverridesPayload): string {
  return summarizeEffectiveConversationConfig(resolveEffectiveConversationConfig(profile, overrides));
}

function installStyles(): void {
  if (document.querySelector("#tnnd-inline-overrides-styles")) return;
  const style = document.createElement("style");
  style.id = "tnnd-inline-overrides-styles";
  style.textContent = `
    .conversation-inline-overrides{display:grid;gap:9px;padding:11px;margin-bottom:12px;border:1px solid var(--border,#d4d4d8);border-radius:10px;background:rgba(127,127,127,.04)}
    .conversation-inline-overrides-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
    .conversation-inline-overrides-heading>div{display:grid;gap:3px}
    .conversation-inline-overrides [data-inline-overrides-provenance],.conversation-inline-overrides [data-inline-effective-values]{margin:0}
    .conversation-inline-effective,.conversation-inline-generation{padding:8px;border-radius:8px;background:rgba(127,127,127,.06)}
    .conversation-inline-generation{display:grid;gap:8px}
    .conversation-inline-generation textarea{width:100%;min-height:72px;resize:vertical}
    .conversation-inline-generation-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .conversation-inline-generation-preview{white-space:pre-wrap;margin:0}
    .conversation-inline-generation-preview[data-approved="true"]{font-weight:600}
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
  section.setAttribute("aria-label", "Conversation-specific controls");
  section.innerHTML = `
    <div class="conversation-inline-overrides-heading">
      <div>
        <strong>Conversation overrides</strong>
        <small>Only set what should differ from your global profile.</small>
      </div>
      <span class="pill" data-inline-overrides-status>Loading…</span>
    </div>
    <p class="subtle" data-inline-overrides-provenance>Resolving configuration provenance…</p>
    <div class="conversation-inline-effective">
      <small>Effective values</small>
      <p class="subtle" data-inline-effective-values>Resolving global and chat values…</p>
    </div>
    <div data-inline-overrides-editor><p class="subtle">Loading chat overrides…</p></div>
    <div class="conversation-inline-generation">
      <strong>AI reply draft</strong>
      <small>Draft only. Generate, regenerate, copy or approve here; none of these actions sends anything to Tinder.</small>
      <textarea data-generation-message maxlength="4000" placeholder="Paste the latest incoming message"></textarea>
      <div class="conversation-inline-generation-actions">
        <button type="button" data-generation-button>Generate draft</button>
        <button type="button" data-generation-regenerate disabled>Regenerate</button>
        <button type="button" data-generation-copy disabled>Copy</button>
        <button type="button" data-generation-approve disabled>Approve draft</button>
        <span class="subtle" data-generation-status></span>
      </div>
      <p class="conversation-inline-generation-preview" data-generation-preview aria-live="polite"></p>
      <small class="subtle" data-generation-provenance></small>
    </div>
  `;

  const messages = detail.querySelector(".conversation-messages");
  if (messages) detail.insertBefore(section, messages);
  else detail.append(section);

  const status = section.querySelector<HTMLElement>("[data-inline-overrides-status]")!;
  const provenance = section.querySelector<HTMLElement>("[data-inline-overrides-provenance]")!;
  const effective = section.querySelector<HTMLElement>("[data-inline-effective-values]")!;
  const editor = section.querySelector<HTMLElement>("[data-inline-overrides-editor]")!;
  const generationMessage = section.querySelector<HTMLTextAreaElement>("[data-generation-message]")!;
  const generationButton = section.querySelector<HTMLButtonElement>("[data-generation-button]")!;
  const regenerateButton = section.querySelector<HTMLButtonElement>("[data-generation-regenerate]")!;
  const copyButton = section.querySelector<HTMLButtonElement>("[data-generation-copy]")!;
  const approveButton = section.querySelector<HTMLButtonElement>("[data-generation-approve]")!;
  const generationStatus = section.querySelector<HTMLElement>("[data-generation-status]")!;
  const generationPreview = section.querySelector<HTMLElement>("[data-generation-preview]")!;
  const generationProvenance = section.querySelector<HTMLElement>("[data-generation-provenance]")!;
  const session = readSession();
  let currentDraft: ConversationGeneration | null = null;
  let approvedDraftText: string | null = null;

  const setDraftControls = () => {
    const hasDraft = Boolean(currentDraft?.text);
    regenerateButton.disabled = !hasDraft;
    copyButton.disabled = !hasDraft;
    approveButton.disabled = !hasDraft;
    generationPreview.dataset.approved = String(Boolean(currentDraft && approvedDraftText === currentDraft.text));
  };

  if (!session) {
    status.textContent = "Sign in required";
    editor.innerHTML = '<p class="subtle">Connect your TNND account to edit this conversation.</p>';
    effective.textContent = "Sign in to resolve effective values.";
    generationButton.disabled = true;
    generationStatus.textContent = "Sign in required";
    return;
  }

  const generateDraft = async () => {
    const latestMessage = generationMessage.value.trim();
    if (!latestMessage) {
      generationStatus.textContent = "Latest message required";
      return;
    }
    generationButton.disabled = true;
    regenerateButton.disabled = true;
    generationStatus.textContent = currentDraft ? "Regenerating…" : "Generating…";
    approvedDraftText = null;
    try {
      const result = await generateConversationReply(session, conversationId, latestMessage);
      if (!section.isConnected) return;
      currentDraft = result;
      generationPreview.textContent = result.text;
      const sources = result.provenance.overriddenFields.length
        ? `Chat overrides: ${result.provenance.overriddenFields.join(", ")}. `
        : "Global defaults only. ";
      generationProvenance.textContent = `${sources}Persistent instruction: ${result.provenance.hasPersistentInstruction ? "yes" : "no"}; temporary instruction: ${result.provenance.hasTemporaryInstruction ? "yes" : "no"}. Model: ${result.model}.`;
      generationStatus.textContent = "Draft ready";
    } catch (error) {
      generationStatus.textContent = error instanceof Error ? error.message : "Unable to generate draft.";
    } finally {
      if (section.isConnected) {
        generationButton.disabled = false;
        setDraftControls();
      }
    }
  };

  generationButton.addEventListener("click", () => { void generateDraft(); });
  regenerateButton.addEventListener("click", () => { void generateDraft(); });
  copyButton.addEventListener("click", async () => {
    if (!currentDraft?.text) return;
    try {
      await navigator.clipboard.writeText(currentDraft.text);
      generationStatus.textContent = "Draft copied";
    } catch {
      generationStatus.textContent = "Copy failed — select the draft text manually";
    }
  });
  approveButton.addEventListener("click", () => {
    if (!currentDraft?.text) return;
    approvedDraftText = currentDraft.text;
    setDraftControls();
    generationStatus.textContent = "Draft approved locally — not sent";
  });

  try {
    const [overrides, profile] = await Promise.all([
      getConversationOverrides(session, conversationId),
      fetchProfile()
    ]);
    if (generation !== mountGeneration || !section.isConnected) return;
    const refreshSummary = (next: ConversationOverridesPayload) => {
      provenance.textContent = provenanceText(next);
      effective.textContent = effectiveText(profile, next);
    };
    refreshSummary(overrides);
    status.textContent = "Ready";
    disposeEditor = mountConversationOverridesEditor(editor, overrides, {
      onSave: async (next) => {
        const saved = await saveConversationOverrides(session, conversationId, next);
        if (!section.isConnected) return;
        refreshSummary(saved);
        status.textContent = "Saved";
      },
      onClear: async () => {
        await clearConversationOverrides(session, conversationId);
        if (!section.isConnected) return;
        refreshSummary({});
        status.textContent = "Cleared";
        disposeEditor?.();
        disposeEditor = mountConversationOverridesEditor(editor, {}, {
          onSave: async (next) => {
            const saved = await saveConversationOverrides(session, conversationId, next);
            refreshSummary(saved);
            status.textContent = "Saved";
          },
          onClear: async () => {
            await clearConversationOverrides(session, conversationId);
            refreshSummary({});
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