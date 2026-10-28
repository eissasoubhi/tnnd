# TNND — conscience temporelle de tous les messages (v0.2.37)

## Problème
Le générateur Web connaissait les heures de référence Paris/Casablanca et pouvait recevoir l'heure du dernier message entrant. Le générateur automatique de l'extension recevait surtout des lignes de discussion sans heures. Résultat : un « Bonsoir » rédigé hier risquait d'être repris ce matin, ou une mention « ce soir / demain » pouvait être interprétée par rapport à la date courante plutôt que celle où le message avait été écrit.

## User stories et critères
- **US-CHAT-TIME-01.** Chaque demande de réponse sur une conversation déjà synchronisée apporte une chronologie des **40 derniers messages horodatés**, avec direction (entrant/sortant), date, heure et durée écoulée. La liste des textes réels reste distincte. Les 40 entrées sont un plafond pour maîtriser la longueur du prompt.
- **US-CHAT-TIME-02.** L'heure utilisée pour écrire est celle de la **génération en cours**, pas celle du message précédent. Le générateur distingue la date du dernier message reçu, la date de la dernière réponse envoyée et la date actuelle. Il évite d'attribuer « ce soir » ou « demain » à la mauvaise journée.
- **US-CHAT-TIME-03.** En journée, après un « bonsoir » écrit la veille, si une salutation est naturelle, écrire « Bonjour » ou « Salut », jamais recopier mécaniquement « Bonsoir ». Contrôle déterministe **au début de la réponse** (bonjour entre 05 h et 18 h, bonsoir le reste du temps), seulement si la ville courante / de résidence de l'identité est connue. Aucune modification des citations, salutations neutres ou autres mots.
- **US-CHAT-TIME-04.** Respecter les fuseaux **Europe/Paris**, **Africa/Casablanca**, les passages d'heure d'été et de minuit. Ne jamais supposer qu'une ville Tinder/Passport est la position réelle de la personne.
- **US-CHAT-TIME-05.** En cas d'historique serveur obsolète, de dernier tour Tinder non concordant, d'horodatages manquants, incohérents, futurs ou dépourvus de zone, **ne pas inventer** de chronologie. Les contrôles d'envoi, les limites, le respect du consentement et la reprise après 48 h restent indépendants.
- **US-CHAT-TIME-06.** Les métadonnées temporelles ne copient **aucun texte de message**. Les messages restent dans le contexte existant ; les dates servent uniquement à rédiger, jamais à autoriser un envoi.

## Surfaces
- **Web/Backend** : `apps/api/src/conversation-generation-service.ts` ajoute la chronologie datée à l'instruction et corrige la salutation générée si elle est manifestement hors heure.
- **Extension/API** : `apps/api/src/extension-suggestions.ts` réutilise l'historique authentifié correspondant au dernier message réellement observé sur Tinder et applique la même logique de salutations.
- **Moteur commun** : `src/conversation-time-context.ts` fournit `messageChronologyGuidance` et `normalizeGreetingForCurrentTime`.

## Limites
Les dates ne sont exploitables que si la synchronisation Tinder/API a enregistré une **heure d'envoi fiable avec preuve de provenance** (`timestampVerified: true`). Dans le DOM Tinder actuellement observé, l'import ne connaît pas les véritables heures d'envoi et utilise une heure de capture + un décalage ordinal : ces messages sont marqués `timestampVerified: false`. La migration `0026_conversation_message_time_provenance.sql` ajoute `sent_at_verified` (défaut `false`) : les lignes historiques restent non vérifiées. Dans ces cas, le modèle reçoit l'heure actuelle mais **pas** une chronologie fictive. Une source de dates réellement vérifiables devra être ajoutée à la synchronisation Tinder pour profiter de toute la chronologie. L'instant indiqué est celui de génération ; une réponse conservée dans un brouillon puis envoyée bien plus tard doit être revérifiée. Le contrôle déterministe ne traduit que « bonjour/bonsoir » en début de message et ne peut pas garantir que toutes les références relatives choisies par Gemini seront parfaites.

## QA
Tests API automatisés : soir → matin, minuit, DST, Casablanca/Paris, dates partielles/absentes/futures, dernier tour obsolète, sorties privées, contrôle de l'utilisation commune par les deux générateurs. Les CI n'effectuent **aucun envoi réel** sur Tinder.
