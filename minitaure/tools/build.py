"""Génère les pages HTML de Minitaure (en-tête, pied de page et décors végétaux partagés).
Usage : python3 tools/build.py   (depuis le dossier minitaure/)
Modifiez le contenu ici, puis relancez le script.
"""
import math
import random
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
FLEURS_COULEURS = ["#FF4F9A", "#FFC93C", "#FF7B2E", "#FFFFFF", "#A06BFF", "#45C1FF", "#FF5A5A"]

_uid = [0]


def uid(prefixe):
    _uid[0] += 1
    return f"{prefixe}{_uid[0]}"


# ---------------------------------------------------------------- décors végétaux
def fougere(cls, couleur="#2E9E4A", feuilles=12, clair="#5BC85A"):
    """Fougère en SVG (tige courbe + folioles, deux tons de vert)."""
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
                f'transform="rotate({angle:.1f} {x:.1f} {y:.1f})" fill="{couleur if (i + (cote > 0)) % 2 else clair}"/>'
            )
    return f'<svg class="{cls}" viewBox="0 0 160 312" aria-hidden="true" focusable="false">{"".join(parts)}</svg>'


def monstera(cls, couleur="#2FA34A", clair="#6BD45E"):
    """Grande feuille de monstera, avec ses fentes et sa nervure."""
    m = uid("mo")
    feuille = "M100 196 C38 176 6 124 16 74 C26 32 66 8 100 24 C134 8 174 32 184 74 C194 124 162 176 100 196Z"
    fentes = []
    for cote in (-1, 1):
        for i, y in enumerate((56, 84, 112, 140, 166)):
            x0 = 100 + cote * (96 - abs(y - 100) * 0.42)
            fentes.append(f'<path d="M{x0:.0f} {y} L{100 + cote * 26} {y + 12}" stroke="#000" stroke-width="{7 - i * 0.6:.1f}" stroke-linecap="round"/>')
        fentes.append(f'<ellipse cx="{100 + cote * 30}" cy="96" rx="5" ry="9" fill="#000" transform="rotate({cote * 30} {100 + cote * 30} 96)"/>')
    return f"""<svg class="{cls}" viewBox="0 0 200 210" aria-hidden="true" focusable="false">
      <defs><linearGradient id="{m}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{clair}"/><stop offset="1" stop-color="{couleur}"/></linearGradient>
      <mask id="{m}"><path d="{feuille}" fill="#fff"/>{"".join(fentes)}</mask></defs>
      <path d="{feuille}" fill="url(#{m}g)" mask="url(#{m})"/>
      <path d="M100 196 C98 140 99 80 100 24" stroke="#1E7A3A" stroke-width="3" fill="none" opacity=".55"/>
      <path d="M100 196 L100 210" stroke="#1E7A3A" stroke-width="5" stroke-linecap="round"/>
    </svg>"""


def liane(x, hauteur, graine, sens=1):
    """Liane qui pend du haut, avec feuilles en cœur et une petite fleur au bout."""
    rnd = random.Random(graine)
    pts, feuilles = [], []
    n = max(3, int(hauteur / 26))
    for i in range(n + 1):
        y = i * hauteur / n
        ox = 14 + math.sin(i * 1.1 + graine) * 7 * sens
        pts.append((ox, y))
    d = f"M{pts[0][0]:.1f} {pts[0][1]:.1f} " + " ".join(f"T{px:.1f} {py:.1f}" for px, py in pts[1:])
    for i, (px, py) in enumerate(pts[1:], 1):
        cote = 1 if i % 2 else -1
        a = cote * (35 + rnd.random() * 20)
        coul = "#3FBF5C" if (i + graine) % 3 else "#6BD45E"
        t = 8 + rnd.random() * 4
        feuilles.append(f'<path d="M0 0 C{t * 0.9:.1f} {-t * 0.6:.1f} {t * 1.7:.1f} {-t * 0.1:.1f} {t * 1.9:.1f} 0 C{t * 1.7:.1f} {t * 0.1:.1f} {t * 0.9:.1f} {t * 0.6:.1f} 0 0Z" fill="{coul}" transform="translate({px:.1f} {py:.1f}) rotate({a + (0 if cote > 0 else 180):.0f})"/>')
    fx, fy = pts[-1]
    fleur = "".join(f'<circle cx="{fx + math.cos(k * 1.2566) * 4.2:.1f}" cy="{fy + 4 + math.sin(k * 1.2566) * 4.2:.1f}" r="3.4" fill="{FLEURS_COULEURS[graine % 3]}"/>' for k in range(5))
    return f"""<svg class="liane" style="left:{x}%;height:{hauteur}px;animation-delay:-{graine * 1.3 % 6:.1f}s" viewBox="0 0 30 {hauteur + 12}" aria-hidden="true" focusable="false">
      <path d="{d}" stroke="#2A8A40" stroke-width="2.2" fill="none" stroke-linecap="round"/>{"".join(feuilles)}{fleur}<circle cx="{fx:.1f}" cy="{fy + 4:.1f}" r="2.4" fill="#FFC93C"/>
    </svg>"""


def bouquet(cls, graine=1, n=7):
    """Petit bouquet de fleurs sauvages (tiges + corolles colorées)."""
    rnd = random.Random(graine)
    parts = []
    for i in range(n):
        x = 20 + i * (120 / max(1, n - 1)) + rnd.uniform(-6, 6)
        h = 60 + rnd.random() * 70
        coul = FLEURS_COULEURS[(i + graine) % len(FLEURS_COULEURS)]
        parts.append(f'<path d="M{x:.0f} 200 Q {x + rnd.uniform(-14, 14):.0f} {200 - h * 0.5:.0f} {x:.0f} {200 - h:.0f}" stroke="#2E9E4A" stroke-width="2.5" fill="none"/>')
        parts.append(f'<ellipse cx="{x - 7:.0f}" cy="{200 - h * 0.45:.0f}" rx="8" ry="3" fill="#4FCB6E" transform="rotate(-30 {x - 7:.0f} {200 - h * 0.45:.0f})"/>')
        for k in range(5):
            a = k * 1.2566 + i
            parts.append(f'<circle cx="{x + math.cos(a) * 6:.1f}" cy="{200 - h + math.sin(a) * 6:.1f}" r="5" fill="{coul}"/>')
        parts.append(f'<circle cx="{x:.0f}" cy="{200 - h:.0f}" r="3.6" fill="#FFC21F"/>')
    return f'<svg class="{cls}" viewBox="0 0 160 200" aria-hidden="true" focusable="false">{"".join(parts)}</svg>'


def pollen(n=6, graine=1):
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
    {monstera("decor__monstera", "#239A44", "#62CC57")}
    {liane(58, 150, graine)}{liane(72, 95, graine + 3, -1)}{liane(90, 190, graine + 5)}
    {fougere("fougere fougere--g", "#1F7A3A", 12, "#3FBF5C")}
    {bouquet("decor__bouquet", graine)}
    <img class="curieuse" src="assets/creatures/{creature}.svg" alt="" width="200" height="200">
    {fougere("fougere fougere--d", "#2E9E4A", 12, "#6BD45E")}
    {pollen(6, graine)}
  </div>"""


def paysage(graine):
    """Petit paysage de collines fleuries au bas d'une carte (viewBox 63 × 88 agrandie × 10)."""
    rnd = random.Random(graine)
    fleurs = []
    for _ in range(14):
        x, y = rnd.uniform(20, 610), rnd.uniform(500, 590)
        c = FLEURS_COULEURS[rnd.randrange(len(FLEURS_COULEURS))]
        r = rnd.uniform(5, 9)
        fleurs.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{r:.1f}" fill="{c}"/><circle cx="{x:.0f}" cy="{y:.0f}" r="{r * 0.4:.1f}" fill="#FFE27A"/>')
    herbe = "".join(f'<path d="M{x} 556 l{rnd.uniform(-4, 4):.0f} -{rnd.uniform(14, 30):.0f}" stroke="#7BD86A" stroke-width="3" stroke-linecap="round"/>' for x in range(10, 630, 26))
    return f"""<svg class="carte__paysage" viewBox="0 0 630 880" preserveAspectRatio="none" aria-hidden="true" focusable="false">
            <path d="M0 470 C110 430 210 470 320 455 C430 440 520 410 630 440 V880 H0Z" fill="#62C85A"/>
            <path d="M0 470 C110 430 210 470 320 455 C430 440 520 410 630 440" stroke="#9BE57E" stroke-width="5" fill="none" opacity=".7"/>
            <path d="M0 545 C140 515 260 560 380 540 C480 524 560 520 630 535 V880 H0Z" fill="#2FA34A"/>
            {herbe}
            <path d="M0 600 C160 585 320 610 630 592 V880 H0Z" fill="#165E3B"/>
            {"".join(fleurs)}
          </svg>"""


# icônes des étapes : graine → pousse → fleur
ICONE_GRAINE = '<svg viewBox="0 0 48 48" aria-hidden="true"><ellipse cx="24" cy="28" rx="11" ry="14" fill="#8A5A2B" transform="rotate(-20 24 28)"/><ellipse cx="20" cy="23" rx="3.5" ry="6" fill="#C08A55" transform="rotate(-20 20 23)"/></svg>'
ICONE_POUSSE = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 42 V22" stroke="#2E9E4A" stroke-width="3.5" stroke-linecap="round"/><path d="M24 26 C14 26 9 18 10 10 C19 10 24 17 24 26Z" fill="#4FCB6E"/><path d="M24 22 C32 22 38 15 38 8 C30 8 24 14 24 22Z" fill="#7BD86A"/><ellipse cx="24" cy="43" rx="10" ry="3" fill="#8A5A2B"/></svg>'
ICONE_FLEUR = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 44 V26" stroke="#2E9E4A" stroke-width="3.5" stroke-linecap="round"/><path d="M24 36 C17 36 13 31 13 26 C19 26 24 30 24 36Z" fill="#4FCB6E"/>' + "".join(f'<circle cx="{24 + math.cos(k * 1.2566 - 1.57) * 8:.1f}" cy="{17 + math.sin(k * 1.2566 - 1.57) * 8:.1f}" r="6.5" fill="#FF4F9A"/>' for k in range(5)) + '<circle cx="24" cy="17" r="5" fill="#FFC21F"/></svg>'
ICONE_BOUTON = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 44 V24" stroke="#2E9E4A" stroke-width="3.5" stroke-linecap="round"/><path d="M24 34 C16 34 12 29 12 24 C19 24 24 28 24 34Z" fill="#4FCB6E"/><path d="M24 26 C17 22 17 12 24 6 C31 12 31 22 24 26Z" fill="#FF7EB6"/><path d="M24 26 C20 22 20 14 24 9 C26 14 26 22 24 26Z" fill="#FF4F9A"/><path d="M18 24 C20 27 28 27 30 24 L28 28 H20Z" fill="#3DBE5C"/></svg>'


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
<meta name="theme-color" content="#0B2A20">
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


def herbe_bord():
    rnd = random.Random(42)
    brins = []
    for i in range(0, 1440, 9):
        h = rnd.uniform(18, 46)
        brins.append(f'<path d="M{i} 60 q{rnd.uniform(-6, 6):.0f} -{h * 0.6:.0f} {rnd.uniform(-10, 10):.0f} -{h:.0f}" stroke="{"#2FA34A" if i % 4 else "#3FBF5C"}" stroke-width="4" stroke-linecap="round" fill="none"/>')
    fleurs = "".join(
        f'<circle cx="{x}" cy="{rnd.uniform(14, 30):.0f}" r="5" fill="{FLEURS_COULEURS[k % len(FLEURS_COULEURS)]}"/>' for k, x in enumerate(range(40, 1440, 113))
    )
    return f'<svg class="footer__herbe" viewBox="0 0 1440 60" preserveAspectRatio="none" aria-hidden="true" focusable="false">{"".join(brins)}{fleurs}</svg>'


FOOTER = f"""</main>
<footer class="footer">
  {herbe_bord()}
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


def carte(slug, num, nom, lore, delai=0, i=0):
    return f"""      <article class="carte t-{slug} apparait" data-tilt style="--d:{delai:.2f}s">
        <div class="carte__face">
          <div class="carte__fond"></div>
          {paysage(i + 3)}
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
    return "\n".join(carte(*c, delai=i * 0.08, i=i) for i, c in enumerate(CREATURES))


# ---------------------------------------------------------------- accueil
# positions (version 2D) : x, y sur grand écran puis x, y sur téléphone, en % du jardin
POS = {"minotaure": (53, 80, 16, 80), "gribou": (62, 61, 38, 70), "bloop": (74, 81, 60, 85), "noki": (82, 62, 78, 71), "pipo": (93, 79, 88, 84)}

cachettes = "\n".join(
    f"""  <button class="cachette" type="button" data-id="{s}" style="--x:{POS[s][0]}%;--y:{POS[s][1]}%;--xm:{POS[s][2]}%;--ym:{POS[s][3]}%">
    <img src="assets/creatures/{s}.svg" alt="" width="200" height="200">
    <span class="cachette__bulle"><b>{n} <small>N° {num}</small></b>{lore}</span>
    <span class="sr-only">Révéler {n}</span>
  </button>"""
    for s, num, n, lore in CREATURES
)

SOL = """<svg viewBox="0 0 1440 420" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 150 C180 90 320 170 520 130 C720 90 860 160 1040 120 C1200 85 1330 130 1440 110 V420 H0Z" fill="#3FAA4F"/>
      <path d="M0 220 C220 170 380 240 620 205 C860 170 1020 240 1240 200 C1330 185 1400 195 1440 190 V420 H0Z" fill="#2A8C40"/>
      <path d="M0 300 C240 270 480 320 760 292 C1000 268 1240 300 1440 280 V420 H0Z" fill="#1F7335"/>
      <g fill="#FF4F9A"><circle cx="210" cy="250" r="6"/><circle cx="560" cy="240" r="5"/><circle cx="880" cy="250" r="6"/><circle cx="1320" cy="235" r="5"/></g>
      <g fill="#FFC93C"><circle cx="340" cy="300" r="5"/><circle cx="700" cy="320" r="6"/><circle cx="1100" cy="310" r="5"/></g>
    </svg>"""

OISEAUX = '<svg class="oiseaux" viewBox="0 0 120 40" aria-hidden="true"><path d="M5 20 q8 -10 16 0 q8 -10 16 0" stroke="#2A1D55" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M60 8 q6 -8 12 0 q6 -8 12 0" stroke="#2A1D55" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="M92 28 q5 -6 10 0 q5 -6 10 0" stroke="#2A1D55" stroke-width="2" fill="none" stroke-linecap="round"/></svg>'

# Odyssée : repères de la carte du jardin (position en % du carré)
REPERES = [
    ("minotaure", 15, 52, "La poche de manteau", "pour les siestes de Minotaure",
     '<path d="M10 14h28v16a10 10 0 0 1-10 10h-8a10 10 0 0 1-10-10Z" fill="#8A5CFF"/><path d="M10 14h28l-3 8H13Z" fill="#B9A6FF"/><path d="M15 28h18" stroke="#fff" stroke-width="1.6" stroke-dasharray="2 3"/>'),
    ("gribou", 25, 20, "Le fredonnement", "qui fait apparaître Gribou",
     '<path d="M19 33V11l17-4v21" fill="none" stroke="#FF6A45" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="15" cy="34" rx="5.5" ry="4.2" fill="#FF6A45"/><ellipse cx="32" cy="29" rx="5.5" ry="4.2" fill="#FF6A45"/>'),
    ("bloop", 51, 10, "La flaque ronde de lune", "la seule que Bloop adore",
     '<ellipse cx="24" cy="30" rx="19" ry="8" fill="#45C1FF"/><circle cx="26" cy="29" r="4.5" fill="#FFE7A3"/><path d="M14 16c2-4 4-6 4-9 0 3 2 5 4 9a4 4 0 0 1-8 0Z" fill="#45C1FF"/>'),
    ("noki", 77, 20, "Le scintillement", "on entend Noki rire avant",
     '<path d="M24 4l3.6 13.4L41 21l-13.4 3.6L24 38l-3.6-13.4L7 21l13.4-3.6Z" fill="#FFC93C"/><circle cx="39" cy="9" r="2" fill="#FFF4CC"/><circle cx="9" cy="36" r="1.6" fill="#FFF4CC"/>'),
    ("pipo", 84, 54, "Le pot de fleurs", "et le chemin secret de Pipo",
     '<path d="M14 26h20l-3 14H17Z" fill="#D9734E"/><rect x="12" y="23" width="24" height="5" rx="2" fill="#F08A66"/><path d="M24 23V12" stroke="#3FBF5C" stroke-width="2.4"/><circle cx="24" cy="9" r="4" fill="#FF4F9A"/><circle cx="24" cy="9" r="1.6" fill="#FFD23F"/><path d="M24 17c4-4 8-3 9-1-3 3-6 3-9 1Z" fill="#3FBF5C"/>'),
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
    rnd = random.Random(9)
    massifs = "".join(f'<circle class="massif" cx="{500 + math.cos(a) * r:.0f}" cy="{500 + math.sin(a) * r:.0f}" r="{rnd.uniform(14, 34):.0f}"/>' for a, r in ((rnd.uniform(0, 6.28), rnd.uniform(160, 470)) for _ in range(26)))
    fleurs = "".join(
        f'<circle cx="{(i * 137) % 1000}" cy="{(i * 311 + 70) % 1000}" r="{3 + (i % 3) * 1.5:.1f}" fill="{FLEURS_COULEURS[i % len(FLEURS_COULEURS)]}"/>' for i in range(46)
    )
    allees = "".join(f'<circle class="allee" cx="500" cy="500" r="{r}"/>' for r in (150, 280, 410))
    return f'<svg viewBox="0 0 1000 1000" aria-hidden="true" focusable="false"><defs>{"".join(masks)}</defs>{massifs}{allees}{fleurs}{"".join(paths)}</svg>'


reperes = "\n".join(
    f"""        <div class="repere t-{slug}" style="left:{x}%;top:{y}%" data-repere="{i}"><span class="repere__icone"><svg viewBox="0 0 48 48" aria-hidden="true">{svg}</svg></span><span class="repere__nom"><b>{titre}</b>{sous}</span></div>"""
    for i, (slug, x, y, titre, sous, svg) in enumerate(REPERES)
)

LIANES_HERO = liane(36, 120, 1) + liane(47, 70, 2, -1) + liane(58, 150, 4) + liane(66, 90, 6, -1) + liane(97, 200, 8)

INDEX = head(
    "Minitaure · Petites créatures à collectionner, faites au Québec",
    "Minitaure, petite entreprise québécoise de créatures originales à collectionner. Cinq petits animaux ronds et poilus à 6 $ chacun, paiement à la livraison.",
    "index.html",
    modules=("jardin", "vitrine"),
) + header("index.html") + f"""
<section class="jardin" aria-labelledby="titre-jardin">
  <div class="ciel" aria-hidden="true">
    <div class="soleil"></div>
    <div class="nuage nuage--1"></div><div class="nuage nuage--2"></div><div class="nuage nuage--3"></div><div class="nuage nuage--4"></div>
    {OISEAUX}
  </div>
  <div class="jardin__sol">{SOL}</div>
  <div class="wrap jardin__texte">
    <p class="surtitre">Collection n° 1 · Le jardin lunaire</p>
    <h1 id="titre-jardin" data-split>Petites créatures, <em>grandes</em> histoires.</h1>
    <p class="jardin__lead apparait" style="--d:.55s">Le soleil se couche sur le jardin. Promène ta luciole : cinq petites créatures se cachent dans les buissons. Trouve-les, puis adopte tes préférées.</p>
    <div class="jardin__actions apparait" style="--d:.7s">
      <a class="btn btn--lune" href="boutique.html" data-aimant>Voir la boutique</a>
      <a class="btn btn--ligne" href="creatures.html">Rencontrer les créatures</a>
    </div>
  </div>
  <div class="lianes" aria-hidden="true">{LIANES_HERO}</div>
  <div class="lanterne-lueur" aria-hidden="true"></div>
  <div class="lune" aria-hidden="true"></div>
{cachettes}
  <div class="compteur">
    <span class="compteur__points" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>
    <span id="compteur-texte" aria-live="polite">0 / 5 trouvées</span>
    <button type="button" id="illuminer">Tout révéler</button>
    <button class="son" type="button" data-son aria-pressed="false" aria-label="Son du jardin">{ICONE_SON}</button>
  </div>
  <a class="defiler" href="#collection"><span aria-hidden="true"></span>Découvrir</a>
</section>

<section class="section section--collection" id="collection" aria-labelledby="titre-collection">
  {monstera("feuille-geante feuille-geante--g", "#1F8A3E", "#4FCB6E")}
  {monstera("feuille-geante feuille-geante--d", "#239A44", "#6BD45E")}
  <div class="wrap">
    <div class="titre-section">
      <h2 id="titre-collection" data-split>La collection du jardin lunaire</h2>
      <p class="apparait" style="--d:.15s">Cinq petits animaux originaux, vendus à l’unité. Chacun a sa petite manie, et sûrement une grande histoire à raconter.</p>
    </div>
    <div class="collection">
{collection()}
    </div>
  </div>
</section>

<section class="odyssee" data-progress="colle" aria-labelledby="titre-odyssee">
  <div class="odyssee__scene">
    <h2 id="titre-odyssee" class="sr-only">Petites créatures, grandes histoires</h2>
    {fougere("odyssee__fougere odyssee__fougere--g", "#1F7A3A", 12, "#3FBF5C")}
    {fougere("odyssee__fougere odyssee__fougere--d", "#2E9E4A", 12, "#6BD45E")}
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

<section class="section section--soleil" aria-labelledby="titre-etapes">
  <svg class="vague vague--haut" viewBox="0 0 1440 80" preserveAspectRatio="none" aria-hidden="true"><path d="M0 80 C240 20 480 20 720 50 C960 80 1200 70 1440 30 V0 H0Z" fill="#0B2A20"/></svg>
  {bouquet("section__bouquet section__bouquet--g", 3, 6)}
  {bouquet("section__bouquet section__bouquet--d", 5, 6)}
  <div class="wrap">
    <div class="titre-section">
      <h2 id="titre-etapes" data-split>Commander, c’est tout simple</h2>
      <p class="apparait" style="--d:.15s">Aucun paiement en ligne. Tu choisis, on confirme, tu paies à la livraison.</p>
    </div>
    <ol class="etapes">
      <li class="apparait"><span class="etapes__icone">{ICONE_GRAINE}</span><h3>1. Choisis tes créatures</h3><p>Ajoute une ou plusieurs créatures à ton panier, depuis la boutique ou le jardin.</p></li>
      <li class="apparait" style="--d:.25s"><span class="etapes__icone">{ICONE_POUSSE}</span><h3>2. Remplis le formulaire</h3><p>Tes créatures y sont déjà. Ajuste les quantités : le total se met à jour tout seul.</p></li>
      <li class="apparait" style="--d:.5s"><span class="etapes__icone">{ICONE_FLEUR}</span><h3>3. Paie à la livraison</h3><p>On te contacte pour confirmer, puis tu paies à la réception de ta commande.</p></li>
    </ol>
  </div>
  <svg class="vague vague--bas" viewBox="0 0 1440 80" preserveAspectRatio="none" aria-hidden="true"><path d="M0 0 C240 60 480 70 720 40 C960 10 1200 20 1440 60 V80 H0Z" fill="#0B2A20"/></svg>
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
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#B6E35A" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="6" width="20" height="13" rx="3"/><path d="M2 10h20M6 15h4"/></svg>
      <div><strong>Paiement à la livraison</strong><small>Aucune carte demandée en ligne. On confirme ta commande avant l’envoi.</small></div>
      <a class="btn btn--lune btn--sm" style="margin-left:auto" href="commande.html">Passer la commande</a>
    </div>
  </div>
</section>
<script type="application/ld+json">{{"@context":"https://schema.org","@graph":[{products_ld}]}}</script>
""" + FOOTER

# ---------------------------------------------------------------- créatures
def couronne(graine):
    """Couronne de feuilles autour du portail (tourne lentement)."""
    rnd = random.Random(graine)
    feuilles = []
    for k in range(30):
        a = k / 30 * 360
        coul = ["#2E9E4A", "#4FCB6E", "#7BD86A", "#239A44"][k % 4]
        feuilles.append(f'<ellipse cx="200" cy="12" rx="{rnd.uniform(8, 12):.0f}" ry="{rnd.uniform(18, 24):.0f}" fill="{coul}" transform="rotate({a:.0f} 200 200) rotate({rnd.uniform(-25, 25):.0f} 200 12)"/>')
        if k % 6 == 0:
            feuilles.append(f'<circle cx="200" cy="8" r="7" fill="{FLEURS_COULEURS[k // 6 % len(FLEURS_COULEURS)]}" transform="rotate({a + 6:.0f} 200 200)"/>')
    return f'<svg class="portail__couronne" viewBox="0 0 400 400" aria-hidden="true" focusable="false">{"".join(feuilles)}</svg>'


fiches = "\n".join(
    f"""    <article class="fiche t-{s}" id="{s}">
      <div class="fiche__portail" data-progress>
        {couronne(k)}
        <div class="portail__fenetre">
          <svg class="portail__paysage" viewBox="0 0 400 400" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M0 270 C80 240 160 262 230 250 C300 238 350 224 400 236 V400 H0Z" fill="#62C85A"/><path d="M0 312 C110 292 220 322 400 300 V400 H0Z" fill="#2FA34A"/>{"".join(f'<circle cx="{40 + j * 47}" cy="{300 + (j % 3) * 14}" r="6" fill="{FLEURS_COULEURS[(j + k) % len(FLEURS_COULEURS)]}"/>' for j in range(8))}</svg>
          <div class="portail__creature" data-c3d="{s}" data-c3d-mode="portail"><img src="assets/creatures/{s}.svg" alt="{n}, petite créature ronde et poilue, sans visage" width="200" height="200" loading="lazy"></div>
        </div>
        {fougere("portail__feuille portail__feuille--g", "#1F8A3E", 9, "#4FCB6E")}
        {fougere("portail__feuille portail__feuille--d", "#2E9E4A", 9, "#7BD86A")}
      </div>
      <div class="fiche__texte">
        <p class="fiche__num apparait" aria-hidden="true">{num}</p>
        <h2 data-split>{n}</h2>
        <blockquote class="apparait" style="--d:.2s">{lore}</blockquote>
        <div class="fiche__actions apparait" style="--d:.3s"><span class="prix">{PRIX} $</span><button class="ajout" type="button" data-ajouter="{s}" aria-label="Ajouter {n} au panier"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span>Ajouter au panier</span></button></div>
      </div>
    </article>"""
    for k, (s, num, n, lore) in enumerate(CREATURES)
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
STADES = {1: ICONE_GRAINE, 2: ICONE_POUSSE, 3: ICONE_BOUTON, 4: ICONE_FLEUR}


def rarete(n, etoiles, titre, texte, d):
    return f"""      <article class="rarete rarete--{n} apparait" data-tilt style="--d:{d}s">
        <div class="carte__face">
          <div class="carte__fond"></div>
          <div class="carte__cadre"></div>
          <span class="rarete__stade">{STADES[n]}</span>
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
    <span aria-hidden="true" style="font-size:1.5rem">🌱</span>
    <p><strong>À noter :</strong> les cartes et les sachets mystères ne sont pas offerts en ce moment. La boutique propose uniquement les cinq créatures vendues à l’unité. Cette page présente le système de rareté de l’univers Minitaure.</p>
  </div>
</section>
<section class="section" aria-labelledby="titre-rarete">
  <div class="wrap">
    <div class="titre-section"><h2 id="titre-rarete" data-split>Quatre niveaux de rareté</h2><p class="apparait">De la graine à la fleur : plus un trésor est rare, plus il brille. Passe ta souris sur chaque carte.</p></div>
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
PETALES = "".join(f'<ellipse cx="100" cy="36" rx="13" ry="34" fill="{"#FFC21F" if k % 2 else "#FFD84D"}" transform="rotate({k * 20} 100 100)"/>' for k in range(18))
GRAINES = "".join(f'<circle cx="{100 + math.cos(k * 2.39996) * math.sqrt(k) * 4.1:.1f}" cy="{100 + math.sin(k * 2.39996) * math.sqrt(k) * 4.1:.1f}" r="2.3" fill="{"#5A3410" if k % 3 else "#8A5A2B"}"/>' for k in range(90))
TOURNESOL = f'<svg class="systeme__fleur" viewBox="0 0 200 200" aria-hidden="true">{PETALES}<circle cx="100" cy="100" r="42" fill="#6B3E14"/>{GRAINES}</svg>'
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
      <p>Nos créatures sont douces, colorées et un peu mystérieuses. Ce sont de petits animaux ronds et poilus, sans visage, inspirés de la nature : une feuille, une pousse, une goutte de rosée, une fleur.</p>
      <p>On les dit petites, mais on les voit plutôt comme un début. Chaque créature est le point de départ d’une histoire que tu inventes : celle qui dort dans ta poche de manteau, celle qui apparaît quand tu fredonnes, celle qui connaît le chemin derrière le pot de fleurs.</p>
      <p>Elles vivent toutes dans le jardin lunaire, un monde de fleurs, d’étoiles et de petits trésors imaginaires.</p>
    </div>
    <div class="systeme apparait" style="--d:.15s" aria-hidden="true">
      {TOURNESOL}
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
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#163126" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="6" width="20" height="13" rx="3"/><path d="M2 10h20M6 15h4"/></svg>
        <div><strong>Paiement à la livraison</strong><small>Rien à payer en ligne.</small></div>
      </div>
      <button class="btn btn--plein" style="width:100%" type="submit">Envoyer ma commande</button>
      <p class="form-msg" id="commande-msg" role="status"></p>
    </div>
  </form>
</section>
""" + FOOTER

FAVICON = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="9" fill="#0B2A20"/><circle cx="16" cy="16" r="10" fill="#FFE7A3"/><circle cx="20" cy="12.5" r="9" fill="#0B2A20"/><path d="M6 27 C10 22 14 22 16 26 C18 22 22 22 26 27Z" fill="#3FBF5C"/></svg>"""

if __name__ == "__main__":
    pages = {
        "index.html": INDEX, "boutique.html": BOUTIQUE, "creatures.html": CREAT,
        "recompenses.html": RECOMP, "a-propos.html": APROPOS, "contact.html": CONTACT, "commande.html": COMMANDE,
    }
    for name, html in pages.items():
        (ROOT / name).write_text(html, encoding="utf-8")
        print("écrit", name)
    (ROOT / "assets" / "favicon.svg").write_text(FAVICON, encoding="utf-8")
