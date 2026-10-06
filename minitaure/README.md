# Minitaure — site web

Site statique (HTML, CSS, JavaScript sans dépendance) pour Minitaure, petite entreprise québécoise de créatures à collectionner.

**Concept : le jardin lunaire.** À l’accueil, le jardin est plongé dans la nuit. Le curseur (ou le doigt) devient une lanterne qui révèle les cinq créatures cachées. Un compteur « 0 / 5 trouvées » transforme la découverte en mini-collection.

## Pages
| Fichier | Page |
|---|---|
| `index.html` | Accueil (jardin lunaire, collection, étapes de commande) |
| `boutique.html` | Boutique : 5 créatures à 6 $ |
| `creatures.html` | Fiches des créatures |
| `recompenses.html` | Rareté et récompenses (avec avis : cartes et sachets non offerts) |
| `a-propos.html` | À propos |
| `contact.html` | Contact (formulaire, 48 h, anti-spam) |
| `commande.html` | Formulaire de commande prérempli depuis le panier |

## Voir le site
```bash
cd minitaure
python3 -m http.server 8000   # puis ouvrir http://localhost:8000
```
Pour le mettre en ligne, déposez le dossier `minitaure/` tel quel sur Netlify, Vercel, Cloudflare Pages ou GitHub Pages.

## À faire avant la mise en ligne
1. **Formspree** : dans `assets/js/site.js`, remplacez `VOTRE_ID` dans `FORMSPREE_COMMANDE` et `FORMSPREE_CONTACT` par l’identifiant de votre formulaire Formspree (relié à ibrahimkalil2024@gmail.com). Tant que ce n’est pas fait, les formulaires ouvrent le logiciel de courriel avec le message prérempli.
2. **Illustrations officielles** : remplacez les fichiers de `assets/creatures/` (`minotaure.svg`, `gribou.svg`, `bloop.svg`, `noki.svg`, `pipo.svg`) par les illustrations officielles. Gardez les mêmes noms, ou changez l’extension dans `tools/build.py` et `assets/js/site.js`.
3. **Domaine** : changez `SITE` dans `tools/build.py` (balises canoniques et données structurées).

## Modifier le contenu
Les pages sont générées par `tools/build.py` (en-tête, pied de page et textes au même endroit) :
```bash
python3 tools/build.py
```
- Créatures, prix et textes : listes `CREATURES` et `PRIX` dans `tools/build.py`, **et** la liste `CREATURES` dans `assets/js/site.js` (panier et formulaire).
- Couleurs, typographie, espacements : variables `:root` en haut de `assets/css/style.css`.
- Position des créatures dans le jardin : dictionnaire `POS` dans `tools/build.py`.

## Détails techniques
- Le panier est enregistré dans le navigateur (localStorage) et partagé entre les pages.
- Accessibilité : navigation au clavier, tiroir de panier avec piège de focus et touche Échap. Si le mouvement réduit est activé, le jardin s’affiche directement illuminé.
- Sans JavaScript, toutes les créatures restent visibles (le voile de nuit n’apparaît qu’avec JS).
