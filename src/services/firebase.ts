import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInAnonymously,
  signOut,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  deleteDoc,
  writeBatch,
  Unsubscribe,
} from 'firebase/firestore';
import appletFirebaseConfig from '../../firebase-applet-config.json';
import { PurchaseOrder, ArrivalSchedule, CoalTransaction } from '../types/coal';

// =========================================================================
// 1. GOOGLE SHEETS OAUTH HELPER (Separate Applet Project)
// =========================================================================
const oauthApp = initializeApp(appletFirebaseConfig);
export const auth = getAuth(oauthApp);

export const GOOGLE_SHEETS_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
] as const;

const googleProvider = new GoogleAuthProvider();
GOOGLE_SHEETS_SCOPES.forEach((scope) => googleProvider.addScope(scope));
googleProvider.setCustomParameters({ prompt: 'select_account' });

// In-memory OAuth access token cache ONLY (never persisted to localStorage/sessionStorage)
let cachedGoogleAccessToken: string | null = null;
let isGoogleSigningIn = false;

export function getGoogleAccessToken(): string | null {
  return cachedGoogleAccessToken;
}

export function clearGoogleAccessToken(): void {
  cachedGoogleAccessToken = null;
}

export function isGoogleSignInInProgress(): boolean {
  return isGoogleSigningIn;
}

export async function signInWithGoogleSheets(): Promise<{
  user: User;
  accessToken: string | null;
}> {
  try {
    isGoogleSigningIn = true;
    const cred = await signInWithPopup(auth, googleProvider);
    const oauthCred = GoogleAuthProvider.credentialFromResult(cred);
    const token = oauthCred?.accessToken || null;
    if (token) {
      cachedGoogleAccessToken = token;
    }
    return { user: cred.user, accessToken: token };
  } finally {
    isGoogleSigningIn = false;
  }
}

export async function signOutGoogle(): Promise<void> {
  cachedGoogleAccessToken = null;
  await signOut(auth);
}

// =========================================================================
// 2. SIMOTUBA-BB FIREBASE PROJECT (Firestore + Silent Anonymous Auth)
// =========================================================================
const SIMOTUBA_APP_NAME = 'simotuba-bb';

const simotubaFirebaseConfig = {
  apiKey: 'AIzaSyAXTV402tMAmpiPQOq0Vbm5YmEt9MSmRMU',
  authDomain: 'simotuba-bb.firebaseapp.com',
  projectId: 'simotuba-bb',
  storageBucket: 'simotuba-bb.firebasestorage.app',
  messagingSenderId: '173736178347',
  appId: '1:173736178347:web:c92d8f6608ac57d5b0bdee',
  measurementId: 'G-EMFNPQ40S8',
};

function getOrInitSimotubaApp(): FirebaseApp {
  const existing = getApps().find((a) => a.name === SIMOTUBA_APP_NAME);
  return existing || initializeApp(simotubaFirebaseConfig, SIMOTUBA_APP_NAME);
}

const simotubaApp = getOrInitSimotubaApp();
export const simotubaAuth = getAuth(simotubaApp);
export const simotubaDb = getFirestore(simotubaApp);

let pendingAnonSignIn: Promise<User> | null = null;

export async function ensureSimotubaAuth(): Promise<User> {
  if (simotubaAuth.currentUser) {
    return simotubaAuth.currentUser;
  }
  if (!pendingAnonSignIn) {
    pendingAnonSignIn = signInAnonymously(simotubaAuth)
      .then((cred) => cred.user)
      .finally(() => {
        pendingAnonSignIn = null;
      });
  }
  return pendingAnonSignIn;
}

const COLLECTIONS = {
  PO: 'purchase_orders',
  SCHEDULES: 'arrival_schedules',
  TRANSACTIONS: 'coal_transactions',
} as const;

function sanitizeDocId(rawId: string): string {
  const cleaned = (rawId || '')
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 128);
  return cleaned || `ID-${Date.now()}`;
}

function cleanForFirestore<T>(value: T): T {
  if (value === undefined || value === null) {
    return undefined as unknown as T;
  }
  if (typeof value === 'number') {
    return (Number.isFinite(value) ? value : 0) as unknown as T;
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => cleanForFirestore(item))
      .filter((item) => item !== undefined) as unknown as T;
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([k, v]) => {
      const cleaned = cleanForFirestore(v);
      if (cleaned !== undefined) {
        out[k] = cleaned;
      }
    });
    return out as T;
  }
  return undefined as unknown as T;
}

async function commitBatchedOps(
  ops: Array<{ type: 'set'; col: string; id: string; data: Record<string, unknown> } | { type: 'delete'; col: string; id: string }>
): Promise<void> {
  if (ops.length === 0) return;
  await ensureSimotubaAuth();
  const CHUNK_SIZE = 400;
  for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
    const chunk = ops.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(simotubaDb);
    chunk.forEach((op) => {
      const ref = doc(simotubaDb, op.col, sanitizeDocId(op.id));
      if (op.type === 'set') {
        batch.set(ref, op.data, { merge: true });
      } else {
        batch.delete(ref);
      }
    });
    await batch.commit();
  }
}

export const simotubaFirestoreService = {
  async fetchAllSnapshot(): Promise<{
    purchaseOrders: PurchaseOrder[];
    schedules: ArrivalSchedule[];
    transactions: CoalTransaction[];
  }> {
    await ensureSimotubaAuth();
    const [poSnap, schSnap, txSnap] = await Promise.all([
      getDocs(collection(simotubaDb, COLLECTIONS.PO)),
      getDocs(collection(simotubaDb, COLLECTIONS.SCHEDULES)),
      getDocs(collection(simotubaDb, COLLECTIONS.TRANSACTIONS)),
    ]);

    const purchaseOrders = poSnap.docs.map((d) => ({
      ...(d.data() as PurchaseOrder),
      id: d.id,
    }));
    purchaseOrders.sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );

    const schedules = schSnap.docs.map((d) => ({
      ...(d.data() as ArrivalSchedule),
      id: d.id,
    }));
    schedules.sort(
      (a, b) => new Date(b.createdAt || b.etaDateTime || 0).getTime() - new Date(a.createdAt || a.etaDateTime || 0).getTime()
    );

    const transactions = txSnap.docs.map((d) => ({
      ...(d.data() as CoalTransaction),
      id: d.id,
    }));
    transactions.sort(
      (a, b) => new Date(b.gateInTime || 0).getTime() - new Date(a.gateInTime || 0).getTime()
    );

    return { purchaseOrders, schedules, transactions };
  },

  subscribeAll(callbacks: {
    onPurchaseOrders: (pos: PurchaseOrder[]) => void;
    onSchedules: (schs: ArrivalSchedule[]) => void;
    onTransactions: (txs: CoalTransaction[]) => void;
    onError: (err: unknown) => void;
  }): Unsubscribe {
    const unsubPo = onSnapshot(
      collection(simotubaDb, COLLECTIONS.PO),
      (snap) => {
        const items = snap.docs.map((d) => ({
          ...(d.data() as PurchaseOrder),
          id: d.id,
        }));
        items.sort(
          (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        );
        callbacks.onPurchaseOrders(items);
      },
      callbacks.onError
    );

    const unsubSch = onSnapshot(
      collection(simotubaDb, COLLECTIONS.SCHEDULES),
      (snap) => {
        const items = snap.docs.map((d) => ({
          ...(d.data() as ArrivalSchedule),
          id: d.id,
        }));
        items.sort(
          (a, b) =>
            new Date(b.createdAt || b.etaDateTime || 0).getTime() -
            new Date(a.createdAt || a.etaDateTime || 0).getTime()
        );
        callbacks.onSchedules(items);
      },
      callbacks.onError
    );

    const unsubTx = onSnapshot(
      collection(simotubaDb, COLLECTIONS.TRANSACTIONS),
      (snap) => {
        const items = snap.docs.map((d) => ({
          ...(d.data() as CoalTransaction),
          id: d.id,
        }));
        items.sort(
          (a, b) => new Date(b.gateInTime || 0).getTime() - new Date(a.gateInTime || 0).getTime()
        );
        callbacks.onTransactions(items);
      },
      callbacks.onError
    );

    return () => {
      unsubPo();
      unsubSch();
      unsubTx();
    };
  },

  async savePurchaseOrders(pos: PurchaseOrder[]): Promise<void> {
    const now = new Date().toISOString();
    await commitBatchedOps(
      pos.map((po) => ({
        type: 'set',
        col: COLLECTIONS.PO,
        id: po.id,
        data: cleanForFirestore({
          ...po,
          createdAt: po.createdAt || now,
          updatedAt: now,
        }) as unknown as Record<string, unknown>,
      }))
    );
  },

  async updatePurchaseOrderCascade(
    po: PurchaseOrder,
    affectedSchedules: ArrivalSchedule[],
    affectedTransactions: CoalTransaction[]
  ): Promise<void> {
    const now = new Date().toISOString();
    const ops: Parameters<typeof commitBatchedOps>[0] = [
      {
        type: 'set',
        col: COLLECTIONS.PO,
        id: po.id,
        data: cleanForFirestore({
          ...po,
          updatedAt: now,
        }) as unknown as Record<string, unknown>,
      },
      ...affectedSchedules.map((sch) => ({
        type: 'set' as const,
        col: COLLECTIONS.SCHEDULES,
        id: sch.id,
        data: cleanForFirestore({
          ...sch,
          updatedAt: now,
        }) as unknown as Record<string, unknown>,
      })),
      ...affectedTransactions.map((tx) => ({
        type: 'set' as const,
        col: COLLECTIONS.TRANSACTIONS,
        id: tx.id,
        data: cleanForFirestore({
          ...tx,
          updatedAt: now,
        }) as unknown as Record<string, unknown>,
      })),
    ];
    await commitBatchedOps(ops);
  },

  async deletePurchaseOrderAndSchedules(
    poId: string,
    connectedScheduleIds: string[]
  ): Promise<void> {
    const ops: Parameters<typeof commitBatchedOps>[0] = [
      ...connectedScheduleIds.map((id) => ({
        type: 'delete' as const,
        col: COLLECTIONS.SCHEDULES,
        id,
      })),
      {
        type: 'delete',
        col: COLLECTIONS.PO,
        id: poId,
      },
    ];
    await commitBatchedOps(ops);
  },

  async saveSchedules(schedules: ArrivalSchedule[]): Promise<void> {
    const now = new Date().toISOString();
    await commitBatchedOps(
      schedules.map((sch) => ({
        type: 'set',
        col: COLLECTIONS.SCHEDULES,
        id: sch.id,
        data: cleanForFirestore({
          ...sch,
          createdAt: sch.createdAt || now,
          updatedAt: sch.updatedAt || now,
        }) as unknown as Record<string, unknown>,
      }))
    );
  },

  async deleteSchedule(schId: string): Promise<void> {
    await ensureSimotubaAuth();
    await deleteDoc(doc(simotubaDb, COLLECTIONS.SCHEDULES, sanitizeDocId(schId)));
  },

  async saveTransactions(txs: CoalTransaction[]): Promise<void> {
    const now = new Date().toISOString();
    await commitBatchedOps(
      txs.map((tx) => ({
        type: 'set',
        col: COLLECTIONS.TRANSACTIONS,
        id: tx.id,
        data: cleanForFirestore({
          ...tx,
          createdAt: tx.createdAt || now,
          updatedAt: tx.updatedAt || now,
        }) as unknown as Record<string, unknown>,
      }))
    );
  },

  async flushPendingOperations(params: {
    upsertPos: PurchaseOrder[];
    upsertSchedules: ArrivalSchedule[];
    upsertTransactions: CoalTransaction[];
    deletePoIds: string[];
    deleteScheduleIds: string[];
    deleteTransactionIds: string[];
  }): Promise<void> {
    const now = new Date().toISOString();
    const ops: Parameters<typeof commitBatchedOps>[0] = [
      ...params.upsertPos.map((po) => ({
        type: 'set' as const,
        col: COLLECTIONS.PO,
        id: po.id,
        data: cleanForFirestore({
          ...po,
          createdAt: po.createdAt || now,
          updatedAt: po.updatedAt || now,
        }) as unknown as Record<string, unknown>,
      })),
      ...params.upsertSchedules.map((sch) => ({
        type: 'set' as const,
        col: COLLECTIONS.SCHEDULES,
        id: sch.id,
        data: cleanForFirestore({
          ...sch,
          createdAt: sch.createdAt || now,
          updatedAt: sch.updatedAt || now,
        }) as unknown as Record<string, unknown>,
      })),
      ...params.upsertTransactions.map((tx) => ({
        type: 'set' as const,
        col: COLLECTIONS.TRANSACTIONS,
        id: tx.id,
        data: cleanForFirestore({
          ...tx,
          createdAt: tx.createdAt || now,
          updatedAt: tx.updatedAt || now,
        }) as unknown as Record<string, unknown>,
      })),
      ...params.deletePoIds.map((id) => ({
        type: 'delete' as const,
        col: COLLECTIONS.PO,
        id,
      })),
      ...params.deleteScheduleIds.map((id) => ({
        type: 'delete' as const,
        col: COLLECTIONS.SCHEDULES,
        id,
      })),
      ...params.deleteTransactionIds.map((id) => ({
        type: 'delete' as const,
        col: COLLECTIONS.TRANSACTIONS,
        id,
      })),
    ];
    await commitBatchedOps(ops);
  },

  async deleteTransactionBundle(params: {
    txId: string;
    schedule?: ArrivalSchedule | null;
    po?: PurchaseOrder | null;
  }): Promise<void> {
    const now = new Date().toISOString();
    const ops: Parameters<typeof commitBatchedOps>[0] = [
      {
        type: 'delete',
        col: COLLECTIONS.TRANSACTIONS,
        id: params.txId,
      },
    ];
    if (params.schedule) {
      ops.push({
        type: 'set',
        col: COLLECTIONS.SCHEDULES,
        id: params.schedule.id,
        data: cleanForFirestore({
          ...params.schedule,
          createdAt: params.schedule.createdAt || now,
          updatedAt: params.schedule.updatedAt || now,
        }) as unknown as Record<string, unknown>,
      });
    }
    if (params.po) {
      ops.push({
        type: 'set',
        col: COLLECTIONS.PO,
        id: params.po.id,
        data: cleanForFirestore({
          ...params.po,
          createdAt: params.po.createdAt || now,
          updatedAt: params.po.updatedAt || now,
        }) as unknown as Record<string, unknown>,
      });
    }
    await commitBatchedOps(ops);
  },

  async saveTransaction(tx: CoalTransaction): Promise<void> {
    await ensureSimotubaAuth();
    const now = new Date().toISOString();
    await setDoc(
      doc(simotubaDb, COLLECTIONS.TRANSACTIONS, sanitizeDocId(tx.id)),
      cleanForFirestore({
        ...tx,
        createdAt: tx.createdAt || now,
        updatedAt: tx.updatedAt || now,
      }) as unknown as Record<string, unknown>,
      { merge: true }
    );
  },

  async saveTransactionBundle(params: {
    transaction: CoalTransaction;
    schedule?: ArrivalSchedule | null;
    po?: PurchaseOrder | null;
  }): Promise<void> {
    const now = new Date().toISOString();
    const ops: Parameters<typeof commitBatchedOps>[0] = [
      {
        type: 'set',
        col: COLLECTIONS.TRANSACTIONS,
        id: params.transaction.id,
        data: cleanForFirestore({
          ...params.transaction,
          createdAt: params.transaction.createdAt || now,
          updatedAt: now,
        }) as unknown as Record<string, unknown>,
      },
    ];
    if (params.schedule) {
      ops.push({
        type: 'set',
        col: COLLECTIONS.SCHEDULES,
        id: params.schedule.id,
        data: cleanForFirestore({
          ...params.schedule,
          updatedAt: now,
        }) as unknown as Record<string, unknown>,
      });
    }
    if (params.po) {
      ops.push({
        type: 'set',
        col: COLLECTIONS.PO,
        id: params.po.id,
        data: cleanForFirestore({
          ...params.po,
          updatedAt: now,
        }) as unknown as Record<string, unknown>,
      });
    }
    await commitBatchedOps(ops);
  },

  async replaceAllCollections(
    purchaseOrders: PurchaseOrder[],
    schedules: ArrivalSchedule[],
    transactions: CoalTransaction[]
  ): Promise<void> {
    await this.clearAllCollections();
    const now = new Date().toISOString();
    const ops: Parameters<typeof commitBatchedOps>[0] = [
      ...purchaseOrders.map((po) => ({
        type: 'set' as const,
        col: COLLECTIONS.PO,
        id: po.id,
        data: cleanForFirestore({
          ...po,
          createdAt: po.createdAt || now,
          updatedAt: now,
        }) as unknown as Record<string, unknown>,
      })),
      ...schedules.map((sch) => ({
        type: 'set' as const,
        col: COLLECTIONS.SCHEDULES,
        id: sch.id,
        data: cleanForFirestore({
          ...sch,
          createdAt: sch.createdAt || now,
          updatedAt: now,
        }) as unknown as Record<string, unknown>,
      })),
      ...transactions.map((tx) => ({
        type: 'set' as const,
        col: COLLECTIONS.TRANSACTIONS,
        id: tx.id,
        data: cleanForFirestore({
          ...tx,
          createdAt: tx.createdAt || now,
          updatedAt: now,
        }) as unknown as Record<string, unknown>,
      })),
    ];
    await commitBatchedOps(ops);
  },

  async clearAllCollections(): Promise<void> {
    await ensureSimotubaAuth();
    const [poSnap, schSnap, txSnap] = await Promise.all([
      getDocs(collection(simotubaDb, COLLECTIONS.PO)),
      getDocs(collection(simotubaDb, COLLECTIONS.SCHEDULES)),
      getDocs(collection(simotubaDb, COLLECTIONS.TRANSACTIONS)),
    ]);

    const ops: Parameters<typeof commitBatchedOps>[0] = [
      ...poSnap.docs.map((d) => ({
        type: 'delete' as const,
        col: COLLECTIONS.PO,
        id: d.id,
      })),
      ...schSnap.docs.map((d) => ({
        type: 'delete' as const,
        col: COLLECTIONS.SCHEDULES,
        id: d.id,
      })),
      ...txSnap.docs.map((d) => ({
        type: 'delete' as const,
        col: COLLECTIONS.TRANSACTIONS,
        id: d.id,
      })),
    ];
    await commitBatchedOps(ops);
  },
};
