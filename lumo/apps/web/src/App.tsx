import { useTranslation } from 'react-i18next';
import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, MemoryRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router';
import { LOCAL, NETLIFY } from './lib/api';
import { Layout } from './components/Layout';
import { Lumo } from './components/Lumo';
import { PageLoading } from './components/PageLoading';
import { AuthProvider, useAuth } from './lib/auth';
import { Home } from './pages/Home';
import { RewardsProvider } from './lib/rewards';
import { SignIn } from './pages/SignIn';

// Pages load on demand so the first screen appears fast (the service worker still caches them all for offline).
const Chat = lazy(() => import('./pages/Chat').then((m) => ({ default: m.Chat })));
const ChatHome = lazy(() => import('./pages/Chat').then((m) => ({ default: m.ChatHome })));
const Deck = lazy(() => import('./pages/Deck').then((m) => ({ default: m.Deck })));
const Sandbox = lazy(() => import('./pages/Sandbox').then((m) => ({ default: m.Sandbox })));
const SandboxPlay = lazy(() => import('./pages/SandboxPlay').then((m) => ({ default: m.SandboxPlay })));
const League = lazy(() => import('./pages/League').then((m) => ({ default: m.League })));
const Pets = lazy(() => import('./pages/Pets').then((m) => ({ default: m.Pets })));
const Shop = lazy(() => import('./pages/Shop').then((m) => ({ default: m.Shop })));
const Learn = lazy(() => import('./pages/Learn').then((m) => ({ default: m.Learn })));
const Quiz = lazy(() => import('./pages/Quiz').then((m) => ({ default: m.Quiz })));
const Profile = lazy(() => import('./pages/Profile').then((m) => ({ default: m.Profile })));
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));
const AddFriend = lazy(() => import('./pages/Friends').then((m) => ({ default: m.AddFriend })));
const Friends = lazy(() => import('./pages/Friends').then((m) => ({ default: m.Friends })));
const Group = lazy(() => import('./pages/Groups').then((m) => ({ default: m.Group })));
const Groups = lazy(() => import('./pages/Groups').then((m) => ({ default: m.Groups })));
const JoinGroup = lazy(() => import('./pages/Groups').then((m) => ({ default: m.JoinGroup })));
const LiveHome = lazy(() => import('./pages/Live').then((m) => ({ default: m.LiveHome })));
const LiveRoom = lazy(() => import('./pages/Live').then((m) => ({ default: m.LiveRoom })));
const ExamReport = lazy(() => import('./pages/ExamReport').then((m) => ({ default: m.ExamReport })));
const OfflineList = lazy(() => import('./pages/Offline').then((m) => ({ default: m.OfflineList })));
const OfflineReview = lazy(() => import('./pages/Offline').then((m) => ({ default: m.OfflineReview })));
const Audio = lazy(() => import('./pages/Audio').then((m) => ({ default: m.Audio })));
const Progress = lazy(() => import('./pages/Progress').then((m) => ({ default: m.Progress })));

// The browser-only build lives inside another page, so it keeps its own in-memory address bar.
const Router = LOCAL && !NETLIFY ? MemoryRouter : BrowserRouter;
const NewDeck = lazy(() => import('./pages/NewDeck').then((m) => ({ default: m.NewDeck })));
const LocalFriends = lazy(() => import('./pages/LocalFriends').then((m) => ({ default: m.LocalFriends })));

export function App() {
  return (
    <AuthProvider>
      <Router>
        <RewardsProvider>
          <AppRoutes />
        </RewardsProvider>
      </Router>
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
      <Suspense fallback={<PageLoading />}>
        <Routes>
          <Route path="/signin" element={<SignIn />} />
          <Route element={<Bare />}>
            <Route path="/progress/:token" element={<Progress />} />
          </Route>
          <Route path="*" element={<RememberThenSignIn />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <>
      <ResumeLink />
      <Suspense fallback={<PageLoading />}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="learn" element={<Learn />} />
            <Route path="decks/:id" element={<Deck />} />
            <Route path="chat" element={LOCAL ? <NewDeck /> : <ChatHome />} />
            <Route path="chat/:id" element={<Chat />} />
            <Route path="sandbox" element={<Sandbox />} />
            <Route path="sandbox/play/:id" element={<SandboxPlay />} />
            <Route path="live" element={<LiveHome />} />
            <Route path="friends" element={LOCAL ? <LocalFriends /> : <Friends />} />
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
      </Suspense>
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
      <Suspense fallback={<PageLoading />}>
        <Outlet />
      </Suspense>
    </div>
  );
}
