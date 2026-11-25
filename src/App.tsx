import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Download, RotateCcw, X, FileSpreadsheet } from 'lucide-react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { Sidebar } from './components/Sidebar';
import { TopHeader } from './components/TopHeader';
import { DashboardOverview } from './components/DashboardOverview';
import { PoManagement } from './components/PoManagement';
import { ScheduleArrivals } from './components/ScheduleArrivals';
import { PosSecurity } from './components/PosSecurity';
import { WeighbridgeInbound } from './components/WeighbridgeInbound';
import { QCLabCheck } from './components/QCLabCheck';
import { UnloadingStockpile } from './components/UnloadingStockpile';
import { WeighbridgeOutbound } from './components/WeighbridgeOutbound';
import { TransactionsTable } from './components/TransactionsTable';
import { CoalOutgoingOperational } from './components/CoalOutgoingOperational';
import { GoogleSheetSyncModal } from './components/GoogleSheetSyncModal';
import { PrintableTicketModal } from './components/PrintableTicketModal';
import { MobileBottomNav } from './components/MobileBottomNav';
import {
  SheetMutationConfirmModal,
  SheetMutationConfirmRequest,
} from './components/SheetMutationConfirmModal';
import { storageService } from './services/storageService';
import { evaluatePoQuotaStatus } from './utils/poQuotaUtils';
import {
  googleSheetService,
  sheetsApiService,
  SheetsApiError,
  SHEET_TABS,
} from './services/googleSheetService';
import {
  auth,
  signInWithGoogleSheets,
  getGoogleAccessToken,
  clearGoogleAccessToken,
  ensureSimotubaAuth,
  simotubaFirestoreService,
} from './services/firebase';
import {
  ActiveTab,
  PurchaseOrder,
  ArrivalSchedule,
  CoalTransaction,
  CoalOutgoingRecord,
  GoogleSheetConfig,
  VisualQC,
  LabQCResults,
  AuditLogEntry,
  AuditEntityType,
} from './types/coal';
import { calculateDuration } from './utils/timeUtils';
import { resolveTransactionRitInfo } from './utils/ritUtils';
import { calculateToleranceMetrics } from './utils/toleranceUtils';

export default function App() {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [schedules, setSchedules] = useState<ArrivalSchedule[]>([]);
  const [transactions, setTransactions] = useState<CoalTransaction[]>([]);
  const [coalOutgoing, setCoalOutgoing] = useState<CoalOutgoingRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [sheetConfig, setSheetConfig] = useState<GoogleSheetConfig>({
    webhookUrl: '',
    sheetName: 'Data_Monitoring_Batubara',
    autoSyncEnabled: false,
    syncStatus: 'IDLE',
  });

  // Google Sheets In-Memory Session State (for optional Google Sheets API mode)
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [sheetsAccessToken, setSheetsAccessToken] = useState<string | null>(() =>
    getGoogleAccessToken()
  );
  const [isCloudBusy, setIsCloudBusy] = useState<boolean>(false);
  const [hasPendingSheetChanges, setHasPendingSheetChanges] = useState<boolean>(false);
  const [sheetConfirmRequest, setSheetConfirmRequest] =
    useState<SheetMutationConfirmRequest | null>(null);
  const [sheetsFeedback, setSheetsFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [selectedTxId, setSelectedTxId] = useState<string | undefined>(undefined);
  const [selectedScheduleForGateIn, setSelectedScheduleForGateIn] = useState<ArrivalSchedule | null>(null);
  const [printingTx, setPrintingTx] = useState<CoalTransaction | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);

  const [selectedPoForSchedule, setSelectedPoForSchedule] = useState<string | null>(null);
  const [securitySubTab, setSecuritySubTab] = useState<'GATE_IN' | 'GATE_OUT'>('GATE_IN');
  const [isResetModalOpen, setIsResetModalOpen] = useState<boolean>(false);

  const hasSheetsToken = Boolean(sheetsAccessToken);
  const isSheetsDbConfigured = Boolean(sheetConfig.spreadsheetId && sheetConfig.databaseEnabled);
  const isSheetsDbReady = Boolean(isSheetsDbConfigured && hasSheetsToken);
  const isAdminUser = true;

  // Permanently set light mode as the official standard
  useEffect(() => {
    document.body.classList.add('light-mode');
    document.documentElement.classList.add('light-mode');
    try {
      localStorage.setItem('simontuba_theme', 'light');
    } catch (e) {
      console.warn('Storage:', e);
    }
  }, []);

  const toastTimerRef = React.useRef<number | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 4500);
  }, []);

  const persistToSimotubaFirebase = useCallback(
    async (op: () => Promise<void>, contextLabel: string, onSuccess?: () => void) => {
      try {
        await op();
        onSuccess?.();
      } catch (err) {
        console.warn(`Firestore sync (${contextLabel}) deferred to local outbox:`, err);
        const msg = err instanceof Error ? err.message : String(err);
        if (
          msg.includes('permission-denied') ||
          msg.includes('Missing or insufficient permissions')
        ) {
          console.error(
            `Firestore permission denied (${contextLabel}): pastikan Firestore Rules di project simotuba-bb sudah di-Publish. Data lokal tetap tersimpan.`
          );
        } else if (
          msg.includes('operation-not-allowed') ||
          msg.includes('admin-restricted-operation')
        ) {
          console.error(
            `Firebase Anonymous Auth disabled (${contextLabel}). Data lokal tetap tersimpan.`
          );
        }
      }
    },
    []
  );

  const flushPendingCloudSync = useCallback(async () => {
    const syncState = storageService.getSyncState();
    if (syncState.pendingClearAll) {
      try {
        await simotubaFirestoreService.clearAllCollections();
        storageService.clearSyncState();
      } catch (err) {
        console.warn('Deferred cloud clearAll failed:', err);
      }
      return;
    }

    const currentPos = storageService.getPurchaseOrders();
    const currentSchs = storageService.getSchedules();
    const currentTxs = storageService.getTransactions();

    const poUpsertSet = new Set(syncState.upsertPoIds);
    const schUpsertSet = new Set(syncState.upsertScheduleIds);
    const txUpsertSet = new Set(syncState.upsertTransactionIds);

    const upsertPos = currentPos.filter((p) => poUpsertSet.has(p.id));
    const upsertSchedules = currentSchs.filter((s) => schUpsertSet.has(s.id));
    const upsertTransactions = currentTxs.filter((t) => txUpsertSet.has(t.id));

    const hasPending =
      upsertPos.length > 0 ||
      upsertSchedules.length > 0 ||
      upsertTransactions.length > 0 ||
      syncState.deletePoIds.length > 0 ||
      syncState.deleteScheduleIds.length > 0 ||
      syncState.deleteTransactionIds.length > 0;

    if (!hasPending) return;

    try {
      await simotubaFirestoreService.flushPendingOperations({
        upsertPos,
        upsertSchedules,
        upsertTransactions,
        deletePoIds: syncState.deletePoIds,
        deleteScheduleIds: syncState.deleteScheduleIds,
        deleteTransactionIds: syncState.deleteTransactionIds,
      });

      storageService.markCloudUpsertsAcked('po', upsertPos.map((p) => p.id));
      storageService.markCloudUpsertsAcked('schedule', upsertSchedules.map((s) => s.id));
      storageService.markCloudUpsertsAcked('transaction', upsertTransactions.map((t) => t.id));
      storageService.markCloudDeletesAcked('po', syncState.deletePoIds);
      storageService.markCloudDeletesAcked('schedule', syncState.deleteScheduleIds);
      storageService.markCloudDeletesAcked('transaction', syncState.deleteTransactionIds);
    } catch (err) {
      console.warn('Deferred flushPendingCloudSync failed:', err);
    }
  }, []);

  // Load initial local cache + connect silently to simotuba-bb Firestore via Anonymous Auth
  useEffect(() => {
    const localPos = storageService.getPurchaseOrders();
    const localSchs = storageService.getSchedules();
    const localTxs = storageService.getTransactions();

    setPurchaseOrders(localPos);
    setSchedules(localSchs);
    setTransactions(localTxs);
    setCoalOutgoing(storageService.getCoalOutgoing());
    setSheetConfig(storageService.getSheetConfig());
    setAuditLogs(storageService.getAuditLogs());

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setFirebaseUser(user);
        setSheetsAccessToken(getGoogleAccessToken());
      } else {
        clearGoogleAccessToken();
        setSheetsAccessToken(null);
        setFirebaseUser(null);
      }
    });

    let isDisposed = false;
    let unsubscribeFirestore: (() => void) | null = null;

    const initSimotubaFirestore = async () => {
      try {
        await ensureSimotubaAuth();
        if (isDisposed) return;

        const cloud = await simotubaFirestoreService.fetchAllSnapshot();
        if (isDisposed) return;

        // Read freshest local cache in case user saved data while auth/snapshot was in-flight
        const latestLocalPos = storageService.getPurchaseOrders();
        const latestLocalSchs = storageService.getSchedules();
        const latestLocalTxs = storageService.getTransactions();

        const sortPos = (list: PurchaseOrder[]) =>
          [...list].sort(
            (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
          );
        const sortSchedules = (list: ArrivalSchedule[]) =>
          [...list].sort(
            (a, b) =>
              new Date(b.createdAt || b.etaDateTime || 0).getTime() -
              new Date(a.createdAt || a.etaDateTime || 0).getTime()
          );
        const sortTransactions = (list: CoalTransaction[]) =>
          [...list].sort(
            (a, b) => new Date(b.gateInTime || 0).getTime() - new Date(a.gateInTime || 0).getTime()
          );

        const poMerge = storageService.mergeCloudCollection('po', cloud.purchaseOrders, latestLocalPos);
        const schMerge = storageService.mergeCloudCollection('schedule', cloud.schedules, latestLocalSchs);
        const txMerge = storageService.mergeCloudCollection('transaction', cloud.transactions, latestLocalTxs);

        const nextPosMerged = sortPos(poMerge.merged);
        const nextSchsMerged = sortSchedules(schMerge.merged);
        const nextTxsMerged = sortTransactions(txMerge.merged);

        setPurchaseOrders(nextPosMerged);
        storageService.savePurchaseOrders(nextPosMerged);
        setSchedules(nextSchsMerged);
        storageService.saveSchedules(nextSchsMerged);
        setTransactions(nextTxsMerged);
        storageService.saveTransactions(nextTxsMerged);

        if (isDisposed) return;

        // Push any unsynced local creates/updates/deletes up to Firestore
        void flushPendingCloudSync();

        unsubscribeFirestore = simotubaFirestoreService.subscribeAll({
          onPurchaseOrders: (nextPos) => {
            const latestLocal = storageService.getPurchaseOrders();
            const { merged } = storageService.mergeCloudCollection('po', nextPos, latestLocal);
            const sorted = sortPos(merged);
            setPurchaseOrders(sorted);
            storageService.savePurchaseOrders(sorted);
          },
          onSchedules: (nextSchs) => {
            const latestLocal = storageService.getSchedules();
            const { merged } = storageService.mergeCloudCollection('schedule', nextSchs, latestLocal);
            const sorted = sortSchedules(merged);
            setSchedules(sorted);
            storageService.saveSchedules(sorted);
          },
          onTransactions: (nextTxs) => {
            const latestLocal = storageService.getTransactions();
            const { merged } = storageService.mergeCloudCollection('transaction', nextTxs, latestLocal);
            const sorted = sortTransactions(merged);
            setTransactions(sorted);
            storageService.saveTransactions(sorted);
          },
          onError: (err) => {
            console.warn('Firestore realtime listener warning:', err);
          },
        });
      } catch (err) {
        console.warn('Simotuba Firebase init warning:', err);
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('operation-not-allowed') || msg.includes('admin-restricted-operation')) {
          showToast(
            'Mode lokal aktif: aktifkan Anonymous Sign-in di simotuba-bb bila butuh sinkron antar perangkat.'
          );
        }
      }
    };

    initSimotubaFirestore();

    const handleOnline = () => {
      void flushPendingCloudSync();
    };
    window.addEventListener('online', handleOnline);

    return () => {
      isDisposed = true;
      window.removeEventListener('online', handleOnline);
      unsubscribeAuth();
      unsubscribeFirestore?.();
    };
  }, [showToast, flushPendingCloudSync]);

  const buildAuditEntry = (
    action: string,
    entityType: AuditEntityType,
    entityId: string,
    summary: string,
    details?: string
  ): AuditLogEntry => ({
    id: `LOG-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
    timestamp: new Date().toISOString(),
    actorUid: firebaseUser?.uid || 'local-operator',
    actorEmail: firebaseUser?.email || 'local@simotuba.local',
    actorName: firebaseUser?.displayName || 'Operator SIMOTUBA',
    actorRole: 'ADMIN',
    action,
    entityType,
    entityId,
    summary,
    details,
  });

  const appendLocalAuditLog = (entry: AuditLogEntry): AuditLogEntry[] => {
    const nextLogs = [entry, ...auditLogs].slice(0, 500);
    setAuditLogs(nextLogs);
    storageService.saveAuditLogs(nextLogs);
    return nextLogs;
  };

  const requireRole = (_requiredRole?: string): boolean => {
    return true;
  };

  // Helper to commit full snapshot to Google Sheets via API v4
  const commitDatabaseToSheet = async (
    nextPos: PurchaseOrder[],
    nextSchs: ArrivalSchedule[],
    nextTxs: CoalTransaction[],
    nextLogs: AuditLogEntry[],
    targetSpreadsheetId = sheetConfig.spreadsheetId || ''
  ): Promise<boolean> => {
    const token = getGoogleAccessToken() || sheetsAccessToken;
    if (!token || !targetSpreadsheetId) {
      setHasPendingSheetChanges(true);
      showToast('Sesi Google Sheets belum aktif. Buka menu Database Google Sheets untuk menyimpan ke Google Sheets.');
      return false;
    }

    setIsSyncing(true);
    setIsCloudBusy(true);
    try {
      const meta = await sheetsApiService.writeFullDatabaseToSheet(token, targetSpreadsheetId, {
        purchaseOrders: nextPos,
        schedules: nextSchs,
        transactions: nextTxs,
        auditLogs: nextLogs,
      });

      const nowIso = new Date().toISOString();
      const updatedTxs = nextTxs.map((t) => ({
        ...t,
        syncedToGoogleSheet: true,
        lastSyncedAt: nowIso,
      }));
      setTransactions(updatedTxs);
      storageService.saveTransactions(updatedTxs);

      const nextCfg: GoogleSheetConfig = {
        ...sheetConfig,
        mode: 'SHEETS_API',
        spreadsheetId: meta.spreadsheetId,
        spreadsheetTitle: meta.spreadsheetTitle,
        spreadsheetUrl: meta.spreadsheetUrl,
        databaseEnabled: true,
        lastSyncTime: nowIso,
        syncStatus: 'SUCCESS',
        lastErrorMessage: undefined,
      };
      setSheetConfig(nextCfg);
      storageService.saveSheetConfig(nextCfg);
      setHasPendingSheetChanges(false);
      showToast(`Data berhasil disimpan ke Google Sheet "${meta.spreadsheetTitle}"!`);
      return true;
    } catch (err) {
      if (err instanceof SheetsApiError && err.isAuthError) {
        clearGoogleAccessToken();
        setSheetsAccessToken(null);
        setHasPendingSheetChanges(true);
        showToast('Sesi akses Google Sheets kedaluwarsa. Buka menu Database Google Sheets untuk menghubungkan ulang.');
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        setHasPendingSheetChanges(true);
        showToast(`Gagal menyimpan ke Google Sheets: ${msg}`);
      }
      return false;
    } finally {
      setIsSyncing(false);
      setIsCloudBusy(false);
    }
  };

  // Mandatory explicit user confirmation dialog before mutating/overwriting/deleting Google Sheet data
  const promptSheetMutation = (params: {
    title: string;
    description: string;
    affectedTabs: string[];
    nextPos: PurchaseOrder[];
    nextSchs: ArrivalSchedule[];
    nextTxs: CoalTransaction[];
    nextLogs: AuditLogEntry[];
    isDestructive?: boolean;
    confirmLabel?: string;
    onAfterConfirmed?: () => void;
  }) => {
    if (!isSheetsDbConfigured) {
      if (sheetConfig.autoSyncEnabled && sheetConfig.webhookUrl) {
        executeWebhookSync(params.nextTxs, params.nextPos, params.nextSchs);
      }
      return;
    }

    const token = getGoogleAccessToken() || sheetsAccessToken;
    if (!token) {
      setHasPendingSheetChanges(true);
      showToast(
        'Data tersimpan lokal. Buka menu Database Google Sheets untuk menghubungkan ulang akses Google Sheets.'
      );
      return;
    }

    setSheetConfirmRequest({
      title: params.title,
      description: params.description,
      spreadsheetTitle: sheetConfig.spreadsheetTitle || sheetConfig.spreadsheetId || 'Google Sheet',
      affectedTabs: params.affectedTabs,
      affectedCounts: {
        pos: params.nextPos.length,
        schedules: params.nextSchs.length,
        transactions: params.nextTxs.length,
      },
      isDestructive: params.isDestructive,
      confirmLabel: params.confirmLabel,
      onCancel: () => {
        setHasPendingSheetChanges(true);
        showToast('Perubahan disimpan lokal. Gunakan tombol "Simpan ke Google Sheet" kapan saja untuk memperbarui spreadsheet.');
      },
      onConfirm: async () => {
        const ok = await commitDatabaseToSheet(
          params.nextPos,
          params.nextSchs,
          params.nextTxs,
          params.nextLogs
        );
        if (ok) {
          params.onAfterConfirmed?.();
        }
        setSheetConfirmRequest(null);
      },
    });
  };

  // Legacy Apps Script webhook helper (optional secondary mode)
  const executeWebhookSync = async (
    currentTxs = transactions,
    currentPos = purchaseOrders,
    currentSchs = schedules,
    currentCfg = sheetConfig
  ) => {
    if (!currentCfg.webhookUrl) {
      setActiveTab('googlesheet');
      showToast('Hubungkan Database Google Sheets atau isi URL Webhook terlebih dahulu.');
      return;
    }

    setIsSyncing(true);
    const result = await googleSheetService.syncToGoogleSheet(currentCfg.webhookUrl, {
      transactions: currentTxs,
      purchaseOrders: currentPos,
      schedules: currentSchs,
    });
    setIsSyncing(false);

    if (result.success) {
      const updatedTxs = currentTxs.map((t) => ({
        ...t,
        syncedToGoogleSheet: true,
        lastSyncedAt: new Date().toISOString(),
      }));
      setTransactions(updatedTxs);
      storageService.saveTransactions(updatedTxs);
      showToast('Data berhasil dikirim via Webhook Google Apps Script!');
    } else {
      showToast(`Gagal sinkron webhook: ${result.message}`);
    }
  };

  // Unified trigger sync button in header / hub
  const executeSync = async () => {
    if (isSheetsDbConfigured) {
      if (!sheetsAccessToken && !getGoogleAccessToken()) {
        setActiveTab('googlesheet');
        showToast('Hubungkan akun Google terlebih dahulu di menu Database Google Sheets.');
        return;
      }
      promptSheetMutation({
        title: 'Sinkronkan Semua Data ke Google Sheets?',
        description:
          'Operasi ini akan memperbarui seluruh isi 4 tab di Google Spreadsheet agar sama dengan data terbaru di aplikasi (dari Purchase Order hingga Uji Lab QC-PA).',
        affectedTabs: [
          SHEET_TABS.PO,
          SHEET_TABS.SCHEDULES,
          SHEET_TABS.TRANSACTIONS,
          SHEET_TABS.AUDIT,
        ],
        nextPos: purchaseOrders,
        nextSchs: schedules,
        nextTxs: transactions,
        nextLogs: auditLogs,
        confirmLabel: 'Ya, Perbarui Google Sheet',
      });
      return;
    }

    if (sheetConfig.webhookUrl) {
      await executeWebhookSync();
      return;
    }

    setActiveTab('googlesheet');
    showToast('Buat atau hubungkan Database Google Sheets terlebih dahulu.');
  };

  // Ensure a valid Google Sheets OAuth token exists (triggers Sign-In popup directly if missing)
  const ensureSheetsAuthFromClick = async (): Promise<string | null> => {
    const existing = getGoogleAccessToken() || sheetsAccessToken;
    if (existing) return existing;

    setSheetsFeedback({
      type: 'info',
      message: 'Membuka jendela Sign in with Google untuk otorisasi akses Google Sheets...',
    });

    try {
      const { user, accessToken } = await signInWithGoogleSheets();
      setFirebaseUser(user);
      setSheetsAccessToken(accessToken);

      if (!accessToken) {
        const msg =
          'Login Google berhasil, namun izin akses Google Sheets tidak diberikan. Mohon izinkan akses Google Sheets saat popup login muncul.';
        setSheetsFeedback({ type: 'error', message: msg });
        showToast(msg);
        return null;
      }

      return accessToken;
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      const rawMsg = err instanceof Error ? err.message : String(err);
      let msg = `Login Google dibatalkan atau gagal (${rawMsg}).`;
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        msg = 'Jendela login Google ditutup sebelum selesai. Klik tombol sekali lagi untuk melanjutkan.';
      } else if (code === 'auth/popup-blocked') {
        msg = 'Popup login Google diblokir oleh browser. Izinkan popup untuk situs ini lalu klik lagi.';
      }
      setSheetsFeedback({ type: 'error', message: msg });
      showToast(msg);
      return null;
    }
  };

  // Google Sign-In for Google Sheets API (in-memory token ONLY)
  const handleGoogleLogin = async () => {
    setIsCloudBusy(true);
    setSheetsFeedback(null);
    try {
      const { user, accessToken } = await signInWithGoogleSheets();
      setFirebaseUser(user);
      setSheetsAccessToken(accessToken);

      if (!accessToken) {
        const msg =
          'Login berhasil, namun token Google Sheets tidak diterima. Coba izinkan akses Google Sheets saat login.';
        setSheetsFeedback({ type: 'error', message: msg });
        showToast(msg);
        return;
      }

      if (sheetConfig.spreadsheetId && sheetConfig.databaseEnabled) {
        // Read-only refresh if local storage has no unsaved data
        const hasLocal =
          purchaseOrders.length > 0 || schedules.length > 0 || transactions.length > 0;
        if (!hasLocal && !hasPendingSheetChanges) {
          try {
            const db = await sheetsApiService.loadDatabaseFromSheet(
              accessToken,
              sheetConfig.spreadsheetId
            );
            setPurchaseOrders(db.purchaseOrders);
            storageService.savePurchaseOrders(db.purchaseOrders);
            setSchedules(db.schedules);
            storageService.saveSchedules(db.schedules);
            setTransactions(db.transactions);
            storageService.saveTransactions(db.transactions);
            if (db.auditLogs.length > 0) {
              setAuditLogs(db.auditLogs);
              storageService.saveAuditLogs(db.auditLogs);
            }
            const loadedMsg = `Google Sheets terhubung! Data dimuat dari "${db.metadata.spreadsheetTitle}".`;
            setSheetsFeedback({ type: 'success', message: loadedMsg });
            showToast(loadedMsg);
            return;
          } catch (readErr) {
            console.warn('Auto-load sheet after login failed:', readErr);
          }
        }
      }

      const okMsg = `Berhasil terhubung sebagai ${user.displayName || user.email} (Google Sheets aktif).`;
      setSheetsFeedback({ type: 'success', message: okMsg });
      showToast(okMsg);
    } catch (err) {
      console.error('Google login error:', err);
      const errMsg = 'Login Google dibatalkan atau gagal.';
      setSheetsFeedback({ type: 'error', message: errMsg });
      showToast(errMsg);
    } finally {
      setIsCloudBusy(false);
    }
  };

  // Create Brand-New Database Spreadsheet
  const handleCreateNewSpreadsheet = async (title: string) => {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      const msg = 'Masukkan nama file Spreadsheet baru terlebih dahulu.';
      setSheetsFeedback({ type: 'error', message: msg });
      showToast(msg);
      return;
    }

    setIsCloudBusy(true);
    setSheetsFeedback(null);
    try {
      const token = await ensureSheetsAuthFromClick();
      if (!token) return;

      setSheetsFeedback({
        type: 'info',
        message: `Sedang membuat Google Spreadsheet "${cleanTitle}" beserta 4 tab database...`,
      });

      const meta = await sheetsApiService.createDatabaseSpreadsheet(token, cleanTitle);
      const nowIso = new Date().toISOString();
      const nextCfg: GoogleSheetConfig = {
        ...sheetConfig,
        mode: 'SHEETS_API',
        spreadsheetId: meta.spreadsheetId,
        spreadsheetTitle: meta.spreadsheetTitle,
        spreadsheetUrl: meta.spreadsheetUrl,
        sheetName: meta.spreadsheetTitle,
        databaseEnabled: true,
        lastSyncTime: nowIso,
        syncStatus: 'SUCCESS',
        lastErrorMessage: undefined,
      };
      setSheetConfig(nextCfg);
      storageService.saveSheetConfig(nextCfg);

      const entry = buildAuditEntry(
        'CREATE_GOOGLE_SHEET_DB',
        'SYSTEM',
        meta.spreadsheetId,
        `Buat database Google Sheet baru "${meta.spreadsheetTitle}"`
      );
      const nextLogs = appendLocalAuditLog(entry);

      if (purchaseOrders.length > 0 || schedules.length > 0 || transactions.length > 0) {
        await sheetsApiService.writeFullDatabaseToSheet(token, meta.spreadsheetId, {
          purchaseOrders,
          schedules,
          transactions,
          auditLogs: nextLogs,
        });
      }

      setHasPendingSheetChanges(false);
      const okMsg = `Database Google Sheet "${meta.spreadsheetTitle}" berhasil dibuat & terhubung!`;
      setSheetsFeedback({ type: 'success', message: okMsg });
      showToast(okMsg);
    } catch (err) {
      if (err instanceof SheetsApiError && err.isAuthError) {
        clearGoogleAccessToken();
        setSheetsAccessToken(null);
        const msg =
          'Otorisasi Google Sheets ditolak atau kedaluwarsa. Klik tombol lagi untuk login ulang dan izinkan akses Google Sheets.';
        setSheetsFeedback({ type: 'error', message: msg });
        showToast(msg);
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        const fullMsg = `Gagal membuat Spreadsheet: ${msg}`;
        setSheetsFeedback({ type: 'error', message: fullMsg });
        showToast(fullMsg);
      }
    } finally {
      setIsCloudBusy(false);
    }
  };

  // Connect Existing Spreadsheet & Inspect Metadata First
  const handleConnectExistingSpreadsheet = async (idOrUrl: string) => {
    const rawInput = idOrUrl.trim();
    if (!rawInput) {
      const msg = 'Tempelkan URL atau ID Google Spreadsheet terlebih dahulu.';
      setSheetsFeedback({ type: 'error', message: msg });
      showToast(msg);
      return;
    }

    setIsCloudBusy(true);
    setSheetsFeedback(null);
    try {
      const token = await ensureSheetsAuthFromClick();
      if (!token) return;

      setSheetsFeedback({
        type: 'info',
        message: 'Memeriksa metadata Spreadsheet, menyusun tab yang diperlukan, dan memuat data...',
      });

      const db = await sheetsApiService.loadDatabaseFromSheet(token, rawInput);
      const nowIso = new Date().toISOString();
      const nextCfg: GoogleSheetConfig = {
        ...sheetConfig,
        mode: 'SHEETS_API',
        spreadsheetId: db.metadata.spreadsheetId,
        spreadsheetTitle: db.metadata.spreadsheetTitle,
        spreadsheetUrl: db.metadata.spreadsheetUrl,
        sheetName: db.metadata.spreadsheetTitle,
        databaseEnabled: true,
        lastSyncTime: nowIso,
        syncStatus: 'SUCCESS',
        lastErrorMessage: undefined,
      };
      setSheetConfig(nextCfg);
      storageService.saveSheetConfig(nextCfg);

      const sheetHasRows =
        db.purchaseOrders.length > 0 ||
        db.schedules.length > 0 ||
        db.transactions.length > 0;
      const appHasRows =
        purchaseOrders.length > 0 ||
        schedules.length > 0 ||
        transactions.length > 0;

      if (sheetHasRows) {
        setPurchaseOrders(db.purchaseOrders);
        storageService.savePurchaseOrders(db.purchaseOrders);
        setSchedules(db.schedules);
        storageService.saveSchedules(db.schedules);
        setTransactions(db.transactions);
        storageService.saveTransactions(db.transactions);
        if (db.auditLogs.length > 0) {
          setAuditLogs(db.auditLogs);
          storageService.saveAuditLogs(db.auditLogs);
        }
        setHasPendingSheetChanges(false);
        const okMsg = `Terhubung ke "${db.metadata.spreadsheetTitle}"! Dimuat ${db.purchaseOrders.length} PO, ${db.schedules.length} Jadwal, dan ${db.transactions.length} Transaksi.`;
        setSheetsFeedback({ type: 'success', message: okMsg });
        showToast(okMsg);
      } else if (appHasRows) {
        const infoMsg = `Terhubung ke "${db.metadata.spreadsheetTitle}". Spreadsheet masih kosong — silakan konfirmasi untuk mengunggah data lokal ke Spreadsheet.`;
        setSheetsFeedback({ type: 'info', message: infoMsg });
        showToast(infoMsg);
        setSheetConfirmRequest({
          title: 'Isi Spreadsheet Kosong dengan Data Aplikasi Saat Ini?',
          description: `Spreadsheet "${db.metadata.spreadsheetTitle}" sudah terhubung dan memiliki 4 tab terstruktur, namun belum memiliki baris data. Simpan ${purchaseOrders.length} PO, ${schedules.length} Jadwal, dan ${transactions.length} Transaksi ke spreadsheet ini?`,
          spreadsheetTitle: db.metadata.spreadsheetTitle,
          affectedTabs: [
            SHEET_TABS.PO,
            SHEET_TABS.SCHEDULES,
            SHEET_TABS.TRANSACTIONS,
            SHEET_TABS.AUDIT,
          ],
          affectedCounts: {
            pos: purchaseOrders.length,
            schedules: schedules.length,
            transactions: transactions.length,
          },
          confirmLabel: 'Ya, Simpan Data ke Spreadsheet',
          onCancel: () => setHasPendingSheetChanges(true),
          onConfirm: async () => {
            await commitDatabaseToSheet(
              purchaseOrders,
              schedules,
              transactions,
              auditLogs,
              db.metadata.spreadsheetId
            );
            setSheetsFeedback({
              type: 'success',
              message: `Data aplikasi berhasil disimpan ke "${db.metadata.spreadsheetTitle}".`,
            });
            setSheetConfirmRequest(null);
          },
        });
      } else {
        setHasPendingSheetChanges(false);
        const okMsg = `Terhubung ke "${db.metadata.spreadsheetTitle}"! 4 tab database siap menerima data PO s/d QC-PA.`;
        setSheetsFeedback({ type: 'success', message: okMsg });
        showToast(okMsg);
      }
    } catch (err) {
      if (err instanceof SheetsApiError) {
        if (err.status === 401) {
          clearGoogleAccessToken();
          setSheetsAccessToken(null);
          const msg =
            'Sesi Google kedaluwarsa (401). Klik tombol Hubungkan lagi untuk login ulang.';
          setSheetsFeedback({ type: 'error', message: msg });
          showToast(msg);
        } else if (err.status === 403) {
          const msg = `Akses ditolak (403) untuk akun ${firebaseUser?.email || 'Google Anda'}. Pastikan akun Google yang dipakai login memiliki izin Editor di Spreadsheet tersebut, atau gunakan tab 2A untuk membuat Spreadsheet baru.`;
          setSheetsFeedback({ type: 'error', message: msg });
          showToast(msg);
        } else if (err.status === 404) {
          const msg =
            'Spreadsheet tidak ditemukan (404). Periksa kembali URL atau Spreadsheet ID yang ditempelkan.';
          setSheetsFeedback({ type: 'error', message: msg });
          showToast(msg);
        } else {
          const msg = `Gagal menghubungkan Spreadsheet (${err.status}): ${err.message}`;
          setSheetsFeedback({ type: 'error', message: msg });
          showToast(msg);
        }
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        const fullMsg = `Gagal menghubungkan Spreadsheet: ${msg}`;
        setSheetsFeedback({ type: 'error', message: fullMsg });
        showToast(fullMsg);
      }
    } finally {
      setIsCloudBusy(false);
    }
  };

  // Read-only Load from Connected Google Sheet
  const handleLoadFromSheet = async () => {
    if (!sheetConfig.spreadsheetId) {
      const msg = 'Belum ada Spreadsheet yang terhubung. Tempelkan URL Spreadsheet pada bagian 2B terlebih dahulu.';
      setSheetsFeedback({ type: 'error', message: msg });
      showToast(msg);
      return;
    }

    setIsCloudBusy(true);
    setSheetsFeedback(null);
    try {
      const token = await ensureSheetsAuthFromClick();
      if (!token) return;

      const db = await sheetsApiService.loadDatabaseFromSheet(token, sheetConfig.spreadsheetId);
      setPurchaseOrders(db.purchaseOrders);
      storageService.savePurchaseOrders(db.purchaseOrders);
      setSchedules(db.schedules);
      storageService.saveSchedules(db.schedules);
      setTransactions(db.transactions);
      storageService.saveTransactions(db.transactions);
      if (db.auditLogs.length > 0) {
        setAuditLogs(db.auditLogs);
        storageService.saveAuditLogs(db.auditLogs);
      }
      const nextCfg: GoogleSheetConfig = {
        ...sheetConfig,
        spreadsheetTitle: db.metadata.spreadsheetTitle,
        spreadsheetUrl: db.metadata.spreadsheetUrl,
        lastSyncTime: new Date().toISOString(),
        syncStatus: 'SUCCESS',
      };
      setSheetConfig(nextCfg);
      storageService.saveSheetConfig(nextCfg);
      setHasPendingSheetChanges(false);
      const okMsg = `Berhasil memuat ulang dari Google Sheet "${db.metadata.spreadsheetTitle}" (${db.purchaseOrders.length} PO, ${db.transactions.length} Transaksi).`;
      setSheetsFeedback({ type: 'success', message: okMsg });
      showToast(okMsg);
    } catch (err) {
      if (err instanceof SheetsApiError && err.isAuthError) {
        clearGoogleAccessToken();
        setSheetsAccessToken(null);
        const msg = 'Sesi/izin Google Sheets kedaluwarsa atau ditolak. Klik "Sign in with Google" kembali.';
        setSheetsFeedback({ type: 'error', message: msg });
        showToast(msg);
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        const fullMsg = `Gagal memuat dari Google Sheets: ${msg}`;
        setSheetsFeedback({ type: 'error', message: fullMsg });
        showToast(fullMsg);
      }
    } finally {
      setIsCloudBusy(false);
    }
  };

  const handleDisconnectSheet = () => {
    const nextCfg: GoogleSheetConfig = {
      ...sheetConfig,
      spreadsheetId: '',
      spreadsheetTitle: '',
      spreadsheetUrl: '',
      databaseEnabled: false,
      syncStatus: 'IDLE',
    };
    setSheetConfig(nextCfg);
    storageService.saveSheetConfig(nextCfg);
    setHasPendingSheetChanges(false);
    showToast('Koneksi Spreadsheet diputus. Data browser lokal tetap aman.');
  };

  // PO Creation Handler (supports single or batch array up to 5 items)
  const handleSavePo = async (newPo: PurchaseOrder | PurchaseOrder[]) => {
    if (!requireRole('ADMIN')) return;

    const nowIso = new Date().toISOString();
    const toAdd = (Array.isArray(newPo) ? newPo : [newPo]).map((p) => ({
      ...p,
      createdAt: p.createdAt || nowIso,
      updatedAt: nowIso,
    }));
    const poNumbers = toAdd.map((p) => p.poNumber).join(', ');
    const auditEntry = buildAuditEntry(
      'CREATE_PO',
      'PO',
      toAdd[0]?.id || 'BATCH_PO',
      `Terbitkan ${toAdd.length} PO baru (${poNumbers})`
    );

    const nextPos = [...toAdd, ...purchaseOrders];
    const poIds = toAdd.map((p) => p.id);
    storageService.markLocalUpserts('po', poIds);
    setPurchaseOrders(nextPos);
    storageService.savePurchaseOrders(nextPos);
    const nextLogs = appendLocalAuditLog(auditEntry);

    void persistToSimotubaFirebase(
      () => simotubaFirestoreService.savePurchaseOrders(toAdd),
      'PO baru',
      () => storageService.markCloudUpsertsAcked('po', poIds)
    );

    showToast(
      toAdd.length === 1
        ? `Purchase Order ${toAdd[0].poNumber} berhasil diterbitkan! Beralih ke menu Jadwal Pengiriman.`
        : `${toAdd.length} Purchase Order berhasil diterbitkan! Beralih ke menu Jadwal Pengiriman.`
    );
    setSelectedPoForSchedule(null);
    setActiveTab('schedules');

    promptSheetMutation({
      title: `Simpan ${toAdd.length} PO Baru ke Google Sheets?`,
      description: `Akan menambahkan ${toAdd.length} Purchase Order (${poNumbers}) ke tab DATA_PURCHASE_ORDER dan mencatat jejak audit di Google Spreadsheet.`,
      affectedTabs: [SHEET_TABS.PO, SHEET_TABS.AUDIT],
      nextPos,
      nextSchs: schedules,
      nextTxs: transactions,
      nextLogs,
    });
  };

  const handleCreateScheduleForPo = (po: PurchaseOrder) => {
    setSelectedPoForSchedule(po.id);
    setActiveTab('schedules');
  };

  // Update PO Handler (Edit PO)
  const handleUpdatePo = async (updatedPo: PurchaseOrder) => {
    if (!requireRole('ADMIN')) return;

    const affectedSchedules = schedules
      .filter((s) => s.poId === updatedPo.id)
      .map((s) => ({
        ...s,
        poNumber: updatedPo.poNumber,
        supplierName: updatedPo.supplierName,
      }));

    const tol = updatedPo.tolerancePercentage || 5;
    const affectedTransactions: CoalTransaction[] = [];
    const updatedTransactions = transactions.map((t) => {
      if (t.poId !== updatedPo.id) return t;
      if (!t.nettoWeight || !t.suratJalanWeight) {
        const syncedHeader = {
          ...t,
          poNumber: updatedPo.poNumber,
          supplierName: updatedPo.supplierName,
        };
        affectedTransactions.push(syncedHeader);
        return syncedHeader;
      }
      const metrics = calculateToleranceMetrics({
        grossWeight: t.grossWeight,
        tareWeight: t.tareWeight,
        suratJalanWeight: t.suratJalanWeight,
        tolerancePercentage: tol,
      });
      const recalc = {
        ...t,
        poNumber: updatedPo.poNumber,
        supplierName: updatedPo.supplierName,
        weightDifference: metrics.weightDifference,
        shrinkagePercentage: metrics.shrinkagePercentage,
        toleranceStatus: metrics.toleranceStatus,
        claimPenaltyKg: metrics.claimPenaltyKg,
      };
      affectedTransactions.push(recalc);
      return recalc;
    });

    const nowIso = new Date().toISOString();
    const stampedPo: PurchaseOrder = { ...updatedPo, updatedAt: nowIso };
    const stampedSchedules = affectedSchedules.map((s) => ({ ...s, updatedAt: nowIso }));
    const stampedTransactions = affectedTransactions.map((t) => ({ ...t, updatedAt: nowIso }));

    const updatedPos = purchaseOrders.map((p) => (p.id === stampedPo.id ? stampedPo : p));
    const updatedSchedules = schedules.map(
      (s) => stampedSchedules.find((a) => a.id === s.id) || s
    );
    const syncedTransactions = transactions.map(
      (t) => stampedTransactions.find((a) => a.id === t.id) || t
    );

    const auditEntry = buildAuditEntry(
      'UPDATE_PO',
      'PO',
      stampedPo.id,
      `Perbarui PO ${stampedPo.poNumber} (${stampedPo.status})`,
      `Target: ${stampedPo.targetTonnage} Kg · Toleransi: ±${tol}%`
    );

    storageService.markLocalUpserts('po', [stampedPo.id]);
    if (stampedSchedules.length > 0) {
      storageService.markLocalUpserts('schedule', stampedSchedules.map((s) => s.id));
    }
    if (stampedTransactions.length > 0) {
      storageService.markLocalUpserts('transaction', stampedTransactions.map((t) => t.id));
    }

    setPurchaseOrders(updatedPos);
    storageService.savePurchaseOrders(updatedPos);
    setSchedules(updatedSchedules);
    storageService.saveSchedules(updatedSchedules);
    if (stampedTransactions.length > 0) {
      setTransactions(syncedTransactions);
      storageService.saveTransactions(syncedTransactions);
    }
    const nextLogs = appendLocalAuditLog(auditEntry);

    void persistToSimotubaFirebase(
      () =>
        simotubaFirestoreService.updatePurchaseOrderCascade(
          stampedPo,
          stampedSchedules,
          stampedTransactions
        ),
      `Edit PO ${stampedPo.poNumber}`,
      () => {
        storageService.markCloudUpsertsAcked('po', [stampedPo.id]);
        if (stampedSchedules.length > 0) {
          storageService.markCloudUpsertsAcked('schedule', stampedSchedules.map((s) => s.id));
        }
        if (stampedTransactions.length > 0) {
          storageService.markCloudUpsertsAcked('transaction', stampedTransactions.map((t) => t.id));
        }
      }
    );

    showToast(`Purchase Order ${updatedPo.poNumber} berhasil diperbarui & disimpan!`);

    promptSheetMutation({
      title: `Perbarui PO ${updatedPo.poNumber} di Google Sheets?`,
      description: `Perubahan PO ${updatedPo.poNumber} akan memperbarui tab DATA_PURCHASE_ORDER${affectedSchedules.length > 0 ? ', JADWAL_KEDATANGAN' : ''}${affectedTransactions.length > 0 ? ', dan DATA_TRANSAKSI_TIMBANGAN' : ''} pada Google Spreadsheet.`,
      affectedTabs: [
        SHEET_TABS.PO,
        ...(affectedSchedules.length > 0 ? [SHEET_TABS.SCHEDULES] : []),
        ...(affectedTransactions.length > 0 ? [SHEET_TABS.TRANSACTIONS] : []),
        SHEET_TABS.AUDIT,
      ],
      nextPos: updatedPos,
      nextSchs: updatedSchedules,
      nextTxs: updatedTransactions,
      nextLogs,
    });
  };

  // Delete PO Handler (Hapus PO)
  const handleDeletePo = async (poId: string) => {
    if (!requireRole('ADMIN')) return;

    const linkedTxCount = transactions.filter((t) => t.poId === poId).length;
    if (linkedTxCount > 0) {
      showToast('PO memiliki riwayat transaksi operasional dan tidak boleh dihapus. Ubah status menjadi CLOSED.');
      return;
    }

    const targetPo = purchaseOrders.find((p) => p.id === poId);
    const connectedScheduleIds = schedules.filter((s) => s.poId === poId).map((s) => s.id);
    const updatedPos = purchaseOrders.filter((p) => p.id !== poId);
    const updatedSchedules = schedules.filter((s) => s.poId !== poId);

    const auditEntry = buildAuditEntry(
      'DELETE_PO',
      'PO',
      poId,
      `Hapus PO ${targetPo?.poNumber || poId} beserta ${connectedScheduleIds.length} jadwal`
    );

    storageService.markLocalDeletes('po', [poId]);
    if (connectedScheduleIds.length > 0) {
      storageService.markLocalDeletes('schedule', connectedScheduleIds);
    }

    setPurchaseOrders(updatedPos);
    storageService.savePurchaseOrders(updatedPos);
    setSchedules(updatedSchedules);
    storageService.saveSchedules(updatedSchedules);
    const nextLogs = appendLocalAuditLog(auditEntry);

    void persistToSimotubaFirebase(
      () => simotubaFirestoreService.deletePurchaseOrderAndSchedules(poId, connectedScheduleIds),
      `Hapus PO ${targetPo?.poNumber || poId}`,
      () => {
        storageService.markCloudDeletesAcked('po', [poId]);
        if (connectedScheduleIds.length > 0) {
          storageService.markCloudDeletesAcked('schedule', connectedScheduleIds);
        }
      }
    );

    showToast(`Purchase Order ${targetPo?.poNumber || ''} berhasil dihapus!`);

    promptSheetMutation({
      title: `Hapus PO ${targetPo?.poNumber || poId} dari Google Sheets?`,
      description: `Akan menghapus baris PO ${targetPo?.poNumber || poId} beserta ${connectedScheduleIds.length} jadwal terkait dari Google Spreadsheet.`,
      affectedTabs: [SHEET_TABS.PO, SHEET_TABS.SCHEDULES, SHEET_TABS.AUDIT],
      nextPos: updatedPos,
      nextSchs: updatedSchedules,
      nextTxs: transactions,
      nextLogs,
      isDestructive: true,
      confirmLabel: 'Ya, Hapus dari Google Sheet',
    });
  };

  // Schedule Creation Handler (supports single or batch array up to 20 items)
  const handleSaveSchedule = async (newSchedule: ArrivalSchedule | ArrivalSchedule[]) => {
    if (!requireRole('ADMIN')) return;

    const nowIso = new Date().toISOString();
    const toAdd = (Array.isArray(newSchedule) ? newSchedule : [newSchedule]).map((s) => ({
      ...s,
      createdAt: s.createdAt || nowIso,
      updatedAt: nowIso,
    }));
    const updated = [...toAdd, ...schedules];
    const schIds = toAdd.map((s) => s.id);
    const auditEntry = buildAuditEntry(
      'CREATE_SCHEDULE',
      'SCHEDULE',
      toAdd[0]?.id || 'BATCH_SCH',
      `Buat ${toAdd.length} jadwal kedatangan untuk PO ${toAdd[0]?.poNumber || ''}`
    );

    storageService.markLocalUpserts('schedule', schIds);
    setSchedules(updated);
    storageService.saveSchedules(updated);
    const nextLogs = appendLocalAuditLog(auditEntry);
    setSelectedScheduleForGateIn(null);

    void persistToSimotubaFirebase(
      () => simotubaFirestoreService.saveSchedules(toAdd),
      'Jadwal Kedatangan',
      () => storageService.markCloudUpsertsAcked('schedule', schIds)
    );

    if (toAdd.length === 1) {
      showToast(`Jadwal pengiriman PO ${toAdd[0].poNumber} berhasil dibuat & tersimpan!`);
    } else {
      showToast(`${toAdd.length} data jadwal pengiriman PO ${toAdd[0].poNumber} berhasil dibuat & tersimpan!`);
    }

    promptSheetMutation({
      title: `Simpan ${toAdd.length} Jadwal Kedatangan ke Google Sheets?`,
      description: `Akan menambahkan ${toAdd.length} jadwal pengiriman untuk PO ${toAdd[0]?.poNumber || ''} ke tab JADWAL_KEDATANGAN.`,
      affectedTabs: [SHEET_TABS.SCHEDULES, SHEET_TABS.AUDIT],
      nextPos: purchaseOrders,
      nextSchs: updated,
      nextTxs: transactions,
      nextLogs,
    });
  };

  // Schedule Update / Revision Handler
  const handleUpdateSchedule = async (updatedSch: ArrivalSchedule) => {
    if (!requireRole('ADMIN')) return;

    const nowIso = new Date().toISOString();
    const stampedSch: ArrivalSchedule = { ...updatedSch, updatedAt: nowIso };
    const updatedSchedules = schedules.map((s) => (s.id === stampedSch.id ? stampedSch : s));
    const auditEntry = buildAuditEntry(
      'UPDATE_SCHEDULE',
      'SCHEDULE',
      stampedSch.id,
      `Revisi jadwal ${stampedSch.id} (PO ${stampedSch.poNumber}) · Status: ${stampedSch.status}`
    );

    storageService.markLocalUpserts('schedule', [stampedSch.id]);
    setSchedules(updatedSchedules);
    storageService.saveSchedules(updatedSchedules);
    const nextLogs = appendLocalAuditLog(auditEntry);

    void persistToSimotubaFirebase(
      () => simotubaFirestoreService.saveSchedules([stampedSch]),
      `Revisi Jadwal ${stampedSch.id}`,
      () => storageService.markCloudUpsertsAcked('schedule', [stampedSch.id])
    );

    showToast(`Jadwal ${stampedSch.id} (PO ${stampedSch.poNumber}) berhasil direvisi!`);

    promptSheetMutation({
      title: `Perbarui Jadwal ${stampedSch.id} di Google Sheets?`,
      description: `Revisi jadwal PO ${stampedSch.poNumber} (Status: ${stampedSch.status}) akan diperbarui pada tab JADWAL_KEDATANGAN.`,
      affectedTabs: [SHEET_TABS.SCHEDULES, SHEET_TABS.AUDIT],
      nextPos: purchaseOrders,
      nextSchs: updatedSchedules,
      nextTxs: transactions,
      nextLogs,
    });
  };

  // Schedule Delete Handler
  const handleDeleteSchedule = async (schId: string) => {
    if (!requireRole('ADMIN')) return;

    const updatedSchedules = schedules.filter((s) => s.id !== schId);
    const auditEntry = buildAuditEntry(
      'DELETE_SCHEDULE',
      'SCHEDULE',
      schId,
      `Hapus jadwal pengiriman ${schId}`
    );

    storageService.markLocalDeletes('schedule', [schId]);
    setSchedules(updatedSchedules);
    storageService.saveSchedules(updatedSchedules);
    const nextLogs = appendLocalAuditLog(auditEntry);

    void persistToSimotubaFirebase(
      () => simotubaFirestoreService.deleteSchedule(schId),
      `Hapus Jadwal ${schId}`,
      () => storageService.markCloudDeletesAcked('schedule', [schId])
    );

    showToast(`Jadwal ${schId} berhasil dihapus!`);

    promptSheetMutation({
      title: `Hapus Jadwal ${schId} dari Google Sheets?`,
      description: `Baris jadwal ${schId} akan dihapus dari tab JADWAL_KEDATANGAN di Google Spreadsheet.`,
      affectedTabs: [SHEET_TABS.SCHEDULES, SHEET_TABS.AUDIT],
      nextPos: purchaseOrders,
      nextSchs: updatedSchedules,
      nextTxs: transactions,
      nextLogs,
      isDestructive: true,
      confirmLabel: 'Ya, Hapus dari Google Sheet',
    });
  };

  // Transaction / Riwayat Bongkar Delete Handler
  const handleDeleteTransaction = async (txId: string) => {
    if (!requireRole('ADMIN')) return;

    const targetTx = transactions.find((t) => t.id === txId);
    if (!targetTx) return;

    const nowIso = new Date().toISOString();
    const updatedTxs = transactions.filter((t) => t.id !== txId);

    // Roll back PO receivedTonnage if this transaction was COMPLETED
    const nettoKgToRollback =
      targetTx.status === 'COMPLETED'
        ? targetTx.nettoWeight || Math.round((targetTx.nettoTons || 0) * 1000)
        : 0;
    const updatedPos =
      nettoKgToRollback > 0 && targetTx.poId
        ? purchaseOrders.map((po) => {
            if (po.id === targetTx.poId) {
              const nextReceived = Math.max(
                0,
                Math.round((po.receivedTonnage || 0) - nettoKgToRollback)
              );
              return { ...po, receivedTonnage: nextReceived, updatedAt: nowIso };
            }
            return po;
          })
        : purchaseOrders;
    const affectedPo: PurchaseOrder | null =
      nettoKgToRollback > 0 && targetTx.poId
        ? updatedPos.find((po) => po.id === targetTx.poId) || null
        : null;

    // Revert linked schedule status back to SCHEDULED if no other transaction references it
    const shouldRevertSchedule =
      Boolean(targetTx.scheduleId) &&
      !updatedTxs.some((t) => t.scheduleId === targetTx.scheduleId);
    const updatedSchs = shouldRevertSchedule
      ? schedules.map((s) =>
          s.id === targetTx.scheduleId && s.status !== 'CANCELLED'
            ? { ...s, status: 'SCHEDULED' as const, updatedAt: nowIso }
            : s
        )
      : schedules;
    const affectedSchedule: ArrivalSchedule | null =
      shouldRevertSchedule && targetTx.scheduleId
        ? updatedSchs.find((s) => s.id === targetTx.scheduleId && s.status === 'SCHEDULED') || null
        : null;

    const auditEntry = buildAuditEntry(
      'DELETE_TRANSACTION',
      'TRANSACTION',
      txId,
      `Hapus riwayat bongkar ${targetTx.vehiclePlate} (PO: ${targetTx.poNumber}, Tiket: ${targetTx.ticketNumber})`
    );

    storageService.markLocalDeletes('transaction', [txId]);
    if (affectedPo) {
      storageService.markLocalUpserts('po', [affectedPo.id]);
    }
    if (affectedSchedule) {
      storageService.markLocalUpserts('schedule', [affectedSchedule.id]);
    }

    setTransactions(updatedTxs);
    storageService.saveTransactions(updatedTxs);
    if (affectedPo) {
      setPurchaseOrders(updatedPos);
      storageService.savePurchaseOrders(updatedPos);
    }
    if (affectedSchedule) {
      setSchedules(updatedSchs);
      storageService.saveSchedules(updatedSchs);
    }
    if (printingTx?.id === txId) {
      setPrintingTx(null);
    }
    const nextLogs = appendLocalAuditLog(auditEntry);

    void persistToSimotubaFirebase(
      () =>
        simotubaFirestoreService.deleteTransactionBundle({
          txId,
          schedule: affectedSchedule,
          po: affectedPo,
        }),
      `Hapus Riwayat ${targetTx.vehiclePlate}`,
      () => {
        storageService.markCloudDeletesAcked('transaction', [txId]);
        if (affectedPo) storageService.markCloudUpsertsAcked('po', [affectedPo.id]);
        if (affectedSchedule) storageService.markCloudUpsertsAcked('schedule', [affectedSchedule.id]);
      }
    );

    showToast(`Data riwayat bongkar ${targetTx.vehiclePlate} berhasil dihapus!`);

    const affectedTabs: string[] = [SHEET_TABS.TRANSACTIONS, SHEET_TABS.AUDIT];
    if (affectedPo) affectedTabs.push(SHEET_TABS.PO);
    if (affectedSchedule) affectedTabs.push(SHEET_TABS.SCHEDULES);

    promptSheetMutation({
      title: `Hapus Riwayat Bongkar ${targetTx.vehiclePlate} dari Google Sheets?`,
      description: `Transaksi ${targetTx.vehiclePlate} (Tiket ${targetTx.ticketNumber}) akan dihapus dari Google Spreadsheet${affectedPo ? ' dan realisasi kuota PO akan disesuaikan' : ''}.`,
      affectedTabs,
      nextPos: updatedPos,
      nextSchs: updatedSchs,
      nextTxs: updatedTxs,
      nextLogs,
      isDestructive: true,
      confirmLabel: 'Ya, Hapus dari Google Sheet',
    });
  };

  // Check-In to Security from Schedule
  const handleScheduleCheckInDirect = (schedule: ArrivalSchedule) => {
    setSelectedScheduleForGateIn(schedule);
    setSecuritySubTab('GATE_IN');
    setActiveTab('security');
  };

  // Helper to sync linked schedule locally
  const syncLinkedScheduleStatusLocal = (
    targetTx: CoalTransaction | undefined,
    nextStatus: ArrivalSchedule['status'],
    currentSchedules: ArrivalSchedule[] = schedules
  ): ArrivalSchedule[] => {
    if (!targetTx?.scheduleId) return currentSchedules;
    let changed = false;
    const nowIso = new Date().toISOString();
    const updatedSchedules = currentSchedules.map((s) => {
      if (s.id === targetTx.scheduleId && s.status !== 'CANCELLED' && s.status !== nextStatus) {
        changed = true;
        return { ...s, status: nextStatus, updatedAt: nowIso };
      }
      return s;
    });
    if (changed) {
      storageService.markLocalUpserts('schedule', [targetTx.scheduleId]);
      setSchedules(updatedSchedules);
      storageService.saveSchedules(updatedSchedules);
    }
    return updatedSchedules;
  };

  // Check-In Truck at Security -> Langsung Masuk Timbang Masuk
  const handleCheckInTruck = async (newTx: CoalTransaction) => {
    if (!requireRole('SECURITY')) return;

    let resolvedScheduleId = newTx.scheduleId;

    // Auto-match an unlinked pending schedule when date & PO match
    if (!resolvedScheduleId) {
      const linkedIds = new Set(transactions.map((t) => t.scheduleId).filter(Boolean));
      const txEtaDate = (newTx.scheduledDeliveryDate || '').slice(0, 10);
      const candidate = schedules.find(
        (s) =>
          s.poId === newTx.poId &&
          !linkedIds.has(s.id) &&
          (s.status === 'ON_WAY' || s.status === 'SCHEDULED' || s.status === 'OVERDUE') &&
          (!txEtaDate || (s.etaDateTime || '').slice(0, 10) === txEtaDate)
      );
      if (candidate) {
        resolvedScheduleId = candidate.id;
      }
    }

    const baseNewTx: CoalTransaction = resolvedScheduleId
      ? { ...newTx, scheduleId: resolvedScheduleId }
      : newTx;

    const resolvedRit = resolveTransactionRitInfo(baseNewTx, [baseNewTx, ...transactions], schedules);
    const nowIso = new Date().toISOString();
    const finalNewTx: CoalTransaction = {
      ...baseNewTx,
      ritCategory: baseNewTx.ritCategory || resolvedRit.ritCategory,
      ritRemarks: baseNewTx.ritRemarks || resolvedRit.ritRemarks,
      createdAt: baseNewTx.createdAt || nowIso,
      updatedAt: nowIso,
    };

    const scheduleStatusFromTx: ArrivalSchedule['status'] =
      finalNewTx.status === 'GATE_IN'
        ? 'ARRIVED_GATE'
        : finalNewTx.status === 'QC_CHECK'
          ? 'BONGKAR'
          : finalNewTx.status;

    const matchedPoForAlert = purchaseOrders.find((p) => p.id === finalNewTx.poId);
    const gateInQuotaCheck = matchedPoForAlert
      ? evaluatePoQuotaStatus(matchedPoForAlert, schedules, transactions, {
          incomingWeightKg: Number(finalNewTx.suratJalanWeight || 0),
          incomingRitCount: 1,
          hasSelectedSchedule: Boolean(finalNewTx.scheduleId),
        })
      : null;

    const excessNoteForAudit =
      gateInQuotaCheck && gateInQuotaCheck.hasExcessAlert
        ? ` · PERINGATAN: ${gateInQuotaCheck.alertReasons.join('; ')}`
        : '';

    const auditEntry = buildAuditEntry(
      'CHECK_IN_GATE_IN',
      'TRANSACTION',
      finalNewTx.id,
      `Gate In ${finalNewTx.vehiclePlate} (${finalNewTx.driverName}) · Tiket ${finalNewTx.ticketNumber}`,
      `PO: ${finalNewTx.poNumber} · Berat SJ: ${finalNewTx.suratJalanWeight} kg${excessNoteForAudit}`
    );

    const updatedTxs = [finalNewTx, ...transactions];
    storageService.markLocalUpserts('transaction', [finalNewTx.id]);
    setTransactions(updatedTxs);
    storageService.saveTransactions(updatedTxs);
    const updatedSchs = syncLinkedScheduleStatusLocal(finalNewTx, scheduleStatusFromTx, schedules);
    const nextLogs = appendLocalAuditLog(auditEntry);

    const linkedSchAfterGateIn = finalNewTx.scheduleId
      ? updatedSchs.find((s) => s.id === finalNewTx.scheduleId) || null
      : null;
    void persistToSimotubaFirebase(
      () =>
        simotubaFirestoreService.saveTransactionBundle({
          transaction: finalNewTx,
          schedule: linkedSchAfterGateIn,
        }),
      `Gate In ${finalNewTx.vehiclePlate}`,
      () => {
        storageService.markCloudUpsertsAcked('transaction', [finalNewTx.id]);
        if (linkedSchAfterGateIn) {
          storageService.markCloudUpsertsAcked('schedule', [linkedSchAfterGateIn.id]);
        }
      }
    );

    setSelectedScheduleForGateIn(null);
    setSelectedTxId(finalNewTx.id);
    setActiveTab('weigh-in');
    if (gateInQuotaCheck && gateInQuotaCheck.hasExcessAlert) {
      showToast(
        `PERINGATAN POSKO: Gate In ${finalNewTx.vehiclePlate} (PO ${finalNewTx.poNumber}) dicatat dengan ${gateInQuotaCheck.alertReasons.join(' & ')}.`
      );
    } else {
      showToast(
        `Check-In Pos Security selesai! Nopol ${finalNewTx.vehiclePlate} (${finalNewTx.driverName}) langsung masuk ke data Timbang Masuk.`
      );
    }

    promptSheetMutation({
      title: `Simpan Gate In ${finalNewTx.vehiclePlate} ke Google Sheets?`,
      description: `Menyimpan tiket ${finalNewTx.ticketNumber} (${finalNewTx.vehiclePlate} · PO ${finalNewTx.poNumber}) ke tab DATA_TRANSAKSI_TIMBANGAN.`,
      affectedTabs: [SHEET_TABS.TRANSACTIONS, SHEET_TABS.SCHEDULES, SHEET_TABS.AUDIT],
      nextPos: purchaseOrders,
      nextSchs: updatedSchs,
      nextTxs: updatedTxs,
      nextLogs,
    });
  };

  // Advance Gate In -> Weigh In Gross
  const handleAdvanceToWeighIn = async (txId: string) => {
    if (!requireRole('SECURITY')) return;

    const targetTx = transactions.find((t) => t.id === txId);
    const auditEntry = buildAuditEntry(
      'ADVANCE_WEIGH_IN',
      'TRANSACTION',
      txId,
      `Teruskan ${targetTx?.vehiclePlate || txId} ke Jembatan Timbang Masuk`
    );

    const nowIso = new Date().toISOString();
    const updated = transactions.map((t) =>
      t.id === txId ? { ...t, status: 'TIMBANG_MASUK' as const, updatedAt: nowIso } : t
    );
    storageService.markLocalUpserts('transaction', [txId]);
    setTransactions(updated);
    storageService.saveTransactions(updated);
    const updatedSchs = syncLinkedScheduleStatusLocal(targetTx, 'TIMBANG_MASUK');
    const nextLogs = appendLocalAuditLog(auditEntry);

    const updatedTx = updated.find((t) => t.id === txId);
    const linkedSch = targetTx?.scheduleId
      ? updatedSchs.find((s) => s.id === targetTx.scheduleId) || null
      : null;
    if (updatedTx) {
      void persistToSimotubaFirebase(
        () =>
          simotubaFirestoreService.saveTransactionBundle({
            transaction: updatedTx,
            schedule: linkedSch,
          }),
        `Lanjut Timbang Masuk ${updatedTx.vehiclePlate}`,
        () => {
          storageService.markCloudUpsertsAcked('transaction', [updatedTx.id]);
          if (linkedSch) {
            storageService.markCloudUpsertsAcked('schedule', [linkedSch.id]);
          }
        }
      );
    }

    setSelectedTxId(txId);
    setActiveTab('weigh-in');

    promptSheetMutation({
      title: `Perbarui Status Timbang Masuk ke Google Sheets?`,
      description: `Status armada ${targetTx?.vehiclePlate || txId} akan diperbarui menjadi TIMBANG_MASUK di Google Spreadsheet.`,
      affectedTabs: [SHEET_TABS.TRANSACTIONS, SHEET_TABS.SCHEDULES, SHEET_TABS.AUDIT],
      nextPos: purchaseOrders,
      nextSchs: updatedSchs,
      nextTxs: updated,
      nextLogs,
    });
  };

  // Complete Weigh In Gross -> Langsung masuk ke Bongkar Muatan (QC-PA independen diluar alur)
  const handleCompleteWeighIn = async (
    txId: string,
    grossWeight: number,
    operatorName: string,
    scaleId: string,
    customWeighInTime?: string,
    weighInNotes?: string
  ) => {
    if (!requireRole('TIMBANG_MASUK')) return;

    const targetTx = transactions.find((t) => t.id === txId);
    if (!targetTx) return;
    const parsedCustomTime = customWeighInTime ? new Date(customWeighInTime) : null;
    const weighInTime =
      parsedCustomTime && !Number.isNaN(parsedCustomTime.getTime())
        ? parsedCustomTime.toISOString()
        : new Date().toISOString();
    const initialDiscrepancy =
      targetTx.suratJalanWeight > 0 ? grossWeight - targetTx.suratJalanWeight : 0;

    const nowIso = new Date().toISOString();
    const trimmedNotes = weighInNotes?.trim();
    const updated = transactions.map((t) =>
      t.id === txId
        ? {
            ...t,
            grossWeight,
            weighInTime,
            weighInOperator: operatorName,
            weighInScaleId: scaleId,
            initialDiscrepancy,
            ...(trimmedNotes ? { weighInNotes: trimmedNotes } : {}),
            status: 'BONGKAR' as const,
            updatedAt: nowIso,
          }
        : t
    );

    const auditEntry = buildAuditEntry(
      'WEIGH_IN_GROSS',
      'TRANSACTION',
      txId,
      `Timbang Masuk ${targetTx.vehiclePlate}: Gross ${grossWeight.toLocaleString('id-ID')} kg (Op: ${operatorName})`
    );

    storageService.markLocalUpserts('transaction', [txId]);
    setTransactions(updated);
    storageService.saveTransactions(updated);
    const updatedSchs = syncLinkedScheduleStatusLocal(targetTx, 'BONGKAR');
    const nextLogs = appendLocalAuditLog(auditEntry);

    const updatedTx = updated.find((t) => t.id === txId);
    const linkedSch = targetTx.scheduleId
      ? updatedSchs.find((s) => s.id === targetTx.scheduleId) || null
      : null;
    if (updatedTx) {
      void persistToSimotubaFirebase(
        () =>
          simotubaFirestoreService.saveTransactionBundle({
            transaction: updatedTx,
            schedule: linkedSch,
          }),
        `Timbang Masuk ${targetTx.vehiclePlate}`,
        () => {
          storageService.markCloudUpsertsAcked('transaction', [updatedTx.id]);
          if (linkedSch) {
            storageService.markCloudUpsertsAcked('schedule', [linkedSch.id]);
          }
        }
      );
    }

    setSelectedTxId(txId);
    setActiveTab('unloading');
    showToast(`Gross Weight ${grossWeight.toLocaleString('id-ID')} kg berhasil dicatat. Lanjut ke Bongkar Muatan.`);

    promptSheetMutation({
      title: `Simpan Data Timbang Masuk (${targetTx.vehiclePlate}) ke Google Sheets?`,
      description: `Berat Gross ${grossWeight.toLocaleString('id-ID')} kg untuk tiket ${targetTx.ticketNumber} akan disimpan ke tab DATA_TRANSAKSI_TIMBANGAN.`,
      affectedTabs: [SHEET_TABS.TRANSACTIONS, SHEET_TABS.SCHEDULES, SHEET_TABS.AUDIT],
      nextPos: purchaseOrders,
      nextSchs: updatedSchs,
      nextTxs: updated,
      nextLogs,
    });
  };

  // Complete / Update QC-PA Lab (Independen setelah Timbang Keluar, tidak mengubah alur status atau hitungan jam operasional)
  const handleCompleteQC = async (
    txId: string,
    sampleId: string,
    samplingMethod: 'KADAR_AIR' | 'AUGUR_SAMPLER' | 'MANUAL_CORING' | 'CROSS_BELT' | 'GRAB' | 'RAPID_MOISTURE' | string,
    visual: VisualQC,
    lab: LabQCResults,
    decision: 'APPROVED' | 'CONDITIONAL_PENALTY' | 'REJECTED',
    stockpile: string,
    inspector: string,
    notes: string
  ) => {
    if (!requireRole('QC_LAB')) return;

    const targetTx = transactions.find((t) => t.id === txId);
    if (!targetTx) return;
    const qcTime = new Date().toISOString();
    const nextStockpile = stockpile || targetTx.assignedStockpile || targetTx.unloadingStockpile;
    const nextStatus = targetTx.status === 'QC_CHECK' ? ('BONGKAR' as const) : targetTx.status;

    const nowIso = new Date().toISOString();
    const updated = transactions.map((t) => {
      if (t.id !== txId) return t;
      return {
        ...t,
        sampleId,
        samplingMethod,
        visualAssessment: visual,
        labResults: lab,
        qcStatus: decision,
        assignedStockpile: nextStockpile,
        qcInspector: inspector,
        qcDecisionNotes: notes,
        qcTime,
        status: nextStatus,
        updatedAt: nowIso,
      };
    });

    const auditEntry = buildAuditEntry(
      'QC_LAB_UPDATE',
      'TRANSACTION',
      txId,
      `Update Uji Lab QC-PA ${targetTx.vehiclePlate} (${decision}) · Kalori ${lab.calorieGAR} kcal`
    );

    storageService.markLocalUpserts('transaction', [txId]);
    setTransactions(updated);
    storageService.saveTransactions(updated);
    const nextLogs = appendLocalAuditLog(auditEntry);

    const updatedTx = updated.find((t) => t.id === txId);
    if (updatedTx) {
      void persistToSimotubaFirebase(
        () => simotubaFirestoreService.saveTransaction(updatedTx),
        `QC-PA ${targetTx.vehiclePlate}`,
        () => storageService.markCloudUpsertsAcked('transaction', [updatedTx.id])
      );
    }

    showToast(
      `Data QC-PA untuk Nopol ${targetTx.vehiclePlate || txId} (${decision}) berhasil diperbarui oleh PIC QC.`
    );

    promptSheetMutation({
      title: `Simpan Hasil Uji Lab QC-PA (${sampleId}) ke Google Sheets?`,
      description: `Hasil Proximate Analysis (Kalori GAR ${lab.calorieGAR} kcal/kg, TM ${lab.totalMoisture}%, Ash ${lab.ashContent}%, Sulfur ${lab.totalSulfur}%, HGI ${lab.hgi}, Status ${decision}) untuk ${targetTx.vehiclePlate} akan diperbarui di tab DATA_TRANSAKSI_TIMBANGAN.`,
      affectedTabs: [SHEET_TABS.TRANSACTIONS, SHEET_TABS.AUDIT],
      nextPos: purchaseOrders,
      nextSchs: schedules,
      nextTxs: updated,
      nextLogs,
    });
  };

  // Complete Stockpile Unloading
  const handleCompleteUnloading = async (
    txId: string,
    checkerName: string,
    cleanDumpVerified: boolean,
    notes: string,
    customUnloadingEndTime?: string
  ) => {
    if (!requireRole('BONGKAR')) return;

    const targetTx = transactions.find((t) => t.id === txId);
    if (!targetTx) return;
    const nowIso = new Date().toISOString();
    const parsedCustomTime = customUnloadingEndTime ? new Date(customUnloadingEndTime) : null;
    const unloadingEndTime =
      parsedCustomTime && !Number.isNaN(parsedCustomTime.getTime())
        ? parsedCustomTime.toISOString()
        : nowIso;

    const updated = transactions.map((t) =>
      t.id === txId
        ? {
            ...t,
            unloadingChecker: checkerName,
            cleanDumpVerified,
            unloadingNotes: notes,
            unloadingEndTime,
            status: 'TIMBANG_KELUAR' as const,
            updatedAt: nowIso,
          }
        : t
    );

    const auditEntry = buildAuditEntry(
      'UNLOADING_COMPLETE',
      'TRANSACTION',
      txId,
      `Selesai Bongkar ${targetTx.vehiclePlate} (Checker: ${checkerName})`
    );

    storageService.markLocalUpserts('transaction', [txId]);
    setTransactions(updated);
    storageService.saveTransactions(updated);
    const updatedSchs = syncLinkedScheduleStatusLocal(targetTx, 'TIMBANG_KELUAR');
    const nextLogs = appendLocalAuditLog(auditEntry);

    const updatedTx = updated.find((t) => t.id === txId);
    const linkedSch = targetTx.scheduleId
      ? updatedSchs.find((s) => s.id === targetTx.scheduleId) || null
      : null;
    if (updatedTx) {
      void persistToSimotubaFirebase(
        () =>
          simotubaFirestoreService.saveTransactionBundle({
            transaction: updatedTx,
            schedule: linkedSch,
          }),
        `Bongkar ${targetTx.vehiclePlate}`,
        () => {
          storageService.markCloudUpsertsAcked('transaction', [updatedTx.id]);
          if (linkedSch) {
            storageService.markCloudUpsertsAcked('schedule', [linkedSch.id]);
          }
        }
      );
    }

    setSelectedTxId(txId);
    setActiveTab('weigh-out');
    showToast('Pembongkaran selesai. Truk kosong menuju Jembatan Timbang Keluar.');

    promptSheetMutation({
      title: `Simpan Status Bongkar Muatan (${targetTx.vehiclePlate}) ke Google Sheets?`,
      description: `Status selesai bongkar & verifikasi bak bersih (Checker: ${checkerName}) akan diperbarui di Google Spreadsheet.`,
      affectedTabs: [SHEET_TABS.TRANSACTIONS, SHEET_TABS.SCHEDULES, SHEET_TABS.AUDIT],
      nextPos: purchaseOrders,
      nextSchs: updatedSchs,
      nextTxs: updated,
      nextLogs,
    });
  };

  // Complete Weigh Out Tare & Netto Finalize -> Masuk Tahap Akhir Pos Security (Gate Out)
  const handleCompleteWeighOut = async (
    txId: string,
    tareWeight: number,
    operatorName: string,
    scaleId: string,
    gateOutOfficer: string,
    customWeighOutTime?: string,
    weighOutNotes?: string
  ) => {
    if (!requireRole('TIMBANG_KELUAR')) return;

    const targetTx = transactions.find((t) => t.id === txId);
    if (!targetTx) return;
    if (tareWeight <= 0 || tareWeight >= targetTx.grossWeight) {
      showToast('Berat Tare tidak valid (harus > 0 dan lebih kecil dari Gross Weight).');
      return;
    }

    const po = purchaseOrders.find((p) => p.id === targetTx.poId);
    const tol = po?.tolerancePercentage || 5;
    const metrics = calculateToleranceMetrics({
      grossWeight: targetTx.grossWeight,
      tareWeight,
      suratJalanWeight: targetTx.suratJalanWeight,
      tolerancePercentage: tol,
    });
    const nowIso = new Date().toISOString();
    const parsedCustomTime = customWeighOutTime ? new Date(customWeighOutTime) : null;
    const weighOutTime =
      parsedCustomTime && !Number.isNaN(parsedCustomTime.getTime())
        ? parsedCustomTime.toISOString()
        : nowIso;
    const trimmedNotes = weighOutNotes?.trim();

    const updated = transactions.map((t) =>
      t.id === txId
        ? {
            ...t,
            tareWeight,
            weighOutTime,
            weighOutOperator: operatorName,
            weighOutScaleId: scaleId,
            nettoWeight: metrics.nettoWeight,
            nettoTons: metrics.nettoTons,
            weightDifference: metrics.weightDifference,
            shrinkagePercentage: metrics.shrinkagePercentage,
            toleranceStatus: metrics.toleranceStatus,
            claimPenaltyKg: metrics.claimPenaltyKg,
            ...(trimmedNotes ? { weighOutNotes: trimmedNotes } : {}),
            gateOutOfficer,
            status: 'GATE_OUT' as const,
            updatedAt: nowIso,
          }
        : t
    );

    const auditEntry = buildAuditEntry(
      'WEIGH_OUT_TARE',
      'TRANSACTION',
      txId,
      `Timbang Keluar ${targetTx.vehiclePlate}: Tare ${tareWeight.toLocaleString('id-ID')} kg · Netto ${metrics.nettoTons.toFixed(2)} Ton (${metrics.shrinkagePercentage.toFixed(2)}%)`
    );

    storageService.markLocalUpserts('transaction', [txId]);
    setTransactions(updated);
    storageService.saveTransactions(updated);
    const updatedSchs = syncLinkedScheduleStatusLocal(targetTx, 'GATE_OUT');
    const nextLogs = appendLocalAuditLog(auditEntry);

    const updatedTx = updated.find((t) => t.id === txId);
    const linkedSch = targetTx.scheduleId
      ? updatedSchs.find((s) => s.id === targetTx.scheduleId) || null
      : null;
    if (updatedTx) {
      void persistToSimotubaFirebase(
        () =>
          simotubaFirestoreService.saveTransactionBundle({
            transaction: updatedTx,
            schedule: linkedSch,
          }),
        `Timbang Keluar ${targetTx.vehiclePlate}`,
        () => {
          storageService.markCloudUpsertsAcked('transaction', [updatedTx.id]);
          if (linkedSch) {
            storageService.markCloudUpsertsAcked('schedule', [linkedSch.id]);
          }
        }
      );
    }

    setSelectedTxId(txId);
    setSecuritySubTab('GATE_OUT');
    setActiveTab('security');
    showToast(`Timbang Keluar selesai! Netto: ${metrics.nettoTons.toFixed(2)} Ton. Truk ${targetTx.vehiclePlate} diarahkan ke Pos Security (Gate Out) untuk pengeluaran akhir.`);

    promptSheetMutation({
      title: `Simpan Data Timbang Keluar & Netto (${targetTx.vehiclePlate}) ke Google Sheets?`,
      description: `Berat Tare ${tareWeight.toLocaleString('id-ID')} kg dan Netto ${metrics.nettoTons.toFixed(2)} Ton akan disimpan ke tab DATA_TRANSAKSI_TIMBANGAN.`,
      affectedTabs: [SHEET_TABS.TRANSACTIONS, SHEET_TABS.SCHEDULES, SHEET_TABS.AUDIT],
      nextPos: purchaseOrders,
      nextSchs: updatedSchs,
      nextTxs: updated,
      nextLogs,
    });
  };

  // Complete Gate Out at Pos Security (Final Stage of Full Pipeline)
  const handleCompleteGateOut = async (
    txId: string,
    officerName: string,
    customGateOutTime?: string,
    gateOutNotes?: string
  ) => {
    if (!requireRole('SECURITY')) return;

    const existingTx = transactions.find((t) => t.id === txId);
    if (!existingTx) return;

    const nowIso = new Date().toISOString();
    const parsedCustomTime = customGateOutTime ? new Date(customGateOutTime) : null;
    const gateOutTime =
      parsedCustomTime && !Number.isNaN(parsedCustomTime.getTime())
        ? parsedCustomTime.toISOString()
        : nowIso;
    const trimmedNotes = gateOutNotes?.trim();
    const finalTx: CoalTransaction = {
      ...existingTx,
      gateOutTime,
      gateOutOfficer: officerName,
      ...(trimmedNotes ? { gateOutNotes: trimmedNotes } : {}),
      status: 'COMPLETED' as const,
      updatedAt: nowIso,
    };

    const updated = transactions.map((t) => (t.id === txId ? finalTx : t));
    const nettoKgAdded = finalTx.nettoWeight || (finalTx.nettoTons || 0) * 1000;
    const targetPoId = finalTx.poId;
    const targetPo = purchaseOrders.find((po) => po.id === targetPoId);
    const nextReceivedTonnageKg = Math.round((targetPo?.receivedTonnage || 0) + nettoKgAdded);

    const updatedPos = purchaseOrders.map((po) =>
      po.id === targetPoId
        ? { ...po, receivedTonnage: nextReceivedTonnageKg, updatedAt: nowIso }
        : po
    );

    const auditEntry = buildAuditEntry(
      'COMPLETE_GATE_OUT',
      'TRANSACTION',
      txId,
      `Gate Out Selesai ${finalTx.vehiclePlate} · Netto ${(nettoKgAdded / 1000).toFixed(2)} Ton (Petugas: ${officerName})`
    );

    storageService.markLocalUpserts('transaction', [txId]);
    if (targetPo) {
      storageService.markLocalUpserts('po', [targetPoId]);
    }
    setTransactions(updated);
    setPurchaseOrders(updatedPos);
    storageService.saveTransactions(updated);
    storageService.savePurchaseOrders(updatedPos);
    const updatedSchs = syncLinkedScheduleStatusLocal(finalTx, 'COMPLETED');
    const nextLogs = appendLocalAuditLog(auditEntry);

    const linkedSch = finalTx.scheduleId
      ? updatedSchs.find((s) => s.id === finalTx.scheduleId) || null
      : null;
    const updatedPo = updatedPos.find((po) => po.id === targetPoId) || null;
    void persistToSimotubaFirebase(
      () =>
        simotubaFirestoreService.saveTransactionBundle({
          transaction: finalTx,
          schedule: linkedSch,
          po: updatedPo,
        }),
      `Gate Out ${finalTx.vehiclePlate}`,
      () => {
        storageService.markCloudUpsertsAcked('transaction', [finalTx.id]);
        if (linkedSch) storageService.markCloudUpsertsAcked('schedule', [linkedSch.id]);
        if (updatedPo) storageService.markCloudUpsertsAcked('po', [updatedPo.id]);
      }
    );

    const dur = calculateDuration(finalTx.gateInTime, finalTx.gateOutTime);
    showToast(`Penyelesaian Armada Sukses! Nopol ${finalTx.vehiclePlate} resmi keluar dari Pos Security. Total Waktu Operasional: ${dur.text}.`);
    setPrintingTx(finalTx);

    promptSheetMutation({
      title: `Simpan Penyelesaian Gate Out (${finalTx.vehiclePlate}) ke Google Sheets?`,
      description: `Status armada ${finalTx.vehiclePlate} menjadi COMPLETED dan realisasi kuota PO ${finalTx.poNumber} akan diperbarui (+${nettoKgAdded.toLocaleString('id-ID')} kg) pada Google Spreadsheet.`,
      affectedTabs: [
        SHEET_TABS.TRANSACTIONS,
        SHEET_TABS.PO,
        SHEET_TABS.SCHEDULES,
        SHEET_TABS.AUDIT,
      ],
      nextPos: updatedPos,
      nextSchs: updatedSchs,
      nextTxs: updated,
      nextLogs,
    });
  };

  // Update Transaction from Riwayat Operasional Batubara (Edit jam, berat, data armada, petugas)
  const handleUpdateTransaction = async (updatedTx: CoalTransaction) => {
    if (!requireRole('ADMIN')) return;

    const existingTx = transactions.find((t) => t.id === updatedTx.id);
    if (!existingTx) return;

    const nowIso = new Date().toISOString();
    const stampedTx: CoalTransaction = { ...updatedTx, updatedAt: nowIso };
    const updatedTransactions = transactions.map((t) =>
      t.id === stampedTx.id ? stampedTx : t
    );

    let updatedPos = purchaseOrders;
    let poDeltaUpdate: { poId: string; receivedTonnage: number } | null = null;
    if (existingTx.status === 'COMPLETED' && stampedTx.status === 'COMPLETED') {
      const oldNetto = existingTx.nettoWeight || (existingTx.nettoTons || 0) * 1000;
      const newNetto = stampedTx.nettoWeight || (stampedTx.nettoTons || 0) * 1000;
      const deltaKg = newNetto - oldNetto;
      if (deltaKg !== 0) {
        const targetPo = purchaseOrders.find((po) => po.id === stampedTx.poId);
        const nextReceived = Math.max(0, Math.round((targetPo?.receivedTonnage || 0) + deltaKg));
        poDeltaUpdate = { poId: stampedTx.poId, receivedTonnage: nextReceived };
        updatedPos = purchaseOrders.map((po) =>
          po.id === stampedTx.poId
            ? { ...po, receivedTonnage: nextReceived, updatedAt: nowIso }
            : po
        );
      }
    }

    const auditEntry = buildAuditEntry(
      'ADMIN_EDIT_TRANSACTION',
      'TRANSACTION',
      stampedTx.id,
      `Revisi riwayat ${stampedTx.vehiclePlate} (${stampedTx.ticketNumber})`,
      `Netto: ${stampedTx.nettoTons.toFixed(2)} Ton`
    );

    storageService.markLocalUpserts('transaction', [stampedTx.id]);
    if (poDeltaUpdate) {
      storageService.markLocalUpserts('po', [poDeltaUpdate.poId]);
      setPurchaseOrders(updatedPos);
      storageService.savePurchaseOrders(updatedPos);
    }
    setTransactions(updatedTransactions);
    storageService.saveTransactions(updatedTransactions);
    const nextLogs = appendLocalAuditLog(auditEntry);

    const updatedPoIfChanged = poDeltaUpdate
      ? updatedPos.find((po) => po.id === poDeltaUpdate?.poId) || null
      : null;
    void persistToSimotubaFirebase(
      () =>
        simotubaFirestoreService.saveTransactionBundle({
          transaction: stampedTx,
          po: updatedPoIfChanged,
        }),
      `Revisi ${stampedTx.vehiclePlate}`,
      () => {
        storageService.markCloudUpsertsAcked('transaction', [stampedTx.id]);
        if (updatedPoIfChanged) {
          storageService.markCloudUpsertsAcked('po', [updatedPoIfChanged.id]);
        }
      }
    );

    showToast(`Data operasional ${updatedTx.vehiclePlate} (${updatedTx.ticketNumber}) berhasil diperbarui.`);

    promptSheetMutation({
      title: `Perbarui Revisi Transaksi ${updatedTx.vehiclePlate} di Google Sheets?`,
      description: `Revisi tiket ${updatedTx.ticketNumber} (Netto: ${updatedTx.nettoTons.toFixed(2)} Ton) akan diperbarui di tab DATA_TRANSAKSI_TIMBANGAN${poDeltaUpdate ? ' dan DATA_PURCHASE_ORDER' : ''}.`,
      affectedTabs: [
        SHEET_TABS.TRANSACTIONS,
        ...(poDeltaUpdate ? [SHEET_TABS.PO] : []),
        SHEET_TABS.AUDIT,
      ],
      nextPos: updatedPos,
      nextSchs: schedules,
      nextTxs: updatedTransactions,
      nextLogs,
    });
  };

  // Open in-app reset confirmation modal
  const handleResetData = () => {
    if (!requireRole('ADMIN')) return;
    setIsResetModalOpen(true);
  };

  // Confirm & clear all data (PO, Schedules, Transactions)
  const handleConfirmResetData = async () => {
    if (!requireRole('ADMIN')) return;
    const auditEntry = buildAuditEntry(
      'RESET_ALL_DATA',
      'SYSTEM',
      'ALL_COLLECTIONS',
      `Reset seluruh data operasional (${purchaseOrders.length} PO, ${schedules.length} Jadwal, ${transactions.length} Transaksi)`
    );

    storageService.clearAllData();
    storageService.markPendingClearAll(true);
    setPurchaseOrders([]);
    setSchedules([]);
    setTransactions([]);
    setCoalOutgoing([]);
    const nextLogs = appendLocalAuditLog(auditEntry);

    void persistToSimotubaFirebase(
      () => simotubaFirestoreService.clearAllCollections(),
      'Reset Data',
      () => storageService.clearSyncState()
    );

    setSelectedTxId(undefined);
    setSelectedScheduleForGateIn(null);
    setSelectedPoForSchedule(null);
    setPrintingTx(null);
    setIsResetModalOpen(false);
    showToast('Semua data lokal & Firebase (PO, Jadwal, dan Transaksi) berhasil dikosongkan.');

    if (isSheetsDbConfigured) {
      promptSheetMutation({
        title: 'Kosongkan Semua Data di Google Sheets Juga?',
        description:
          'Data lokal telah direset. Apakah Anda juga ingin mengosongkan seluruh baris data (PO, Jadwal, Transaksi & PA) di Google Spreadsheet yang terhubung?',
        affectedTabs: [
          SHEET_TABS.PO,
          SHEET_TABS.SCHEDULES,
          SHEET_TABS.TRANSACTIONS,
          SHEET_TABS.AUDIT,
        ],
        nextPos: [],
        nextSchs: [],
        nextTxs: [],
        nextLogs,
        isDestructive: true,
        confirmLabel: 'Ya, Kosongkan Google Sheet',
      });
    }
  };

  // Export JSON Backup
  const handleExportBackup = () => {
    const payload = {
      version: '2.1',
      exportedAt: new Date().toISOString(),
      purchaseOrders,
      schedules,
      transactions,
      coalOutgoing,
      sheetConfig,
      auditLogs,
    };
    const jsonStr = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `backup_sistem_batubara_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Cadangan data JSON berhasil diunduh.');
  };

  // Import JSON Backup
  const handleImportBackup = async (jsonStr: string) => {
    if (!requireRole('ADMIN')) return;
    const success = storageService.importBackupJSON(jsonStr);
    if (success) {
      const nowIso = new Date().toISOString();
      const nextPos = storageService.getPurchaseOrders().map((p) => ({
        ...p,
        createdAt: p.createdAt || nowIso,
        updatedAt: nowIso,
      }));
      const nextSchs = storageService.getSchedules().map((s) => ({
        ...s,
        createdAt: s.createdAt || nowIso,
        updatedAt: nowIso,
      }));
      const nextTxs = storageService.getTransactions().map((t) => ({
        ...t,
        createdAt: t.createdAt || nowIso,
        updatedAt: nowIso,
      }));
      const nextCfg = storageService.getSheetConfig();

      storageService.savePurchaseOrders(nextPos);
      storageService.saveSchedules(nextSchs);
      storageService.saveTransactions(nextTxs);
      storageService.markLocalUpserts('po', nextPos.map((p) => p.id));
      storageService.markLocalUpserts('schedule', nextSchs.map((s) => s.id));
      storageService.markLocalUpserts('transaction', nextTxs.map((t) => t.id));

      setPurchaseOrders(nextPos);
      setSchedules(nextSchs);
      setTransactions(nextTxs);
      setCoalOutgoing(storageService.getCoalOutgoing());
      setSheetConfig(nextCfg);
      const nextLogs = appendLocalAuditLog(
        buildAuditEntry(
          'IMPORT_BACKUP_JSON',
          'SYSTEM',
          'BACKUP_RESTORE',
          `Pulihkan backup JSON lokal (${nextPos.length} PO, ${nextSchs.length} Jadwal, ${nextTxs.length} Transaksi)`
        )
      );

      void persistToSimotubaFirebase(
        () => simotubaFirestoreService.replaceAllCollections(nextPos, nextSchs, nextTxs),
        'Restore Backup JSON',
        () => {
          storageService.markCloudUpsertsAcked('po', nextPos.map((p) => p.id));
          storageService.markCloudUpsertsAcked('schedule', nextSchs.map((s) => s.id));
          storageService.markCloudUpsertsAcked('transaction', nextTxs.map((t) => t.id));
        }
      );

      showToast('Cadangan data berhasil dipulihkan!');

      promptSheetMutation({
        title: 'Timpa Google Sheets dengan Data Backup JSON?',
        description: `Backup berisi ${nextPos.length} PO, ${nextSchs.length} Jadwal, dan ${nextTxs.length} Transaksi berhasil dimuat secara lokal. Apakah Anda ingin memperbarui Google Spreadsheet dengan data ini?`,
        affectedTabs: [
          SHEET_TABS.PO,
          SHEET_TABS.SCHEDULES,
          SHEET_TABS.TRANSACTIONS,
          SHEET_TABS.AUDIT,
        ],
        nextPos,
        nextSchs,
        nextTxs,
        nextLogs,
        isDestructive: true,
        confirmLabel: 'Ya, Perbarui Google Sheet',
      });
    } else {
      showToast('Format berkas cadangan JSON tidak valid.');
    }
  };

  // Save Google Sheet config
  const handleSaveSheetConfig = async (newCfg: GoogleSheetConfig) => {
    setSheetConfig(newCfg);
    storageService.saveSheetConfig(newCfg);

    appendLocalAuditLog(
      buildAuditEntry(
        'UPDATE_GOOGLE_SHEET_CONFIG',
        'SYSTEM',
        'GOOGLE_SHEET',
        `Simpan konfigurasi Google Sheets (${newCfg.spreadsheetTitle || newCfg.sheetName})`
      )
    );
    showToast('Konfigurasi Google Sheets berhasil disimpan.');
  };

  // Queue Counts (QC-PA dihitung dari armada pasca Timbang Keluar yang belum diupdate PIC QC)
  const queueCounts = {
    security: transactions.filter((t) => t.status === 'GATE_IN' || t.status === 'GATE_OUT').length + schedules.filter((s) => s.status === 'ON_WAY' || s.status === 'SCHEDULED').length,
    weighIn: transactions.filter((t) => t.status === 'TIMBANG_MASUK').length,
    qc: transactions.filter((t) => (Boolean(t.weighOutTime) || t.status === 'GATE_OUT' || t.status === 'COMPLETED') && !t.qcTime).length,
    unloading: transactions.filter((t) => t.status === 'BONGKAR' || t.status === 'QC_CHECK').length,
    weighOut: transactions.filter((t) => t.status === 'TIMBANG_KELUAR').length,
  };

  // Handlers Operasional Pengeluaran Batubara Harian
  const handleAddCoalOutgoing = (
    data: Omit<CoalOutgoingRecord, 'id' | 'createdAt' | 'updatedAt'>
  ) => {
    const nowIso = new Date().toISOString();
    const newRecord: CoalOutgoingRecord = {
      ...data,
      id: `OUT-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    const next = [newRecord, ...coalOutgoing];
    setCoalOutgoing(next);
    storageService.saveCoalOutgoing(next);
    appendLocalAuditLog(
      buildAuditEntry(
        'ADD_COAL_OUTGOING',
        'SYSTEM',
        newRecord.id,
        `Input Pengeluaran Batubara: ${newRecord.quantityKg.toLocaleString('id-ID')} Kg (${newRecord.quantityTons.toFixed(2)} Ton) ke ${newRecord.destinationUnit} (${newRecord.shift})`
      )
    );
    showToast(
      `Pengeluaran ${newRecord.quantityKg.toLocaleString('id-ID')} Kg ke ${newRecord.destinationUnit} berhasil dicatat.`
    );
  };

  const handleUpdateCoalOutgoing = (updated: CoalOutgoingRecord) => {
    const next = coalOutgoing.map((r) => (r.id === updated.id ? updated : r));
    setCoalOutgoing(next);
    storageService.saveCoalOutgoing(next);
    appendLocalAuditLog(
      buildAuditEntry(
        'UPDATE_COAL_OUTGOING',
        'SYSTEM',
        updated.id,
        `Update Pengeluaran Batubara: ${updated.quantityKg.toLocaleString('id-ID')} Kg ke ${updated.destinationUnit} (${updated.shift})`
      )
    );
    showToast(`Data pengeluaran batubara (${updated.destinationUnit}) berhasil diperbarui.`);
  };

  const handleDeleteCoalOutgoing = (id: string) => {
    const target = coalOutgoing.find((r) => r.id === id);
    const next = coalOutgoing.filter((r) => r.id !== id);
    setCoalOutgoing(next);
    storageService.saveCoalOutgoing(next);
    if (target) {
      appendLocalAuditLog(
        buildAuditEntry(
          'DELETE_COAL_OUTGOING',
          'SYSTEM',
          id,
          `Hapus Pengeluaran Batubara: ${target.quantityKg.toLocaleString('id-ID')} Kg (${target.destinationUnit} · ${target.date})`
        )
      );
    }
    showToast('Data pengeluaran batubara berhasil dihapus.');
  };

  const handleNavigateWithFilter = (tab: ActiveTab, filterId?: string) => {
    if (filterId) {
      setSelectedTxId(filterId);
    }
    setActiveTab(tab);
  };

  return (
    <div className="flex h-screen overflow-hidden font-sans selection:bg-amber-500 selection:text-slate-950 bg-slate-100 text-slate-900 light-mode">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-amber-500 text-slate-950 px-4 py-2.5 rounded-lg shadow-xl font-bold text-xs flex items-center gap-2 border border-amber-400">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Modern Sidebar with per-section Accordion Toggles & Collapse support */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        queueCounts={queueCounts}
      />

      {/* Main Layout Area: TopHeader + Scrollable Main Content + Footer */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        <TopHeader
          activeTab={activeTab}
          onToggleSidebarMobile={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
          onToggleSidebarCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          isSidebarCollapsed={isSidebarCollapsed}
          sheetConfig={sheetConfig}
          onTriggerSync={() => executeSync()}
          isSyncing={isSyncing}
          onResetData={handleResetData}
          onExportBackup={handleExportBackup}
          onImportBackup={handleImportBackup}
          pendingSheetSync={hasPendingSheetChanges}
          onOpenSheetsHub={() => setActiveTab('googlesheet')}
          isAdminUser={isAdminUser}
        />

        {/* Main Viewport Container */}
        <main className="flex-1 w-full px-3 sm:px-5 lg:px-6 py-4 sm:py-6 pb-24 lg:pb-8">
          {/* Prompt reconnect when spreadsheet is linked but in-memory token needs refresh */}
          {isSheetsDbConfigured && !hasSheetsToken && activeTab !== 'googlesheet' && (
            <div className="mb-4 p-3.5 bg-amber-50 border border-amber-300 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-amber-700 shrink-0" />
                <span>
                  <strong>Database Google Sheets ({sheetConfig.spreadsheetTitle || sheetConfig.spreadsheetId}):</strong> Hubungkan kembali akun Google Anda untuk membaca &amp; menyimpan perubahan ke Google Spreadsheet.
                </span>
              </div>
              <button
                type="button"
                disabled={isCloudBusy}
                onClick={handleGoogleLogin}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                Hubungkan Google Sheets
              </button>
            </div>
          )}

          {/* Prompt user when local changes are pending sync to Google Sheet */}
          {isSheetsDbReady && hasPendingSheetChanges && activeTab !== 'googlesheet' && (
            <div className="mb-4 p-3.5 bg-sky-50 border border-sky-300 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs text-sky-950">
              <span>
                <strong>Perubahan Belum Disimpan ke Google Sheet:</strong> Ada data PO / Jadwal / Timbangan / QC-PA baru yang siap dikirim ke <strong>{sheetConfig.spreadsheetTitle}</strong>.
              </span>
              <button
                type="button"
                disabled={isSyncing || isCloudBusy}
                onClick={() => executeSync()}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                Simpan Perubahan ke Google Sheet
              </button>
            </div>
          )}

          {activeTab === 'dashboard' && (
            <DashboardOverview
              purchaseOrders={purchaseOrders}
              schedules={schedules}
              transactions={transactions}
              onNavigate={handleNavigateWithFilter}
              onOpenTicket={(tx) => setPrintingTx(tx)}
              onCheckInSchedule={handleScheduleCheckInDirect}
              onDeleteTransaction={handleDeleteTransaction}
            />
          )}

          {activeTab === 'po' && (
            <PoManagement
              purchaseOrders={purchaseOrders}
              schedules={schedules}
              transactions={transactions}
              isAdmin={isAdminUser}
              onSavePo={handleSavePo}
              onCreateScheduleForPo={handleCreateScheduleForPo}
              onUpdatePo={handleUpdatePo}
              onDeletePo={handleDeletePo}
            />
          )}

          {activeTab === 'schedules' && (
            <ScheduleArrivals
              schedules={schedules}
              purchaseOrders={purchaseOrders}
              transactions={transactions}
              isAdmin={isAdminUser}
              onSaveSchedule={handleSaveSchedule}
              onCheckInToSecurity={handleScheduleCheckInDirect}
              onUpdateSchedule={handleUpdateSchedule}
              onDeleteSchedule={handleDeleteSchedule}
              initialPoId={selectedPoForSchedule}
              onClearInitialPoId={() => setSelectedPoForSchedule(null)}
            />
          )}

          {activeTab === 'security' && (
            <PosSecurity
              transactions={transactions}
              purchaseOrders={purchaseOrders}
              schedules={schedules}
              onCheckInTruck={handleCheckInTruck}
              onAdvanceToWeighIn={handleAdvanceToWeighIn}
              preselectedSchedule={selectedScheduleForGateIn}
              onCompleteGateOut={handleCompleteGateOut}
              onOpenTicket={(tx) => setPrintingTx(tx)}
              onUpdateSchedule={handleUpdateSchedule}
              onDeleteSchedule={handleDeleteSchedule}
              initialSubTab={securitySubTab}
            />
          )}

          {activeTab === 'weigh-in' && (
            <WeighbridgeInbound
              transactions={transactions}
              onCompleteWeighIn={handleCompleteWeighIn}
              selectedTxId={selectedTxId}
            />
          )}

          {activeTab === 'qc' && (
            <QCLabCheck
              transactions={transactions}
              purchaseOrders={purchaseOrders}
              onCompleteQC={handleCompleteQC}
              selectedTxId={selectedTxId}
            />
          )}

          {activeTab === 'unloading' && (
            <UnloadingStockpile
              transactions={transactions}
              onCompleteUnloading={handleCompleteUnloading}
              selectedTxId={selectedTxId}
            />
          )}

          {activeTab === 'weigh-out' && (
            <WeighbridgeOutbound
              transactions={transactions}
              purchaseOrders={purchaseOrders}
              onCompleteWeighOut={handleCompleteWeighOut}
              onOpenPrintTicket={(tx) => setPrintingTx(tx)}
              selectedTxId={selectedTxId}
            />
          )}

          {activeTab === 'transactions' && (
            <TransactionsTable
              transactions={transactions}
              purchaseOrders={purchaseOrders}
              schedules={schedules}
              onOpenTicket={(tx) => setPrintingTx(tx)}
              onNavigateToStage={handleNavigateWithFilter}
              onUpdateTransaction={handleUpdateTransaction}
              canEditTransactions={isAdminUser}
            />
          )}

          {activeTab === 'googlesheet' && (
            <GoogleSheetSyncModal
              config={sheetConfig}
              onSaveConfig={handleSaveSheetConfig}
              transactions={transactions}
              purchaseOrders={purchaseOrders}
              schedules={schedules}
              onTriggerSync={() => executeWebhookSync()}
              isSyncing={isSyncing}
              hasSheetsToken={hasSheetsToken}
              googleUserEmail={firebaseUser?.email}
              isBusySheets={isCloudBusy || isSyncing}
              pendingLocalChanges={hasPendingSheetChanges}
              onSignInForSheets={handleGoogleLogin}
              onCreateNewSpreadsheet={handleCreateNewSpreadsheet}
              onConnectExistingSpreadsheet={handleConnectExistingSpreadsheet}
              onLoadFromSheet={handleLoadFromSheet}
              onWriteFullToSheet={() => executeSync()}
              onDisconnectSheet={handleDisconnectSheet}
              sheetsFeedback={sheetsFeedback}
              onClearSheetsFeedback={() => setSheetsFeedback(null)}
            />
          )}

          {activeTab === 'coal-outgoing' && (
            <CoalOutgoingOperational
              records={coalOutgoing}
              transactions={transactions}
              purchaseOrders={purchaseOrders}
              onAddRecord={handleAddCoalOutgoing}
              onUpdateRecord={handleUpdateCoalOutgoing}
              onDeleteRecord={handleDeleteCoalOutgoing}
            />
          )}
        </main>

        {/* Footer */}
        <footer className="border-t border-slate-900 bg-slate-950/80 py-4 text-center text-xs text-slate-500 mt-auto">
          <div className="w-full px-3 sm:px-5 lg:px-6 flex items-center justify-center">
            <div>
              SIMOTUBA · Sistem Monitoring Operasional Batubara & Jembatan Timbang Real-Time
            </div>
          </div>
        </footer>
      </div>

      {/* Mobile Bottom App Navigation Bar (Only on mobile viewport) */}
      <MobileBottomNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenSidebar={() => setIsMobileSidebarOpen(true)}
        queueCounts={queueCounts}
      />

      {/* Printable Ticket Modal */}
      {printingTx && (
        <PrintableTicketModal
          transaction={printingTx}
          purchaseOrder={purchaseOrders.find((p) => p.id === printingTx.poId)}
          onClose={() => setPrintingTx(null)}
        />
      )}

      {/* Mandatory Confirmation Dialog Before Any Google Sheet Mutation/Overwrite/Delete */}
      <SheetMutationConfirmModal
        request={sheetConfirmRequest}
        isBusy={isSyncing || isCloudBusy}
        onClose={() => setSheetConfirmRequest(null)}
      />

      {/* In-App Reset All Data Confirmation Modal */}
      {isResetModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => setIsResetModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-modal-title"
            className="w-full max-w-lg rounded-xl bg-white border border-slate-300 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-rose-50/70">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-700 shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="reset-modal-title" className="text-sm font-bold text-slate-900">
                    Apakah Anda yakin ingin reset data?
                  </h3>
                  <p className="text-xs text-slate-600">
                    Konfirmasi pengosongan seluruh data operasional & dummy
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsResetModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200/70 transition-colors cursor-pointer"
                title="Tutup"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="rounded-lg border border-rose-200 bg-rose-50/80 p-3.5 space-y-2">
                <p className="text-xs font-bold text-rose-900">
                  Perhatian — Efek / Dampak Jika Reset Dilanjutkan:
                </p>
                <ul className="list-disc pl-4 space-y-1 text-xs text-rose-900 leading-relaxed">
                  <li>
                    Seluruh data <strong>Purchase Order (PO)</strong>, <strong>Jadwal Pengiriman</strong>, dan <strong>Riwayat Transaksi</strong> akan dihapus permanen hingga kosong (0).
                  </li>
                  <li>
                    Semua truk yang masih berada di antrean aktif (Pos Security, Timbang Masuk, Bongkar, Timbang Keluar, dan QC-PA) ikut terhapus.
                  </li>
                  <li>
                    Seluruh kalkulasi grafik, total tonase, dan persentase deviasi susut di Dashboard akan kembali ke nol dan <strong>tidak dapat dibatalkan</strong> tanpa file cadangan JSON.
                  </li>
                </ul>
              </div>

              <div className="grid grid-cols-3 gap-2.5 text-center">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                  <div className="text-lg font-bold font-mono-num text-slate-900">
                    {purchaseOrders.length}
                  </div>
                  <div className="text-[11px] font-medium text-slate-600">Data PO</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                  <div className="text-lg font-bold font-mono-num text-slate-900">
                    {schedules.length}
                  </div>
                  <div className="text-[11px] font-medium text-slate-600">Jadwal</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                  <div className="text-lg font-bold font-mono-num text-slate-900">
                    {transactions.length}
                  </div>
                  <div className="text-[11px] font-medium text-slate-600">Transaksi</div>
                </div>
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
                Pengaturan koneksi Google Sheets tetap aman. Jika masih ragu, simpan cadangan JSON terlebih dahulu sebelum melanjutkan reset.
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 border-t border-slate-200 bg-slate-50">
              <button
                type="button"
                onClick={handleExportBackup}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Unduh Backup JSON
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsResetModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleConfirmResetData}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-rose-100 hover:bg-rose-200 text-rose-900 border border-rose-300 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Ya, Yakin Reset Data
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
