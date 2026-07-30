// src/lib/firebase.ts
import { getApp, getApps, initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, getRedirectResult, GoogleAuthProvider, signInWithCredential, signInWithPopup, signInWithRedirect, signOut, type User } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

export const FIREBASE_REDIRECT_TRIED_KEY = "firebaseRedirectTried";
let authPromise: Promise<User> | null = null;
export const REDIRECT_TRIED_KEY = "firebaseRedirectTried";

/**
 * Mobile browsers — chiefly iOS Safari — can't reliably complete Firebase's
 * signInWithPopup: popups get blocked and ITP partitions the (third-party)
 * *.firebaseapp.com auth storage, so the credential never makes it back. A
 * full-page redirect passes the credential in the return URL and works where
 * the popup silently fails. (iPadOS Safari masquerades as desktop Mac, so we
 * also treat a touch-capable "Mac" as mobile.)
 */
function isMobileBrowser(): boolean {
  if (typeof window === "undefined") return false;
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const ua = /iphone|ipad|ipod|android/i.test(navigator.userAgent || "");
  const touchMac =
    navigator.platform === "MacIntel" && (navigator.maxTouchPoints ?? 0) > 1;
  return coarse || ua || touchMac;
}

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
            window.localStorage.removeItem(FIREBASE_REDIRECT_TRIED_KEY);
          }
          return redirectCred.user;
        }

        // On mobile, prefer a full-page redirect over the unreliable popup.
        // A one-shot flag prevents a redirect loop: if we come back from a
        // redirect with no credential, fall through to popup instead.
        if (isMobileBrowser() && typeof window !== "undefined") {
          const alreadyTried =
            window.localStorage.getItem(FIREBASE_REDIRECT_TRIED_KEY) === "1";
          if (!alreadyTried) {
            try {
              window.localStorage.setItem(FIREBASE_REDIRECT_TRIED_KEY, "1");
              await signInWithRedirect(auth, provider);
              // The page is navigating away; this never settles here — on return
              // getRedirectResult (above) resolves the signed-in user.
              return new Promise<User>(() => {});
            } catch {
              // Redirect couldn't start — clear the flag and try the popup.
              window.localStorage.removeItem(FIREBASE_REDIRECT_TRIED_KEY);
            }
          } else {
            // Redirect already attempted and returned nothing — reset so a later
            // attempt can redirect again, and try the popup now.
            window.localStorage.removeItem(FIREBASE_REDIRECT_TRIED_KEY);
          }
        }

        const tryPopup = async () => {
          const credFromPopup = await signInWithPopup(auth, provider);
          if (!credFromPopup?.user) throw new Error("Firebase Google auth failed");
          if (typeof window !== "undefined") {
            window.localStorage.removeItem(FIREBASE_REDIRECT_TRIED_KEY);
          }
          return credFromPopup.user;
        };

        try {
          return await tryPopup();
        } catch (err) {
          const code = (err as { code?: string })?.code;

          if (code === "auth/popup-blocked") {
            throw new Error(
              "Google sign-in was blocked. Please allow popups and third-party cookies for Google, then try again."
            );
          }

          // The popup was dismissed. That usually means the user closed it —
          // but it is also what we see when Google refused the request inside
          // the popup (e.g. redirect_uri_mismatch, when this project's OAuth
          // client is missing the .firebaseapp.com/__/auth/handler URI). Don't
          // assert "popups are blocked": it sends people down the wrong path.
          if (code === "auth/popup-closed-by-user") {
            throw new Error(
              "Google sign-in didn't complete. If the popup showed an error rather than an account picker, see TROUBLESHOOTING.md — the sign-in window closed before returning a credential."
            );
          }

          throw err;
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

/**
 * Bridge a single Google login into Firebase Auth: exchange the next-auth
 * Google id_token for a Firebase session with no popup/redirect, so every
 * pillar (Bookmarks, Focus, Habits, My Stuff) is synced after one login.
 *
 * Best-effort by design — returns null (never throws) if the credential is
 * rejected (e.g. the OAuth client isn't whitelisted on the Firebase project) or
 * has expired. Callers fall back to the interactive ensureFirebaseGoogleAuth
 * flow, so a failed bridge is a no-op, never a regression. Skips work when a
 * Firebase session already exists (restored from persistence or a prior sign-in).
 */
export async function bridgeFirebaseFromIdToken(
  idToken: string
): Promise<User | null> {
  if (auth.currentUser) return auth.currentUser;
  try {
    const credential = GoogleAuthProvider.credential(idToken);
    const result = await signInWithCredential(auth, credential);
    return result.user ?? null;
  } catch {
    return null;
  }
}
