import {
  PurchaseOrder,
  ArrivalSchedule,
  CoalTransaction,
  AuditLogEntry,
} from '../types/coal';
import { normalizeSupplierName } from './supplierUtils';

export const REMOVED_PO_NUMBER = '4T260555';
export const REMOVED_PO_SCHEDULE_IDS = new Set(['SCH-106976-01', 'SCH-106976-02']);
export const REMOVED_PO_TRANSACTION_IDS = new Set([
  'TRX-1794725194312',
  'TRX-1794726982237',
]);

export const RESTORED_BORNEO_PO_ID = 'PO-1794379055385-0-968';
export const RESTORED_BORNEO_PO_NUMBER = '4T260689';
export const RESTORED_BORNEO_UPDATED_AT = '2026-11-28T03:10:02.982Z';

export function isRemovedPoNumber(poNumber?: string | null): boolean {
  return (poNumber || '').trim().toUpperCase() === REMOVED_PO_NUMBER;
}

export function createRestoredBorneoPo(receivedTonnage = 410150): PurchaseOrder {
  return {
    id: RESTORED_BORNEO_PO_ID,
    poNumber: RESTORED_BORNEO_PO_NUMBER,
    supplierName: normalizeSupplierName('BORNEO BARA ABADI, CV'),
    supplierCode: 'BBA',
    contractDate: '2026-11-02',
    targetTonnage: 1089000,
    receivedTonnage,
    status: 'ACTIVE',
    specs: {
      calorieMin: 4200,
      moistureMax: 34,
      ashMax: 8,
      sulfurMax: 0.8,
      hgiMin: 45,
    },
    tolerancePercentage: 5,
    pricePerTon: 850000,
    destinationStockpile: 'Stockpile Utama - A1 (Medium Calorie)',
    notes: '',
    createdAt: '2026-11-11T06:37:35.385Z',
    updatedAt: RESTORED_BORNEO_UPDATED_AT,
  };
}

export function sanitizeSchedulesForRemovedPo(schedules: ArrivalSchedule[]): {
  items: ArrivalSchedule[];
  removedIds: string[];
} {
  const removedIds: string[] = [];
  const items: ArrivalSchedule[] = [];
  for (const sch of schedules) {
    if (isRemovedPoNumber(sch.poNumber) || REMOVED_PO_SCHEDULE_IDS.has(sch.id)) {
      removedIds.push(sch.id);
    } else {
      items.push(sch);
    }
  }
  return { items, removedIds };
}

export function sanitizeTransactionsForRemovedPo(transactions: CoalTransaction[]): {
  items: CoalTransaction[];
  removedIds: string[];
} {
  const removedIds: string[] = [];
  const items: CoalTransaction[] = [];
  for (const tx of transactions) {
    if (isRemovedPoNumber(tx.poNumber) || REMOVED_PO_TRANSACTION_IDS.has(tx.id)) {
      removedIds.push(tx.id);
    } else {
      items.push(tx);
    }
  }
  return { items, removedIds };
}

export function sanitizePurchaseOrdersForRemovedPo(
  pos: PurchaseOrder[],
  transactions?: CoalTransaction[]
): {
  items: PurchaseOrder[];
  removedIds: string[];
  restoredBorneoPo: boolean;
} {
  const removedIds: string[] = [];
  const items: PurchaseOrder[] = [];
  let sawOverwrittenBorneoDoc = false;

  const hasBorneo689Already = pos.some(
    (p) => (p.poNumber || '').trim().toUpperCase() === RESTORED_BORNEO_PO_NUMBER
  );

  const tx689CompletedSum = (transactions || [])
    .filter(
      (t) =>
        (t.poNumber || '').trim().toUpperCase() === RESTORED_BORNEO_PO_NUMBER &&
        t.status === 'COMPLETED'
    )
    .reduce((acc, t) => acc + (Number(t.nettoWeight) || 0), 0);

  for (const po of pos) {
    if (isRemovedPoNumber(po.poNumber)) {
      if (po.id === RESTORED_BORNEO_PO_ID) {
        sawOverwrittenBorneoDoc = true;
      } else {
        removedIds.push(po.id);
      }
      continue;
    }
    items.push(po);
  }

  let restoredBorneoPo = false;
  const hasTxFor689 = (transactions || []).some(
    (t) => (t.poNumber || '').trim().toUpperCase() === RESTORED_BORNEO_PO_NUMBER
  );

  if (!hasBorneo689Already && (sawOverwrittenBorneoDoc || hasTxFor689)) {
    const restoredReceived = tx689CompletedSum > 0 ? tx689CompletedSum : 410150;
    items.push(createRestoredBorneoPo(restoredReceived));
    restoredBorneoPo = true;
  }

  return { items, removedIds, restoredBorneoPo };
}

export function sanitizeAuditLogsForRemovedPo(logs: AuditLogEntry[]): {
  items: AuditLogEntry[];
  changed: boolean;
} {
  const items = logs.filter((entry) => {
    const haystack = `${entry.entityId || ''} ${entry.summary || ''} ${entry.details || ''}`.toUpperCase();
    if (haystack.includes(REMOVED_PO_NUMBER)) return false;
    for (const id of REMOVED_PO_SCHEDULE_IDS) {
      if (haystack.includes(id)) return false;
    }
    for (const id of REMOVED_PO_TRANSACTION_IDS) {
      if (haystack.includes(id)) return false;
    }
    return true;
  });
  return { items, changed: items.length !== logs.length };
}
