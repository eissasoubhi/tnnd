# US — Sélection manuelle des modes (lanceur TNND)

Date : 23 octobre 2026 · Version cible : v0.2.31 · Statut : implémentation avec tests synthétiques ; confirmation Tinder réelle à réaliser.

## Contrat produit

Sous **Arrêter** (ou **Démarrer** lorsque l'automatisation est arrêtée), le lanceur propose trois boutons égaux : **Swipe | Matches | Chat**. Un clic est un **ordre de démarrage / bascule**, pas un simple onglet visuel. Le contrôleur doit confirmer l'activité réellement active avant d'afficher le bouton sélectionné.

L'ordre automatique configuré dans TNND Web demeure inchangé. Un choix manuel prend la priorité **jusqu'au prochain arrêt**. Après Arrêter puis Démarrer, les priorités Web sont de nouveau appliquées. Un bouton manuel ne contourne jamais la connexion, les permissions, les journaux de tentatives ou les quotas.

| ID | User story | Critères d'acceptation | Impact technique | Risque |
| --- | --- | --- | --- | --- |
| US-MODE-01 | En tant qu'utilisateur, je vois Arrêter puis trois boutons Swipe/Matches/Chat. | Boutons sous l'action principale ; au moins 44 px de haut ; clavier, focus et état actif avec texte/contour. | `public/launcher.html`, `src/launcher.ts` | Faible |
| US-MODE-02 | Je clique Swipe pour choisir l'activité Swipe, même après Chat. | Vérifier l'unique onglet Tinder sur Découvrir, Web actif, quotas du jour et rapprochement des tentatives avant toute activation. Refuser sans arrêter l'ancien moteur si le précontrôle échoue. | `src/unified-controller-background.ts`, politique de sécurité, moteur Swipe existant | Élevé |
| US-MODE-03 | Je clique Matches pour prioriser l'examen des matchs et premiers messages autorisés. | Watcher unifié en mode manuel Matches ; persistance après fermeture du popup ; ne pas repartir automatiquement sur les chats une fois les matchs visibles épuisés. Les preuves de match, quota de premier message et consentement demeurent obligatoires. | `src/tinder-global-existing-runner.ts`, `src/tinder-watcher-match-cycle.ts` (réutilisé) | Élevé |
| US-MODE-04 | Je clique Chat pour traiter uniquement les réponses en attente. | Watcher en mode manuel Chat ; scan des nouveaux matchs désactivé ; les conversations non autorisées/avec action humaine restent exclues. | `src/tinder-global-existing-runner.ts`, politique de gestion existante | Moyen |
| US-MODE-05 | Je change de mode pendant une opération. | Refus explicite pendant génération/envoi/navigation/verrou de suivi, vérification Match ou Like non soldé ; ne pas envoyer ni rejouer deux fois ; ne jamais exécuter deux moteurs concurrents. | précontrôles, Stop sérialisé, stockage de maîtrise | Critique |
| US-MODE-06 | Je consulte le mode effectif après bascule/rechargement. | Statut interrogé auprès du service worker, jamais optimiste. Bouton actif = moteur confirmé ; erreur détaillée en cas d'échec ; données persistées sans texte sensible. | `src/launcher.ts`, contrôleur, `chrome.storage.local` | Moyen |
| US-MODE-07 | Je fais Arrêter après une sélection manuelle. | Arrêt de toutes les activités, conservation des quotas, arrêt de la préférence manuelle. Démarrer suivant utilise les priorités Web. | Stop central existant, MASTER | Élevé |
| US-MODE-08 | Le quota Swipe est atteint ou l'API est indisponible. | Pas de repli automatique caché pour un Swipe explicitement sélectionné ; possibilité de sélectionner Matches/Chat uniquement si les vérifications de sécurité passent ; aucun zéro inventé. | contrôleur, quota, affichage du popup | Élevé |

## Décisions et impacts de migration

- **État** : ajout de `manualMode` au stockage du contrôleur `tnnd.unifiedLauncher.v1` et de `manualActivity` au watcher `tnnd.globalExistingRunner.v2`, champs facultatifs compatibles avec les anciennes sessions. Aucun schéma PostgreSQL et aucune migration.
- **Modes internes** : Swipe = `swipe`, Matches = `new-match`, Chat = `active-chat`. Pas de quatrième moteur ; le watcher réutilise son architecture existante.
- **Contrôle d'accès** : nouvelle commande `TNND_UNIFIED_SELECT_MODE`, acceptée uniquement du popup du lanceur ; entrée strictement typée. Web garde l'autorité sur paramètres, comptes, quotas et autorisations.
- **Sécurité** : deux vérifications du journal Swipe pour une bascule Swipe → autre activité, avant puis après désarmement durable. Si la seconde échoue, Swipe reste arrêté et aucun nouveau moteur ne démarre. Le manuel ne relance pas des Likes incertains.
- **Mode Matches** : lorsqu'il n'y a plus de match éligible, rester en veille Matches, selon la cadence existante, plutôt que basculer automatiquement sur Chat. Bloquer les réponses automatiques aux conversations existantes avant génération et à nouveau avant chaque envoi ; préserver les premiers messages sous leurs autorisations séparées. Aucun contournement de la limite de premiers messages.
- **Mode Chat** : pas d'inspection périodique des Matches en période d'attente. Les messages dans une conversation déjà ouverte sont toujours soumis aux contrôles de sécurité habituels.
- **Déploiement** : mise à jour synchronisée de `package.json` et `manifest.json` vers 0.2.31 ; reconstruction et recharge Chrome requises.

## Scénarios de validation

1. Popup arrêté : clic de chaque mode ; refus explicite si déconnecté ; aucun propriétaire activé.
2. Mode actif : autre mode sélectionné seulement après vérification ; l'ancien propriétaire disparaît avant activation du nouveau.
3. Retour Swipe depuis Chat sans page Découvrir : conserver Chat et expliquer l'action manuelle nécessaire.
4. Swipe avec quota épuisé : refuser le Swipe manuel, ne jamais déclencher de mode de secours implicite.
5. Swipe avec Like local ou serveur non résolu / inconnu : refuser la bascule. Nouvelle vérification après Stop obligatoire.
6. Watcher en cours de génération/envoi/verification Match : refuser et conserver le mode initial.
7. Matches épuisés : ne pas dériver vers Chat ; Chat : ne pas relancer la détection périodique des matchs.
8. Stop, fermeture/réouverture popup, redémarrage du worker : mode confirmé lu du stockage ; pas d'activité fantôme.
9. Matches : aucun envoi automatique en réponse à un chat existant, même après une attente Gemini ou entre deux bulles ; les premiers messages autorisés restent indépendants.
10. Exécution des tests de politique et de la CI standard ; essais sur un compte Tinder réel **non couverts par les tests synthétiques**.

## Périmètre exclu / vigilance

Le changement manuel ne résout ni un backend arrêté, ni une connexion TNND invalide, ni l'absence de conversations synchronisées. Il n'accélère pas les cadences et ne force pas une réponse lorsqu'elle est interdite. Vérifier en navigateur autorisé que le nouveau garde-fou du service worker empêche effectivement toute réponse automatique à un chat existant pendant Matches, y compris après attente du modèle et entre plusieurs bulles. Les notifications de messages et la synchronisation en lecture seule restent possibles.
