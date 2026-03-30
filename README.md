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
- `DASHBOARD_LOGIN_USER` : identifiant autorisé
- `DASHBOARD_LOGIN_PASSWORD_HASH` : hash du mot de passe
- `NEON_DATABASE_URL` : URL PostgreSQL Neon pour la persistance partagée et les journaux d'accès

Génération du hash :

```powershell
node scripts/generate_auth_hash.js "MonMotDePasseFort"
```

Copier ensuite la valeur affichée dans `DASHBOARD_LOGIN_PASSWORD_HASH`.

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
Les jeux de données locaux doivent rester hors Git et être importés par l'utilisateur via CSV.
La variante GitHub/Netlify utilise `chart/js/data-empty.js`.
