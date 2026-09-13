import { readSession } from "./auth-client";
import {
  draftLifecycleLabel,
  draftPreviewInstruction,
  emptyConversationDraftLifecycle,
  markDraftApproved,
  markDraftConfirmedSent,
  markDraftGenerated,
  setDraftPreviewPreset,
  toggleDraftFeedbackTag
} from "./conversation-draft-lifecycle";
import { generateConversationReply, type ConversationGeneration } from "./conversation-generation-client";
import { confirmConversationOutgoingMessage } from "./conversation-outgoing-confirmation-client";
import {
  clearConversationOverrides,
  getConversationOverrides,
  saveConversationOverrides
} from "./conversation-overrides-client";
import { resolveEffectiveConversationConfig, summarizeEffectiveConversationConfig } from "./conversation-effective-config";
import { mountConversationOverridesEditor } from "./conversation-overrides-editor";
import { summarizeOverrideProvenance } from "./conversation-overrides-provenance";
import type { ConversationOverridesPayload } from "./conversation-overrides-model";
import {
  CONVERSATION_PREVIEW_PRESETS,
  type ConversationPreviewFeedbackTag
} from "./conversation-preview-feedback";
import { fetchProfile } from "./profile-client";
import type { ImportedProfile } from "./profile-import";

const feedbackTags: ReadonlyArray<{ id: ConversationPreviewFeedbackTag; label: string }> = [
  { id: "too-long", label: "Too long" },
  { id: "too-short", label: "Too short" },
  { id: "too-formal", label: "Too formal" },
  { id: "too-direct", label: "Too direct" },
  { id: "not-direct-enough", label: "Not direct enough" },
  { id: "too-flirty", label: "Too flirty" },
  { id: "not-flirty-enough", label: "Not flirty enough" },
  { id: "not-natural", label: "Not natural" }
];

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
    .conversation-inline-generation textarea,.conversation-inline-generation input{width:100%;box-sizing:border-box}
    .conversation-inline-generation textarea{min-height:72px;resize:vertical}
    .conversation-inline-generation-actions,.conversation-inline-confirmation,.conversation-inline-feedback-options{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .conversation-inline-confirmation input{min-width:220px;flex:1 1 260px}
    .conversation-inline-feedback{display:grid;gap:6px;padding:8px;border:1px solid var(--border,#d4d4d8);border-radius:8px}
    .conversation-inline-feedback button[aria-pressed="true"]{font-weight:700;outline:2px solid currentColor;outline-offset:1px}
    .conversation-inline-generation-preview{white-space:pre-wrap;margin:0}
    .conversation-inline-generation-preview[data-approved="true"]{font-weight:600}
    .conversation-inline-generation-lifecycle{display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:11px}
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
      <div class="conversation-inline-feedback" data-generation-feedback hidden>
        <small><strong>Regeneration feedback</strong> — choose one preset and any useful tags.</small>
        <div class="conversation-inline-feedback-options" data-generation-presets aria-label="Preview regeneration presets"></div>
        <div class="conversation-inline-feedback-options" data-generation-tags aria-label="Preview feedback tags"></div>
        <small class="subtle" data-generation-feedback-summary>No regeneration steering selected.</small>
      </div>
      <div class="conversation-inline-confirmation">
        <input data-confirmation-message-id maxlength="500" placeholder="Confirmed Tinder message ID" aria-label="Confirmed Tinder message ID" disabled>
        <button type="button" data-confirmation-button disabled>Confirm sent</button>
      </div>
      <small class="subtle" data-confirmation-status>Confirmation records an already-sent Tinder message; it never sends one.</small>
      <div class="conversation-inline-generation-lifecycle">
        <span class="pill" data-generation-lifecycle>No draft</span>
        <span class="subtle">Generated → Approved locally → Confirmed sent</span>
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
  const generationLifecycle = section.querySelector<HTMLElement>("[data-generation-lifecycle]")!;
  const generationPreview = section.querySelector<HTMLElement>("[data-generation-preview]")!;
  const generationProvenance = section.querySelector<HTMLElement>("[data-generation-provenance]")!;
  const generationFeedback = section.querySelector<HTMLElement>("[data-generation-feedback]")!;
  const generationPresets = section.querySelector<HTMLElement>("[data-generation-presets]")!;
  const generationTags = section.querySelector<HTMLElement>("[data-generation-tags]")!;
  const generationFeedbackSummary = section.querySelector<HTMLElement>("[data-generation-feedback-summary]")!;
  const confirmationMessageId = section.querySelector<HTMLInputElement>("[data-confirmation-message-id]")!;
  const confirmationButton = section.querySelector<HTMLButtonElement>("[data-confirmation-button]")!;
  const confirmationStatus = section.querySelector<HTMLElement>("[data-confirmation-status]")!;
  const session = readSession();
  let currentDraft: ConversationGeneration | null = null;
  let lifecycle = emptyConversationDraftLifecycle();

  const renderFeedbackControls = () => {
    const hasDraft = lifecycle.phase !== "empty";
    generationFeedback.hidden = !hasDraft;
    generationPresets.innerHTML = "";
    for (const preset of CONVERSATION_PREVIEW_PRESETS) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = preset.label;
      button.disabled = !hasDraft || lifecycle.phase === "confirmed-sent";
      button.setAttribute("aria-pressed", String(lifecycle.feedback.presetId === preset.id));
      button.addEventListener("click", () => {
        const nextPreset = lifecycle.feedback.presetId === preset.id ? null : preset.id;
        lifecycle = setDraftPreviewPreset(lifecycle, nextPreset);
        renderFeedbackControls();
      });
      generationPresets.append(button);
    }
    generationTags.innerHTML = "";
    for (const tag of feedbackTags) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = tag.label;
      button.disabled = !hasDraft || lifecycle.phase === "confirmed-sent";
      button.setAttribute("aria-pressed", String(lifecycle.feedback.tags.includes(tag.id)));
      button.addEventListener("click", () => {
        lifecycle = toggleDraftFeedbackTag(lifecycle, tag.id);
        renderFeedbackControls();
      });
      generationTags.append(button);
    }
    generationFeedbackSummary.textContent = draftPreviewInstruction(lifecycle)
      ? "Selected feedback will steer Regenerate only; durable chat settings are unchanged."
      : "No regeneration steering selected.";
  };

  const setDraftControls = () => {
    const hasDraft = Boolean(currentDraft?.text);
    const approved = lifecycle.phase === "approved";
    regenerateButton.disabled = !hasDraft;
    copyButton.disabled = !hasDraft;
    approveButton.disabled = !hasDraft || approved || lifecycle.phase === "confirmed-sent";
    confirmationMessageId.disabled = !approved;
    confirmationButton.disabled = !approved || !confirmationMessageId.value.trim();
    generationPreview.dataset.approved = String(approved || lifecycle.phase === "confirmed-sent");
    generationLifecycle.textContent = draftLifecycleLabel(lifecycle);
    renderFeedbackControls();
  };

  if (!session) {
    status.textContent = "Sign in required";
    editor.innerHTML = '<p class="subtle">Connect your TNND account to edit this conversation.</p>';
    effective.textContent = "Sign in to resolve effective values.";
    generationButton.disabled = true;
    generationStatus.textContent = "Sign in required";
    return;
  }

  const generateDraft = async (regenerate = false) => {
    const latestMessage = generationMessage.value.trim();
    if (!latestMessage) {
      generationStatus.textContent = "Latest message required";
      return;
    }
    const previewInstruction = regenerate ? draftPreviewInstruction(lifecycle) : null;
    generationButton.disabled = true;
    regenerateButton.disabled = true;
    generationStatus.textContent = regenerate ? "Regenerating…" : "Generating…";
    try {
      const result = await generateConversationReply(session, conversationId, latestMessage, previewInstruction ?? undefined);
      if (!section.isConnected) return;
      currentDraft = result;
      lifecycle = markDraftGenerated(lifecycle, result.text);
      confirmationMessageId.value = "";
      confirmationStatus.textContent = "Confirmation records an already-sent Tinder message; it never sends one.";
      generationPreview.textContent = result.text;
      const sources = result.provenance.overriddenFields.length
        ? `Chat overrides: ${result.provenance.overriddenFields.join(", ")}. `
        : "Global defaults only. ";
      generationProvenance.textContent = `${sources}Persistent instruction: ${result.provenance.hasPersistentInstruction ? "yes" : "no"}; temporary instruction: ${result.provenance.hasTemporaryInstruction ? "yes" : "no"}; preview steering: ${result.provenance.hasPreviewInstruction ? "yes" : "no"}. Model: ${result.model}.`;
      generationStatus.textContent = regenerate && previewInstruction ? "Draft regenerated with preview feedback" : "Draft ready";
    } catch (error) {
      generationStatus.textContent = error instanceof Error ? error.message : "Unable to generate draft.";
    } finally {
      if (section.isConnected) {
        generationButton.disabled = false;
        setDraftControls();
      }
    }
  };

  generationButton.addEventListener("click", () => { void generateDraft(false); });
  regenerateButton.addEventListener("click", () => { void generateDraft(true); });
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
    lifecycle = markDraftApproved(lifecycle);
    setDraftControls();
    generationStatus.textContent = "Draft approved locally — awaiting confirmed send";
  });
  confirmationMessageId.addEventListener("input", setDraftControls);
  confirmationButton.addEventListener("click", () => {
    void (async () => {
      if (!currentDraft?.text || lifecycle.phase !== "approved") return;
      const externalMessageId = confirmationMessageId.value.trim();
      if (!externalMessageId) return;
      confirmationButton.disabled = true;
      confirmationStatus.textContent = "Recording confirmed send…";
      const sentAt = new Date().toISOString();
      try {
        const confirmation = await confirmConversationOutgoingMessage(session, conversationId, {
          externalMessageId,
          text: currentDraft.text,
          sentAt
        });
        if (!section.isConnected) return;
        lifecycle = markDraftConfirmedSent(lifecycle, confirmation.externalMessageId, sentAt);
        const instruction = confirmation.temporaryInstructionScope
          ? `${confirmation.temporaryInstructionScope}${confirmation.temporaryInstructionRemaining !== null ? ` (${confirmation.temporaryInstructionRemaining} remaining)` : ""}`
          : "cleared";
        confirmationStatus.textContent = confirmation.accepted
          ? `Confirmed. Temporary instruction: ${instruction}.`
          : `Already confirmed earlier. Temporary instruction: ${instruction}.`;
        generationStatus.textContent = confirmation.accepted ? "Confirmed sent" : "Already confirmed";
      } catch (error) {
        confirmationStatus.textContent = error instanceof Error ? error.message : "Unable to confirm the outgoing message.";
      } finally {
        if (section.isConnected) setDraftControls();
      }
    })();
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