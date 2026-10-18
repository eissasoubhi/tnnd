/**
 * Recognize ONLY Tinder's post-Like "Upgrade Your Like!" upsell.
 *
 * This is a DOM-only, opt-in assistant for the current explicitly reserved
 * Like. It is not a general popup closer and never touches Super Like.
 * If Tinder changes its wording/markup or the state is ambiguous, fail closed.
 */
export type UpgradeLikeOffer =
  | { status: "none" }
  | { status: "ambiguous" }
  | { status: "recognized"; dismissButton: HTMLButtonElement };

function normal(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim().toLocaleLowerCase("en-US");
}
function visible(node: HTMLElement): boolean {
  if (node.hidden || node.closest('[hidden],[aria-hidden="true"]')) return false;
  const rect = node.getBoundingClientRect();
  const style = getComputedStyle(node);
  return rect.width > 0 && rect.height > 0 &&
    style.display !== "none" && style.visibility === "visible" &&
    style.pointerEvents !== "none" && Number(style.opacity) !== 0;
}

/** Only inspect visible, modal-role dialogs; do not match profile or chat text. */
export function findUpgradeLikeOffer(doc: Document): UpgradeLikeOffer {
  const dialogs = Array.from(doc.querySelectorAll<HTMLElement>(
    '[role="dialog"][aria-modal="true"]'
  )).filter(visible);
  if (dialogs.length === 0) return { status: "none" };
  if (dialogs.length !== 1) return { status: "ambiguous" };
  const dialog = dialogs[0];
  const heading = Array.from(dialog.querySelectorAll<HTMLElement>("h1,h2,h3,[role='heading']"))
    .filter(visible);
  if (heading.length !== 1 || !/^upgrade your like!?$/.test(normal(heading[0].textContent)))
    return { status: "ambiguous" };
  const buttons = Array.from(dialog.querySelectorAll<HTMLButtonElement>("button"))
    .filter(visible);
  const matches = (label: string) => buttons.filter(button =>
    normal(button.textContent) === label && !button.disabled &&
    button.getAttribute("aria-disabled") !== "true"
  );
  // Both distinctive choices must be present and unique; the button
  // labeled "Send Super Like" is NEVER clicked.
  const noThanks = matches("no thanks");
  const superLike = matches("send super like");
  return noThanks.length === 1 && superLike.length === 1
    ? { status: "recognized", dismissButton: noThanks[0] }
    : { status: "ambiguous" };
}
