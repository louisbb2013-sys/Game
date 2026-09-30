import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Static SPA build. `base` can be overridden for sub-path hosting:
//   BASE_PATH=/minitaure/ npm run build
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  build: {
    target: 'es2022',
    // The 3D chunk (three + R3F + drei) is lazy-loaded only when a scene mounts.
    chunkSizeWarningLimit: 1000,
  },
});
