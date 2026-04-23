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
- `POWER_AUTOMATE_IMPORT_TOKEN` si tu veux pousser les données depuis Power Automate

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

## Source SharePoint / Microsoft Graph

Une page admin `chart/source-sync.html` permet de relier le dashboard à un fichier Excel distant puis de le réimporter via le bouton `Refresh SharePoint`.

Modes supportés :

- `Aucun header d'auth` : pour une vraie URL directe `.xlsx` ou `.csv`
- `Bearer token` : pour une URL de fichier protégée, si tu disposes déjà du bon endpoint
- `Lien de partage SharePoint + Graph` : pour coller une URL de partage SharePoint standard (`/:x:/r/...`) et laisser le serveur résoudre le vrai téléchargement via Microsoft Graph

Pour le mode Graph :

- le champ URL accepte le lien de partage SharePoint normal
- le bearer token doit être un token Microsoft Graph valide permettant de lire le fichier partagé
- le test de source affiche désormais le vrai diagnostic métier au lieu d'un simple `HTTP 400`

## Import Power Automate

Une alternative plus simple à Graph consiste à laisser Power Automate lire le tableau Excel SharePoint, puis pousser les lignes vers :

- `POST /.netlify/functions/import-from-power-automate`

Sécurité :

- header obligatoire `X-Import-Token`
- valeur stockée dans la variable d'environnement `POWER_AUTOMATE_IMPORT_TOKEN`
- aucune session navigateur requise
- aucune lecture de dataset n'est ouverte par ce flux

Générer le token :

```powershell
node scripts/generate_import_token.js
```

Puis enregistrer la valeur dans Netlify sous :

- `POWER_AUTOMATE_IMPORT_TOKEN`

Exemple d'appel HTTP depuis Power Automate :

Headers :

```json
{
  "Content-Type": "application/json",
  "X-Import-Token": "TON_SECRET"
}
```

Body :

```json
{
  "datasetKey": "saip-main",
  "sourceName": "Power Automate SharePoint",
  "rows": @{body('List_rows_present_in_a_table')?['value']}
}
```

Le connecteur Excel doit lire un vrai tableau Excel, par exemple `Tableau1`.

## Git

Le script `git_push_smart.cmd` à la racine permet de faire un push assisté depuis le dossier du projet.

Exemples :

```bat
git_push_smart.cmd
git_push_smart.cmd "Mise à jour des pages admin"
git_push_smart.cmd --no-commit
```

Comportement :

- détecte la branche courante
- affiche l’état du dépôt
- fait `git add -A` puis `git commit` si des fichiers ont changé
- pousse toujours vers `origin/main`
- utilise `git push origin HEAD:main` pour publier l’état courant sur `main`
