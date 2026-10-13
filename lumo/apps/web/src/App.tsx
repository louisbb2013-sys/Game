import { useTranslation } from 'react-i18next';
import { useEffect } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router';
import { Layout } from './components/Layout';
import { Lumo } from './components/Lumo';
import { AuthProvider, useAuth } from './lib/auth';
import { Chat, ChatHome } from './pages/Chat';
import { Deck } from './pages/Deck';
import { Sandbox } from './pages/Sandbox';
import { SandboxPlay } from './pages/SandboxPlay';
import { Home } from './pages/Home';
import { League } from './pages/League';
import { Pets } from './pages/Pets';
import { Shop } from './pages/Shop';
import { RewardsProvider } from './lib/rewards';
import { Learn } from './pages/Learn';
import { Quiz } from './pages/Quiz';
import { Profile } from './pages/Profile';
import { Settings } from './pages/Settings';
import { SignIn } from './pages/SignIn';
import { AddFriend, Friends } from './pages/Friends';
import { Group, Groups, JoinGroup } from './pages/Groups';
import { LiveHome, LiveRoom } from './pages/Live';
import { ExamReport } from './pages/ExamReport';
import { OfflineList, OfflineReview } from './pages/Offline';
import { Audio } from './pages/Audio';
import { Progress } from './pages/Progress';

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <RewardsProvider>
          <AppRoutes />
        </RewardsProvider>
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
        <Route element={<Bare />}>
          <Route path="/progress/:token" element={<Progress />} />
        </Route>
        <Route path="*" element={<RememberThenSignIn />} />
      </Routes>
    );
  }

  return (
    <>
      <ResumeLink />
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="learn" element={<Learn />} />
          <Route path="decks/:id" element={<Deck />} />
          <Route path="chat" element={<ChatHome />} />
          <Route path="chat/:id" element={<Chat />} />
          <Route path="sandbox" element={<Sandbox />} />
          <Route path="sandbox/play/:id" element={<SandboxPlay />} />
          <Route path="live" element={<LiveHome />} />
          <Route path="friends" element={<Friends />} />
          <Route path="add/:code" element={<AddFriend />} />
          <Route path="groups" element={<Groups />} />
          <Route path="groups/join/:code" element={<JoinGroup />} />
          <Route path="groups/:id" element={<Group />} />
          <Route path="exam/:sessionId" element={<ExamReport />} />
          <Route path="offline" element={<OfflineList />} />
          <Route path="audio/:deckId" element={<Audio />} />
          <Route path="league" element={<League />} />
          <Route path="shop" element={<Shop />} />
          <Route path="pets" element={<Pets />} />
          <Route path="me" element={<Profile />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="quiz/:sessionId" element={<Quiz />} />
        <Route element={<Bare />}>
          <Route path="live/:code" element={<LiveRoom />} />
          <Route path="offline/:deckId" element={<OfflineReview />} />
          <Route path="progress/:token" element={<Progress />} />
        </Route>
        <Route path="*" element={<Fallback />} />
      </Routes>
    </>
  );
}

const NEXT_KEY = 'lumo_next';

/** Opened a friend/group/game link while signed out: come back to it after signing in. */
function RememberThenSignIn() {
  const { pathname } = useLocation();
  if (/^\/(live|add|groups)\//.test(pathname)) {
    try {
      sessionStorage.setItem(NEXT_KEY, pathname);
    } catch {
      /* private mode: just go to the home page after sign-in */
    }
  }
  return <Navigate to="/signin" replace />;
}

const peekNext = () => {
  try {
    return sessionStorage.getItem(NEXT_KEY);
  } catch {
    return null;
  }
};

/** Unknown path (or /signin right after signing in): go home, or back to the saved link. */
function Fallback() {
  return <Navigate to={peekNext() ?? '/'} replace />;
}

function ResumeLink() {
  const navigate = useNavigate();
  useEffect(() => {
    let next: string | null = null;
    try {
      next = sessionStorage.getItem(NEXT_KEY);
      sessionStorage.removeItem(NEXT_KEY);
    } catch {
      /* ignore */
    }
    if (next) navigate(next, { replace: true });
  }, [navigate]);
  return null;
}

/** Full-screen pages without the tab bar (a live game). */
function Bare() {
  return (
    <div className="mx-auto min-h-dvh max-w-xl px-4 pt-4 pb-6">
      <Outlet />
    </div>
  );
}
