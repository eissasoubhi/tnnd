export type ConversationDraftPhase = "empty" | "generated" | "approved" | "confirmed-sent";

export interface ConversationDraftLifecycle {
  phase: ConversationDraftPhase;
  text: string | null;
  generatedAt: string | null;
  approvedAt: string | null;
  confirmedSentAt: string | null;
  externalMessageId: string | null;
}

export function emptyConversationDraftLifecycle(): ConversationDraftLifecycle {
  return {
    phase: "empty",
    text: null,
    generatedAt: null,
    approvedAt: null,
    confirmedSentAt: null,
    externalMessageId: null
  };
}

export function markDraftGenerated(
  previous: ConversationDraftLifecycle,
  text: string,
  now = new Date().toISOString()
): ConversationDraftLifecycle {
  const normalized = text.trim();
  if (!normalized) throw new Error("draft_text_required");
  return {
    ...previous,
    phase: "generated",
    text: normalized,
    generatedAt: now,
    approvedAt: null,
    confirmedSentAt: null,
    externalMessageId: null
  };
}

export function markDraftApproved(
  previous: ConversationDraftLifecycle,
  now = new Date().toISOString()
): ConversationDraftLifecycle {
  if (previous.phase !== "generated" || !previous.text) throw new Error("generated_draft_required");
  return { ...previous, phase: "approved", approvedAt: now };
}

export function markDraftConfirmedSent(
  previous: ConversationDraftLifecycle,
  externalMessageId: string,
  sentAt: string
): ConversationDraftLifecycle {
  if (previous.phase !== "approved" || !previous.text) throw new Error("approved_draft_required");
  const messageId = externalMessageId.trim();
  if (!messageId) throw new Error("external_message_id_required");
  const parsedSentAt = Date.parse(sentAt);
  if (Number.isNaN(parsedSentAt)) throw new Error("valid_sent_at_required");
  return {
    ...previous,
    phase: "confirmed-sent",
    confirmedSentAt: new Date(parsedSentAt).toISOString(),
    externalMessageId: messageId
  };
}

export function draftLifecycleLabel(state: ConversationDraftLifecycle): string {
  switch (state.phase) {
    case "empty":
      return "No draft";
    case "generated":
      return "Generated — review required";
    case "approved":
      return "Approved locally — awaiting confirmed send";
    case "confirmed-sent":
      return "Confirmed sent";
  }
}
