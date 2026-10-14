import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './i18n';
import './index.css';
import { App } from './App';


// The browser-only build inside Claude has no service worker (it runs inside another page); the
// standalone site is an installable app.
if (import.meta.env.VITE_LOCAL !== '1' || import.meta.env.VITE_NETLIFY === '1') void import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));

const root = createRoot(document.getElementById('root')!);
if (import.meta.env.VITE_NETLIFY === '1') {
  // Google sign-in first (loaded only on the standalone site).
  const Gate = lazy(() => import('./netlify/Gate').then((m) => ({ default: m.Gate })));
  root.render(
    <StrictMode>
      <Suspense>
        <Gate>
          <App />
        </Gate>
      </Suspense>
    </StrictMode>,
  );
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
