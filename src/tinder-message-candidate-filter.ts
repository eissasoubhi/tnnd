/** Tinder may label the Send button "Send message". That is not a chat bubble.
 * Keep interactive controls and navigation out of fallback message detection,
 * even when their accessible label includes "message".
 */
export const NON_MESSAGE_UI_CONTROL_SELECTOR =
  'form, button, input, textarea, select, [contenteditable="true"], [role="button"], [role="textbox"], nav, [role="navigation"]';

export function isTinderMessageUiControl(node: Pick<HTMLElement, "closest">): boolean {
  return node.closest(NON_MESSAGE_UI_CONTROL_SELECTOR) !== null;
}
