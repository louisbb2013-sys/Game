# Minitaure — site web

Site statique (HTML, CSS, JavaScript) pour Minitaure, petite entreprise québécoise de créatures à collectionner.
Thème : **jardin luxuriant au coucher du soleil, couleurs vives**.

**Concept : le jardin lunaire.** À l’accueil, une vraie scène 3D : une prairie fleurie au coucher du soleil
(herbe qui ondule au vent, buissons et arbres feuillus, arbres en fleurs, champignons, lucioles). Les cinq créatures,
de petits animaux ronds et poilus, se cachent derrière les buissons : on ne voit que leurs oreilles. Le curseur ou le doigt
guide une luciole qui les fait sortir. Un compteur « 0 / 5 trouvées » transforme la découverte en mini-collection.

## Ce qui bouge
- **Jardin 3D** (accueil) : lumière de lanterne réelle, herbe qui s’écarte autour de la lanterne, créatures qui sautent
  et scintillent quand on les trouve, bouton « Tout révéler ».
- **Créatures-animaux en fourrure 3D** : un petit veau (Minotaure), un renard (Gribou), une loutre (Bloop),
  une chouette (Noki) et un lapin (Pipo), avec oreilles qui frémissent, queue qui remue, tête qui s’incline et ombre au sol.
  On les retrouve dans les cartes de la boutique, les fenêtres de la page Créatures et la scène « odyssée ».
  Elles se tournent vers le curseur et sautent de joie quand on les ajoute au panier.
- **Cartes holographiques** : inclinaison 3D et reflets arc-en-ciel au survol (format carte à collectionner).
- **Odyssée** (accueil) : en défilant, Minotaure rétrécit et une carte du jardin se dessine vers les lieux de chaque créature
  (poche de manteau, flaque ronde de lune, pot de fleurs…).
- Pétales et feuilles qui tombent et lucioles sur tout le site, lianes, monsteras, fougères et fleurs qui se balancent,
  ciel de coucher de soleil avec nuages, oiseaux et lune.
- Titres qui apparaissent mot par mot, étapes qui poussent (graine, pousse, fleur), luciole qui suit le curseur, boutons aimantés,
  orbe qui vole jusqu’au panier, transitions douces entre les pages.
- **Son** (désactivé par défaut) : petites notes quand on trouve une créature ou qu’on ajoute au panier.

Tout reste utilisable sans 3D : si WebGL 2 n’est pas disponible (ou en mode « économie de données »), le site affiche
les illustrations SVG et la version 2D du jardin. Le mode « réduire les animations » du système est respecté.

## Pages
| Fichier | Page |
|---|---|
| `index.html` | Accueil (jardin 3D, collection, odyssée, étapes de commande) |
| `boutique.html` | Boutique : 5 créatures à 6 $ |
| `creatures.html` | Fiches des créatures (portails 3D) |
| `recompenses.html` | Rareté et récompenses (avec avis : cartes et sachets non offerts) |
| `a-propos.html` | À propos |
| `contact.html` | Contact (formulaire, 48 h, anti-spam) |
| `commande.html` | Formulaire de commande prérempli depuis le panier |

## Voir le site
```bash
cd minitaure
python3 -m http.server 8000   # puis ouvrir http://localhost:8000
```
Un serveur local est nécessaire (les modules JavaScript ne se chargent pas en ouvrant le fichier directement).
Pour le mettre en ligne, déposez le dossier `minitaure/` tel quel sur Netlify, Vercel, Cloudflare Pages ou GitHub Pages.

## À faire avant la mise en ligne
1. **Formspree** : dans `assets/js/site.js`, remplacez `VOTRE_ID` dans `FORMSPREE_COMMANDE` et `FORMSPREE_CONTACT`
   par l’identifiant de votre formulaire Formspree (relié à ibrahimkalil2024@gmail.com). Tant que ce n’est pas fait,
   les formulaires ouvrent le logiciel de courriel avec le message prérempli.
2. **Illustrations officielles** : remplacez les fichiers de `assets/creatures/` (`minotaure.svg`, `gribou.svg`,
   `bloop.svg`, `noki.svg`, `pipo.svg`) par les illustrations officielles (mêmes noms). Elles servent d’image de secours
   et dans le panier. Les couleurs des créatures 3D se règlent dans `PALETTE` (`assets/js/3d/commun.js`).
3. **Domaine** : changez `SITE` dans `tools/build.py` (balises canoniques et données structurées).

## Modifier le contenu
Les pages sont générées par `tools/build.py` (en-tête, pied de page et textes au même endroit) :
```bash
python3 tools/build.py
```
- Créatures, prix et textes : listes `CREATURES` et `PRIX` dans `tools/build.py`, **et** la liste `CREATURES`
  dans `assets/js/site.js` (panier et formulaire).
- Couleurs, typographie, espacements : variables `:root` en haut de `assets/css/style.css`.

## Organisation du code
- `assets/js/site.js` : panier, ciel, apparitions, cartes holographiques, défilement, jardin 2D, son, formulaires.
- `assets/js/3d/commun.js` : lumières, fourrure (technique des coquilles + répartition de Fibonacci), créatures, étincelles.
- `assets/js/3d/jardin.js` : la scène 3D de l’accueil.
- `assets/js/3d/vitrine.js` : un seul canevas WebGL qui dessine les créatures dans chaque carte et portail.
- `assets/js/vendor/three.module.js` : sous-ensemble de three.js 0.186.1 (licence MIT). Pour le reconstruire après
  avoir utilisé une nouvelle classe de three.js, ajoutez-la dans `tools/three-entry.js`, puis :
  `npm i three@0.186.1 && npx esbuild tools/three-entry.js --bundle --format=esm --minify --outfile=assets/js/vendor/three.module.js`

## Performance
- La 3D se met en pause hors de l’écran et quand l’onglet est caché.
- Qualité adaptative : si l’appareil peine, la résolution et la quantité d’herbe diminuent automatiquement.
- three.js est réduit au strict nécessaire (environ 140 Ko compressé).
