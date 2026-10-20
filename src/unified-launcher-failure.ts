/** Minimal, non-authoritative operator guidance for rejected launcher commands.
 * Never modifies server or Chrome attempt history, automatically rearms,
 * assumes Tinder receipt, or retries an uncertain Like.
 */
export interface LauncherFailureGuidance {
  message: string;
  reviewAttempts: boolean;
}

const REVIEW_REASONS = new Set([
  "server_attempt_unresolved",
  "reservation_day_mismatch",
  "reservation_count_mismatch",
  "server_attempts_not_fully_resolved",
  "local_observed_count_mismatch",
  "local_attempt_count_exceeds_server",
  "corrupt_local_progress_requires_review"
]);

export function explainLauncherStartRefusal(reason: string | undefined): LauncherFailureGuidance {
  const technicalReason = typeof reason === "string" && reason.length > 0
    ? reason.slice(0, 160) : "commande_non_confirmee";
  if (technicalReason === "server_attempt_unresolved") {
    return {
      message: "Un ancien Like reste sans résultat confirmé. Les nouveaux Likes sont bloqués jusqu'à la revue manuelle dans TNND Web. Aucun Like n'a été relancé.",
      reviewAttempts: true
    };
  }
  if (REVIEW_REASONS.has(technicalReason)) {
    return {
      message: "Les journaux des Likes nécessitent une vérification (" +
        technicalReason + "). N'efface pas les tentatives; examine-les dans TNND Web.",
      reviewAttempts: true
    };
  }
  return { message: "Démarrage refusé : " + technicalReason, reviewAttempts: false };
}
