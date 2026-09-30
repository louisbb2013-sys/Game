/** Site-wide copy and navigation. */
export const site = {
  name: 'Minitaure',
  url: 'https://minitaure.example',
  tagline: 'Petites créatures sans visage, venues d’une douce nébuleuse.',
  description:
    'Minitaure : des créatures de collection, rondes, douces et sans visage, numérotées une à une. Découvrez le catalogue et la boutique.',
  social: [
    { label: 'Instagram', href: 'https://instagram.com/' },
    { label: 'Pinterest', href: 'https://pinterest.com/' },
    { label: 'TikTok', href: 'https://tiktok.com/' },
  ],
  email: 'bonjour@minitaure.example',
};

export const nav = [
  { to: '/', label: 'Accueil' },
  { to: '/boutique', label: 'Boutique' },
  { to: '/creatures', label: 'Créatures' },
  { to: '/a-propos', label: 'À propos' },
  { to: '/contact', label: 'Contact' },
] as const;
