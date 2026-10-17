/**
 * Read an ephemeral fingerprint of the active Discovery card.
 * The sidebar's match avatars (.recCard__img) are deliberately ignored.
 * Never store, transmit or log this return value (it may contain a photo URL).
 */
export function activeTinderDiscoveryCardMarker(doc: Document): string | null {
  const active = Array.from(doc.querySelectorAll<HTMLElement>(
    '.recsCardboard__cards > [data-keyboard-gamepad][aria-hidden="false"]:not([inert])'
  )).filter(el => {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
  if (active.length !== 1) return null;
  const firstSlide = active[0].querySelector<HTMLElement>(".keen-slider__slide");
  const image = firstSlide?.querySelector<HTMLElement>('[style*="url("]');
  const marker = image?.getAttribute("style") ?? null;
  return marker && marker.includes("url(") ? marker : null;
}
