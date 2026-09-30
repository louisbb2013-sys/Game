import type { Collection } from './types';

export const collections: Collection[] = [
  {
    slug: 'nebuleuse',
    name: 'Nébuleuse',
    subtitle: 'Venues du fond du ciel',
    description:
      'Les premières arrivées. Des fourrures couleur de nuit claire, qui gardent un peu de lumière d’étoile au bout de chaque poil.',
    accent: '#8E78E4',
    tint: '#EFE9FC',
  },
  {
    slug: 'sucrerie',
    name: 'Sucrerie',
    subtitle: 'Douceurs de passage',
    description:
      'Nées près des comètes les plus tièdes. Leurs teintes rappellent la confiserie, leur calme rappelle un après-midi sans horaire.',
    accent: '#E58DB0',
    tint: '#FDEEF4',
  },
  {
    slug: 'aurore',
    name: 'Aurore',
    subtitle: 'La lumière avant le jour',
    description:
      'Des créatures du matin, chaudes et un peu timides, qui apparaissent quand le ciel hésite encore entre la nuit et le jour.',
    accent: '#F2A66E',
    tint: '#FEF3E7',
  },
  {
    slug: 'maree',
    name: 'Marée',
    subtitle: 'Ce que la mer ramène',
    description:
      'Trouvées sur les grèves après les grandes marées d’étoiles. Leurs pelages ont la couleur de l’écume, du galet et de l’eau calme.',
    accent: '#5FAFB8',
    tint: '#EAF6F4',
  },
];

export const collectionBySlug = (slug: string) =>
  collections.find((c) => c.slug === slug);
