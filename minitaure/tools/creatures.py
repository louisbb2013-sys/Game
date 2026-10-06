"""Génère les illustrations SVG des créatures Minitaure (petits animaux ronds, sans visage).

Elles servent d'image de secours (sans 3D), dans le panier et sur la page À propos.
Remplacez les fichiers de assets/creatures/ par les illustrations officielles
(même nom de fichier) pour les afficher partout sur le site.
Usage : python3 tools/creatures.py
"""
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "assets" / "creatures"

# base, clair, foncé, ventre, pattes
CREATURES = {
    "minotaure": ("#8A5CFF", "#BBA3FF", "#4E2BC0", "#D9C9FF", "#3B2463"),
    "gribou": ("#FF6A45", "#FFA184", "#C2391F", "#FFE0CF", "#7A2112"),
    "bloop": ("#33B4FF", "#8FD6FF", "#1478C4", "#C9EEFF", "#1673B6"),
    "noki": ("#FFC21F", "#FFE07A", "#D18A00", "#FFF0B8", "#FF8A1F"),
    "pipo": ("#35DA93", "#8BEFC0", "#169A62", "#C9F7E2", "#23A86E"),
}

DERRIERE = {
    # queue fine à pompon
    "minotaure": """
  <path d="M146 140 C166 142 172 160 166 176" stroke="#6A42DD" stroke-width="7" stroke-linecap="round" fill="none"/>
  <circle cx="165" cy="180" r="9" fill="#5A33D6" filter="url(#fur)"/>""",
    # grosse queue touffue, bout crème
    "gribou": """
  <path d="M138 150 C176 150 186 110 168 80 C160 100 150 120 132 128Z" fill="#FF6A45" filter="url(#fur)"/>
  <path d="M168 80 C176 92 178 104 174 114 C166 106 162 96 162 86Z" fill="#FFF4EA" filter="url(#fur)"/>""",
    # flaque + queue plate
    "bloop": """
  <ellipse cx="100" cy="184" rx="76" ry="10" fill="#9FDBFF" opacity=".8"/>
  <ellipse cx="100" cy="184" rx="50" ry="5" fill="#FFFFFF" opacity=".55"/>
  <ellipse cx="150" cy="168" rx="22" ry="7" fill="#2399E6" transform="rotate(-20 150 168)"/>""",
    # plumes de queue
    "noki": """
  <ellipse cx="146" cy="150" rx="18" ry="6" fill="#FF9F1C" transform="rotate(-25 146 150)"/>
  <ellipse cx="148" cy="160" rx="18" ry="6" fill="#FF9F1C" transform="rotate(-5 148 160)"/>""",
    # pompon blanc
    "pipo": """
  <circle cx="152" cy="150" r="13" fill="#FFFFFF" filter="url(#fur)"/>""",
}

DEVANT = {
    "minotaure": """
  <path d="M74 66 C62 58 56 46 60 32" stroke="#FFF0D2" stroke-width="8" stroke-linecap="round" fill="none"/>
  <path d="M126 66 C138 58 144 46 140 32" stroke="#FFF0D2" stroke-width="8" stroke-linecap="round" fill="none"/>
  <ellipse cx="60" cy="80" rx="18" ry="8" fill="#7448E6" transform="rotate(25 60 80)"/>
  <ellipse cx="60" cy="80" rx="11" ry="4" fill="#FF9FC8" transform="rotate(25 60 80)"/>
  <ellipse cx="140" cy="80" rx="18" ry="8" fill="#7448E6" transform="rotate(-25 140 80)"/>
  <ellipse cx="140" cy="80" rx="11" ry="4" fill="#FF9FC8" transform="rotate(-25 140 80)"/>
  <ellipse cx="100" cy="50" rx="17" ry="9" fill="#5A33D6" filter="url(#fur)"/>
  <path d="M88 46 C82 38 84 32 92 30 C94 38 92 42 88 46Z" fill="#3FBF5C"/>""",
    "gribou": """
  <path d="M70 66 L64 26 L92 50Z" fill="#FF6A45"/><path d="M72 58 L68 36 L86 50Z" fill="#FFE6D8"/><path d="M64 26 L67 36 L71 33Z" fill="#5E1A0E"/>
  <path d="M130 66 L136 26 L108 50Z" fill="#FF6A45"/><path d="M128 58 L132 36 L114 50Z" fill="#FFE6D8"/><path d="M136 26 L133 36 L129 33Z" fill="#5E1A0E"/>
  <path d="M100 46 C100 34 102 26 110 22 C118 19 121 29 115 32 C110 34 107 29 110 26" stroke="#3FA15F" stroke-width="4" stroke-linecap="round" fill="none"/>
  <path d="M100 44 C90 41 86 33 88 26 C96 28 100 36 100 44Z" fill="#4FCB6E"/>""",
    "bloop": """
  <circle cx="72" cy="56" r="11" fill="#2399E6"/><circle cx="72" cy="56" r="5.5" fill="#C2EAFF"/>
  <circle cx="128" cy="56" r="11" fill="#2399E6"/><circle cx="128" cy="56" r="5.5" fill="#C2EAFF"/>
  <path d="M100 16 C109 29 114 36 114 43 C114 51 107 55 100 55 C93 55 86 51 86 43 C86 36 91 29 100 16Z" fill="#E6F6FF" stroke="#1478C4" stroke-width="2.5"/>""",
    "noki": """
  <path d="M74 54 L70 34 L88 48Z" fill="#FF9F1C"/><path d="M126 54 L130 34 L112 48Z" fill="#FF9F1C"/>
  <ellipse cx="100" cy="40" rx="5" ry="12" fill="#FF9F1C"/><ellipse cx="91" cy="42" rx="4" ry="10" fill="#FF9F1C" transform="rotate(-22 91 42)"/><ellipse cx="109" cy="42" rx="4" ry="10" fill="#FF9F1C" transform="rotate(22 109 42)"/>
  <ellipse cx="50" cy="128" rx="10" ry="26" fill="#FF9F1C" transform="rotate(14 50 128)"/>
  <ellipse cx="150" cy="128" rx="10" ry="26" fill="#FF9F1C" transform="rotate(-14 150 128)"/>
  <path d="M164 64 L167 74 L177 77 L167 80 L164 90 L161 80 L151 77 L161 74Z" fill="#FFFFFF"/>
  <path d="M36 96 L38 103 L45 105 L38 107 L36 114 L34 107 L27 105 L34 103Z" fill="#FFFFFF"/>""",
    "pipo": """
  <ellipse cx="84" cy="30" rx="10" ry="30" fill="#2ECB86" transform="rotate(-8 84 30)"/>
  <ellipse cx="84" cy="30" rx="5" ry="22" fill="#FFB0C6" transform="rotate(-8 84 30)"/>
  <ellipse cx="138" cy="56" rx="30" ry="10" fill="#2ECB86" transform="rotate(28 138 56)"/>
  <ellipse cx="138" cy="56" rx="22" ry="5" fill="#FFB0C6" transform="rotate(28 138 56)"/>
  <g transform="translate(76 54)"><circle cx="0" cy="-7" r="5" fill="#FF4F9A"/><circle cx="6.6" cy="-2.2" r="5" fill="#FF4F9A"/><circle cx="4.1" cy="5.7" r="5" fill="#FF4F9A"/><circle cx="-4.1" cy="5.7" r="5" fill="#FF4F9A"/><circle cx="-6.6" cy="-2.2" r="5" fill="#FF4F9A"/><circle r="4" fill="#FFC21F"/></g>""",
}

PIEDS = {
    "noki": ("#FF8A1F", (16, 6), (10, 5)),
    "pipo": ("#23A86E", (24, 8), (12, 7)),
}


def svg(slug, base, clair, fonce, ventre, patte):
    couleur_pied, (rx_ar, ry_ar), (rx_av, ry_av) = PIEDS.get(slug, (patte, (18, 9), (12, 8)))
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" role="img" aria-label="{slug.capitalize()}">
  <defs>
    <radialGradient id="g" cx="38%" cy="30%" r="80%">
      <stop offset="0" stop-color="{clair}"/><stop offset=".55" stop-color="{base}"/><stop offset="1" stop-color="{fonce}"/>
    </radialGradient>
    <filter id="fur" x="-20%" y="-20%" width="140%" height="140%">
      <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="7" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="7" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
    <filter id="doux"><feGaussianBlur stdDeviation="5"/></filter>
  </defs>{DERRIERE.get(slug, "")}
  <ellipse cx="62" cy="170" rx="{rx_ar}" ry="{ry_ar}" fill="{couleur_pied}"/>
  <ellipse cx="138" cy="170" rx="{rx_ar}" ry="{ry_ar}" fill="{couleur_pied}"/>
  <ellipse cx="100" cy="130" rx="52" ry="45" fill="url(#g)" filter="url(#fur)"/>
  <ellipse cx="100" cy="146" rx="30" ry="22" fill="{ventre}" opacity=".85" filter="url(#doux)"/>
  <ellipse cx="85" cy="173" rx="{rx_av}" ry="{ry_av}" fill="{couleur_pied}"/>
  <ellipse cx="115" cy="173" rx="{rx_av}" ry="{ry_av}" fill="{couleur_pied}"/>
  <circle cx="100" cy="80" r="37" fill="url(#g)" filter="url(#fur)"/>
  <ellipse cx="88" cy="68" rx="14" ry="9" fill="#FFFFFF" opacity=".3" filter="url(#doux)"/>{DEVANT[slug]}
</svg>
"""


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for slug, couleurs in CREATURES.items():
        (OUT / f"{slug}.svg").write_text(svg(slug, *couleurs), encoding="utf-8")
        print("écrit", slug)
