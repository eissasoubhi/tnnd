# TNND Chat — compte à rebours et file des conversations sans réponse (v0.2.42)

## Besoin
Quand le mode **Chat** est actif dans le nouveau lanceur Swipe / Matches / Chat, afficher un petit compteur de temps restant avant la **prochaine étape programmée de réponse**. Les conversations avec **des messages entrants nouveaux non traités** doivent être contrôlées en premier, pas selon un ordre arbitraire.

## Parcours
- **Chat inactif** : « Prochaine réponse : mode Chat inactif ».
- **Chat actif, aucun message prêt** : « Prochaine réponse : aucun envoi planifié » ; on ne suppose pas un faux compte à rebours entre deux scans.
- **Une réponse est réellement programmée** : « Prochaine réponse : 1:04 » puis 1:03, 1:02… ; c'est le délai de cadence entre la détection d'un message entrant vérifié et la reprise des contrôles pré-génération, **pas une garantie de livraison**.
- **Délai écoulé** : « Délai écoulé · vérification de la réponse en cours ».
- **Gemini travaille** : « Réponse IA en préparation · durée inconnue ».
- **Tinder Send est tenté** : « Tentative d’envoi en cours · confirmation en attente ».
- **Données invalides/stale/arrêtées** : pas de timer artificiel. Le compteur se remet à zéro à chaque changement de phase, Stop, changement de conversation ou session.

## Priorités du Watcher
Tri déterministe, uniquement sur les **preuves techniques de la conversation** :
1. Nouveau message **entrant non encore contrôlé** avec badge non lu.
2. Nouveau message **entrant non encore contrôlé** confirmé par la dernière version synchronisée côté API (même sans badge).
3. Conversation avec badge non lu lorsque le backend montre encore un dernier message sortant (à contrôler, mais moins fiable).
4. Conversation entrante déjà consultée, à revérifier après son délai de sécurité.

À priorité égale : ancienneté de mise en file, puis identifiant technique stable. **Aucun tirage aléatoire** et aucune liste de mots-clés pour déduire les intentions. Les informations de file ne constituent jamais une autorisation d'envoyer : l'extension revérifie le message Tinder, les réglages, la décision Gemini, les quotas et les claims anti-doublons juste avant Send.

## Implémentation
- `src/content.ts` : annonce la vraie échéance `nextReplyAt` calculée à partir du délai de cadence effectif.
- `src/tinder-global-existing-runner.ts` : accepte l'échéance uniquement depuis l'onglet Tinder et la conversation qui appartiennent au runner, valide une échéance réaliste et la supprime aux transitions.
- `src/unified-controller-background.ts` : expose le champ **en lecture seule** pour le mode Chat uniquement.
- `src/chat-reply-countdown.ts` : formatage pur des états `waiting / generating / sending`.
- `public/launcher.html` et `src/launcher.ts` : compteur `role=timer` dans l'onglet Chat, rafraîchi toutes les secondes sans appel IA. Relecture du statut toutes les 10 s quand Chat est affiché.
- `src/tinder-reply-watcher.ts` : tri de file favorisant les entrantes effectivement en attente.
- `scripts/check-tinder-reply-watcher.mjs` : tests des échéances, refus d'ETA trompeuses, file et intégration.

## Limites
Ce timer **n'est pas** le temps restant avant un message Tinder livré : le temps Gemini, les nouvelles vérifications, le réseau, les blocages et le temps de Send sont imprévisibles. Les conversations non synchronisées dans TNND ne figurent pas dans la file. Les tests automatisés utilisent une fausse page Tinder ; aucun vrai message n'est envoyé.
