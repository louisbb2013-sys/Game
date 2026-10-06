"""Génère les pages HTML de Minitaure (en-tête, pied de page et décors partagés).
Usage : python3 tools/build.py   (depuis le dossier minitaure/)
Modifiez le contenu ici, puis relancez le script.
"""
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://minitaure.ca"  # à remplacer par le vrai domaine
COURRIEL = "ibrahimkalil2024@gmail.com"

CREATURES = [
    ("minotaure", "001", "Minotaure", "Aime collectionner les siestes dans les poches de manteau."),
    ("gribou", "002", "Gribou", "Apparaît lorsqu’une personne fredonne très doucement."),
    ("bloop", "003", "Bloop", "Adore les flaques, mais seulement celles qui ressemblent à des ronds de lune."),
    ("noki", "004", "Noki", "Rit si fort qu’on l’entend avant de le voir scintiller."),
    ("pipo", "005", "Pipo", "Connaît le chemin secret derrière chaque pot de fleurs."),
]
PRIX = 6

NAV = [
    ("index.html", "Accueil"),
    ("boutique.html", "Boutique"),
    ("creatures.html", "Les créatures"),
    ("recompenses.html", "Récompenses"),
    ("a-propos.html", "À propos"),
    ("contact.html", "Contact"),
]

ICONE_SON = """<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path class="onde" d="M15.5 9a4 4 0 0 1 0 6M18.3 6.5a7.5 7.5 0 0 1 0 11"/></svg>"""


# ---------------------------------------------------------------- décors
def fougere(cls, couleur="#173D3B", feuilles=12):
    """Silhouette de fougère en SVG (tige courbe + folioles)."""
    parts = []
    p0, p1, p2 = (62, 305), (16, 165), (78, 14)
    parts.append(f'<path d="M{p0[0]} {p0[1]} Q {p1[0]} {p1[1]} {p2[0]} {p2[1]}" stroke="{couleur}" stroke-width="4" fill="none" stroke-linecap="round"/>')
    for i in range(feuilles):
        t = 0.08 + 0.86 * i / (feuilles - 1)
        x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t ** 2 * p2[0]
        y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t ** 2 * p2[1]
        taille = 50 * (1 - t * 0.72)
        for cote in (-1, 1):
            angle = -cote * (24 + 22 * t)
            parts.append(
                f'<ellipse cx="{x + cote * taille * 0.5:.1f}" cy="{y:.1f}" rx="{taille * 0.56:.1f}" ry="{taille * 0.15:.1f}" '
                f'transform="rotate({angle:.1f} {x:.1f} {y:.1f})" fill="{couleur}"/>'
            )
    return f'<svg class="{cls}" viewBox="0 0 160 312" aria-hidden="true" focusable="false">{"".join(parts)}</svg>'


def spores(n=6, graine=1):
    out = []
    for i in range(n):
        x = (graine * 37 + i * 53) % 90 + 5
        y = (graine * 17 + i * 29) % 50 + 40
        d = (i * 1.7 + graine) % 9
        out.append(f'<span class="spore" style="left:{x}%;top:{y}%;animation-delay:-{d:.1f}s"></span>')
    return "".join(out)


def decor_page(creature, graine=1):
    return f"""  <div class="decor" aria-hidden="true">
    <div class="decor__lueur"></div>
    <div class="decor__orbite"></div>
    {fougere("fougere fougere--g", "#122F33")}
    <img class="curieuse" src="assets/creatures/{creature}.svg" alt="" width="200" height="200">
    {fougere("fougere fougere--d")}
    {spores(6, graine)}
  </div>"""


# ---------------------------------------------------------------- gabarit
def head(title, desc, page, modules=(), robots=None):
    preload = '\n<link rel="modulepreload" href="assets/js/vendor/three.module.js">\n<link rel="modulepreload" href="assets/js/3d/commun.js">' if modules else ""
    scripts = "".join(f'\n<script type="module" src="assets/js/3d/{m}.js"></script>' for m in modules)
    meta_robots = f'\n<meta name="robots" content="{robots}">' if robots else ""
    return f"""<!doctype html>
<html lang="fr-CA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">{meta_robots}
<title>{title}</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="{SITE}/{'' if page == 'index.html' else page}">
<meta property="og:type" content="website">
<meta property="og:locale" content="fr_CA">
<meta property="og:site_name" content="Minitaure">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta name="theme-color" content="#07061A">
<meta name="color-scheme" content="dark">
<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400..700;1,9..40,400&family=Fredoka:wght@400..700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/css/style.css">{preload}
<script src="assets/js/site.js" defer></script>{scripts}
</head>
"""


def header(page):
    links = "\n".join(
        f'        <li><a href="{href}"{" aria-current=" + chr(34) + "page" + chr(34) if href == page else ""}>{label}</a></li>'
        for href, label in NAV
    )
    return f"""<body>
<a class="skip" href="#contenu">Aller au contenu</a>
<header class="header">
  <div class="wrap header__in">
    <a class="logo" href="index.html" aria-label="Minitaure, accueil"><span class="logo__lune" aria-hidden="true"></span>Minitaure</a>
    <nav class="nav" id="nav" aria-label="Navigation principale">
      <ul>
{links}
      </ul>
    </nav>
    <button class="cart-btn" type="button" data-ouvrir-panier aria-label="Ouvrir le panier">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 8h14l-1.2 11.1a2 2 0 0 1-2 1.9H8.2a2 2 0 0 1-2-1.9L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>
      Panier <span class="cart-btn__n">0</span>
    </button>
    <button class="menu-btn" type="button" aria-controls="nav" aria-expanded="false" aria-label="Menu"><span></span><span></span></button>
  </div>
</header>
<main id="contenu">
"""


FOOTER = f"""</main>
<footer class="footer">
  <div class="wrap">
    <div class="appel apparait">
      <p data-split>Ton aventure commence par une toute petite créature.</p>
      <a class="btn btn--lune" href="boutique.html" data-aimant>Voir la boutique</a>
    </div>
    <p class="footer__grand" aria-hidden="true">Minitaure</p>
    <div class="footer__grille">
      <div style="max-width:32ch">
        <h2>Petites créatures, grandes histoires</h2>
        <p>Petite entreprise québécoise de créatures originales à collectionner, nées dans un jardin lunaire.</p>
      </div>
      <div>
        <h2>Explorer</h2>
        <ul>{''.join(f'<li><a href="{h}">{l}</a></li>' for h, l in NAV)}</ul>
      </div>
      <div>
        <h2>Nous joindre</h2>
        <ul>
          <li><a href="mailto:{COURRIEL}">{COURRIEL}</a></li>
          <li>Réponse sous 48 heures</li>
          <li>Paiement à la livraison</li>
        </ul>
      </div>
    </div>
    <div class="footer__bas">
      <span>© <span id="annee">2026</span> Minitaure · Fait au Québec</span>
      <button class="son" type="button" data-son aria-pressed="false">{ICONE_SON}<span>Son du jardin : coupé</span></button>
    </div>
  </div>
</footer>

<div class="tiroir" id="tiroir" aria-hidden="true">
  <div class="tiroir__fond" data-fermer-panier></div>
  <aside class="tiroir__panneau" role="dialog" aria-modal="true" aria-labelledby="tiroir-titre">
    <div class="tiroir__tete">
      <h2 id="tiroir-titre">Ton panier</h2>
      <button class="fermer" type="button" data-fermer-panier aria-label="Fermer le panier">×</button>
    </div>
    <div class="tiroir__liste" id="tiroir-liste"></div>
    <div class="tiroir__pied">
      <div class="total"><span>Total</span><output id="tiroir-total">0 $</output></div>
      <a class="btn btn--lune" id="tiroir-commander" href="commande.html">Passer la commande</a>
    </div>
  </aside>
</div>
<script>document.getElementById("annee").textContent = new Date().getFullYear();</script>
</body>
</html>
"""


def carte(slug, num, nom, lore, delai=0):
    return f"""      <article class="carte t-{slug} apparait" data-tilt style="--d:{delai:.2f}s">
        <div class="carte__face">
          <div class="carte__fond"></div>
          <div class="carte__cadre"></div>
          <span class="carte__num">N° {num}</span>
          <div class="carte__creature" data-c3d="{slug}"><img src="assets/creatures/{slug}.svg" alt="{nom}, petite créature ronde et poilue" width="200" height="200" loading="lazy"></div>
          <div class="carte__texte">
            <h3><a href="creatures.html#{slug}">{nom}</a></h3>
            <p class="carte__lore">{lore}</p>
          </div>
          <div class="carte__holo" aria-hidden="true"></div>
          <div class="carte__reflet" aria-hidden="true"></div>
        </div>
        <div class="carte__pied"><span class="prix">{PRIX} $</span><button class="ajout" type="button" data-ajouter="{slug}" aria-label="Ajouter {nom} au panier"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span>Ajouter</span></button></div>
      </article>"""


def collection():
    return "\n".join(carte(*c, delai=i * 0.08) for i, c in enumerate(CREATURES))


# ---------------------------------------------------------------- accueil
# positions (version 2D) : x, y sur grand écran puis x, y sur téléphone, en % du jardin
POS = {"minotaure": (50, 80, 15, 80), "gribou": (61, 61, 36, 70), "bloop": (72, 81, 56, 85), "noki": (83, 62, 76, 71), "pipo": (93, 79, 87, 84)}

cachettes = "\n".join(
    f"""  <button class="cachette" type="button" data-id="{s}" style="--x:{POS[s][0]}%;--y:{POS[s][1]}%;--xm:{POS[s][2]}%;--ym:{POS[s][3]}%">
    <img src="assets/creatures/{s}.svg" alt="" width="200" height="200">
    <span class="cachette__bulle"><b>{n} <small>N° {num}</small></b>{lore}</span>
    <span class="sr-only">Révéler {n}</span>
  </button>"""
    for s, num, n, lore in CREATURES
)

SOL = """<svg viewBox="0 0 1440 420" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="sol" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1D1A52"/><stop offset="1" stop-color="#0B0A24"/></linearGradient></defs>
      <path d="M0 150 C180 90 320 170 520 130 C720 90 860 160 1040 120 C1200 85 1330 130 1440 110 V420 H0Z" fill="#17154A"/>
      <path d="M0 220 C220 170 380 240 620 205 C860 170 1020 240 1240 200 C1330 185 1400 195 1440 190 V420 H0Z" fill="url(#sol)"/>
      <g fill="#262363">
        <path d="M120 230 c-6-40 4-70 18-90 c-2 30 0 60-6 92Z"/><path d="M140 232 c10-30 30-48 50-56 c-14 22-28 40-40 58Z"/>
        <path d="M700 220 c-4-50 8-80 22-100 c-4 36-4 66-10 102Z"/><path d="M1180 210 c8-36 26-60 48-70 c-16 26-30 48-40 72Z"/>
        <rect x="1010" y="180" width="70" height="56" rx="10"/><rect x="1000" y="172" width="90" height="16" rx="8"/>
        <rect x="300" y="196" width="56" height="44" rx="8"/><rect x="292" y="190" width="72" height="13" rx="6"/>
      </g>
      <g fill="#7CF5D2" opacity=".55"><circle cx="210" cy="200" r="3"/><circle cx="560" cy="180" r="2.5"/><circle cx="880" cy="190" r="3"/><circle cx="1320" cy="185" r="2.5"/></g>
    </svg>"""

# Odyssée : repères de la carte du ciel (position en % du carré)
REPERES = [
    ("minotaure", 15, 52, "La poche de manteau", "pour les siestes de Minotaure",
     '<path d="M10 14h28v16a10 10 0 0 1-10 10h-8a10 10 0 0 1-10-10Z" fill="none" stroke="#B9A6FF" stroke-width="2.6" stroke-linejoin="round"/><path d="M10 14h28l-3 8H13Z" fill="#B9A6FF" opacity=".55"/><path d="M15 28h18" stroke="#B9A6FF" stroke-width="1.6" stroke-dasharray="2 3"/>'),
    ("gribou", 25, 20, "Le fredonnement", "qui fait apparaître Gribou",
     '<path d="M19 33V11l17-4v21" fill="none" stroke="#FF8F7E" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="15" cy="34" rx="5.5" ry="4.2" fill="#FF8F7E"/><ellipse cx="32" cy="29" rx="5.5" ry="4.2" fill="#FF8F7E"/>'),
    ("bloop", 51, 10, "La flaque ronde de lune", "la seule que Bloop adore",
     '<ellipse cx="24" cy="30" rx="19" ry="8" fill="none" stroke="#8FC8FF" stroke-width="2.6"/><circle cx="26" cy="29" r="4.5" fill="#FFE7A3"/><path d="M14 16c2-4 4-6 4-9 0 3 2 5 4 9a4 4 0 0 1-8 0Z" fill="#8FC8FF"/>'),
    ("noki", 77, 20, "Le scintillement", "on entend Noki rire avant",
     '<path d="M24 4l3.6 13.4L41 21l-13.4 3.6L24 38l-3.6-13.4L7 21l13.4-3.6Z" fill="#FFD46B"/><circle cx="39" cy="9" r="2" fill="#FFF4CC"/><circle cx="9" cy="36" r="1.6" fill="#FFF4CC"/>'),
    ("pipo", 84, 54, "Le pot de fleurs", "et le chemin secret de Pipo",
     '<path d="M14 26h20l-3 14H17Z" fill="#C86B5A"/><rect x="12" y="23" width="24" height="5" rx="2" fill="#E08A76"/><path d="M24 23V12" stroke="#8EDDBE" stroke-width="2.4"/><circle cx="24" cy="9" r="4" fill="#FF8F7E"/><circle cx="24" cy="9" r="1.6" fill="#FFD46B"/><path d="M24 17c4-4 8-3 9-1-3 3-6 3-9 1Z" fill="#8EDDBE"/>'),
]


def sentiers():
    paths, masks = [], []
    for i, (slug, x, y, *_rest) in enumerate(REPERES):
        x1, y1 = x * 10, y * 10
        mx, my = (500 + x1) / 2, (500 + y1) / 2
        dx, dy = x1 - 500, y1 - 500
        ln = math.hypot(dx, dy) or 1
        s = 1 if i % 2 else -1
        cx, cy = mx - dy / ln * ln * 0.22 * s, my + dx / ln * ln * 0.22 * s
        d = f"M500 500 Q {cx:.0f} {cy:.0f} {x1:.0f} {y1:.0f}"
        masks.append(f'<mask id="trace-{i}" maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="1000"><path class="sentier-trace" d="{d}" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="0" data-trace="{i}"/></mask>')
        paths.append(f'<path class="sentier" d="{d}" mask="url(#trace-{i})"/>')
    anneaux = "".join(f'<circle class="anneau-ciel" cx="500" cy="500" r="{r}"/>' for r in (150, 280, 410))
    etoiles = "".join(
        f'<circle class="etoile-ciel" cx="{(i * 137) % 1000}" cy="{(i * 311 + 70) % 1000}" r="{1 + (i % 3) * 0.6:.1f}"/>' for i in range(46)
    )
    return f'<svg viewBox="0 0 1000 1000" aria-hidden="true" focusable="false"><defs>{"".join(masks)}</defs>{anneaux}{etoiles}{"".join(paths)}</svg>'


reperes = "\n".join(
    f"""        <div class="repere t-{slug}" style="left:{x}%;top:{y}%" data-repere="{i}"><span class="repere__icone"><svg viewBox="0 0 48 48" aria-hidden="true">{svg}</svg></span><span class="repere__nom"><b>{titre}</b>{sous}</span></div>"""
    for i, (slug, x, y, titre, sous, svg) in enumerate(REPERES)
)

INDEX = head(
    "Minitaure · Petites créatures à collectionner, faites au Québec",
    "Minitaure, petite entreprise québécoise de créatures originales à collectionner. Cinq miniatures douces et mystérieuses à 6 $ chacune, paiement à la livraison.",
    "index.html",
    modules=("jardin", "vitrine"),
) + header("index.html") + f"""
<section class="jardin" aria-labelledby="titre-jardin">
  <div class="ciel" aria-hidden="true">
    <div class="nebuleuse nebuleuse--1"></div><div class="nebuleuse nebuleuse--2"></div><div class="nebuleuse nebuleuse--3"></div>
    <div class="aurore"></div>
  </div>
  <div class="jardin__sol">{SOL}</div>
  <div class="wrap jardin__texte">
    <p class="surtitre">Collection n° 1 · Le jardin lunaire</p>
    <h1 id="titre-jardin" data-split>Petites créatures, <em>grandes</em> histoires.</h1>
    <p class="jardin__lead apparait" style="--d:.55s">La nuit est tombée sur le jardin. Promène ta lanterne : cinq créatures s’y cachent. Trouve-les, puis adopte tes préférées.</p>
    <div class="jardin__actions apparait" style="--d:.7s">
      <a class="btn btn--lune" href="boutique.html" data-aimant>Voir la boutique</a>
      <a class="btn btn--ligne" href="creatures.html">Rencontrer les créatures</a>
    </div>
  </div>
  <div class="lanterne-lueur" aria-hidden="true"></div>
  <div class="voile" aria-hidden="true"></div>
  <div class="lune" aria-hidden="true"></div>
{cachettes}
  <div class="compteur">
    <span class="compteur__points" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>
    <span id="compteur-texte" aria-live="polite">0 / 5 trouvées</span>
    <button type="button" id="illuminer">Tout illuminer</button>
    <button class="son" type="button" data-son aria-pressed="false" aria-label="Son du jardin">{ICONE_SON}</button>
  </div>
  <a class="defiler" href="#collection"><span aria-hidden="true"></span>Découvrir</a>
</section>

<section class="section" id="collection" aria-labelledby="titre-collection">
  <div class="lueur-fond" style="width:50vw;height:30vw;left:-10vw;top:10%;background:#6A4FD6" aria-hidden="true"></div>
  <div class="wrap">
    <div class="titre-section">
      <h2 id="titre-collection" data-split>La collection du jardin lunaire</h2>
      <p class="apparait" style="--d:.15s">Cinq créatures originales, vendues à l’unité. Chacune a sa petite manie, et sûrement une grande histoire à raconter.</p>
    </div>
    <div class="collection">
{collection()}
    </div>
  </div>
</section>

<section class="odyssee" data-progress="colle" aria-labelledby="titre-odyssee">
  <div class="odyssee__scene">
    <h2 id="titre-odyssee" class="sr-only">Petites créatures, grandes histoires</h2>
    <div class="odyssee__progress" aria-hidden="true"></div>
    <div class="odyssee__carte" aria-hidden="true">
      {sentiers()}
{reperes}
    </div>
    <div class="odyssee__creature" data-c3d="minotaure" data-c3d-mode="odyssee"><img src="assets/creatures/minotaure.svg" alt="" width="200" height="200" loading="lazy"></div>
    <div class="odyssee__textes">
      <p class="odyssee__t" data-fenetre="-1,0.27">Elles sont toutes petites…</p>
      <p class="odyssee__t" data-fenetre="0.34,0.6">mais chacune est un <em>point de départ</em>.</p>
      <div class="odyssee__t" data-fenetre="0.68,9"><p>Vers de grandes histoires.</p><a class="btn btn--lune odyssee__cta" href="boutique.html">Commencer ma collection</a></div>
    </div>
  </div>
</section>

<section class="section" aria-labelledby="titre-etapes">
  <div class="wrap">
    <div class="titre-section">
      <h2 id="titre-etapes" data-split>Commander, c’est tout simple</h2>
      <p class="apparait" style="--d:.15s">Aucun paiement en ligne. Tu choisis, on confirme, tu paies à la livraison.</p>
    </div>
    <ol class="etapes">
      <li class="apparait"><h3>Choisis tes créatures</h3><p>Ajoute une ou plusieurs créatures à ton panier, depuis la boutique ou le jardin.</p></li>
      <li class="apparait" style="--d:.25s"><h3>Remplis le formulaire</h3><p>Tes créatures y sont déjà. Ajuste les quantités : le total se met à jour tout seul.</p></li>
      <li class="apparait" style="--d:.5s"><h3>Paie à la livraison</h3><p>On te contacte pour confirmer, puis tu paies à la réception de ta commande.</p></li>
    </ol>
  </div>
</section>
""" + FOOTER

# ---------------------------------------------------------------- boutique
products_ld = ",".join(
    f'{{"@type":"Product","name":"{n}","sku":"MNT-{num}","image":"{SITE}/assets/creatures/{s}.svg","description":"{lore}","brand":{{"@type":"Brand","name":"Minitaure"}},"offers":{{"@type":"Offer","price":"{PRIX}.00","priceCurrency":"CAD","availability":"https://schema.org/InStock"}}}}'
    for s, num, n, lore in CREATURES
)
BOUTIQUE = head(
    "Boutique · Minitaure",
    "Adopte Minotaure, Gribou, Bloop, Noki et Pipo : cinq créatures à collectionner à 6 $ chacune. Paiement à la livraison.",
    "boutique.html",
    modules=("vitrine",),
) + header("boutique.html") + f"""
<section class="page-tete">
{decor_page("pipo", 2)}
  <div class="wrap page-tete__in">
    <h1 data-split>La boutique</h1>
    <p class="apparait" style="--d:.3s">Cinq créatures, 6 $ chacune. Ajoute tes préférées au panier, puis remplis le formulaire. Tu paies à la livraison.</p>
  </div>
</section>
<section class="section" style="padding-top:var(--s-3)" aria-label="Créatures en vente">
  <div class="wrap">
    <div class="collection">
{collection()}
    </div>
    <div class="paiement paiement--nuit apparait" style="margin-top:3.5rem">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#8EDDBE" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="6" width="20" height="13" rx="3"/><path d="M2 10h20M6 15h4"/></svg>
      <div><strong>Paiement à la livraison</strong><small>Aucune carte demandée en ligne. On confirme ta commande avant l’envoi.</small></div>
      <a class="btn btn--lune btn--sm" style="margin-left:auto" href="commande.html">Passer la commande</a>
    </div>
  </div>
</section>
<script type="application/ld+json">{{"@context":"https://schema.org","@graph":[{products_ld}]}}</script>
""" + FOOTER

# ---------------------------------------------------------------- créatures
fiches = "\n".join(
    f"""    <article class="fiche t-{s}" id="{s}">
      <div class="fiche__portail" data-progress>
        <div class="portail__orbite"></div>
        <div class="portail__orbite portail__orbite--2"></div>
        <div class="portail__fenetre"><div class="portail__creature" data-c3d="{s}" data-c3d-mode="portail"><img src="assets/creatures/{s}.svg" alt="{n}, petite créature ronde et poilue, sans visage" width="200" height="200" loading="lazy"></div></div>
        {fougere("portail__feuille portail__feuille--g", "#143936", 9)}
        {fougere("portail__feuille portail__feuille--d", "#1A2F48", 9)}
      </div>
      <div class="fiche__texte">
        <p class="fiche__num apparait" aria-hidden="true">{num}</p>
        <h2 data-split>{n}</h2>
        <blockquote class="apparait" style="--d:.2s">{lore}</blockquote>
        <div class="fiche__actions apparait" style="--d:.3s"><span class="prix">{PRIX} $</span><button class="ajout" type="button" data-ajouter="{s}" aria-label="Ajouter {n} au panier"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span>Ajouter au panier</span></button></div>
      </div>
    </article>"""
    for s, num, n, lore in CREATURES
)
CREAT = head(
    "Les créatures · Minitaure",
    "Rencontre les cinq créatures du jardin lunaire : Minotaure, Gribou, Bloop, Noki et Pipo, et leurs petites manies.",
    "creatures.html",
    modules=("vitrine",),
) + header("creatures.html") + f"""
<section class="page-tete">
{decor_page("noki", 3)}
  <div class="wrap page-tete__in">
    <h1 data-split>Les créatures du jardin lunaire</h1>
    <p class="apparait" style="--d:.3s">Petites, rondes et poilues, elles n’ont pas de visage : à toi d’imaginer leur caractère. Voici ce qu’on sait d’elles.</p>
  </div>
</section>
<section class="wrap" style="padding-bottom:var(--s-6)">
{fiches}
</section>
""" + FOOTER

# ---------------------------------------------------------------- récompenses
# phase de lune par niveau de rareté : croissant fin → pleine lune
# décalage de l'ombre (en unités du SVG) : plus l'ombre s'éloigne, plus la lune est pleine
PHASES = {1: -24, 2: -50, 3: -74, 4: None}


def lune_phase(n):
    dx = PHASES[n]
    masque = "" if dx is None else f'<circle cx="{60 + dx}" cy="57" r="45" fill="#000"/>'
    return f"""<svg class="rarete__lune" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
            <defs><radialGradient id="l{n}" cx="38%" cy="34%" r="70%"><stop offset="0" stop-color="#FFFBEA"/><stop offset=".55" stop-color="#FFE9A8"/><stop offset="1" stop-color="#E9B94F"/></radialGradient>
            <mask id="m{n}"><rect width="120" height="120" fill="#fff"/>{masque}</mask></defs>
            <circle cx="60" cy="60" r="44" fill="#fff" opacity=".06"/>
            <circle cx="60" cy="60" r="44" fill="url(#l{n})" mask="url(#m{n})"/>
          </svg>"""


def rarete(n, etoiles, titre, texte, d):
    return f"""      <article class="rarete rarete--{n} apparait" data-tilt style="--d:{d}s">
        <div class="carte__face">
          <div class="carte__fond"></div>
          <div class="carte__cadre"></div>
          {lune_phase(n)}
          <div class="rarete__in"><span class="rarete__etoiles" aria-hidden="true">{etoiles}</span><div><h3>{titre}</h3><p>{texte}</p></div></div>
          <div class="carte__holo" aria-hidden="true"></div>
          <div class="carte__reflet" aria-hidden="true"></div>
        </div>
      </article>"""


RECOMP = head(
    "Récompenses et rareté · Minitaure",
    "Le système de rareté de l’univers Minitaure : commun, rare, très rare et ultra rare.",
    "recompenses.html",
) + header("recompenses.html") + f"""
<section class="page-tete">
{decor_page("bloop", 4)}
  <div class="wrap page-tete__in">
    <h1 data-split>Rareté et récompenses</h1>
    <p class="apparait" style="--d:.3s">Dans le jardin lunaire, certains trésors se montrent plus rarement que d’autres. Voici comment on les classe.</p>
  </div>
</section>
<section class="wrap">
  <div class="avis apparait" role="note">
    <span aria-hidden="true" style="font-size:1.5rem">🌙</span>
    <p><strong>À noter :</strong> les cartes et les sachets mystères ne sont pas offerts en ce moment. La boutique propose uniquement les cinq créatures vendues à l’unité. Cette page présente le système de rareté de l’univers Minitaure.</p>
  </div>
</section>
<section class="section" aria-labelledby="titre-rarete">
  <div class="wrap">
    <div class="titre-section"><h2 id="titre-rarete" data-split>Quatre niveaux de rareté</h2><p class="apparait">Passe ta souris sur chaque carte : plus elle est rare, plus elle brille.</p></div>
    <div class="raretes">
{rarete(1, "★", "Commun", "Les trésors qu’on croise souvent au détour d’une allée.", 0)}
{rarete(2, "★★", "Rare", "Ceux qui ne sortent que certaines nuits.", .08)}
{rarete(3, "★★★", "Très rare", "On les entend avant de les voir.", .16)}
{rarete(4, "★★★★", "Ultra rare", "Presque une légende du jardin lunaire.", .24)}
    </div>
  </div>
</section>
<section class="section" style="padding-top:0" aria-labelledby="titre-tresors">
  <div class="wrap">
    <div class="titre-section"><h2 id="titre-tresors" data-split>Les petits trésors</h2><p class="apparait">Les récompenses de l’univers Minitaure, du plus simple au plus brillant.</p></div>
    <ul class="tresors">
      <li class="apparait"><h3>Cartes</h3><p>Une carte pour garder la trace de chaque rencontre.</p></li>
      <li class="apparait" style="--d:.06s"><h3>Amulettes en papier</h3><p>De petits porte-bonheur pliés à la main.</p></li>
      <li class="apparait" style="--d:.12s"><h3>Cartes spéciales</h3><p>Des illustrations différentes, plus difficiles à trouver.</p></li>
      <li class="apparait" style="--d:.18s"><h3>Cartes holographiques</h3><p>Elles brillent comme un rond de lune dans une flaque.</p></li>
      <li class="apparait" style="--d:.24s"><h3>Petits bonus exclusifs</h3><p>Des surprises réservées aux collectionneurs.</p></li>
    </ul>
    <p style="margin-top:3rem"><a class="btn btn--lune" href="boutique.html">Voir les créatures disponibles</a></p>
  </div>
</section>
""" + FOOTER

# ---------------------------------------------------------------- à propos
orbite = "".join(f'<img src="assets/creatures/{c[0]}.svg" alt="" width="200" height="200" style="--a:{i * 72}">' for i, c in enumerate(CREATURES))
APROPOS = head(
    "À propos · Minitaure",
    "Minitaure est une petite entreprise québécoise qui imagine des créatures originales à collectionner, douces, colorées et légèrement mystérieuses.",
    "a-propos.html",
) + header("a-propos.html") + f"""
<section class="page-tete">
{decor_page("gribou", 5)}
  <div class="wrap page-tete__in">
    <h1 data-split>Petite marque, grand jardin</h1>
  </div>
</section>
<section class="wrap" style="padding-bottom:var(--s-6)">
  <div class="apropos">
    <div class="apropos__texte apparait">
      <p>Minitaure est une petite entreprise québécoise qui imagine des créatures originales à collectionner.</p>
      <p>Nos créatures sont douces, colorées et un peu mystérieuses. Elles sont rondes et poilues, n’ont pas de visage et s’inspirent de la nature : une feuille, une pousse, une goutte de rosée, une fleur.</p>
      <p>On les dit petites, mais on les voit plutôt comme un début. Chaque créature est le point de départ d’une histoire que tu inventes : celle qui dort dans ta poche de manteau, celle qui apparaît quand tu fredonnes, celle qui connaît le chemin derrière le pot de fleurs.</p>
      <p>Elles vivent toutes dans le jardin lunaire, un monde d’étoiles, de lune et de petits trésors imaginaires.</p>
    </div>
    <div class="systeme apparait" style="--d:.15s" aria-hidden="true">
      <div class="systeme__lune"></div>
      <div class="systeme__anneau">{orbite}</div>
    </div>
  </div>
  <ul class="valeurs">
    <li class="apparait"><h3>Des designs originaux</h3><p>Chaque créature est imaginée par Minitaure, avec sa petite manie bien à elle.</p></li>
    <li class="apparait" style="--d:.08s"><h3>Fait au Québec</h3><p>Une petite entreprise d’ici, proche de ses collectionneurs.</p></li>
    <li class="apparait" style="--d:.16s"><h3>Simple et humain</h3><p>Commande par formulaire, confirmation personnelle, paiement à la livraison.</p></li>
  </ul>
</section>
<script type="application/ld+json">{{"@context":"https://schema.org","@type":"Organization","name":"Minitaure","url":"{SITE}","email":"{COURRIEL}","areaServed":"CA-QC","description":"Petite entreprise québécoise de créatures originales à collectionner."}}</script>
""" + FOOTER

# ---------------------------------------------------------------- contact
CONTACT = head(
    "Contact · Minitaure",
    "Écris à Minitaure : questions, collaborations, presse ou revendeurs. Réponse sous 48 heures.",
    "contact.html",
) + header("contact.html") + f"""
<section class="page-tete">
{decor_page("minotaure", 6)}
  <div class="wrap page-tete__in">
    <h1 data-split>Écris-nous</h1>
    <p class="apparait" style="--d:.3s">Une question, une idée de collaboration ou envie de vendre Minitaure en boutique ? On lit tout.</p>
  </div>
</section>
<section class="wrap" style="padding-bottom:var(--s-6)">
  <div class="form-grille">
    <div class="panneau apparait">
      <h2>Formulaire de contact</h2>
      <form id="form-contact" novalidate>
        <div class="champs">
          <div class="champ"><label for="c-nom">Nom</label><input id="c-nom" name="nom" autocomplete="name" required></div>
          <div class="champ"><label for="c-courriel">Courriel</label><input id="c-courriel" name="email" type="email" autocomplete="email" required></div>
          <div class="champ large"><label for="c-sujet">Sujet</label>
            <select id="c-sujet" name="sujet" required>
              <option>Question générale</option>
              <option>Collaboration / Presse</option>
              <option>Revendeur / Wholesale</option>
            </select></div>
          <div class="champ large"><label for="c-message">Message</label><textarea id="c-message" name="message" required></textarea></div>
        </div>
        <div class="piege" aria-hidden="true"><label for="c-gotcha">Ne pas remplir</label><input id="c-gotcha" name="_gotcha" tabindex="-1" autocomplete="off"></div>
        <p style="margin-top:1.5rem"><button class="btn btn--plein" type="submit">Envoyer le message</button></p>
        <p class="form-msg" id="contact-msg" role="status"></p>
      </form>
    </div>
    <div class="contact-infos">
      <div class="panneau panneau--nuit apparait" style="--d:.1s">
        <h2>Par courriel</h2>
        <p>Tu préfères écrire directement ?</p>
        <p style="margin-top:.6rem"><a class="mail" href="mailto:{COURRIEL}">{COURRIEL}</a></p>
        <span class="delai">Réponse sous 48 heures</span>
      </div>
      <div class="panneau panneau--nuit apparait" style="--d:.2s">
        <h2>Pour commander</h2>
        <p>Les commandes passent par le formulaire de commande, avec paiement à la livraison.</p>
        <p style="margin-top:1rem"><a class="btn btn--ligne btn--sm" href="boutique.html">Aller à la boutique</a></p>
      </div>
    </div>
  </div>
</section>
""" + FOOTER

# ---------------------------------------------------------------- commande
COMMANDE = head(
    "Commande · Minitaure",
    "Finalise ta commande de créatures Minitaure. Paiement à la livraison.",
    "commande.html",
    robots="noindex",
) + header("") + f"""
<section class="page-tete">
{decor_page("bloop", 7)}
  <div class="wrap page-tete__in">
    <h1 data-split>Ta commande</h1>
    <p class="apparait" style="--d:.3s">Tes créatures sont déjà là. Ajuste les quantités, entre tes coordonnées, et on s’occupe du reste.</p>
  </div>
</section>
<section class="wrap" style="padding-bottom:var(--s-6)">
  <form id="form-commande" class="form-grille" novalidate>
    <div class="panneau">
      <h2>Tes coordonnées</h2>
      <div class="champs">
        <div class="champ large"><label for="o-nom">Nom complet</label><input id="o-nom" name="nom" autocomplete="name" required></div>
        <div class="champ"><label for="o-courriel">Courriel</label><input id="o-courriel" name="email" type="email" autocomplete="email" required></div>
        <div class="champ"><label for="o-tel">Téléphone ou WhatsApp</label><input id="o-tel" name="telephone" type="tel" autocomplete="tel" required></div>
        <div class="champ"><label for="o-ville">Ville</label><input id="o-ville" name="ville" autocomplete="address-level2" required></div>
        <div class="champ large"><label for="o-adresse">Adresse complète</label><input id="o-adresse" name="adresse" autocomplete="street-address" placeholder="Numéro, rue, appartement, code postal" required></div>
        <div class="champ large"><label for="o-message">Message <small>(facultatif)</small></label><textarea id="o-message" name="message" placeholder="Une précision pour la livraison ?"></textarea></div>
      </div>
      <div class="piege" aria-hidden="true"><label for="o-gotcha">Ne pas remplir</label><input id="o-gotcha" name="_gotcha" tabindex="-1" autocomplete="off"></div>
      <textarea class="sr-only" id="commande-resume" name="commande" tabindex="-1" aria-hidden="true" readonly></textarea>
    </div>
    <div class="panneau sticky" id="commande-recap">
      <h2>Tes créatures</h2>
      <div id="commande-lignes"><noscript><p>Active JavaScript pour choisir tes créatures, ou écris-nous à <a href="mailto:{COURRIEL}">{COURRIEL}</a>.</p></noscript></div>
      <div class="total"><span>Total</span><output id="commande-total">0 $</output></div>
      <div class="paiement">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#17163A" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="6" width="20" height="13" rx="3"/><path d="M2 10h20M6 15h4"/></svg>
        <div><strong>Paiement à la livraison</strong><small>Rien à payer en ligne.</small></div>
      </div>
      <button class="btn btn--plein" style="width:100%" type="submit">Envoyer ma commande</button>
      <p class="form-msg" id="commande-msg" role="status"></p>
    </div>
  </form>
</section>
""" + FOOTER

FAVICON = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="9" fill="#0E0D2B"/><circle cx="16" cy="16" r="10" fill="#FFE7A3"/><circle cx="20" cy="12.5" r="9" fill="#0E0D2B"/></svg>"""

if __name__ == "__main__":
    pages = {
        "index.html": INDEX, "boutique.html": BOUTIQUE, "creatures.html": CREAT,
        "recompenses.html": RECOMP, "a-propos.html": APROPOS, "contact.html": CONTACT, "commande.html": COMMANDE,
    }
    for name, html in pages.items():
        (ROOT / name).write_text(html, encoding="utf-8")
        print("écrit", name)
    (ROOT / "assets" / "favicon.svg").write_text(FAVICON, encoding="utf-8")
