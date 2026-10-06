"""Génère les pages HTML de Minitaure (en-tête et pied partagés).
Usage : python3 tools/build.py   (depuis le dossier minitaure/)
Modifiez le contenu ici, puis relancez le script.
"""
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


def head(title, desc, page):
    return f"""<!doctype html>
<html lang="fr-CA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="{SITE}/{'' if page == 'index.html' else page}">
<meta property="og:type" content="website">
<meta property="og:locale" content="fr_CA">
<meta property="og:site_name" content="Minitaure">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta name="theme-color" content="#17163A">
<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&family=Fredoka:wght@500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/css/style.css">
<script src="assets/js/site.js" defer></script>
</head>
"""


def header(page, nuit=False):
    links = "\n".join(
        f'        <li><a href="{href}"{" aria-current=\"page\"" if href == page else ""}>{label}</a></li>'
        for href, label in NAV
    )
    return f"""<body>
<a class="skip" href="#contenu">Aller au contenu</a>
<header class="header{' header--nuit' if nuit else ''}">
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
    <p class="footer__grand" aria-hidden="true">Minitaure<span>.</span></p>
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
    <div class="footer__bas"><span>© <span id="annee">2026</span> Minitaure · Fait au Québec</span><span>Sous la lune, entre deux pots de fleurs.</span></div>
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
      <a class="btn btn--plein" id="tiroir-commander" href="commande.html">Passer la commande</a>
    </div>
  </aside>
</div>
<script>document.getElementById("annee").textContent = new Date().getFullYear();</script>
</body>
</html>
"""


def carte(slug, num, nom, lore, delai=0, lien="creatures.html"):
    return f"""      <article class="carte t-{slug} apparait" style="--d:{delai:.2f}s">
        <div class="carte__scene"><span class="carte__num">N° {num}</span><img src="assets/creatures/{slug}.svg" alt="{nom}, petite créature ronde et poilue" width="200" height="200" loading="lazy"></div>
        <div class="carte__corps">
          <h3><a href="{lien}#{slug}">{nom}</a></h3>
          <p class="carte__lore">{lore}</p>
          <div class="carte__pied"><span class="prix">{PRIX} $</span><button class="ajout" type="button" data-ajouter="{slug}" aria-label="Ajouter {nom} au panier"><span>Ajouter</span></button></div>
        </div>
      </article>"""


def collection(lien="creatures.html"):
    return "\n".join(carte(*c, delai=i * 0.07, lien=lien) for i, c in enumerate(CREATURES))


# ---------- Accueil ----------
# positions des cachettes dans le jardin (x %, y %)
POS = {"minotaure": (14, 80), "gribou": (34, 70), "bloop": (55, 79), "noki": (74, 66), "pipo": (90, 81)}

cachettes = "\n".join(
    f"""    <button class="cachette{' bord-g' if POS[s][0] < 40 else ' bord-d' if POS[s][0] > 60 else ''}" type="button" data-id="{s}" style="--x:{POS[s][0]}%;--y:{POS[s][1]}%">
      <img src="assets/creatures/{s}.svg" alt="" width="200" height="200">
      <span class="cachette__bulle"><b>{n} <small>N° {num}</small></b>{lore}</span>
      <span class="sr-only">Révéler {n}</span>
    </button>"""
    for s, num, n, lore in CREATURES
)

SOL = """<svg viewBox="0 0 1440 420" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="sol" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2A2766"/><stop offset="1" stop-color="#121131"/></linearGradient></defs>
      <path d="M0 150 C180 90 320 170 520 130 C720 90 860 160 1040 120 C1200 85 1330 130 1440 110 V420 H0Z" fill="#1F1D52"/>
      <path d="M0 220 C220 170 380 240 620 205 C860 170 1020 240 1240 200 C1330 185 1400 195 1440 190 V420 H0Z" fill="url(#sol)"/>
      <g fill="#3B3790">
        <path d="M120 230 c-6-40 4-70 18-90 c-2 30 0 60-6 92Z"/><path d="M140 232 c10-30 30-48 50-56 c-14 22-28 40-40 58Z"/>
        <path d="M700 220 c-4-50 8-80 22-100 c-4 36-4 66-10 102Z"/><path d="M1180 210 c8-36 26-60 48-70 c-16 26-30 48-40 72Z"/>
        <rect x="1010" y="180" width="70" height="56" rx="10"/><rect x="1000" y="172" width="90" height="16" rx="8"/>
        <path d="M1045 172 c-10-30 -4-56 12-74 c0 26 0 50-6 74Z"/><circle cx="1058" cy="92" r="12" fill="#4A46A8"/>
        <rect x="300" y="196" width="56" height="44" rx="8"/><rect x="292" y="190" width="72" height="13" rx="6"/>
      </g>
      <g fill="#FFD46B" opacity=".55"><circle cx="210" cy="160" r="3"/><circle cx="560" cy="120" r="2.5"/><circle cx="880" cy="150" r="3"/><circle cx="1320" cy="140" r="2.5"/></g>
    </svg>"""

INDEX = head(
    "Minitaure · Petites créatures à collectionner, faites au Québec",
    "Minitaure, petite entreprise québécoise de créatures originales à collectionner. Cinq miniatures douces et mystérieuses à 6 $ chacune, paiement à la livraison.",
    "index.html",
) + header("index.html", nuit=True) + f"""
<section class="jardin" aria-labelledby="titre-jardin">
  <div class="jardin__ciel" aria-hidden="true"></div>
  <div class="jardin__sol">{SOL}</div>
  <div class="wrap jardin__texte">
    <p class="surtitre">Collection n° 1 · Le jardin lunaire</p>
    <h1 id="titre-jardin">Petites créatures, <em>grandes</em> histoires.</h1>
    <p class="jardin__lead">Promène ta lanterne dans le jardin : cinq créatures s’y cachent. Trouve-les, puis adopte tes préférées.</p>
    <div class="jardin__actions">
      <a class="btn btn--lune" href="boutique.html">Voir la boutique</a>
      <a class="btn btn--ligne" href="creatures.html">Rencontrer les créatures</a>
    </div>
  </div>
  <div class="lanterne-lueur" aria-hidden="true"></div>
  <div class="voile" aria-hidden="true"></div>
  <div class="lune" aria-hidden="true"></div>
{cachettes}
  <div class="compteur" aria-live="polite">
    <span class="compteur__points" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>
    <span id="compteur-texte">0 / 5 trouvées</span>
    <button type="button" id="illuminer">Tout illuminer</button>
  </div>
</section>

<section class="section" id="collection" aria-labelledby="titre-collection">
  <div class="wrap">
    <div class="titre-section">
      <h2 id="titre-collection" class="apparait">La collection du jardin lunaire</h2>
      <p class="apparait" style="--d:.1s">Cinq créatures originales, vendues à l’unité. Chacune a une petite manie, et sûrement une grande histoire à raconter.</p>
    </div>
    <div class="collection">
{collection()}
    </div>
  </div>
</section>

<section class="section section--nuit" aria-labelledby="titre-etapes">
  <div class="wrap">
    <div class="titre-section">
      <h2 id="titre-etapes" class="apparait">Commander, c’est tout simple</h2>
      <p class="apparait" style="--d:.1s">Aucun paiement en ligne. Tu choisis, on confirme, tu paies à la livraison.</p>
    </div>
    <ol class="etapes">
      <li class="apparait"><h3>Choisis tes créatures</h3><p>Ajoute une ou plusieurs créatures à ton panier, depuis la boutique ou le jardin.</p></li>
      <li class="apparait" style="--d:.1s"><h3>Remplis le formulaire</h3><p>Tes créatures y sont déjà. Ajuste les quantités : le total se met à jour tout seul.</p></li>
      <li class="apparait" style="--d:.2s"><h3>Paie à la livraison</h3><p>On te contacte pour confirmer, puis tu paies à la réception de ta commande.</p></li>
    </ol>
  </div>
</section>

<section class="section manifeste" aria-label="Notre philosophie">
  <div class="wrap">
    <div class="manifeste__rang" aria-hidden="true">{''.join(f'<img src="assets/creatures/{c[0]}.svg" alt="" width="96" height="96" loading="lazy">' for c in CREATURES)}</div>
    <p class="apparait">Nos créatures sont petites, mais chacune est le <span>point de départ</span> d’une grande aventure.</p>
    <div style="margin-top:2.5rem" class="apparait"><a class="btn btn--plein" href="boutique.html">Commencer ma collection</a></div>
  </div>
</section>
""" + FOOTER

# ---------- Boutique ----------
products_ld = ",".join(
    f'{{"@type":"Product","name":"{n}","sku":"MNT-{num}","image":"{SITE}/assets/creatures/{s}.svg","description":"{lore}","brand":{{"@type":"Brand","name":"Minitaure"}},"offers":{{"@type":"Offer","price":"{PRIX}.00","priceCurrency":"CAD","availability":"https://schema.org/InStock"}}}}'
    for s, num, n, lore in CREATURES
)
BOUTIQUE = head(
    "Boutique · Minitaure",
    "Adopte Minotaure, Gribou, Bloop, Noki et Pipo : cinq créatures à collectionner à 6 $ chacune. Paiement à la livraison.",
    "boutique.html",
) + header("boutique.html") + f"""
<section class="page-tete wrap">
  <h1 class="apparait">La boutique</h1>
  <p class="apparait" style="--d:.1s">Cinq créatures, 6 $ chacune. Ajoute tes préférées au panier, puis remplis le formulaire. Tu paies à la livraison.</p>
</section>
<section class="section" style="padding-top:0" aria-label="Créatures en vente">
  <div class="wrap">
    <div class="collection">
{collection()}
    </div>
    <div class="paiement" style="margin-top:3rem">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#17163A" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="6" width="20" height="13" rx="3"/><path d="M2 10h20M6 15h4"/></svg>
      <div><strong>Paiement à la livraison</strong><small>Aucune carte demandée en ligne. On confirme ta commande avant l’envoi.</small></div>
      <a class="btn btn--plein btn--sm" style="margin-left:auto" href="commande.html">Passer la commande</a>
    </div>
  </div>
</section>
<script type="application/ld+json">{{"@context":"https://schema.org","@graph":[{products_ld}]}}</script>
""" + FOOTER

# ---------- Créatures ----------
fiches = "\n".join(
    f"""    <article class="fiche t-{s}" id="{s}">
      <div class="fiche__visuel apparait"><img src="assets/creatures/{s}.svg" alt="{n}, petite créature ronde et poilue, sans visage" width="200" height="200" loading="lazy"></div>
      <div class="apparait" style="--d:.1s">
        <p class="fiche__num" aria-hidden="true">{num}</p>
        <h2>{n}</h2>
        <blockquote>{lore}</blockquote>
        <div class="fiche__actions"><span class="prix">{PRIX} $</span><button class="ajout" type="button" data-ajouter="{s}" aria-label="Ajouter {n} au panier"><span>Ajouter au panier</span></button></div>
      </div>
    </article>"""
    for s, num, n, lore in CREATURES
)
CREAT = head(
    "Les créatures · Minitaure",
    "Rencontre les cinq créatures du jardin lunaire : Minotaure, Gribou, Bloop, Noki et Pipo, et leurs petites manies.",
    "creatures.html",
) + header("creatures.html") + f"""
<section class="page-tete wrap">
  <h1 class="apparait">Les créatures du jardin lunaire</h1>
  <p class="apparait" style="--d:.1s">Petites, rondes et poilues, elles n’ont pas de visage : à toi d’imaginer leur caractère. Voici ce qu’on sait d’elles.</p>
</section>
<section class="wrap" style="padding-bottom:var(--s-6)">
{fiches}
</section>
""" + FOOTER

# ---------- Récompenses ----------
RECOMP = head(
    "Récompenses et rareté · Minitaure",
    "Le système de rareté de l’univers Minitaure : commun, rare, très rare et ultra rare.",
    "recompenses.html",
) + header("recompenses.html") + """
<section class="page-tete wrap">
  <h1 class="apparait">Rareté et récompenses</h1>
  <p class="apparait" style="--d:.1s">Dans le jardin lunaire, certains trésors se montrent plus rarement que d’autres. Voici comment on les classe.</p>
</section>
<section class="wrap">
  <div class="avis apparait" role="note">
    <span aria-hidden="true" style="font-size:1.6rem">🌙</span>
    <p><strong>À noter :</strong> les cartes et les sachets mystères ne sont pas offerts en ce moment. La boutique propose uniquement les cinq créatures vendues à l’unité. Cette page présente le système de rareté de l’univers Minitaure.</p>
  </div>
</section>
<section class="section" aria-labelledby="titre-rarete">
  <div class="wrap">
    <div class="titre-section"><h2 id="titre-rarete" class="apparait">Quatre niveaux de rareté</h2></div>
    <div class="raretes">
      <div class="rarete rarete--1 apparait"><span class="rarete__etoiles" aria-hidden="true">★</span><div><h3>Commun</h3><p>Les trésors qu’on croise souvent au détour d’une allée.</p></div></div>
      <div class="rarete rarete--2 apparait" style="--d:.08s"><span class="rarete__etoiles" aria-hidden="true">★★</span><div><h3>Rare</h3><p>Ceux qui ne sortent que certaines nuits.</p></div></div>
      <div class="rarete rarete--3 apparait" style="--d:.16s"><span class="rarete__etoiles" aria-hidden="true">★★★</span><div><h3>Très rare</h3><p>On les entend avant de les voir.</p></div></div>
      <div class="rarete rarete--4 apparait" style="--d:.24s"><span class="rarete__etoiles" aria-hidden="true">★★★★</span><div><h3>Ultra rare</h3><p>Presque une légende du jardin lunaire.</p></div></div>
    </div>
  </div>
</section>
<section class="section section--creme2" aria-labelledby="titre-tresors">
  <div class="wrap">
    <div class="titre-section"><h2 id="titre-tresors" class="apparait">Les petits trésors</h2><p class="apparait">Les récompenses de l’univers Minitaure, du plus simple au plus brillant.</p></div>
    <ul class="tresors">
      <li class="apparait"><h3>Cartes</h3><p>Une carte pour garder la trace de chaque rencontre.</p></li>
      <li class="apparait" style="--d:.06s"><h3>Amulettes en papier</h3><p>De petits porte-bonheur pliés à la main.</p></li>
      <li class="apparait" style="--d:.12s"><h3>Cartes spéciales</h3><p>Des illustrations différentes, plus difficiles à trouver.</p></li>
      <li class="apparait" style="--d:.18s"><h3>Cartes holographiques</h3><p>Elles brillent comme un rond de lune dans une flaque.</p></li>
      <li class="apparait" style="--d:.24s"><h3>Petits bonus exclusifs</h3><p>Des surprises réservées aux collectionneurs.</p></li>
    </ul>
    <p style="margin-top:3rem"><a class="btn btn--plein" href="boutique.html">Voir les créatures disponibles</a></p>
  </div>
</section>
""" + FOOTER

# ---------- À propos ----------
APROPOS = head(
    "À propos · Minitaure",
    "Minitaure est une petite entreprise québécoise qui imagine des créatures originales à collectionner, douces, colorées et légèrement mystérieuses.",
    "a-propos.html",
) + header("a-propos.html") + """
<section class="page-tete wrap">
  <h1 class="apparait">Petite marque, grand jardin</h1>
</section>
<section class="wrap" style="padding-bottom:var(--s-6)">
  <div class="apropos">
    <div class="apropos__texte apparait">
      <p>Minitaure est une petite entreprise québécoise qui imagine des créatures originales à collectionner.</p>
      <p>Nos créatures sont douces, colorées et un peu mystérieuses. Elles sont rondes et poilues, n’ont pas de visage et s’inspirent de la nature : une feuille, une pousse, une goutte de rosée, une fleur.</p>
      <p>On les dit petites, mais on les voit plutôt comme un début. Chaque créature est le point de départ d’une histoire que tu inventes : celle qui dort dans ta poche de manteau, celle qui apparaît quand tu fredonnes, celle qui connaît le chemin derrière le pot de fleurs.</p>
      <p>Elles vivent toutes dans le jardin lunaire, un monde d’étoiles, de lune et de petits trésors imaginaires.</p>
    </div>
    <ul class="valeurs">
      <li class="apparait" style="--d:.05s"><h3>Des designs originaux</h3><p>Chaque créature est imaginée par Minitaure, avec sa petite manie bien à elle.</p></li>
      <li class="apparait" style="--d:.1s"><h3>Fait au Québec</h3><p>Une petite entreprise d’ici, proche de ses collectionneurs.</p></li>
      <li class="apparait" style="--d:.15s"><h3>Simple et humain</h3><p>Commande par formulaire, confirmation personnelle, paiement à la livraison.</p></li>
    </ul>
  </div>
</section>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Minitaure","url":"https://minitaure.ca","email":"ibrahimkalil2024@gmail.com","areaServed":"CA-QC","description":"Petite entreprise québécoise de créatures originales à collectionner."}</script>
""" + FOOTER

# ---------- Contact ----------
CONTACT = head(
    "Contact · Minitaure",
    "Écris à Minitaure : questions, collaborations, presse ou revendeurs. Réponse sous 48 heures.",
    "contact.html",
) + header("contact.html") + f"""
<section class="page-tete wrap">
  <h1 class="apparait">Écris-nous</h1>
  <p class="apparait" style="--d:.1s">Une question, une idée de collaboration ou envie de vendre Minitaure en boutique ? On lit tout.</p>
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
      <div class="panneau apparait" style="--d:.1s">
        <h2>Par courriel</h2>
        <p>Tu préfères écrire directement ?</p>
        <p style="margin-top:.6rem"><a class="mail" href="mailto:{COURRIEL}">{COURRIEL}</a></p>
        <span class="delai">⏱ Réponse sous 48 heures</span>
      </div>
      <div class="panneau apparait" style="--d:.2s">
        <h2>Pour commander</h2>
        <p>Les commandes passent par le formulaire de commande, avec paiement à la livraison.</p>
        <p style="margin-top:1rem"><a class="btn btn--ligne btn--sm" href="boutique.html">Aller à la boutique</a></p>
      </div>
    </div>
  </div>
</section>
""" + FOOTER

# ---------- Commande ----------
COMMANDE = head(
    "Commande · Minitaure",
    "Finalise ta commande de créatures Minitaure. Paiement à la livraison.",
    "commande.html",
).replace("<title>", '<meta name="robots" content="noindex">\n<title>') + header("") + f"""
<section class="page-tete wrap">
  <h1>Ta commande</h1>
  <p>Tes créatures sont déjà là. Ajuste les quantités, entre tes coordonnées, et on s’occupe du reste.</p>
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

FAVICON = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="#6A4FD6"/><path d="M16 2a14 14 0 1 0 14 14A11 11 0 0 1 16 2Z" fill="#B9A6FF"/></svg>"""

if __name__ == "__main__":
    pages = {
        "index.html": INDEX, "boutique.html": BOUTIQUE, "creatures.html": CREAT,
        "recompenses.html": RECOMP, "a-propos.html": APROPOS, "contact.html": CONTACT, "commande.html": COMMANDE,
    }
    for name, html in pages.items():
        (ROOT / name).write_text(html, encoding="utf-8")
        print("écrit", name)
    (ROOT / "assets" / "favicon.svg").write_text(FAVICON, encoding="utf-8")
