import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// VITE_LOCAL=1 builds the browser-only Lumo: one self-contained page, no server, no service worker.
// VITE_NETLIFY=1 (with VITE_LOCAL=1) builds the same app as a standalone, installable site.
const netlify = process.env.VITE_NETLIFY === '1';
const local = process.env.VITE_LOCAL === '1' && !netlify;

/*
 * The website, findable on Google ("study lumo", "lumo study"): its address (Netlify gives it as URL
 * while building), what search engines and link previews show, robots.txt and a sitemap.
 */
const site = (process.env.URL || 'https://lumo-study-qwd6.netlify.app').replace(/\/$/, '');
const DESCRIPTION = 'Lumo Study turns your notes, a photo of your textbook or any topic into quiz games you play until you truly understand: Live games with friends, pets to hatch, streaks. Free, in English and French.';
const verify = (process.env.GOOGLE_SITE_VERIFICATION ?? '').replace(/[^\w-]/g, '');
function findable(): Plugin {
  const app = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Lumo Study',
    alternateName: ['Lumo', 'Study Lumo', 'Lumo study game'],
    url: `${site}/`,
    description: DESCRIPTION,
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Web',
    inLanguage: ['en', 'fr'],
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'CAD' },
    image: `${site}/icon-512.png`,
  };
  const head = [
    `<link rel="canonical" href="${site}/" />`,
    '<meta name="robots" content="index, follow" />',
    '<meta property="og:type" content="website" />',
    '<meta property="og:site_name" content="Lumo Study" />',
    '<meta property="og:title" content="Lumo Study: turn your notes into a study game" />',
    `<meta property="og:description" content="${DESCRIPTION}" />`,
    `<meta property="og:url" content="${site}/" />`,
    `<meta property="og:image" content="${site}/icon-512.png" />`,
    '<meta property="og:locale" content="en_CA" />',
    '<meta property="og:locale:alternate" content="fr_CA" />',
    '<meta name="twitter:card" content="summary" />',
    `<script type="application/ld+json">${JSON.stringify(app)}</script>`,
    // Google Search Console's proof that this site is ours (set GOOGLE_SITE_VERIFICATION on Netlify).
    ...(verify ? [`<meta name="google-site-verification" content="${verify}" />`] : []),
  ].join('\n    ');
  return {
    name: 'lumo-findable',
    transformIndexHtml: (html) => html.replace('</head>', `    ${head}\n  </head>`),
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${site}/sitemap.xml\n` });
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${site}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>\n</urlset>\n`,
      });
    },
  };
}

export default defineConfig({
  base: local ? './' : '/',
  build: netlify
    ? { outDir: 'dist-netlify' }
    : local
    ? {
        outDir: 'dist-local',
        assetsInlineLimit: 100_000_000, // fonts and images become data: URIs
        cssCodeSplit: false,
        rollupOptions: { output: { inlineDynamicImports: true } },
      }
    : undefined,
  plugins: [
    react(),
    tailwindcss(),
    netlify ? findable() : null,
    local
      ? null
      : VitePWA({
          registerType: 'autoUpdate',
          includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
          manifest: {
            name: 'Lumo Study',
            short_name: 'Lumo',
            description: 'Turn your notes into quiz games that make you truly understand.',
            theme_color: '#0F0C29',
            background_color: '#0F0C29',
            display: 'standalone',
            start_url: '/',
            icons: [
              { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
              { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
              { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            ],
          },
          workbox: {
            // Sign-in with Google (Netlify Identity) and the site's endpoints must reach the server, never the cached app.
            navigateFallbackDenylist: [/^\/api/, /^\/\.netlify\//],
            globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          },
        }),
  ],
  server: {
    port: 5173,
    host: true,
    proxy: {
      // ws: Live games use Socket.io under /api/live/socket.
      '/api': { target: 'http://localhost:3001', ws: true },
    },
  },
});
