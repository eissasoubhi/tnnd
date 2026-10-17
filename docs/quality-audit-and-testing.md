# TNND — Tester et auditer la qualité de l'IA

> Guide utilisateur et opérateur, version initiale. Aucun test GitHub Actions ne remplace un essai Chrome/Tinder réel.

## 1. Préparation locale

1. Installer Node.js 22 et lancer Docker Desktop puis votre base PostgreSQL locale.
2. Dans `apps/api`, installer les dépendances avec `npm ci`, configurer `DATABASE_URL` dans votre environnement local, puis exécuter `npm run migrate`.
3. Démarrer l'API avec `npm run dev` dans `apps/api`.
4. Dans `apps/web`, lancer `npm ci` puis `npm run dev`. Se connecter dans TNND Web avec le **même compte** que l'extension Chrome.
5. À la racine, exécuter `npm ci && npm run build`, puis charger l'extension compilée dans Chrome si elle n'est pas déjà à jour.

Ne placez jamais de mot de passe ou URL de base avec identifiants dans une issue GitHub, une PR ou un terminal enregistré publiquement. Vous pouvez préparer une base jetable pour les premiers essais.

## 2. Contrôles automatisés de code

    # À la racine
    npm ci
    npm run build

    # Dans apps/api
    npm ci
    npm run typecheck
    npm test
    npm run migrate

    # Dans apps/web
    npm ci
    npm run typecheck
    npm test
    npm run build

La CI GitHub (API CI, Web CI, CI, V1 Release Gate) teste l'intégrité technique sur environnement de test, pas la livraison d'un message Tinder réel.

## 3. Test manuel, sans envoi non souhaité

1. Ouvrir TNND Web et l'extension avec la même session, vérifier la version/commit et l'état de connexion.
2. Commencer par importer une conversation visible **en lecture seule**. Vérifier le nom, les directions incoming/outgoing, les horodatages, le dernier message et la déduplication après un deuxième import.
3. Dans TNND Web, vérifier que Analytics et Conversation style audit reflètent les messages synchronisés, et qu'aucune conversation privée n'est visible dans le rapport d'audit.
4. Dans une conversation test explicitement autorisée, créer une suggestion **sans l'envoyer** : vérifier langue, détails factuels, absence d'emojis excessifs ou de rires automatiques, questions pertinentes et statut du brouillon.
5. Tester Pause et prise de contrôle manuelle, vérifier qu'aucune nouvelle réponse automatique ne part pendant la pause.
6. Avec l'accord du propriétaire du compte et une conversation de test prévue, vérifier le cycle réel envoi -> confirmation Tinder -> historique synchronisé. Comparer la preuve de livraison ; un brouillon ou clic n'est pas une confirmation.
7. Vérifier les fins de conversation, demandes explicites de ne plus écrire et échanges Instagram/WhatsApp sur **des scénarios consentis**, sans envoi automatique hors Tinder.
8. Changer de compte et vérifier que les conversations, scores et historiques du compte précédent ne réapparaissent pas.

Avant d'affirmer la release prête, suivre `docs/v1-release-checklist.md` et conserver les diagnostics expurgés de secrets.

## 4. Audit depuis l'interface

Ouvrir **Analytics → Conversation style audit → Run audit**. L'API authentifiée lit jusqu'aux 600 derniers messages synchronisés appartenant au compte connecté. Aucun envoi Tinder, aucun appel Gemini et aucune mutation des réglages.

Le tableau de bord affiche nombre de messages entrants/sortants, nombre de conversations, occurrences d'emojis, expressions de rire, formules formelles, longueurs et paires de langues classifiables. L'audit compare désormais aussi la fréquence des emojis et rires du côté de l'utilisateur **et du côté des matchs**, sur le même échantillon global : si les deux personnes utilisent naturellement beaucoup d'emojis, le système évite de suggérer une réduction automatique. Cette comparaison globale n'est pas une preuve des préférences d'un match précis. Les alertes sont heuristiques ; en dessous de dix réponses sortantes, l'échantillon est considéré comme insuffisant. L'interface ne renvoie **jamais** le texte des conversations.

## 5. Audit par commande, en lecture seule

Dans `apps/api`, avec la base locale accessible :

    npm run audit:quality -- --user-id=<UUID_DU_COMPTE>

Cette commande retourne un JSON avec statistiques agrégées et recommandations. L'UUID interne est nécessaire pour cibler le bon compte ; il ne figure pas dans la sortie d'audit. Pour n'afficher qu'un succès/échec, utiliser `--quiet`.

Le rapport ne prétend pas savoir si une réponse a été écrite par IA ni évaluer la réussite des échanges. Il n'analyse pas encore les hallucinations, la véracité de chaque fait, la pertinence sentimentale ou les retours humains de chaque match. Un examen qualitatif manuel demeure nécessaire.

## 6. Réglages initiaux conseillés (à adapter à chaque match)

| Réglage | Point de départ | Pourquoi |
| --- | --- | --- |
| Tone | `warm` | détendu et attentif, pas administratif |
| Emoji level | `low` | pas d'emoji systématique ; éviter le maximum |
| Message length | `short` | répondre précisément au dernier message |
| Humor level | `45` | humour contextualisé, limiter haha/mdr répétés |
| Directness | `50` | équilibre, ajustable selon la personne |
| Language adaptation | activée si souhaitée | tenir compte des messages entrants et des choix manuels par chat |
| Grammar | écriture naturelle et correcte | contractions usuelles acceptées ; **ne pas injecter de fautes artificielles** |

Préférer des formulations simples, éventuellement familières si le contexte le permet. Ne jamais inventer un fait personnel, une ville, un contact ou un engagement. Si un match pose une question directe sur l'usage de l'IA, ne pas mentir ni esquiver ; une intervention humaine peut être requise.

## 7. Interprétation et cycle d'amélioration

Après chaque audit : examiner les alertes prioritaires, inspecter quelques réponses (sur votre propre poste, pas dans les logs GitHub), identifier la cause probable (profil global, overrides, prompt, mémoire, synchronisation), puis **ne changer qu'un groupe de réglages à la fois**. Comparer les prochains échanges et conserver les résultats avant/après. Un fort taux d'emojis peut être adapté si l'interlocuteur les utilise également.

Surveiller aussi la couverture des mémoires, les états `action-required`, les erreurs techniques et les validations manuelles. Une alerte statistique seule ne justifie jamais de modifier automatiquement les paramètres. La revue humaine des textes et de leur exactitude reste nécessaire.

## 8. Audits réguliers avec un runner GitHub Actions local

Voir `docs/local-quality-audit-runner.md` pour l'installation sécurisée du runner, la périodicité, l'emplacement des rapports et les limitations. Le système initial fonctionne uniquement si la machine locale, Docker et PostgreSQL sont effectivement disponibles.
