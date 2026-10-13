import { useTranslation } from 'react-i18next';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { Lumo } from './components/Lumo';
import { AuthProvider, useAuth } from './lib/auth';
import { Chat, ChatHome } from './pages/Chat';
import { Deck } from './pages/Deck';
import { Sandbox } from './pages/Sandbox';
import { SandboxPlay } from './pages/SandboxPlay';
import { Home } from './pages/Home';
import { Learn } from './pages/Learn';
import { Quiz } from './pages/Quiz';
import { Profile } from './pages/Profile';
import { Settings } from './pages/Settings';
import { SignIn } from './pages/SignIn';

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

function AppRoutes() {
  const { user, loading } = useAuth();
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center" aria-busy="true">
        <div className="flex flex-col items-center gap-2">
          <Lumo size={96} mood="sleepy" />
          <span className="font-bold text-muted">{t('common.loading')}</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/signin" element={<SignIn />} />
        <Route path="*" element={<Navigate to="/signin" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="learn" element={<Learn />} />
        <Route path="decks/:id" element={<Deck />} />
        <Route path="chat" element={<ChatHome />} />
        <Route path="chat/:id" element={<Chat />} />
        <Route path="sandbox" element={<Sandbox />} />
        <Route path="sandbox/play/:id" element={<SandboxPlay />} />
        <Route path="live" element={<Soon />} />
        <Route path="league" element={<Soon />} />
        <Route path="me" element={<Profile />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="quiz/:sessionId" element={<Quiz />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function Soon() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-3 pt-16 text-center">
      <Lumo size={120} mood="thinking" />
      <p className="text-lg font-black">{t('home.soon')}</p>
    </div>
  );
}
