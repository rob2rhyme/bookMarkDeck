"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";

import { auth } from "@/lib/firebase";

export function useFirebaseAuthUser(): {
  firebaseUser: User | null;
  firebaseAuthReady: boolean;
  firebaseEmailLower: string | null;
} {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [firebaseAuthReady, setFirebaseAuthReady] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setFirebaseUser(nextUser);
      setFirebaseAuthReady(true);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const firebaseEmailLower = firebaseUser?.email?.toLowerCase() ?? null;

  return { firebaseUser, firebaseAuthReady, firebaseEmailLower };
}
