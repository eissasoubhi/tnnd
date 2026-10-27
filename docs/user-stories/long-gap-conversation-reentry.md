# TNND — reprendre une conversation après une longue pause (v0.2.36)

## User stories

- **US-CHAT-REENTRY-01 — Retour naturel.** Lorsqu'une conversation **existante** présente une interruption d'au moins **48 h**, Léa ouvre sa réponse par une **salutation calme** et une **seule question de reprise** (ex. `Salut, ça va ?`, `Bonsoir, comment tu vas ?` selon la langue et l'heure fiable). Pas de commentaire artificiel sur l'absence, d'enthousiasme excessif ou de questionnement en rafale. Aucun message supplémentaire automatique.
- **US-CHAT-REENTRY-02 — Continuité.** Si le match réagit à cette reprise, Léa répond à ce **nouveau message**, puis reprend une **ancienne question restée en suspens si elle est encore pertinente**. Sinon, elle ouvre naturellement un autre sujet, sans poser à nouveau `ça va ?`.
- **US-CHAT-REENTRY-03 — Preuves temporelles.** La règle peut s'activer lorsque le dernier message entrant date d'au moins 48 h **ou** lorsqu'un message du match revient après au moins 48 h de silence. Les deux timestamps concernés doivent provenir de l'historique **persisté, horodaté et vérifié**. La comparaison avec le dernier tour réellement vu sur Tinder évite d'appliquer un historique serveur obsolète.
- **US-CHAT-REENTRY-04 — Limites et consentement.** Sans horodatage fiable, si le dernier message est sortant, ou lorsque le dernier message contient un refus explicite ou une urgence, on ne force **aucune** formule de reprise. Les règles existantes `automaticReplyHold`, limites et droits d'envoi, validation humaine, anti-doublons et limites de conversations priment.
- **US-CHAT-REENTRY-05 — Pas d'ouverture répétée.** Une fois le retour confirmé, l'historique guide le modèle et empêche de répéter la salutation sur chaque tour suivant.

## Implémentation

`src/conversation-long-gap.ts` est une fonction pure, sans Gemini ni accès à Tinder, utilisée par :
- `apps/api/src/extension-suggestions.ts` pour les réponses automatiques de l'extension, uniquement après concordance entre la dernière entrée Tinder et le dernier message synchronisé.
- `apps/api/src/conversation-generation-service.ts` pour les brouillons dans TNND Web, à partir des messages authentifiés.

Seuil initial : **48 h** (constante `LONG_GAP_REENTRY_MS`). Ce seuil pourra devenir configurable si les usages réels le justifient. La règle influe uniquement sur **le prompt de génération**, pas sur l'autorisation, la planification, la fréquence ni le mécanisme d'envoi.

## Vérifications

Tests unitaires : seuil exact, arrivée tardive de message après silence, première salutation, retour à une question antérieure, nouveau sujet, dates manquantes/futures/non chronologiques, synchronisation serveur obsolète, dernières bulles sortantes, refus explicites, cas sensible, et absence de répétition.

**Limite :** le serveur doit avoir synchronisé les véritables dates des messages Tinder. Si des messages ne sont pas encore enregistrés ou ont une date incertaine, le modèle conserve son comportement normal ; il n'invente pas une longue pause. Tests sur fixtures : aucune conversation réelle ni envoi Tinder.
