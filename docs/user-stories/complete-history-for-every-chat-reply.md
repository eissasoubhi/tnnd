# TNND — Relire tout l'historique avant chaque réponse (v0.2.41)

## Objectif
À chaque génération d'une réponse dans une conversation existante, l'IA doit avoir accès **à l'intégralité des messages déjà synchronisés pour cette conversation**. Un sujet ancien, une question déjà posée et répondue, une promesse, une correction ou un changement d'avis ne doivent pas être oubliés parce que le message est plus ancien que les 12 derniers tours ou situé en dehors du contexte DOM visible.

## User stories et critères d'acceptation
- **US-HISTORY-01 (historique intégral)** : à chaque réponse, le backend lit l'historique persistant complet, de la première à la dernière entrée, pour l'utilisateur authentifié et **la conversation exacte**. Pour les historiques dont la représentation fait moins de 110 000 caractères, les messages sont transmis **textuellement en entier** dans le prompt Gemini, dans leur ordre chronologique.
- **US-HISTORY-02 (historique volumineux)** : pour des échanges plus longs, **tous les messages** sont lus au travers de passages contigus de taille bornée. Chaque passage est analysé par le modèle IA (au maximum 3 appels parallèles) pour conserver les faits, sujets, anciennes questions/réponses, questions encore en suspens et corrections. Ces analyses sont assemblées puis compactées par l'IA si nécessaire. Aucun segment ne peut être supprimé silencieusement.
- **US-HISTORY-03 (continuité sémantique)** : le prompt demande explicitement de ne pas redemander un renseignement déjà donné, de ne pas réouvrir une ancienne question résolue et de faire un lien avec une discussion ancienne **seulement si c'est pertinent** pour le nouveau tour. La décision de pertinence appartient à l'IA, pas à des regex.
- **US-HISTORY-04 (Tinder virtuel / synchronisation)** : pour une réponse automatique, si l'historique serveur n'existe pas ou ne concorde pas avec la dernière bulle Tinder observée, **ne pas envoyer** ; éviter l'illusion d'un contexte complet à partir des quelques bulles actuellement montées dans le DOM.
- **US-HISTORY-05 (fiabilité)** : si la revue IA d'un seul segment échoue, ne jamais rédiger une réponse automatique à partir d'un extrait tronqué en prétendant disposer du contexte entier. La vérification du dernier message réel, l'autorisation, les limites Tinder et la déduplication d'envoi restent indépendantes.
- **US-HISTORY-06 (diagnostics / coûts)** : résultat `mode: verbatim | ai-reviewed`, `messageCount`, `segmentCount` disponibles côté code pour instrumentation ultérieure. Les textes des messages ne sont jamais ajoutés à des logs de diagnostic. Les conversations très longues nécessitent plusieurs appels Gemini avant la génération : latence et coût plus élevés sont une conséquence explicite de la relecture complète.

## Périmètre exact
L'« historique complet » signifie **tous les messages présents dans la base TNND pour ce chat**. Les vieux messages jamais importés depuis Tinder ne peuvent pas être relus et devront être synchronisés pour être inclus. Aucune requête réseau n'est lancée pour aller explorer automatiquement d'autres conversations, ni pour charger l'historique Tinder à l'insu de l'utilisateur.

## Implémentation
- `apps/api/src/conversation-full-history.ts` : construit un transcript entier ou déclenche l'analyse IA de tous les segments.
- `apps/api/src/conversation-generation-service.ts` + `apps/api/src/gemini-provider.ts` : brouillons Web.
- `apps/api/src/extension-suggestions.ts` : génération extension, contrôle de synchronisation pour les réponses automatiques, contexte complet issu de PostgreSQL.
- `apps/api/src/conversation-full-history.test.ts` : preuve de couverture de **chaque** message même si plus de 600 messages, échec bloquant en cas d'IA indisponible, dates non vérifiées ignorées, intégration des deux voies.

## Right Likes per day
**Déjà livré via PR #599 (v0.2.40)** : `maxRightSwipesPerDay: null`, sans plafond **TNND** par jour. Conserver les vérifications d'actions réelles, sessions, cadence, déduplication et limites imposées par Tinder. Ne pas remettre un champ de limite chiffrée.

## Limites des tests
Les tests couvrent les structures, l'intégralité de couverture, le JSON et la compilation ; pas d'envoi réel sur Tinder. Une revue IA peut perdre une nuance malgré la lecture de tous les segments : les préférences de génération doivent encourager la fidélité aux messages et la revue humaine en cas d'incertitude.
