import {
  PurchaseOrder,
  ArrivalSchedule,
  CoalTransaction,
  AuditLogEntry,
} from '../types/coal';

const BORNEO_CANONICAL_NAME = 'BORNEO BARA ABADI, CV';
const BORNEO_EXACT_PATTERN =
  /^(?:(?:PT|CV)\.?\s+)?BORNEO\s+BARA\s+ABADI(?:(?:\s*,\s*|\s+)(?:PT|CV)\.?)?$/i;
const BORNEO_INLINE_PATTERN =
  /(?:\b(?:PT|CV)\.?\s+)?\bBORNEO\s+BARA\s+ABADI(?:(?:\s*,\s*|\s+)(?:PT|CV)\b\.?)?/gi;

/**
 * Menormalkan nama supplier agar semua variasi "BORNEO BARA ABADI, PT" / "PT BORNEO BARA ABADI" / "CV BORNEO BARA ABADI"
 * (beserta variasi ejaan/titik/spasi) secara konsisten menggunakan format resmi "BORNEO BARA ABADI, CV".
 */
export function normalizeSupplierName(raw?: string | null): string {
  if (!raw) return '';
  const cleaned = raw.trim().replace(/\s+/g, ' ');
  if (!cleaned) return '';
  if (BORNEO_EXACT_PATTERN.test(cleaned)) {
    return BORNEO_CANONICAL_NAME;
  }
  return cleaned;
}

/**
 * Mengganti kemunculan "BORNEO BARA ABADI, PT" / "PT BORNEO BARA ABADI" / variasi lainnya
 * di dalam teks bebas (misalnya audit log) menjadi "BORNEO BARA ABADI, CV".
 */
export function replaceBorneoNameInText(text?: string | null): string {
  if (!text) return '';
  return text.replace(BORNEO_INLINE_PATTERN, BORNEO_CANONICAL_NAME);
}

export function normalizePurchaseOrdersSupplier(pos: PurchaseOrder[]): {
  items: PurchaseOrder[];
  changedIds: string[];
} {
  const changedIds: string[] = [];
  const now = new Date().toISOString();
  const items = pos.map((po) => {
    const normalized = normalizeSupplierName(po.supplierName);
    if (normalized && normalized !== po.supplierName) {
      changedIds.push(po.id);
      return {
        ...po,
        supplierName: normalized,
        updatedAt: now,
      };
    }
    return po;
  });
  return { items, changedIds };
}

export function normalizeSchedulesSupplier(schedules: ArrivalSchedule[]): {
  items: ArrivalSchedule[];
  changedIds: string[];
} {
  const changedIds: string[] = [];
  const now = new Date().toISOString();
  const items = schedules.map((sch) => {
    const normalized = normalizeSupplierName(sch.supplierName);
    if (normalized && normalized !== sch.supplierName) {
      changedIds.push(sch.id);
      return {
        ...sch,
        supplierName: normalized,
        updatedAt: now,
      };
    }
    return sch;
  });
  return { items, changedIds };
}

export function normalizeTransactionsSupplier(txs: CoalTransaction[]): {
  items: CoalTransaction[];
  changedIds: string[];
} {
  const changedIds: string[] = [];
  const now = new Date().toISOString();
  const items = txs.map((tx) => {
    const normalized = normalizeSupplierName(tx.supplierName);
    if (normalized && normalized !== tx.supplierName) {
      changedIds.push(tx.id);
      return {
        ...tx,
        supplierName: normalized,
        updatedAt: now,
      };
    }
    return tx;
  });
  return { items, changedIds };
}

export function normalizeAuditLogsSupplier(logs: AuditLogEntry[]): {
  items: AuditLogEntry[];
  changed: boolean;
} {
  let changed = false;
  const items = logs.map((entry) => {
    const nextSummary = replaceBorneoNameInText(entry.summary);
    const nextDetails = entry.details !== undefined ? replaceBorneoNameInText(entry.details) : undefined;
    if (nextSummary !== entry.summary || nextDetails !== entry.details) {
      changed = true;
      return {
        ...entry,
        summary: nextSummary,
        details: nextDetails,
      };
    }
    return entry;
  });
  return { items, changed };
}
