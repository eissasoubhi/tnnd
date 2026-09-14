import type { AuthSession } from "./auth-client";
import { createMatchProfilePanel } from "./match-profile-panel";

const apiBase = (import.meta.env.VITE_TNND_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "http://127.0.0.1:4000";

export function mountConversationMatchProfile(
  host: HTMLElement,
  session: AuthSession,
  conversationId: string
): void {
  const panel = createMatchProfilePanel({ apiBase, token: session.token, conversationId });
  host.replaceChildren(panel.element);
  void panel.load();
}
