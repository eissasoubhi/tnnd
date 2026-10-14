/** Safety-critical, deterministic checks before any AI reply generation.
 * No model call is needed to know when a location detail is missing.
 */
export interface SafePersonalLocation {
  originCity?: string;
  residenceCity?: string;
  currentCity?: string;
  originNeighborhood?: string;
  residenceNeighborhood?: string;
  city?: string; // legacy TNND residence
  origin?: string; // legacy TNND origin
}
const norm = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
const nonempty = (value: unknown) => typeof value === "string" && value.trim().length > 1;
export type MissingLocationKey = "originNeighborhood" | "residenceNeighborhood" | "currentCity" | "residenceCity" | null;
export function missingPersonalLocationDetail(
  incoming: string,
  identity: SafePersonalLocation | undefined
): MissingLocationKey {
  const text = norm(incoming).slice(0, 1000);
  if (!text || !/[?？]|^(?:ou|quel|quelle|dans|t.es)/.test(text)) return null;
  const asksNeighborhood = /\b(?:quartier|coin|arrondissement|district|vers ou a|ou a casa|ou sur casa|whereabouts|which area)\b/.test(text)
    && /\b(?:tu|t.es|t'habites|t habites|vis|chez toi|ton|ta|you|your)\b/.test(text);
  if (asksNeighborhood) {
    const mentionsOrigin = /\b(?:casa|casablanca|maroc|origine|la-bas)\b/.test(text);
    const field = mentionsOrigin ? "originNeighborhood" : "residenceNeighborhood";
    if (!nonempty(identity?.[field])) return field;
    return null;
  }
  if (/\b(?:ou es.tu actuellement|tu es ou en ce moment|t.es ou maintenant|where are you now)\b/.test(text)
    && !nonempty(identity?.currentCity)) return "currentCity";
  if (/\b(?:tu habites dans quelle ville|tu vis dans quelle ville|where do you live)\b/.test(text)
    && !nonempty(identity?.residenceCity) && !nonempty(identity?.city)) return "residenceCity";
  return null;
}
export function personalLocationAnswerPolicy(identity: SafePersonalLocation | undefined): string {
  if (!identity) return "";
  const details = {
    originCity: identity.originCity || identity.origin || null,
    residenceCity: identity.residenceCity || identity.city || null,
    currentCity: identity.currentCity || null,
    originNeighborhood: identity.originNeighborhood || null,
    residenceNeighborhood: identity.residenceNeighborhood || null,
  };
  return [
    "Location identity fields (verified user configuration, not Tinder Passport): " + JSON.stringify(details),
    "Origin is where the user is from; residence is habitual home; current city is their temporary present location. Never swap these meanings.",
    "If a precise location/address/neighborhood or other personal biographical fact is missing, NEVER invent one or infer it from Tinder target cities or chat. Pause for a human answer instead of guessing."
  ].join("\n");
}
