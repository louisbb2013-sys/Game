import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './i18n';
import './index.css';
import { App } from './App';

// The browser-only build has no service worker (it runs inside another page).
if (import.meta.env.VITE_LOCAL !== '1') void import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
