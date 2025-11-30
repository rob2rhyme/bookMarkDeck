// src/lib/firebase.ts
import { getApp, getApps, initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, getRedirectResult, GoogleAuthProvider, signInWithPopup, signOut, type User } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

export const REDIRECT_TRIED_KEY = "firebaseRedirectTried";
const REDIRECT_TRIED_KEY = "firebaseRedirectTried";

let authPromise: Promise<User> | null = null;
export const REDIRECT_TRIED_KEY = "firebaseRedirectTried";

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
    authPromise = getRedirectResult(auth)
      .catch(() => null)
      .then(async (redirectCred) => {
        if (redirectCred?.user) {
          if (typeof window !== "undefined") {
            window.localStorage.removeItem(REDIRECT_TRIED_KEY);
          }
          return redirectCred.user;
        }

        const tryPopup = async () => {
          const credFromPopup = await signInWithPopup(auth, provider);
          if (!credFromPopup?.user) throw new Error("Firebase Google auth failed");
          if (typeof window !== "undefined") {
            window.localStorage.removeItem(REDIRECT_TRIED_KEY);
          }
          return credFromPopup.user;
        };

        try {
          return await tryPopup();
        } catch (err) {
          const popupBlocked =
            (err as { code?: string })?.code === "auth/popup-blocked" ||
            (err as { code?: string })?.code === "auth/popup-closed-by-user";

          if (!popupBlocked) throw err;

          throw new Error(
            "Google sign-in was blocked. Please allow popups and third-party cookies for Google, then try again."
          );
        }
      })
      .then((user) => {
        if (!user) {
          authPromise = null;
          throw new Error("Firebase Google auth failed");
        }
        return user;
      });
  }
  return authPromise;
}
