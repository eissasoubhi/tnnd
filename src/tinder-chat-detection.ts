import { classifyTinderPath } from "./tinder-state-machine.ts";
import { tinderThreadKeyFromPath } from "./tinder-thread-identity.ts";

export interface TinderChatDetection {
  threadKey: string | null;
  source: "route-and-composer" | "route-only" | "not-a-conversation";
  composerFound: boolean;
}

/**
 * Trust only a confirmed conversation route for per-chat identity. The editor
 * may be hidden/replaced by Tinder, but this must never imply a safe send.
 * Neither a visible composer on Discovery nor a Messages sidebar alone is a
 * stable conversation identifier.
 */
export function detectTinderChat(path: string, composerFound: boolean): TinderChatDetection {
  const route = classifyTinderPath(path);
  if (route.state !== "conversation" || !route.conversationRef) {
    return { threadKey: null, composerFound, source: "not-a-conversation" };
  }
  return {
    threadKey: tinderThreadKeyFromPath(path),
    composerFound,
    source: composerFound ? "route-and-composer" : "route-only"
  };
}

/**
 * An older popup used '<path>|<document.title>' while message automation used
 * '<path>'. Migrate the previous local settings without changing any thread
 * identity, adding guessed selectors, or overwriting a canonical entry.
 */
export function findLegacyChatSettingsKey(
  savedKeys: readonly string[],
  canonicalThreadKey: string
): string | null {
  return savedKeys.find(key => key.startsWith(canonicalThreadKey + "|")) ?? null;
}
