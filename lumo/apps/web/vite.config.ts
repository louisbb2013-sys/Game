import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// VITE_LOCAL=1 builds the browser-only Lumo: one self-contained page, no server, no service worker.
const local = process.env.VITE_LOCAL === '1';

export default defineConfig({
  base: local ? './' : '/',
  build: local
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
    local
      ? null
      : VitePWA({
          registerType: 'autoUpdate',
          includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
          manifest: {
            name: 'Lumo — study smarter',
            short_name: 'Lumo',
            description: 'Turn your notes into quizzes that make you truly understand.',
            theme_color: '#1E1B4B',
            background_color: '#FFF8EC',
            display: 'standalone',
            start_url: '/',
            icons: [
              { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
              { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
              { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            ],
          },
          workbox: {
            navigateFallbackDenylist: [/^\/api/],
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
