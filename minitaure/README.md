# Minitaure — site vitrine et boutique

Site en français pour Minitaure, des petites créatures toutes douces à collectionner.

## Ouvrir le site

Ouvre `index.html` dans un navigateur. Il n'y a pas d'étape de compilation, et
Three.js est inclus dans `assets/vendor/`, donc le site marche aussi hors ligne.
Seules les polices Google ont besoin d'Internet.

## Pages

- `index.html` : accueil avec une scène 3D (une planète de mousse, des créatures que l'on peut toucher), un sachet mystère interactif et les raretés.
- `boutique.html` : tous les produits, avec filtres, recherche et tri.
- `creatures.html` : le bestiaire des 12 créatures, la visionneuse 3D et « Ma collection ».
- `a-propos.html` : l'histoire de Minitaure et une visionneuse 3D.
- `contact.html` : formulaire avec validation et FAQ.
- `caisse.html` : caisse en 4 étapes (panier, coordonnées, livraison, paiement) avec les taxes par province et des codes promo (`ETOILE10`, `BIENVENUE`, `COSMIQUE`).

## Fichiers

- `assets/js/data.js` : les créatures et les produits. Pour ajouter une créature, c'est ici.
- `assets/js/creature3d.js` : le pelage 3D (technique des coquilles) et les parties animales.
- `assets/js/cart.js` : le panier (stocké dans le navigateur) et le tiroir latéral.
- `assets/js/checkout.js` : la caisse.

## À brancher avant la mise en ligne

- **Paiement** : la caisse est une démo, aucun paiement réel n'est fait. Il faut la brancher sur Stripe, Square ou Shopify.
- **Formulaire de contact** : il n'envoie rien pour l'instant. Il faut le brancher sur un service comme Formspree.
