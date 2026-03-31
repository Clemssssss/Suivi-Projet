# Suivi-Projet

Dashboard analytics standalone en HTML/CSS/JS vanilla.

## Version Netlify

- le dashboard démarre sans données embarquées
- l'import CSV est le point d'entrée principal
- la page cible est `chart/chart.html`
- l'accès au dashboard passe par `chart/login.html`
- un mode notes permet d'annoter graphiques, boutons, KPI et champs
- les notes sont sauvegardées en base locale navigateur via IndexedDB

## Déploiement

Déployer le dépôt sur Netlify, puis ouvrir `chart/login.html`.

## Authentification Netlify

Le dashboard n'embarque aucun mot de passe côté front. L'authentification repose sur des fonctions Netlify avec :

- mot de passe stocké sous forme de hash PBKDF2 dans les variables d'environnement
- cookie de session signé, `HttpOnly`, `SameSite=Strict`
- headers CSP / anti-framing / `nosniff`
- anti-bot avec honeypot, challenge signé et limitation des tentatives

Restrictions réseau optionnelles :

- `AUTH_ALLOWED_IPS` : liste CSV d'IP ou CIDR IPv4 autorisés
- `AUTH_BLOCKED_IPS` : liste CSV d'IP ou CIDR IPv4 bloqués
- `AUTH_ALLOWED_COUNTRIES` : liste CSV de codes pays autorisés si l'en-tête géolocalisé est disponible
- `AUTH_BLOCKED_COUNTRIES` : liste CSV de codes pays bloqués si l'en-tête géolocalisé est disponible

Variables d'environnement à définir dans Netlify :

- `AUTH_SESSION_SECRET` : secret long et aléatoire pour signer la session
- `DASHBOARD_LOGIN_USER` : identifiant utilisateur standard
- `DASHBOARD_LOGIN_PASSWORD_HASH` : hash du mot de passe utilisateur standard
- `DASHBOARD_ADMIN_USER` : identifiant administrateur distinct
- `DASHBOARD_ADMIN_PASSWORD_HASH` : hash du mot de passe administrateur distinct
- `NEON_DATABASE_URL` : URL PostgreSQL Neon pour la persistance partagée et les journaux d'accès

Génération du hash :

```powershell
node scripts/generate_auth_hash.js "MonMotDePasseFort"
```

Copier ensuite la valeur affichée dans `DASHBOARD_LOGIN_PASSWORD_HASH` ou `DASHBOARD_ADMIN_PASSWORD_HASH`.

Recommandation sécurité :

- utiliser un compte admin séparé du compte utilisateur standard
- ne pas partager le compte admin
- réserver les pages `Logs` et `Whitelist` au seul admin

## Journaux d'accès

Les fonctions Netlify journalisent désormais :

- les vérifications de session
- les connexions réussies
- les échecs de connexion
- les blocages anti-bot / anti-réseau
- les déconnexions
- les opérations de lecture / écriture / suppression sur l'état partagé

Deux niveaux existent :

- logs console structurés dans les logs Netlify
- persistance en base PostgreSQL dans la table `dashboard_access_logs`

La table `dashboard_access_logs` enregistre notamment :

- date/heure
- type d'événement
- niveau (`info`, `warn`, `error`)
- utilisateur
- IP
- pays
- user-agent
- méthode HTTP
- chemin demandé
- host / origin / referer
- request id
- détails JSON utiles à l'analyse

## Données

Le dépôt versionné n'embarque aucune donnée métier.
Le dashboard charge désormais un dataset PostgreSQL en clair, une ligne par projet, après authentification.

Variables requises pour ce mode :

- `NEON_DATABASE_URL`

Import d'un fichier Excel local vers la base :

```powershell
$env:NEON_DATABASE_URL="postgresql://..."
node scripts/import_secure_dataset.js "data\\SAIP - Suivi ventes & AO_VF BRUT.xlsx" saip-main admin
```

Le script conserve son nom pour compatibilité, mais il s'appuie maintenant sur `exceljs` côté serveur et écrit :

- une ligne par projet dans `dashboard_dataset_rows`
- les métadonnées dans `dashboard_dataset_meta`

Le dashboard lit ensuite ce dataset via la fonction Netlify protégée `/.netlify/functions/dataset-projects`.

Les jeux de données locaux restent hors Git.
La variante GitHub/Netlify utilise `chart/js/data-empty.js` au chargement initial, puis hydrate le dashboard depuis la base si un dataset en clair est disponible.
