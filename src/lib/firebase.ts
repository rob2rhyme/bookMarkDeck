// src/lib/firebase.ts
import { getApp, getApps, initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, type User } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

let authPromise: Promise<User> | null = null;

/**
 * Ensure Firebase Auth is signed in with the intended Google account.
 * Uses emailHint to steer the account picker and signs out mismatched users.
 */
export function ensureFirebaseGoogleAuth(emailHint?: string): Promise<User> {
  if (
    auth.currentUser &&
    (!emailHint ||
      auth.currentUser.email?.toLowerCase() === emailHint.toLowerCase())
  ) {
    return Promise.resolve(auth.currentUser);
  }

  if (auth.currentUser && emailHint) {
    signOut(auth).catch(() => {});
  }

  if (!authPromise) {
    const provider = new GoogleAuthProvider();
    if (emailHint) {
      provider.setCustomParameters({
        login_hint: emailHint,
        prompt: "select_account",
      });
    } else {
      provider.setCustomParameters({ prompt: "select_account" });
    }
    authPromise = signInWithPopup(auth, provider).then((cred) => {
      if (!cred.user) {
        authPromise = null;
        throw new Error("Firebase Google auth failed");
      }
      return cred.user;
    });
  }
  return authPromise;
}
