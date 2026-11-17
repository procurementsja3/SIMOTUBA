import {
  PurchaseOrder,
  ArrivalSchedule,
  CoalTransaction,
  GoogleSheetConfig,
  AuditLogEntry,
} from '../types/coal';
import {
  INITIAL_PURCHASE_ORDERS,
  INITIAL_SCHEDULES,
  INITIAL_TRANSACTIONS,
} from '../data/initialData';
import { calculateToleranceMetrics } from '../utils/toleranceUtils';

const STORAGE_KEYS = {
  PURCHASE_ORDERS: 'coal_monitor_pos_v2',
  SCHEDULES: 'coal_monitor_schedules_v2',
  TRANSACTIONS: 'coal_monitor_transactions_v2',
  SHEET_CONFIG: 'coal_monitor_sheet_config_v2',
  AUDIT_LOGS: 'coal_monitor_audit_logs_v1',
  CLEARED_DUMMY_FLAG: 'coal_monitor_cleared_dummy_v2_done',
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

purgeDummyData();
migrateDefaultToleranceToFivePercent();

export const storageService = {
  getPurchaseOrders(): PurchaseOrder[] {
    try {
      purgeDummyData();
      migrateDefaultToleranceToFivePercent();
      const data = localStorage.getItem(STORAGE_KEYS.PURCHASE_ORDERS);
      if (!data) return [];
      return JSON.parse(data);
    } catch (e) {
      console.error('Failed reading POs from storage:', e);
      return [];
    }
  },

  savePurchaseOrders(pos: PurchaseOrder[]): void {
    localStorage.setItem(STORAGE_KEYS.PURCHASE_ORDERS, JSON.stringify(pos));
  },

  getSchedules(): ArrivalSchedule[] {
    try {
      purgeDummyData();
      const data = localStorage.getItem(STORAGE_KEYS.SCHEDULES);
      if (!data) return [];
      return JSON.parse(data);
    } catch (e) {
      console.error('Failed reading schedules from storage:', e);
      return [];
    }
  },

  saveSchedules(schedules: ArrivalSchedule[]): void {
    localStorage.setItem(STORAGE_KEYS.SCHEDULES, JSON.stringify(schedules));
  },

  getTransactions(): CoalTransaction[] {
    try {
      purgeDummyData();
      const data = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
      if (!data) {
        this.saveTransactions(INITIAL_TRANSACTIONS);
        return INITIAL_TRANSACTIONS;
      }
      const parsed: CoalTransaction[] = JSON.parse(data);
      let needsResave = false;
      const migrated = parsed.map((t) => {
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
      if (needsResave) {
        this.saveTransactions(migrated);
      }
      return migrated;
    } catch (e) {
      console.error('Failed reading transactions from storage:', e);
      return INITIAL_TRANSACTIONS;
    }
  },

  saveTransactions(transactions: CoalTransaction[]): void {
    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
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
      const data = localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS);
      if (!data) return [];
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },

  saveAuditLogs(logs: AuditLogEntry[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(logs.slice(0, 500)));
    } catch (e) {
      console.error('Failed saving audit logs:', e);
    }
  },

  clearAllData(): void {
    this.savePurchaseOrders([]);
    this.saveSchedules([]);
    this.saveTransactions([]);
  },

  resetToDefault(): void {
    this.savePurchaseOrders(INITIAL_PURCHASE_ORDERS);
    this.saveSchedules(INITIAL_SCHEDULES);
    this.saveTransactions(INITIAL_TRANSACTIONS);
  },

  exportFullBackupJSON(): string {
    const payload = {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      purchaseOrders: this.getPurchaseOrders(),
      schedules: this.getSchedules(),
      transactions: this.getTransactions(),
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
