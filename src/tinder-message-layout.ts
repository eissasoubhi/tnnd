import type { TinderMessageDirection } from "./tinder-message-evidence";

/** The composer is inside the chat column; document <main> may include Tinder's
 * profile sidebar. Never infer the sender from a full-width message wrapper. */
export interface HorizontalBounds {
  left: number;
  right: number;
  width: number;
}

export function directionFromChatColumnGeometry(
  bubble: HorizontalBounds,
  composer: HorizontalBounds
): TinderMessageDirection {
  if (![bubble.left, bubble.right, bubble.width, composer.left, composer.right, composer.width]
    .every(Number.isFinite)) return "unknown";
  if (composer.width < 150 || bubble.width < 2 || bubble.width >= composer.width * 0.78
      || bubble.right <= bubble.left || composer.right <= composer.left) return "unknown";
  // Do not classify bubbles that lie in a different Tinder panel/profile.
  if (bubble.right < composer.left - composer.width * 0.12
      || bubble.left > composer.right + composer.width * 0.12) return "unknown";
  const chatMiddle = (composer.left + composer.right) / 2;
  const bubbleMiddle = (bubble.left + bubble.right) / 2;
  const margin = Math.max(25, composer.width * 0.13);
  if (bubbleMiddle < chatMiddle - margin) return "them";
  if (bubbleMiddle > chatMiddle + margin) return "me";
  return "unknown";
}

/** Only use a message-sized bubble, not a message *row*. When the only
 * available DOM element spans the whole chat, return unknown rather than
 * guessing. The browser adapter may search inside the wrapper for a bubble. */
export function messageBubbleSized(bounds: HorizontalBounds, composer: HorizontalBounds): boolean {
  return bounds.width > 1 && composer.width > 0
    && bounds.width < composer.width * 0.78
    && bounds.right > bounds.left;
}
