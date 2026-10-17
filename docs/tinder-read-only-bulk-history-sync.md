# TNND — Synchroniser les conversations Tinder en lecture seule

## Ce qui existe et ce que ce mode ajoute

TNND synchronise déjà les conversations actives qu'il voit et permet **Import visible chat (read-only)** sur une conversation ouverte. Le Global AI runner ne couvre que les conversations déjà synchronisées **et explicitement autorisées pour l'IA**. Ce nouveau **Sync Tinder conversations · read-only** est indépendant : son rôle est d'importer l'historique, pas d'envoyer ou de répondre.

**Important : aucune API Tinder officielle d'exportation complète n'est utilisée.** L'extension peut lire uniquement les éléments chargés dans la page Tinder et reconnus par ses sélecteurs vérifiés. Les anciens chats chargés progressivement par Tinder ne sont pas inclus tant que tu ne les fais pas apparaître ; l'application n'affiche donc jamais « toutes les conversations synchronisées » sans preuve.

## Installation et lancement

1. Mettre à jour `main`, compiler l'extension à la racine avec `npm ci && npm run build`, puis recharger TNND depuis `chrome://extensions` et **actualiser l'onglet Tinder**.
2. Démarrer PostgreSQL local, appliquer les migrations dans `apps/api` avec `npm run migrate`, puis lancer l'API avec `npm run dev`. Connecter TNND Web et l'extension **au même compte**.
3. Dans les options de l'extension, mettre **Global automatic replies = OFF**, puis arrêter le Global existing runner, New-match AI et les sessions pouvant changer l'onglet Tinder. Ce mode refuse de démarrer si un runner de conversation est actif.
4. Ne laisser qu'un seul onglet `tinder.com` et ouvrir **Messages** dans la barre latérale de Tinder. Laisser les conversations visibles charger. Terminer ou supprimer tout brouillon de message non envoyé avant de lancer.
5. Extension TNND → **Sync Tinder conversations · read-only** → **Collect while scrolling**. Fermer le popup, faire défiler la liste **Messages** dans Tinder (du haut vers les anciennes conversations), puis rouvrir TNND → **Stop collecting**. Pendant cette phase, le content script observe les nouveaux liens effectivement chargés et transmet uniquement leurs références au catalogue privé de l'extension. Tu peux aussi utiliser **Collect loaded chats** pour une capture ponctuelle. Le catalogue est limité à 500 conversations observées **pour le même compte et onglet**.
6. Cliquer **Start read-only import**. Le worker visite les liens observés dans la barre Messages, lit les bulles reconnues (auteur + texte), les envoie à **ta propre API TNND** et conserve un checkpoint par conversation. Fermer le popup n'arrête pas le worker ; Chrome, Docker, Tinder et l'API doivent rester disponibles. Le travail reprend par alarmes de Chrome et chaque conversation déjà traitée est ignorée.
7. Surveiller `X/Y completed`, `skipped`, `partial` et `pending` dans le popup. **Stop import** permet d'arrêter la série. Après avoir rétabli les conditions/chargé les anciennes conversations, utiliser **Retry skipped** puis recommencer.
8. Ouvrir TNND Web → Conversations et vérifier que les discussions apparaissent, avec leur historique dans le détail. Une nouvelle conversation importée est **paused / non AI-managed**. Une conversation existante garde **son statut et ses choix manuels**.

## Exactitude et limitations

- Tinder peut ne charger qu'une partie de la liste de conversations. Le mode **Collect while scrolling** découvre automatiquement les nouvelles lignes pendant le défilement **manuel** sur Tinder, sans forcer un scroll ou appeler une API non documentée. Il ne parcourt pas les chats non rendus, et ne garantit donc pas la totalité du compte.
- Tous les messages **actuellement rendus dans le DOM** sont importés chronologiquement par lots d'au plus 40, dans la limite de 1 000 bulles visibles par observation ; ce n'est plus une troncature silencieuse aux 40 derniers messages. `partial` signifie que le début du vrai fil n'est pas confirmé par Tinder, même si toutes les bulles rendues ont été importées. Les échanges cachés derrière une pagination non explorée ne sont **pas** couverts.
- Les dates de vrais messages ne sont pas exposées par les sélecteurs actuels : l'horodatage enregistré pendant l'import est celui de la **capture**, dans l'ordre des bulles. Ne pas le présenter comme la date réelle d'envoi Tinder.
- Les clés de messages sont déterministes à partir du texte, de la direction et des répétitions, et le serveur élimine les doublons par conversation. Des changements majeurs du DOM/contexte peuvent nécessiter des vérifications supplémentaires. Comparer la conversation avant et après réimport sur un cas de test.
- Une conversation ouverte manuellement pendant l'import, un brouillon non envoyé, un changement de compte, une tentative de navigation non confirmée ou l'activation d'un runner automatique **bloquent ou interrompent** l'opération. Aucun URL de thread n'est inventé, aucun Send n'est appelé.
- Le mode ne contacte personne, ne garantit aucune livraison Tinder, et **n'autorise jamais à lui seul** l'IA à contrôler une discussion. Les nouveaux Matchs sans conversation sont un autre flux et ne sont pas assimilés à des messages existants.
- Les références des conversations ne restent que dans Chrome extension storage et les données personnelles synchronisées restent sur **ta propre base TNND**. Éviter d'exporter les traces/logs Chrome contenant des références privées.

## Tests

À la racine : `npm run test:bulk-readonly-sync` puis `npm run build`. Dans `apps/api` : `npm run typecheck && npm test`; dans `apps/web` : `npm run typecheck && npm test && npm run build`.

Validation manuelle obligatoire (pas simulée par la CI) : tester deux conversations dont une vide, une discussion avec plus de 40 messages visibles, un deuxième import identique (pas de nouveaux messages), un changement de compte, une rédaction non envoyée bloquant la navigation, l'activation d'auto-reply refusée, une interruption/reprise après fermeture du popup et une conversation chargée par défilement de sidebar.

Après la synchronisation, lancer **Analytics → Conversation style audit**. Les statistiques ne doivent jamais compter des messages privés d'un autre compte ni prétendre connaître les dates d'envoi réelles.

## Ce qui reste à faire pour le 100 % historique

Le catalogue peut atteindre 500 **références chargées**, mais la couverture totale n'est pas vérifiable par la page Tinder elle-même. Pour couvrir d'anciens chats et toutes les bulles au-delà des 40 visibles, il faut un diagnostic réel et expurgé du chargement incrémental de la sidebar et de la pagination du fil, puis un mécanisme sûr d'import progressif. Tant que ce test n'existe pas, TNND indique honnêtement une couverture partielle et ne force pas la navigation par URL conjecturée ou requêtes privées non documentées.

## Import configuré dans TNND Web

Dans **Settings → Tinder conversation import**, choisir **All observed conversations** ou **Only conversations meeting criteria**, éventuellement un âge minimum/maximum vérifié, la présence de messages, et les types de données : messages, profil, photos. Les photos sont des URLs d'images Tinder visibles et vérifiées (jusqu'à 12 par capture), **pas des fichiers image téléchargés**. Seules les informations visibles dans le profil ouvert peuvent être récupérées. Les critères dont la preuve manque provoquent un saut explicite ; aucun âge ou champ n'est inventé.

Les interrupteurs **Auto-sync new messages in conversations I open on Tinder** et **Automatically collect conversation links while browsing Tinder Messages** sont indépendants de l'autorisation de répondre par IA. Tous deux sont désactivés par défaut. Le premier importe passivement la conversation *que tu ouvres* et ses messages visibles sans déplacer Tinder, mais pas une conversation jamais ouverte. Le second enregistre les références des discussions chargées pendant ta navigation dans Messages ; pour importer leurs messages, il faut ensuite lancer le traitement de lot depuis l'extension lorsque les autres runners sont arrêtés. Cela ne constitue pas une synchronisation exhaustive de l'historique ancien sans validation des mécanismes de chargement de Tinder.

### Champs de profil complémentaires

Quand une fiche Tinder est effectivement affichée et liée au fil ouvert, TNND conserve maintenant aussi jusqu'à 24 **sections visibles avec leur libellé et leur valeur textuelle d'origine** (500 caractères par valeur). Cela permet de conserver des informations dont le format de Tinder ne correspond pas encore aux champs normalisés « emploi », « études », etc., sans inventer leur signification. La capture reste limitée aux cartes du profil du match reconnu ; elle n'extrait pas les contenus cachés et ne certifie pas qu'une fiche a été parcourue intégralement. Les photos sont traitées séparément par URL vérifiée, et ne sont pas téléchargées sous forme de fichiers.

### Valeurs par défaut

Pour tout compte sans paramètres enregistrés, les deux synchronisations **en lecture seule** sont maintenant **activées par défaut** : les chats ouverts sont importés, et les conversations de la liste Messages chargées sont collectées automatiquement. Ces paramètres se changent dans **Settings → Tinder conversation import**. Les paramètres déjà enregistrés par l'utilisateur restent prioritaires. **Aucune autorisation d'écrire ou envoyer un message à un match n'est accordée.** Le navigateur, l'extension et l'API TNND doivent être actifs.

## Archivage réel des photos

Lorsqu'une fiche de match fournit des URLs Tinder HTTPS vérifiées et que **Import photos** est activé, TNND tente de télécharger **les octets des images** depuis le domaine Tinder autorisé et de les conserver **dans ta base PostgreSQL privée** (`match_profile_photo_archives`, migration 0022). Une URL n'est pas comptée comme une sauvegarde réussie si le téléchargement échoue. Chaque image est limitée à 4 Mio, jusqu'à 12 URLs par fiche, en JPEG, PNG, WebP ou GIF vérifiés par la signature binaire ; les redirections et les liens non Tinder sont interdits. Les images sont isolées par compte et profil, accessibles seulement par les endpoints authentifiés `GET /api/v1/match-profiles/:profileId/photos` et `GET /api/v1/match-profiles/:profileId/photos/:photoId`. Les suppressions de profil/compte entraînent la suppression des images par cascade SQL.

Un rapport d'archivage indique `stored`, `alreadySaved` et `unavailable`; ce dernier marque l'import de la conversation comme à reprendre, même si les messages sont déjà synchronisés. Certaines photos demandent une session Tinder ou peuvent avoir expiré : dans ce cas, elles ne sont **pas** archivées. L'API TNND doit pouvoir accéder aux hôtes des images en HTTPS. La sauvegarde de la base PostgreSQL reste de la responsabilité de l'opérateur.

Les droits Tinder pour télécharger et conserver les images doivent être respectés ; les fichiers sont uniquement destinés à l'usage privé du compte. Il n'y a aucun upload public ni copie GitHub.
