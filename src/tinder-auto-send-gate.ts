import { mayAiTakeOverTinderConversation } from "./tinder-ai-takeover-policy";
import {
  conversationStatusAllowsTinderAutomation,
  type TinderBackendConversationManagement
} from "./tinder-backend-management";

/** Fail closed. A global toggle or chat-local toggle alone NEVER authorizes a send. */
export function mayAutomaticallySendToTinder(
  backend: TinderBackendConversationManagement | null
): boolean {
  return Boolean(
    backend?.conversationId
    && backend.conversationStatus
    && conversationStatusAllowsTinderAutomation(backend.conversationStatus)
    && mayAiTakeOverTinderConversation(backend.management)
  );
}
