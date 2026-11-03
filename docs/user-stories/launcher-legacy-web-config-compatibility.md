# TNND v0.2.43 — refus « Configuration Web invalide »

## Symptômes
Les commandes **Démarrer**, **Démarrer Swipe** et **Démarrer Chat** affichaient le même message « Configuration Web invalide. Corrige les priorités avant de démarrer. », alors que les priorités pouvaient être parfaitement valides. Les quotas du jour restaient également à « — / — ». Le lanceur était en **v0.2.42**.

## Cause de compatibilité
Le moteur central lisait le JSON de `GET /api/v1/automation/smart-swipe` à trois endroits et appliquait immédiatement `validateSmartAutoSwipeConfig` (qui exige `maxRightSwipesPerDay === null`). Lorsqu'un backend plus ancien renvoyait encore l'ancien nombre quotidien de Right Likes (ex. 500), toutes les activités étaient refusées **avant même** de vérifier les priorités. Le compteur utilisait exactement la même validation et devenait indisponible.

C'est une incompatibilité objectivement présente dans le code. Sans accès au serveur local et à la réponse API exacte, nous ne pouvons pas confirmer que c'est l'unique raison du refus observé sur les captures.

## Correctif
- `src/unified-web-settings.ts` : adapte **uniquement** un ancien plafond de likes entier compris entre 1 et 1000 à `null` (« illimité dans TNND »), sans modifier l'objet renvoyé par le serveur ni réactiver des modes.
- Toute autre incompatibilité continue de bloquer le démarrage : priorités manquantes/dupliquées, `enabled` non booléen, sessions/délais invalides, fuseau horaire manquant ou invalide, ancienne limite impossible à valider.
- L'adaptateur est utilisé par les trois chemins : démarrage manuel/automatique, aperçu des compteurs, bascule de quota.
- Le message d'erreur indique le **véritable paramètre** concerné, sans accuser systématiquement les priorités. Il conseille de réenregistrer la configuration et de redémarrer l'API si nécessaire.
- Aucun changement au journal de Likes, au contrôle d'identité, aux quotas de sessions, à la déduplication ni aux règles d'envoi.

## Validation
Tests : anciennes valeurs `500` converties en `null`, nouvelle API déjà à `null`, rejet des anciennes valeurs malformées, des priorités et autorisations invalides et des fuseaux horaires incorrects. CI / tests navigateur sans envoi Tinder réel.

## Déploiement
Installer **API + extension de la même révision** et recréer le service API si son processus est ancien :
```bash
git status --short
git pull --ff-only origin main
docker compose up -d --force-recreate api web
docker compose run --rm extension
```
Recharger l'extension et actualiser Tinder. Si l'erreur subsiste, la nouvelle version nomme le champ invalide. Le nombre de tentatives de Likes ne doit jamais être supposé à zéro si le journal API est indisponible.
