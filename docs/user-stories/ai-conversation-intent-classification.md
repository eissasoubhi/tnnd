# TNND — classification IA des intentions de conversation (v0.2.38)

## Pourquoi
Les phrases de fin de conversation, accords, refus, « on passe sur une autre appli », simples acquiescements et leur négation ne peuvent pas être exhaustivement reconnus par des mots-clés. Les variations linguistiques (français, anglais, Darija, arabe, translittérations, emojis) sont illimitées. Le nouveau traitement interprète le **sens de l'échange**, non des occurrences littérales.

## User stories / acceptation

1. **US-SEM-01 — Comprendre le contexte.** À chaque nouveau tour entrant éligible, l'extension soumet l'observation de chat déjà vérifiée à l'API authentifiée. Seule l'API transmet les 12 derniers messages persistés au modèle Gemini configuré.
2. **US-SEM-02 — JSON structuré.** Résultat : `{kind, platform, confidence, evidence}` ; `kind` est un des 6 états `continue`, `rest`, `off-tinder`, `do-not-contact`, `acknowledgement`, `unknown` ; validation déterministe des clés/enums, du niveau de confiance et de la cohérence de preuve.
3. **US-SEM-03 — Garde-fou en cas d'incertitude.** Réponse malformée, échec réseau/modèle, confiance < 0,90, observation en décalage avec la base ou contexte ambigu : **aucun envoi**, aucune réactivation ou transition de statut. L'opérateur peut revoir la conversation. Aucun mécanisme ne « passe » automatiquement à `continue` pour contourner un échec.
4. **US-SEM-04 — Pas de régression de sécurité.** `rest` attend un échange clôturé mutuellement ; `off-tinder` requiert une invitation directe explicite ou un accord à une proposition sortante immédiatement précédente, ainsi qu'une plateforme définie ; `do-not-contact` requiert une consigne explicite. Aucun passage extérieur à Tinder n'est automatiquement effectué.
5. **US-SEM-05 — Coût maîtrisé.** L'API utilise un cache privé en mémoire, par utilisateur, conversation et empreinte du transcript, expirant après six heures (350 éléments maximum). Les vérifications de la base sont maintenues à chaque requête ; l'appel Gemini a un délai maximal de 12 secondes. Des erreurs de classification ne deviennent jamais des résultats positifs en cache.
6. **US-SEM-06 — Protection contre les courses.** La classification se produit hors transaction SQL ; le serveur verrouille ensuite la conversation et revérifie que son historique n'a pas changé avant une éventuelle transition de statut. Même après classification, l'extension refait ses vérifications de route, de droits, de quota et de déduplication avant l'envoi.

## Impact et limites
- Fichiers principaux : `src/conversation-boundary-policy.ts`, `src/conversation-reply-safety.ts`, `src/content.ts`, `apps/api/src/conversation-semantic-classifier.ts`, `apps/api/src/conversation-boundary-service.ts`, `apps/api/src/main.ts`.
- Appel **supplémentaire** Gemini sur la première observation de chaque nouveau tour (jusqu'à 12 s), réutilisé pour les recontrôles identiques grâce au cache. Le modèle n'est pas déterministe au même titre qu'un contrôle serveur : le seuil et la validation réduisent le risque, ils ne garantissent pas la justesse sémantique.
- Aucune migration de base ni nouvelle permission de navigateur.
- Les heuristiques des autres modules (style, pragmatique, langues, soupçon d'IA) ne sont **pas** toutes migrées dans cette PR. Les décisions de confidentialité et de consentement restent soumises à des règles déterministes.
- Tests simulés : aucun envoi réel Tinder ni affirmation de validation sur un compte connecté.
