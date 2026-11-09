/** Safe, read-only explanations for why an already detected incoming
 * Tinder message is NOT authorized for automatic reply. Never grants consent,
 * never logs transcript, keys, prompt or raw backend errors.
 */
const backendReasons: Record<string,string> = {
  wrong_live_tinder_thread: "La conversation Tinder a changé pendant le contrôle.",
  conversation_not_synced: "Conversation absente de TNND Web : synchronise-la puis active sa gestion IA.",
  ai_management_not_enabled: "Gestion IA non activée pour cette conversation dans TNND Web.",
  ai_management_not_selected: "Conversation non sélectionnée explicitement pour la gestion IA dans TNND Web.",
  conversation_status_blocks_automation: "Statut de conversation bloquant dans TNND Web (pause, action humaine ou archive).",
  match_screening_blocks_or_unavailable: "Filtrage du match refusé ou données de filtrage indisponibles dans TNND Web.",
  backend_permission_check_failed: "Impossible de vérifier les autorisations auprès du backend TNND."
};
const semanticReasons: Record<string,string> = {
  conversation_ai_provider_not_configured:
    "Gemini non configuré dans TNND Web → AI provider. Enregistre le modèle et la clé API, puis teste la connexion.",
  conversation_ai_provider_unavailable:
    "Le Gemini configuré dans TNND Web ne répond pas. Utilise « Test connection » pour vérifier la clé, le modèle et les quotas.",
  invalid_conversation_boundary:
    "Historique visible non reconnu par l'API de vérification sémantique.",
  invalid_or_expired_session:
    "Session TNND Web expirée : reconnecte le compte TNND.",
  conversation_semantic_check_unavailable:
    "Échec interne du contrôle sémantique TNND (API/BD/fournisseur). Consulte les logs du backend.",
  conversation_boundary_backend_unreachable:
    "Le service worker TNND ne peut pas joindre l'API locale (127.0.0.1:4000). Vérifie que le backend est démarré.",
  conversation_boundary_bridge_unavailable:
    "Pont de vérification IA indisponible. Recharge l'extension TNND et l'onglet Tinder.",
  conversation_boundary_backend_rejected:
    "L'API TNND a refusé la vérification sémantique. Vérifie la version du backend et son journal.",
  invalid_conversation_boundary_response:
    "L'API TNND a renvoyé une réponse sémantique invalide. Vérifie sa version.",
  wrong_live_tinder_thread:
    "La conversation Tinder a changé pendant la vérification IA.",
  ai_management_not_authorized:
    "La conversation n'est plus autorisée en gestion IA dans TNND Web."
};
export function explainBackendReplyDenial(code: unknown): string {
  return typeof code === "string" && Object.hasOwn(backendReasons, code)
    ? backendReasons[code]
    : "Autorisation IA non confirmée par TNND Web (connexion API ou configuration à vérifier).";
}
export function explainSemanticCheckFailure(code: unknown): string {
  return typeof code === "string" && Object.hasOwn(semanticReasons, code)
    ? semanticReasons[code]
    : "Vérification sémantique impossible : contrôler la connexion TNND Web et les logs API.";
}
