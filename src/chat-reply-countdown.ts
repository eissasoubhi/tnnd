/** The countdown reflects only an actually scheduled content-script wait.
 * Gemini generation, network calls and Tinder delivery have NO predictable ETA.
 * Do not show a guessed time when there is no verified future deadline.
 */
export function chatReplyCountdownLabel(
  status: { active: boolean; phase: string | null; nextReplyAt: string | null },
  nowMs = Date.now()
): string {
  if (!status.active) return "Prochaine réponse : mode Chat inactif";
  if (status.phase === "generating") return "Réponse IA en préparation · durée inconnue";
  if (status.phase === "sending") return "Tentative d’envoi en cours · confirmation en attente";
  if (status.phase !== "waiting" || !status.nextReplyAt)
    return "Prochaine réponse : aucun envoi planifié";
  const dueMs = Date.parse(status.nextReplyAt);
  if (!Number.isFinite(dueMs) || !Number.isFinite(nowMs) ||
      dueMs < nowMs - 5 * 60_000 || dueMs > nowMs + 60 * 60_000)
    return "Prochaine réponse : échéance indisponible";
  const remaining = Math.max(0, Math.ceil((dueMs - nowMs) / 1000));
  if (remaining === 0) return "Délai écoulé · vérification de la réponse en cours";
  const minutes = Math.floor(remaining / 60);
  const seconds = String(remaining % 60).padStart(2, "0");
  return `Prochaine réponse : ${minutes}:${seconds}`;
}
