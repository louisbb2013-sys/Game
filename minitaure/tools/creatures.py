"""Génère les illustrations SVG de remplacement des créatures Minitaure.

Remplacez les fichiers de assets/creatures/ par les illustrations officielles
(même nom de fichier) pour les afficher partout sur le site.
Usage : python3 tools/creatures.py
"""
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "assets" / "creatures"

CREATURES = {
    "minotaure": ("#8C6CF0", "#B9A6FF", "#5B3FC4"),
    "gribou": ("#FF8F7E", "#FFC2B5", "#D9604F"),
    "bloop": ("#8FC8FF", "#CFE6FF", "#5A9BE0"),
    "noki": ("#FFD46B", "#FFEDB5", "#E0A93A"),
    "pipo": ("#8EDDBE", "#CDF3E4", "#4FB18D"),
}

BACK = {
    "bloop": """
  <ellipse cx="100" cy="182" rx="74" ry="10" fill="#CFE6FF" opacity=".85"/>
  <ellipse cx="100" cy="182" rx="48" ry="5" fill="#FFFFFF" opacity=".6"/>""",
}

ACCESSORIES = {
    # petites cornes en brindilles + feuille
    "minotaure": """
  <path d="M70 66 C60 52 54 40 58 26" stroke="#F6E7C8" stroke-width="10" stroke-linecap="round" fill="none"/>
  <path d="M130 66 C140 52 146 40 142 26" stroke="#F6E7C8" stroke-width="10" stroke-linecap="round" fill="none"/>
  <path d="M100 52 C92 40 96 30 108 26 C110 38 108 46 100 52Z" fill="#6FCB9F"/>""",
    # pousse en spirale
    "gribou": """
  <path d="M100 54 C100 40 102 30 112 26 C122 22 126 34 118 38 C112 41 108 34 112 31" stroke="#5FAF7F" stroke-width="5" stroke-linecap="round" fill="none"/>
  <path d="M100 50 C88 46 82 36 84 28 C94 30 100 40 100 50Z" fill="#7FD3A3"/>""",
    # goutte de rosée + flaque en rond de lune
    "bloop": """
  <path d="M100 22 C110 36 116 44 116 52 C116 61 108 66 100 66 C92 66 84 61 84 52 C84 44 90 36 100 22Z" fill="#E6F3FF" stroke="#5A9BE0" stroke-width="3"/>""",
    # scintillements
    "noki": """
  <path d="M100 18 L105 38 L124 42 L105 47 L100 66 L95 47 L76 42 L95 38Z" fill="#FFF6D8"/>
  <path d="M164 70 L167 80 L177 83 L167 86 L164 96 L161 86 L151 83 L161 80Z" fill="#FFFFFF"/>
  <path d="M34 92 L36 99 L43 101 L36 103 L34 110 L32 103 L25 101 L32 99Z" fill="#FFFFFF"/>
  <circle cx="158" cy="132" r="3" fill="#FFFFFF"/><circle cx="44" cy="62" r="2.5" fill="#FFFFFF"/>""",
    # fleur sur la tête
    "pipo": """
  <path d="M100 56 L100 36" stroke="#4FB18D" stroke-width="5" stroke-linecap="round"/>
  <path d="M100 48 C110 40 120 42 122 48 C114 54 106 54 100 48Z" fill="#6FCB9F"/>
  <g transform="translate(100 28)">
    <circle cx="0" cy="-11" r="8" fill="#FF8F7E"/><circle cx="10.5" cy="-3.4" r="8" fill="#FF8F7E"/>
    <circle cx="6.5" cy="9" r="8" fill="#FF8F7E"/><circle cx="-6.5" cy="9" r="8" fill="#FF8F7E"/>
    <circle cx="-10.5" cy="-3.4" r="8" fill="#FF8F7E"/><circle r="6.5" fill="#FFD46B"/>
  </g>""",
}


def svg(slug, base, light, dark):
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" role="img" aria-label="{slug.capitalize()}">
  <defs>
    <radialGradient id="g" cx="38%" cy="32%" r="75%">
      <stop offset="0" stop-color="{light}"/><stop offset=".55" stop-color="{base}"/><stop offset="1" stop-color="{dark}"/>
    </radialGradient>
    <filter id="fur" x="-20%" y="-20%" width="140%" height="140%">
      <feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="7" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="9" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
    <filter id="soft"><feGaussianBlur stdDeviation="6"/></filter>
  </defs>{BACK.get(slug, "")}
  <ellipse cx="76" cy="168" rx="16" ry="10" fill="{dark}"/>
  <ellipse cx="124" cy="168" rx="16" ry="10" fill="{dark}"/>
  <circle cx="100" cy="112" r="62" fill="url(#g)" filter="url(#fur)"/>
  <ellipse cx="80" cy="88" rx="22" ry="14" fill="#FFFFFF" opacity=".35" filter="url(#soft)"/>{ACCESSORIES[slug]}
</svg>
"""


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for slug, colors in CREATURES.items():
        (OUT / f"{slug}.svg").write_text(svg(slug, *colors), encoding="utf-8")
        print("écrit", slug)
