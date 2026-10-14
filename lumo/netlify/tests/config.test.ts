import { describe, expect, it } from 'vitest';
import { parseFirebaseConfig } from '../../apps/web/src/netlify/firebase';

const SNIPPET = `// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyA-example_key",
  authDomain: "lumo-1a2b3.firebaseapp.com",
  databaseURL: "https://lumo-1a2b3-default-rtdb.firebaseio.com",
  projectId: "lumo-1a2b3",
  storageBucket: "lumo-1a2b3.firebasestorage.app",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);`;

describe('Firebase settings pasted into Netlify', () => {
  it('reads the whole console snippet', () => {
    const c = parseFirebaseConfig(SNIPPET)!;
    expect(c.projectId).toBe('lumo-1a2b3');
    expect(c.databaseURL).toBe('https://lumo-1a2b3-default-rtdb.firebaseio.com');
    expect(c.apiKey).toBe('AIzaSyA-example_key');
  });
  it('reads plain JSON and just the object', () => {
    expect(parseFirebaseConfig('{"apiKey":"k","projectId":"p"}')).toEqual({ apiKey: 'k', projectId: 'p' });
    expect(parseFirebaseConfig("{ apiKey: 'k', projectId: 'p', }")).toEqual({ apiKey: 'k', projectId: 'p' });
  });
  it('rejects nothing or nonsense', () => {
    expect(parseFirebaseConfig(undefined)).toBeNull();
    expect(parseFirebaseConfig('hello')).toBeNull();
    expect(parseFirebaseConfig('{"apiKey":"k"}')).toBeNull();
  });
});
