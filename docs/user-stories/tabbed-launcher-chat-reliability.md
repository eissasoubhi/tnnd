# TNND — onglets de contrôle et fiabilité Chat (v0.2.34)

## User stories et critères d'acceptation

| ID | Besoin | Acceptation |
| --- | --- | --- |
| US-POP-01 | Voir trois onglets distincts Swipe / Matches / Chat | Swipe est l'onglet **visuel** par défaut. Aucun moteur ne démarre en ouvrant le popup ou en changeant d'onglet. Onglets accessibles avec clavier et `aria-selected`. |
| US-POP-02 | Chaque activité possède un bouton et ses informations | Swipe : son bouton explicite + quotas serveur (jamais 0 fictif). Matches : bouton, phase du watcher et indication des autorisations de premier message. Chat : bouton, phase/raison actuelle, nombre de conversations en attente uniquement si confirmé. |
| US-POP-03 | Arrêter/switcher sans doublon | Démarrer/Arrêter global selon priorités Web reste disponible. Chaque bouton de panneau démarre le mode demandé, ou l'arrête s'il est déjà actif. Bascule vers un mode différent passe par le contrôleur exclusif. Tous les garde-fous quota/auth/autorisation sont inchangés. |
| US-POP-04 | Distinguer le mode affiché du mode réellement actif | Le statut moteur global et le point sur le bon onglet dérivent uniquement du service worker. Un clic d'onglet ne prétend jamais démarrer un moteur. Échec de transition explicite. |
| US-CHAT-01 | Ne pas perdre des scans sur une page Tinder qui change souvent | Un débat incessant dans le DOM ne doit pas repousser indéfiniment `scan()` : attente bornée à 3 s. Aucun polling de Send supplémentaire. |
| US-CHAT-02 | Éviter les vérifications longues lorsque le dernier message était entrant | Après une ouverture de chat non traitée, un message toujours entrant est revérifié après 2 min, plutôt que 30 min. Les conversations sortantes gardent 6 h de délai d'inactivité, et l'historique `processed` / claim conserve la protection anti-doublon. |
| US-CHAT-03 | Comprendre les retards et les annulations | Le popup Chat affiche l'étape réelle du watcher : attente du délai configuré, génération IA, envoi, annulé, hors autorisation, erreur. Ne jamais déclarer une livraison Tinder confirmée sur une simple tentative de clic. |
| US-CHAT-04 | Ne jamais doubler un message incertain | Aucun retry automatique d'une tentative après claim durable. Une réponse interrompue par nouveau message, un changement manuel, une règle ou une indisponibilité n'est pas automatiquement rejouée. Aucune suppression d'état ni modification de quota. |

## Diagnostic établi par lecture de code

- `src/content.ts` impose un délai aléatoire configurable avant génération (généralement 20–60 s selon les paramètres), puis les contrôles de sécurité et l'attente du modèle. Le correctif **ne réduit pas** les délais décidés dans les préférences.
- `MutationObserver(scheduleScan)` annulait et recréait le timeout 900 ms à chaque mutation : une page très active pouvait priver le scanner d'exécution. Le délai total est maintenant borné à 3 s ; le verrou du scanner couvre aussi la phase de précontrôle.
- `src/tinder-existing-thread-index.ts` marquait les conversations vérifiées à l'ouverture, même lorsqu'une erreur temporaire empêchait ensuite le traitement ; le délai de revisite des entrantes était de 30 min. Nouveau délai : 2 min, sans nouvelle permission d'envoi.
- Les raisons « génération vide » et « conversation modifiée pendant l'attente » étaient silencieuses et apparaissent désormais comme événements opérationnels.

## Impact technique

Extension : `public/launcher.html`, `src/launcher.ts`, `src/unified-controller-background.ts`, `src/content.ts`, `src/tinder-existing-thread-index.ts`. Tests unitaires/CI navigateur associés. Pas de migration BDD, permission Chrome supplémentaire, intégration API externe nouvelle ou transfert de données privées.

## Limites des validations

Les tests synthétiques vérifient les contrôles et la non-régression, **pas** la distribution réelle des latences Gemini ni la confirmation d'envoi Tinder sur un compte connecté. Pour investiguer une conversation particulière, consulter la phase/raison dans le popup et les diagnostics d'extension sans partager les messages privés.
