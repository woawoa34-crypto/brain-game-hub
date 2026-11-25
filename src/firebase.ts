import { initializeApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  type User,
} from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: 'AIzaSyCOj1lbkWVr42AQ6YNoGxzuOquJILBv3CY',
  authDomain: 'brain-survival-hub-e69ba.firebaseapp.com',
  databaseURL:
    'https://brain-survival-hub-e69ba-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'brain-survival-hub-e69ba',
  storageBucket: 'brain-survival-hub-e69ba.firebasestorage.app',
  messagingSenderId: '367330284810',
  appId: '1:367330284810:web:b60b32f84f09b0d02ad6f3',
};

export const app = initializeApp(firebaseConfig);
export const database = getDatabase(app);
export const auth = getAuth(app);
export { signInAnonymously };

let authPromise: Promise<User> | null = null;

/**
 * Ensures an anonymous Firebase Auth session is established before RTDB reads/writes.
 * Reuses any existing persisted anonymous user or signs in anonymously once.
 */
export function ensureAnonymousAuth(): Promise<User> {
  if (auth.currentUser) {
    return Promise.resolve(auth.currentUser);
  }
  if (authPromise) {
    return authPromise;
  }

  authPromise = new Promise<User>((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        if (user) {
          unsubscribe();
          resolve(user);
        } else {
          signInAnonymously(auth)
            .then((cred) => {
              unsubscribe();
              resolve(cred.user);
            })
            .catch((err) => {
              unsubscribe();
              authPromise = null;
              reject(err);
            });
        }
      },
      (err) => {
        unsubscribe();
        authPromise = null;
        reject(err);
      },
    );
  });

  return authPromise;
}

// Kick off anonymous sign-in automatically on app load
void ensureAnonymousAuth().catch(() => {
  // Handled gracefully when the user attempts an online room action
});
