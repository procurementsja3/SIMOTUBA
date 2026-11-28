import {
  PurchaseOrder,
  ArrivalSchedule,
  CoalTransaction,
  GoogleSheetConfig,
  AuditLogEntry,
  CoalOutgoingRecord,
} from '../types/coal';
import {
  INITIAL_PURCHASE_ORDERS,
  INITIAL_SCHEDULES,
  INITIAL_TRANSACTIONS,
} from '../data/initialData';
import { calculateToleranceMetrics } from '../utils/toleranceUtils';
import {
  normalizePurchaseOrdersSupplier,
  normalizeSchedulesSupplier,
  normalizeTransactionsSupplier,
  normalizeAuditLogsSupplier,
} from '../utils/supplierUtils';
import {
  REMOVED_PO_SCHEDULE_IDS,
  REMOVED_PO_TRANSACTION_IDS,
  RESTORED_BORNEO_PO_ID,
  sanitizePurchaseOrdersForRemovedPo,
  sanitizeSchedulesForRemovedPo,
  sanitizeTransactionsForRemovedPo,
  sanitizeAuditLogsForRemovedPo,
} from '../utils/poCleanupUtils';

const STORAGE_KEYS = {
  PURCHASE_ORDERS: 'coal_monitor_pos_v2',
  SCHEDULES: 'coal_monitor_schedules_v2',
  TRANSACTIONS: 'coal_monitor_transactions_v2',
  SHEET_CONFIG: 'coal_monitor_sheet_config_v2',
  AUDIT_LOGS: 'coal_monitor_audit_logs_v1',
  COAL_OUTGOING: 'coal_monitor_outgoing_v1',
  CLEARED_DUMMY_FLAG: 'coal_monitor_cleared_dummy_v2_done',
  SYNC_STATE: 'coal_monitor_cloud_sync_state_v1',
};

export type SyncEntityKind = 'po' | 'schedule' | 'transaction';

export interface PendingCloudSyncState {
  upsertPoIds: string[];
  upsertScheduleIds: string[];
  upsertTransactionIds: string[];
  deletePoIds: string[];
  deleteScheduleIds: string[];
  deleteTransactionIds: string[];
  knownCloudPoIds: string[];
  knownCloudScheduleIds: string[];
  knownCloudTransactionIds: string[];
  pendingClearAll: boolean;
}

const createEmptySyncState = (): PendingCloudSyncState => ({
  upsertPoIds: [],
  upsertScheduleIds: [],
  upsertTransactionIds: [],
  deletePoIds: [],
  deleteScheduleIds: [],
  deleteTransactionIds: [],
  knownCloudPoIds: [],
  knownCloudScheduleIds: [],
  knownCloudTransactionIds: [],
  pendingClearAll: false,
});

const getSyncKeyNames = (kind: SyncEntityKind) => {
  if (kind === 'po') {
    return {
      upsertKey: 'upsertPoIds' as const,
      deleteKey: 'deletePoIds' as const,
      knownKey: 'knownCloudPoIds' as const,
    };
  }
  if (kind === 'schedule') {
    return {
      upsertKey: 'upsertScheduleIds' as const,
      deleteKey: 'deleteScheduleIds' as const,
      knownKey: 'knownCloudScheduleIds' as const,
    };
  }
  return {
    upsertKey: 'upsertTransactionIds' as const,
    deleteKey: 'deleteTransactionIds' as const,
    knownKey: 'knownCloudTransactionIds' as const,
  };
};

const uniqueIds = (ids: string[]): string[] => Array.from(new Set(ids.filter(Boolean)));

const parseTimestampMs = (val?: string): number => {
  if (!val) return 0;
  const ms = new Date(val).getTime();
  return Number.isNaN(ms) ? 0 : ms;
};

const DEFAULT_SHEET_CONFIG: GoogleSheetConfig = {
  mode: 'SHEETS_API',
  spreadsheetId: '',
  spreadsheetUrl: '',
  spreadsheetTitle: '',
  databaseEnabled: false,
  webhookUrl: '',
  sheetName: 'SIMOTUBA_Database_Batubara',
  autoSyncEnabled: false,
  syncStatus: 'IDLE',
};

// Purge any dummy data stored in browser storage
const DUMMY_PURGE_FLAG = 'coal_monitor_dummy_purged_v4';
const TOLERANCE_5PCT_FLAG = 'coal_monitor_tolerance_5pct_v2';
const PO_4T260555_PURGE_FLAG = 'coal_monitor_purge_4T260555_v1';

const purgeDummyData = (): void => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    if (localStorage.getItem(DUMMY_PURGE_FLAG) !== 'true') {
      localStorage.setItem(STORAGE_KEYS.PURCHASE_ORDERS, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEYS.SCHEDULES, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify([]));
      localStorage.setItem(DUMMY_PURGE_FLAG, 'true');
    }
  } catch (e) {
    console.error('Error clearing dummy data:', e);
  }
};

const migrateDefaultToleranceToFivePercent = (): void => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    if (localStorage.getItem(TOLERANCE_5PCT_FLAG) === 'true') return;

    const rawPos = localStorage.getItem(STORAGE_KEYS.PURCHASE_ORDERS);
    let parsedPos: PurchaseOrder[] = [];
    if (rawPos) {
      parsedPos = JSON.parse(rawPos);
      if (Array.isArray(parsedPos)) {
        let poChanged = false;
        parsedPos = parsedPos.map((po) => {
          if (po.tolerancePercentage === 0.5 || po.tolerancePercentage === undefined) {
            poChanged = true;
            return { ...po, tolerancePercentage: 5 };
          }
          return po;
        });
        if (poChanged) {
          localStorage.setItem(STORAGE_KEYS.PURCHASE_ORDERS, JSON.stringify(parsedPos));
        }
      }
    }

    const rawTxs = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
    if (rawTxs) {
      const parsedTxs: CoalTransaction[] = JSON.parse(rawTxs);
      if (Array.isArray(parsedTxs)) {
        let txChanged = false;
        const updatedTxs = parsedTxs.map((tx) => {
          const sjKg = Number(tx.suratJalanWeight) || 0;
          const grossKg = Number(tx.grossWeight) || 0;
          const tareKg = Number(tx.tareWeight) || 0;
          if (grossKg <= 0 || tareKg <= 0 || sjKg <= 0) return tx;

          const po = parsedPos.find((p) => p.id === tx.poId);
          const tol = po?.tolerancePercentage || 5;
          const metrics = calculateToleranceMetrics({
            grossWeight: grossKg,
            tareWeight: tareKg,
            suratJalanWeight: sjKg,
            tolerancePercentage: tol,
          });

          if (
            tx.nettoWeight !== metrics.nettoWeight ||
            tx.weightDifference !== metrics.weightDifference ||
            tx.shrinkagePercentage !== metrics.shrinkagePercentage ||
            tx.toleranceStatus !== metrics.toleranceStatus ||
            tx.claimPenaltyKg !== metrics.claimPenaltyKg
          ) {
            txChanged = true;
            return {
              ...tx,
              nettoWeight: metrics.nettoWeight,
              nettoTons: metrics.nettoTons,
              initialDiscrepancy: metrics.initialDiscrepancy,
              weightDifference: metrics.weightDifference,
              shrinkagePercentage: metrics.shrinkagePercentage,
              toleranceStatus: metrics.toleranceStatus,
              claimPenaltyKg: metrics.claimPenaltyKg,
            };
          }
          return tx;
        });
        if (txChanged) {
          localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(updatedTxs));
        }
      }
    }

    localStorage.setItem(TOLERANCE_5PCT_FLAG, 'true');
  } catch (e) {
    console.error('Error migrating default tolerance to 5%:', e);
  }
};

const purgeRemovedPo4T260555 = (): void => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    if (localStorage.getItem(PO_4T260555_PURGE_FLAG) === 'true') return;

    let parsedTxs: CoalTransaction[] = [];
    const rawTxs = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
    const removedTxIds = new Set<string>(REMOVED_PO_TRANSACTION_IDS);
    if (rawTxs) {
      const txs = JSON.parse(rawTxs);
      if (Array.isArray(txs)) {
        const res = sanitizeTransactionsForRemovedPo(txs);
        res.removedIds.forEach((id) => removedTxIds.add(id));
        parsedTxs = res.items;
        if (res.removedIds.length > 0) {
          localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(parsedTxs));
        }
      }
    }

    const removedSchIds = new Set<string>(REMOVED_PO_SCHEDULE_IDS);
    const rawSchs = localStorage.getItem(STORAGE_KEYS.SCHEDULES);
    if (rawSchs) {
      const schs = JSON.parse(rawSchs);
      if (Array.isArray(schs)) {
        const res = sanitizeSchedulesForRemovedPo(schs);
        res.removedIds.forEach((id) => removedSchIds.add(id));
        if (res.removedIds.length > 0) {
          localStorage.setItem(STORAGE_KEYS.SCHEDULES, JSON.stringify(res.items));
        }
      }
    }

    const removedPoIds = new Set<string>();
    let restoredBorneoPo = false;
    const rawPos = localStorage.getItem(STORAGE_KEYS.PURCHASE_ORDERS);
    if (rawPos) {
      const pos = JSON.parse(rawPos);
      if (Array.isArray(pos)) {
        const res = sanitizePurchaseOrdersForRemovedPo(pos, parsedTxs);
        res.removedIds.forEach((id) => removedPoIds.add(id));
        restoredBorneoPo = res.restoredBorneoPo;
        if (res.removedIds.length > 0 || res.restoredBorneoPo) {
          localStorage.setItem(STORAGE_KEYS.PURCHASE_ORDERS, JSON.stringify(res.items));
        }
      }
    }

    const rawLogs = localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS);
    if (rawLogs) {
      const logs = JSON.parse(rawLogs);
      if (Array.isArray(logs)) {
        const res = sanitizeAuditLogsForRemovedPo(logs);
        if (res.changed) {
          localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(res.items));
        }
      }
    }

    // Clear any stale pending upserts for 4T260555 so this browser never pushes 4T260555 back to Firestore
    const rawSync = localStorage.getItem(STORAGE_KEYS.SYNC_STATE);
    if (rawSync) {
      const syncState: PendingCloudSyncState = {
        ...createEmptySyncState(),
        ...JSON.parse(rawSync),
      };
      syncState.upsertPoIds = syncState.upsertPoIds.filter(
        (id) => !removedPoIds.has(id) && !(restoredBorneoPo && id === RESTORED_BORNEO_PO_ID)
      );
      syncState.deletePoIds = syncState.deletePoIds.filter(
        (id) => id !== RESTORED_BORNEO_PO_ID
      );
      syncState.upsertScheduleIds = syncState.upsertScheduleIds.filter(
        (id) => !removedSchIds.has(id)
      );
      syncState.knownCloudScheduleIds = syncState.knownCloudScheduleIds.filter(
        (id) => !removedSchIds.has(id)
      );
      syncState.upsertTransactionIds = syncState.upsertTransactionIds.filter(
        (id) => !removedTxIds.has(id)
      );
      syncState.knownCloudTransactionIds = syncState.knownCloudTransactionIds.filter(
        (id) => !removedTxIds.has(id)
      );
      localStorage.setItem(STORAGE_KEYS.SYNC_STATE, JSON.stringify(syncState));
    }

    localStorage.setItem(PO_4T260555_PURGE_FLAG, 'true');
  } catch (e) {
    console.error('Error purging removed PO 4T260555:', e);
  }
};

purgeDummyData();
migrateDefaultToleranceToFivePercent();
purgeRemovedPo4T260555();

export const storageService = {
  getSyncState(): PendingCloudSyncState {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SYNC_STATE);
      if (!raw) return createEmptySyncState();
      return { ...createEmptySyncState(), ...JSON.parse(raw) };
    } catch {
      return createEmptySyncState();
    }
  },

  saveSyncState(state: PendingCloudSyncState): void {
    try {
      localStorage.setItem(STORAGE_KEYS.SYNC_STATE, JSON.stringify(state));
    } catch (e) {
      console.error('Failed saving sync state:', e);
    }
  },

  markLocalUpserts(kind: SyncEntityKind, ids: string[]): void {
    if (ids.length === 0) return;
    const state = this.getSyncState();
    const { upsertKey, deleteKey } = getSyncKeyNames(kind);
    const idSet = new Set(ids);
    state[upsertKey] = uniqueIds([...state[upsertKey], ...ids]);
    state[deleteKey] = state[deleteKey].filter((id) => !idSet.has(id));
    state.pendingClearAll = false;
    this.saveSyncState(state);
  },

  markLocalDeletes(kind: SyncEntityKind, ids: string[]): void {
    if (ids.length === 0) return;
    const state = this.getSyncState();
    const { upsertKey, deleteKey, knownKey } = getSyncKeyNames(kind);
    const idSet = new Set(ids);
    state[deleteKey] = uniqueIds([...state[deleteKey], ...ids]);
    state[upsertKey] = state[upsertKey].filter((id) => !idSet.has(id));
    state[knownKey] = state[knownKey].filter((id) => !idSet.has(id));
    this.saveSyncState(state);
  },

  markCloudUpsertsAcked(kind: SyncEntityKind, ids: string[]): void {
    if (ids.length === 0) return;
    const state = this.getSyncState();
    const { upsertKey, knownKey } = getSyncKeyNames(kind);
    const idSet = new Set(ids);
    state[upsertKey] = state[upsertKey].filter((id) => !idSet.has(id));
    state[knownKey] = uniqueIds([...state[knownKey], ...ids]);
    this.saveSyncState(state);
  },

  markCloudDeletesAcked(kind: SyncEntityKind, ids: string[]): void {
    if (ids.length === 0) return;
    const state = this.getSyncState();
    const { deleteKey, knownKey } = getSyncKeyNames(kind);
    const idSet = new Set(ids);
    state[deleteKey] = state[deleteKey].filter((id) => !idSet.has(id));
    state[knownKey] = state[knownKey].filter((id) => !idSet.has(id));
    this.saveSyncState(state);
  },

  markPendingClearAll(pending: boolean): void {
    const state = this.getSyncState();
    state.pendingClearAll = pending;
    if (pending) {
      state.upsertPoIds = [];
      state.upsertScheduleIds = [];
      state.upsertTransactionIds = [];
      state.deletePoIds = [];
      state.deleteScheduleIds = [];
      state.deleteTransactionIds = [];
      state.knownCloudPoIds = [];
      state.knownCloudScheduleIds = [];
      state.knownCloudTransactionIds = [];
    }
    this.saveSyncState(state);
  },

  clearSyncState(): void {
    this.saveSyncState(createEmptySyncState());
  },

  /**
   * Merge cloud snapshot with local storage without ever losing unsynced local saves
   * or resurrecting locally deleted items.
   */
  mergeCloudCollection<T extends { id: string; updatedAt?: string; createdAt?: string }>(
    kind: SyncEntityKind,
    cloudItems: T[],
    localItems: T[]
  ): { merged: T[]; idsToPush: string[] } {
    const state = this.getSyncState();
    const { upsertKey, deleteKey, knownKey } = getSyncKeyNames(kind);

    if (state.pendingClearAll) {
      return { merged: [], idsToPush: [] };
    }

    const pendingUpsertSet = new Set(state[upsertKey]);
    const pendingDeleteSet = new Set(state[deleteKey]);
    const knownCloudSet = new Set(state[knownKey]);

    const localMap = new Map(localItems.map((item) => [item.id, item]));
    const cloudMap = new Map(cloudItems.map((item) => [item.id, item]));
    const idsToPush = new Set<string>(state[upsertKey]);
    const merged: T[] = [];

    // 1. Walk cloud items (updating knownCloudIds except those pending local delete)
    const nextKnownIds = new Set<string>(
      cloudItems.filter((c) => !pendingDeleteSet.has(c.id)).map((c) => c.id)
    );

    for (const cloudItem of cloudItems) {
      if (pendingDeleteSet.has(cloudItem.id)) {
        continue;
      }
      const localItem = localMap.get(cloudItem.id);
      if (!localItem) {
        merged.push(cloudItem);
        continue;
      }

      if (pendingUpsertSet.has(cloudItem.id)) {
        merged.push(localItem);
        idsToPush.add(localItem.id);
        continue;
      }

      const localMs = parseTimestampMs(localItem.updatedAt || localItem.createdAt);
      const cloudMs = parseTimestampMs(cloudItem.updatedAt || cloudItem.createdAt);
      if (localMs > cloudMs) {
        merged.push(localItem);
        idsToPush.add(localItem.id);
      } else {
        merged.push(cloudItem);
      }
    }

    // 2. Preserve local items not returned by cloud if:
    //    - they are in pendingUpsertSet, OR
    //    - they were never confirmed in cloud before, OR
    //    - cloud returned 0 items for this collection (prevent wipe on transient/empty snapshot)
    const cloudCollectionEmpty = cloudItems.length === 0;
    for (const localItem of localItems) {
      if (cloudMap.has(localItem.id) || pendingDeleteSet.has(localItem.id)) {
        continue;
      }
      if (
        pendingUpsertSet.has(localItem.id) ||
        !knownCloudSet.has(localItem.id) ||
        cloudCollectionEmpty
      ) {
        merged.push(localItem);
        idsToPush.add(localItem.id);
      }
    }

    // Persist any newly discovered unsynced local IDs & confirmed cloud IDs
    const nextUpserts = uniqueIds(Array.from(idsToPush));
    const nextKnown = uniqueIds(Array.from(nextKnownIds));
    const changed =
      nextUpserts.length !== state[upsertKey].length ||
      nextKnown.length !== state[knownKey].length ||
      nextUpserts.some((id, idx) => state[upsertKey][idx] !== id) ||
      nextKnown.some((id, idx) => state[knownKey][idx] !== id);

    if (changed) {
      state[upsertKey] = nextUpserts;
      state[knownKey] = nextKnown;
      this.saveSyncState(state);
    }

    return { merged, idsToPush: nextUpserts };
  },

  getPurchaseOrders(): PurchaseOrder[] {
    try {
      purgeDummyData();
      migrateDefaultToleranceToFivePercent();
      purgeRemovedPo4T260555();
      const data = localStorage.getItem(STORAGE_KEYS.PURCHASE_ORDERS);
      if (!data) return [];
      const parsed: PurchaseOrder[] = JSON.parse(data);
      if (!Array.isArray(parsed)) return [];
      const rawTxs = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
      const parsedTxs: CoalTransaction[] = rawTxs ? JSON.parse(rawTxs) : [];
      const cleaned = sanitizePurchaseOrdersForRemovedPo(
        parsed,
        Array.isArray(parsedTxs) ? parsedTxs : []
      );
      const { items, changedIds } = normalizePurchaseOrdersSupplier(cleaned.items);
      if (cleaned.removedIds.length > 0 || cleaned.restoredBorneoPo || changedIds.length > 0) {
        localStorage.setItem(STORAGE_KEYS.PURCHASE_ORDERS, JSON.stringify(items));
        if (changedIds.length > 0) {
          this.markLocalUpserts('po', changedIds);
        }
      }
      return items;
    } catch (e) {
      console.error('Failed reading POs from storage:', e);
      return [];
    }
  },

  savePurchaseOrders(pos: PurchaseOrder[]): void {
    const cleaned = sanitizePurchaseOrdersForRemovedPo(pos);
    const { items } = normalizePurchaseOrdersSupplier(cleaned.items);
    localStorage.setItem(STORAGE_KEYS.PURCHASE_ORDERS, JSON.stringify(items));
  },

  getSchedules(): ArrivalSchedule[] {
    try {
      purgeDummyData();
      purgeRemovedPo4T260555();
      const data = localStorage.getItem(STORAGE_KEYS.SCHEDULES);
      if (!data) return [];
      const parsed: ArrivalSchedule[] = JSON.parse(data);
      if (!Array.isArray(parsed)) return [];
      const cleaned = sanitizeSchedulesForRemovedPo(parsed);
      const { items, changedIds } = normalizeSchedulesSupplier(cleaned.items);
      if (cleaned.removedIds.length > 0 || changedIds.length > 0) {
        localStorage.setItem(STORAGE_KEYS.SCHEDULES, JSON.stringify(items));
        if (changedIds.length > 0) {
          this.markLocalUpserts('schedule', changedIds);
        }
      }
      return items;
    } catch (e) {
      console.error('Failed reading schedules from storage:', e);
      return [];
    }
  },

  saveSchedules(schedules: ArrivalSchedule[]): void {
    const cleaned = sanitizeSchedulesForRemovedPo(schedules);
    const { items } = normalizeSchedulesSupplier(cleaned.items);
    localStorage.setItem(STORAGE_KEYS.SCHEDULES, JSON.stringify(items));
  },

  getTransactions(): CoalTransaction[] {
    try {
      purgeDummyData();
      purgeRemovedPo4T260555();
      const data = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
      if (!data) {
        this.saveTransactions(INITIAL_TRANSACTIONS);
        return INITIAL_TRANSACTIONS;
      }
      const parsed: CoalTransaction[] = JSON.parse(data);
      const cleanedTx = sanitizeTransactionsForRemovedPo(Array.isArray(parsed) ? parsed : []);
      let needsResave = cleanedTx.removedIds.length > 0;
      const migrated = cleanedTx.items.map((t) => {
        let current = t;
        if (current.sampleId && current.sampleId.startsWith('SMP-')) {
          needsResave = true;
          const match = current.sampleId.match(/SMP-(?:20)?(\d{2})(\d{2})\d*-?(\d{2})?/);
          const yy = match?.[1] || '26';
          const mm = match?.[2] || '11';
          const seq = match?.[3] || '01';
          current = { ...current, sampleId: `PA-${yy}${mm}${seq}` };
        }
        // Normalize gateInTime if it was stored without timezone offset or Z
        if (
          current.gateInTime &&
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(current.gateInTime) &&
          !current.gateInTime.endsWith('Z') &&
          !current.gateInTime.includes('+')
        ) {
          needsResave = true;
          const [dPart, tPart] = current.gateInTime.split('T');
          const [y, m, d] = dPart.split('-').map(Number);
          const [h, min, s] = tPart.split(':').map(Number);
          if (y && m && d) {
            const dateObj = new Date(y, m - 1, d, h || 0, min || 0, Math.floor(s || 0));
            if (!isNaN(dateObj.getTime())) {
              current = { ...current, gateInTime: dateObj.toISOString() };
            }
          }
        }
        return current;
      });
      const { items: supplierNormalized, changedIds } = normalizeTransactionsSupplier(migrated);
      if (needsResave || changedIds.length > 0) {
        localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(supplierNormalized));
        if (changedIds.length > 0) {
          this.markLocalUpserts('transaction', changedIds);
        }
      }
      return supplierNormalized;
    } catch (e) {
      console.error('Failed reading transactions from storage:', e);
      return INITIAL_TRANSACTIONS;
    }
  },

  saveTransactions(transactions: CoalTransaction[]): void {
    const cleaned = sanitizeTransactionsForRemovedPo(transactions);
    const { items } = normalizeTransactionsSupplier(cleaned.items);
    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(items));
  },

  getSheetConfig(): GoogleSheetConfig {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SHEET_CONFIG);
      if (!data) {
        return DEFAULT_SHEET_CONFIG;
      }
      return { ...DEFAULT_SHEET_CONFIG, ...JSON.parse(data) };
    } catch {
      return DEFAULT_SHEET_CONFIG;
    }
  },

  saveSheetConfig(config: GoogleSheetConfig): void {
    localStorage.setItem(STORAGE_KEYS.SHEET_CONFIG, JSON.stringify(config));
  },

  getAuditLogs(): AuditLogEntry[] {
    try {
      purgeRemovedPo4T260555();
      const data = localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS);
      if (!data) return [];
      const parsed = JSON.parse(data);
      if (!Array.isArray(parsed)) return [];
      const cleaned = sanitizeAuditLogsForRemovedPo(parsed);
      const { items, changed } = normalizeAuditLogsSupplier(cleaned.items);
      if (cleaned.changed || changed) {
        localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(items.slice(0, 500)));
      }
      return items;
    } catch {
      return [];
    }
  },

  saveAuditLogs(logs: AuditLogEntry[]): void {
    try {
      const cleaned = sanitizeAuditLogsForRemovedPo(logs);
      const { items } = normalizeAuditLogsSupplier(cleaned.items);
      localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(items.slice(0, 500)));
    } catch (e) {
      console.error('Failed saving audit logs:', e);
    }
  },

  getCoalOutgoing(): CoalOutgoingRecord[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.COAL_OUTGOING);
      if (!data) return [];
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error('Failed reading coal outgoing records from storage:', e);
      return [];
    }
  },

  saveCoalOutgoing(records: CoalOutgoingRecord[]): void {
    localStorage.setItem(STORAGE_KEYS.COAL_OUTGOING, JSON.stringify(records));
  },

  clearAllData(): void {
    this.savePurchaseOrders([]);
    this.saveSchedules([]);
    this.saveTransactions([]);
    this.saveCoalOutgoing([]);
    this.clearSyncState();
  },

  resetToDefault(): void {
    this.savePurchaseOrders(INITIAL_PURCHASE_ORDERS);
    this.saveSchedules(INITIAL_SCHEDULES);
    this.saveTransactions(INITIAL_TRANSACTIONS);
    this.saveCoalOutgoing([]);
    this.clearSyncState();
  },

  exportFullBackupJSON(): string {
    const payload = {
      version: '2.1',
      exportedAt: new Date().toISOString(),
      purchaseOrders: this.getPurchaseOrders(),
      schedules: this.getSchedules(),
      transactions: this.getTransactions(),
      coalOutgoing: this.getCoalOutgoing(),
      sheetConfig: this.getSheetConfig(),
      auditLogs: this.getAuditLogs(),
    };
    return JSON.stringify(payload, null, 2);
  },

  importBackupJSON(jsonStr: string): boolean {
    try {
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed.purchaseOrders)) {
        this.savePurchaseOrders(parsed.purchaseOrders);
      }
      if (Array.isArray(parsed.schedules)) {
        this.saveSchedules(parsed.schedules);
      }
      if (Array.isArray(parsed.transactions)) {
        this.saveTransactions(parsed.transactions);
      }
      if (Array.isArray(parsed.coalOutgoing)) {
        this.saveCoalOutgoing(parsed.coalOutgoing);
      }
      if (parsed.sheetConfig) {
        this.saveSheetConfig(parsed.sheetConfig);
      }
      if (Array.isArray(parsed.auditLogs)) {
        this.saveAuditLogs(parsed.auditLogs);
      }
      return true;
    } catch (e) {
      console.error('Invalid backup JSON format', e);
      return false;
    }
  },
};
