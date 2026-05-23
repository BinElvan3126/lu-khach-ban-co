import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type Auth,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type Firestore,
} from 'firebase/firestore';

export type CloudProfile = {
  playerId: string;
  name: string;
  email?: string | null;
  mode: 'password' | 'google';
};

export type CloudRanking = {
  name: string;
  totalWins: number;
  highestVp: number;
  recent: string;
};

export type CloudHistory = {
  id: string;
  date: string;
  destination: string;
  finalVp: number;
  itinerary: string;
  timeline?: Array<{
    day: number;
    slot: string;
    title: string;
    note: string;
    estimatedCost: number;
  }>;
  winnerName?: string;
  resultLabel?: string;
};

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

export function isFirebaseConfigured() {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId);
}

function ensureFirebaseApp() {
  if (!app) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  }

  return { auth, db };
}

export async function ensureCloudSession() {
  if (!isFirebaseConfigured()) return undefined;

  const session = ensureFirebaseApp();
  const user = session.auth?.currentUser;
  if (!user) return undefined;

  return { user, db: session.db };
}

export function currentCloudUser() {
  if (!isFirebaseConfigured()) return undefined;
  return ensureFirebaseApp().auth?.currentUser ?? undefined;
}

export async function registerWithEmail(email: string, password: string, name: string) {
  if (!isFirebaseConfigured()) throw new Error('Firebase is not configured.');

  const session = ensureFirebaseApp();
  if (!session.auth) throw new Error('Firebase Auth is unavailable.');

  const credential = await createUserWithEmailAndPassword(session.auth, email, password);
  await updateProfile(credential.user, { displayName: name });
  const profile = { playerId: credential.user.uid, name, email: credential.user.email, mode: 'password' as const };
  try {
    await saveCloudProfile(profile);
  } catch (error) {
    throw new Error(`Account created, but Firestore profile save failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
  return profile;
}

export async function loginWithEmail(email: string, password: string) {
  if (!isFirebaseConfigured()) throw new Error('Firebase is not configured.');

  const session = ensureFirebaseApp();
  if (!session.auth) throw new Error('Firebase Auth is unavailable.');

  const credential = await signInWithEmailAndPassword(session.auth, email, password);
  const existing = await loadCloudProfile(credential.user.uid);
  if (existing) return existing;

  const fallbackName = credential.user.displayName || credential.user.email?.split('@')[0] || 'Traveler';
  const profile = { playerId: credential.user.uid, name: fallbackName, email: credential.user.email, mode: 'password' as const };
  try {
    await saveCloudProfile(profile);
  } catch {
    return profile;
  }
  return profile;
}

export async function logoutCloudUser() {
  const session = ensureCloudSession();
  const resolved = await session;
  if (resolved) await signOut(getAuth());
}

export async function loadCloudProfile(playerId: string) {
  const session = await ensureCloudSession();
  if (!session?.db) return undefined;

  const snapshot = await getDoc(doc(session.db, 'players', playerId));
  if (!snapshot.exists()) return undefined;

  return snapshot.data() as CloudProfile;
}

export async function saveCloudProfile(profile: CloudProfile) {
  const session = await ensureCloudSession();
  if (!session?.db) return;

  await setDoc(
    doc(session.db, 'players', profile.playerId),
    {
      ...profile,
      authUid: session.user?.uid,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function loadCloudRankings() {
  const session = await ensureCloudSession();
  if (!session?.db) return [];

  const snapshot = await getDocs(query(collection(session.db, 'leaderboard'), orderBy('highestVp', 'desc'), limit(20)));
  return snapshot.docs.map((item) => item.data() as CloudRanking);
}

export async function loadCloudHistory(playerId: string) {
  const session = await ensureCloudSession();
  if (!session?.db) return [];

  const snapshot = await getDocs(query(collection(session.db, 'players', playerId, 'history'), orderBy('date', 'desc'), limit(20)));
  return snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<CloudHistory, 'id'>) }));
}

export async function saveCloudMatchResult(playerId: string, history: CloudHistory, ranking: CloudRanking) {
  const session = await ensureCloudSession();
  if (!session?.db) return;

  const historyRef = doc(session.db, 'players', playerId, 'history', history.id);
  const historySnapshot = await getDoc(historyRef);
  await setDoc(historyRef, { ...history, updatedAt: serverTimestamp() }, { merge: true });

  // Only bump win counters once per match result document in this browser flow.
  if (historySnapshot.exists()) return;

  const rankingRef = doc(session.db, 'leaderboard', playerId);
  const rankingSnapshot = await getDoc(rankingRef);
  const current = rankingSnapshot.exists() ? (rankingSnapshot.data() as CloudRanking) : undefined;
  const nextWins = (current?.totalWins ?? 0) + ranking.totalWins;
  const nextBest = Math.max(current?.highestVp ?? 0, ranking.highestVp);

  await setDoc(
    rankingRef,
    {
      ...ranking,
      totalWins: nextWins,
      highestVp: nextBest,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
