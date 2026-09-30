import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import App from './App';
import './styles/global.css';

// Browser scroll restoration fights route transitions; we manage it ourselves.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

// VITE_ROUTER=memory builds a copy that navigates in-page without touching the
// URL, for hosts that serve the site inside a frame (see `npm run build:share`).
function Router({ children }: { children: React.ReactNode }) {
  return import.meta.env.VITE_ROUTER === 'memory' ? (
    <MemoryRouter>{children}</MemoryRouter>
  ) : (
    <BrowserRouter basename={import.meta.env.BASE_URL}>{children}</BrowserRouter>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      <MotionConfig reducedMotion="user">
        <App />
      </MotionConfig>
    </Router>
  </StrictMode>,
);
