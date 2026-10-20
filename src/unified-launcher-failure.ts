/** Minimal, non-authoritative operator guidance for rejected launcher commands.
 * Never modifies server or Chrome attempt history, automatically rearms,
 * assumes Tinder receipt, or retries an uncertain Like.
 */
export interface LauncherFailureGuidance {
  message: string;
  reviewAttempts: boolean;
  connectAccount?: boolean;
  extensionSettings?: boolean;
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
  if (technicalReason === "tnnd_extension_session_missing" ||
      technicalReason === "Connecte TNND à ton compte depuis le Web.") {
    return {
      message: "L'extension Chrome n'est pas connectée à TNND. Le site Web utilise une autre session. Ouvre la page de connexion de l'extension avec le lien ci-dessous.",
      reviewAttempts: false,
      connectAccount: true
    };
  }
  if (technicalReason === "daily_cap_auto_replies_disabled") {
    return {
      message: "Quota de Swipe atteint. La surveillance des conversations et matchs est désactivée dans les paramètres locaux de l'extension. Active les réponses automatiques uniquement si tu autorises leurs envois ; sinon TNND reste arrêté, sans nouveau Like.",
      reviewAttempts: false,
      extensionSettings: true
    };
  }
  if (technicalReason === "daily_cap_no_lower_priority_activity") {
    return {
      message: "Quota de Swipe atteint et aucune activité de priorité inférieure n'est disponible dans ta configuration Web. Aucun nouveau Like n'a été lancé.",
      reviewAttempts: false
    };
  }
  if (technicalReason === "daily_cap") {
    return {
      message: "Quota quotidien de Swipe atteint. Aucune autre activité n'est autorisée pour ce démarrage. TNND reste arrêté sans nouveau Like.",
      reviewAttempts: false
    };
  }
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
