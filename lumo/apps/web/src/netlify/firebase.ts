import { initializeApp, type FirebaseApp } from 'firebase/app';
import { browserLocalPersistence, connectAuthEmulator, getAuth, signInWithCredential, GoogleAuthProvider, onAuthStateChanged, setPersistence, signInWithPopup, signInWithRedirect, signOut, type Auth, type User } from 'firebase/auth';

/**
 * Standalone site (Netlify): Google sign-in through Firebase. The project's public web config comes
 * from the build setting VITE_FIREBASE_CONFIG (the JSON object Firebase shows for a web app).
 */
let app: FirebaseApp | null = null;
let auth: Auth | null = null;

/** Reads the config as JSON or as the snippet the Firebase console shows (imports and comments included). */
export function parseFirebaseConfig(raw: string | undefined): Record<string, string> | null {
  try {
    if (!raw) return null;
    const text = raw.replace(/^\s*\/\/.*$/gm, ''); // whole-line comments only (URLs contain //)
    const at = text.search(/firebaseConfig\s*=\s*\{/);
    const start = at >= 0 ? text.indexOf('{', at) : text.indexOf('{');
    const end = text.indexOf('}', start);
    if (start < 0 || end < 0) return null;
    const body = text
      .slice(start, end + 1)
      .replace(/([{,]\s*)([A-Za-z_]\w*)\s*:/g, '$1"$2":')
      .replace(/'/g, '"')
      .replace(/,\s*}/g, '}');
    const cfg = JSON.parse(body) as Record<string, string>;
    return cfg.apiKey && cfg.projectId ? cfg : null;
  } catch {
    return null;
  }
}

export function firebaseConfig(): Record<string, string> | null {
  return parseFirebaseConfig(import.meta.env.VITE_FIREBASE_CONFIG as string | undefined);
}

export function firebase(): { app: FirebaseApp; auth: Auth } | null {
  if (app && auth) return { app, auth };
  const cfg = firebaseConfig();
  if (!cfg) return null;
  app = initializeApp(cfg);
  auth = getAuth(app);
  // Tests only: talk to the local Firebase emulators instead of the real project.
  const emu = import.meta.env.VITE_FIREBASE_EMULATOR as string | undefined;
  if (emu) {
    connectAuthEmulator(auth, `http://${emu}:9099`, { disableWarnings: true });
    const a = auth;
    // Tests sign in as a made-up Google account (the emulator accepts unsigned test credentials).
    (window as unknown as { __lumoTestSignIn?: (id: string) => Promise<unknown> }).__lumoTestSignIn = (id: string) =>
      signInWithCredential(a, GoogleAuthProvider.credential(JSON.stringify({ sub: id, email: `${id}@example.com`, email_verified: true, name: id })));
  }
  void setPersistence(auth, browserLocalPersistence).catch(() => {});
  return { app, auth };
}

export function watchUser(fn: (u: User | null) => void): () => void {
  const f = firebase();
  if (!f) {
    fn(null);
    return () => {};
  }
  return onAuthStateChanged(f.auth, fn);
}

export async function signInWithGoogle() {
  const f = firebase();
  if (!f) throw new Error('not_configured');
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await signInWithPopup(f.auth, provider);
  } catch (e) {
    const code = (e as { code?: string }).code ?? '';
    // Some phones block pop-ups: go through a full-page redirect instead.
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') return signInWithRedirect(f.auth, provider);
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
    throw e;
  }
}

export async function signOutEverywhere() {
  const f = firebase();
  if (f) await signOut(f.auth);
}
