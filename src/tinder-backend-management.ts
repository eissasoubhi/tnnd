import { getBackendSession } from "./storage";
import {
  DEFAULT_TINDER_CONVERSATION_MANAGEMENT,
  normalizeTinderConversationManagement,
  type TinderConversationManagement
} from "./tinder-ai-takeover-policy";

const API_BASE = "http://127.0.0.1:4000";

interface ThreadLookupPayload {
  conversation?: {
    id?: unknown;
    externalThreadId?: unknown;
    managementState?: unknown;
    explicitlySelected?: unknown;
  };
  error?: unknown;
}

export interface TinderBackendConversationManagement {
  conversationId: string | null;
  management: TinderConversationManagement;
}

export async function loadTinderConversationManagement(
  externalThreadId: string
): Promise<TinderBackendConversationManagement> {
  const threadId = externalThreadId.trim();
  if (!threadId) {
    return { conversationId: null, management: { ...DEFAULT_TINDER_CONVERSATION_MANAGEMENT } };
  }

  const session = await getBackendSession();
  if (!session) {
    return { conversationId: null, management: { ...DEFAULT_TINDER_CONVERSATION_MANAGEMENT } };
  }

  const response = await fetch(
    `${API_BASE}/api/v1/conversations/by-external-thread?externalThreadId=${encodeURIComponent(threadId)}`,
    { headers: { authorization: `Bearer ${session.token}` } }
  );

  if (response.status === 404) {
    return { conversationId: null, management: { ...DEFAULT_TINDER_CONVERSATION_MANAGEMENT } };
  }

  if (!response.ok) {
    throw new Error(`Conversation management lookup failed (${response.status}).`);
  }

  const payload = await response.json().catch(() => null) as ThreadLookupPayload | null;
  const conversation = payload?.conversation;
  const conversationId = typeof conversation?.id === "string" && conversation.id.trim()
    ? conversation.id.trim()
    : null;

  const management = normalizeTinderConversationManagement({
    state: typeof conversation?.managementState === "string"
      ? conversation.managementState as TinderConversationManagement["state"]
      : undefined,
    explicitlySelected: conversation?.explicitlySelected === true
  });

  return { conversationId, management };
}
