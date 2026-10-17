# TNND — Audit hebdomadaire par GitHub Actions sur la base locale

> **Désactivé par défaut**. Rien n'accède à votre PC tant qu'un runner local dédié et les paramètres privés ne sont pas installés puis activés.

## Architecture

GitHub Actions (workflow planifié sur la branche principale) → runner GitHub Actions **auto-hébergé et dédié** dans Docker/local → connexion sortante à GitHub → PostgreSQL local via un compte SELECT-only → rapport JSON **sur volume local**, jamais sur GitHub.

Le mécanisme est comparable au dépôt `eissasoubhi/nc-ai-db` (`runner/` et `docs/SETUP.md`). **Son runner existant ne peut pas être considéré connecté à TNND** : l'enregistrement est lié au dépôt ou à l'organisation. Créer ou autoriser un runner dédié, étiqueté `tnnd-audit-local`, pour ce dépôt.

## Pourquoi cette précaution ?

Ce dépôt est public. Un runner auto-hébergé expose la machine si du code non fiable y est exécuté. Ne donnez jamais à un workflow de PR non revue l'accès à la machine locale. Le workflow `local-quality-audit.yml` **ne possède aucun déclencheur pull_request** et réclame des labels dédiés. Protéger `main`, exiger une revue des modifications de workflows et réserver le runner à cet usage ; de préférence placer le runner et les secrets d'accès en dehors de tout dépôt public non contrôlé. Ne pas réutiliser le compte administrateur PostgreSQL. Pour une isolation plus forte, employer un dépôt de coordination privé et un runner éphémère plutôt qu'un runner persistant dans un dépôt public.

## 1. Installer le runner

1. Démarrer Docker et PostgreSQL. Préparer un conteneur runner Linux x64 dédié TNND, ou une machine dédiée, sans accès privilégié au système hôte.
2. Dans GitHub : **TNND → Settings → Actions → Runners → New self-hosted runner**, enregistrer le runner sur le dépôt approuvé avec le label supplémentaire `tnnd-audit-local`.
3. Mettre la base locale sur le réseau Docker privé ou configurer `host.docker.internal` pour un accès local. Le runner doit pouvoir joindre PostgreSQL sans exposer le port sur Internet.
4. Monter un **volume persistant** pour conserver les audits, par exemple `/var/lib/tnnd-audit/reports` à l'intérieur du conteneur, avec un propriétaire non root et des droits limités.
5. Vérifier que le runner apparaît en ligne dans GitHub. S'il est éteint, l'audit planifié reste en attente ou expire selon les règles GitHub ; aucun audit ne doit être déclaré réussi sans rapport.

**Important :** la passerelle MySQL de `nc-ai-db` ne peut pas lire directement la base PostgreSQL de TNND. Le principe du runner est réutilisé, mais les identifiants et le réseau de base doivent être configurés pour TNND.

## 2. Compte PostgreSQL strictement lecture seule

Créer un rôle de lecture dédié, limité aux tables nécessaires (`conversations` et `conversation_messages`) pour le périmètre utilisateur visé. En PostgreSQL, un exemple **à adapter et exécuter par un administrateur** dans la base TNND :

    CREATE ROLE tnnd_audit LOGIN PASSWORD '<MOT_DE_PASSE_FORT_ET_PRIVE>';
    GRANT CONNECT ON DATABASE tnnd TO tnnd_audit;
    GRANT USAGE ON SCHEMA public TO tnnd_audit;
    GRANT SELECT ON public.conversations, public.conversation_messages TO tnnd_audit;
    ALTER ROLE tnnd_audit SET default_transaction_read_only = on;

Ne pas partager la vraie chaîne de connexion dans un chat, une issue, un commit ou les logs GitHub. L'API Web normale conserve son propre compte et ses permissions ; seul le workflow utilise ce rôle réduit.

## 3. Configurer les Secrets et Variables GitHub

Dans **TNND → Settings → Secrets and variables → Actions** :

| Type | Nom | Valeur |
| --- | --- | --- |
| Secret | `TNND_AUDIT_DATABASE_URL` | URL PostgreSQL pour le rôle de lecture seule, joignable **depuis le runner** |
| Secret | `TNND_AUDIT_USER_ID` | UUID interne du compte TNND à auditer |
| Variable | `TNND_LOCAL_AUDIT_REPORT_DIR` | chemin absolu du volume local persistant, par exemple `/var/lib/tnnd-audit/reports` |
| Variable | `TNND_LOCAL_AUDIT_ENABLED` | `true` uniquement après validation de la connexion et des autorisations |

Le workflow ne démarre aucun job local tant que `TNND_LOCAL_AUDIT_ENABLED` n'est pas exactement `true`.

## 4. Test manuel sans transfert de données privées

Depuis GitHub **Actions → Local conversation quality audit → Run workflow**. Le job affiche seulement que le rapport a été généré. Il ne crée **aucun artefact GitHub**, ne publie aucune conversation et ne modifie pas la base.

Sur le volume local, vérifier le fichier `quality-YYYYMMDDTHHMMSSZ.json`. Il contient les statistiques et recommandations agrégées, **aucun message ni identifiant de compte**. Seules les personnes autorisées sur le PC doivent pouvoir le lire. Sauvegarder et purger ces rapports selon la politique de confidentialité choisie.

Pour un audit manuel sans GitHub Actions, utiliser directement le guide `docs/quality-audit-and-testing.md` et la commande `npm run audit:quality -- --user-id=<UUID>` depuis `apps/api`.

## 5. Planification

Après activation et contrôle d'un premier run, l'audit est planifié **chaque lundi à 07:15 UTC**. L'ordinateur, Docker, le runner et la base PostgreSQL doivent être accessibles. Ce cron GitHub ne promet pas un lancement exact à la minute ; inspecter les runs Actions et la date réelle du dernier fichier.

Pour arrêter les accès : passer `TNND_LOCAL_AUDIT_ENABLED` à `false`, désactiver ou retirer le runner GitHub, puis révoquer son mot de passe PostgreSQL si nécessaire.

## 6. Que faire des recommandations ?

Comparer deux rapports locaux, choisir une anomalie prioritaire et revoir de vrais exemples dans TNND **en local**, avant de changer des réglages. Tester un seul groupe de préférences à la fois (emojis, humour, longueur, ton, langues). Les seuils sont heuristiques ; un fort taux d'emojis peut être approprié à un match particulier.

Le premier module ne fournit pas encore d'interface d'historique multi-semaines, de corrélation avec les évaluations humaines, ni de génération autonome de PRs. Aucune recommandation ne modifie automatiquement les paramètres, ne déclenche un envoi Tinder ou n'approuve des réponses sans décision explicite.
