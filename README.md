# Suivi-Projet

Dashboard analytics standalone en HTML/CSS/JS vanilla.

## Version Netlify

- le dashboard démarre sans données embarquées
- l'import CSV est le point d'entrée principal
- la page cible est `chart/chart.html`
- un mode notes permet d'annoter graphiques, boutons, KPI et champs
- les notes sont sauvegardées en base locale navigateur via IndexedDB

## Déploiement

Déployer le dépôt en statique sur Netlify, puis ouvrir `chart/chart.html`.

## Données

Le dépôt versionné n'embarque pas `chart/js/data.js`.
En local, vous pouvez conserver ce fichier pour vos usages privés, mais la variante GitHub/Netlify utilise `chart/js/data-empty.js`.
