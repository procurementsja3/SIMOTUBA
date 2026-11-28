import { PurchaseOrder, ArrivalSchedule, CoalTransaction } from '../types/coal';
import { normalizeSupplierName } from './supplierUtils';

export interface PoOperationalSummary {
  po: PurchaseOrder;
  totalScheduledRits: number;
  completedRits: number;
  inProgressTxCount: number;
  pendingScheduleCount: number;
  remainingRits: number;
  remainingKg: number;
  progressPct: number;
  isActivePo: boolean;
  hasOnProgressDelivery: boolean;
  isActiveOrOnProgress: boolean;
}

export function computePoOperationalSummary(
  po: PurchaseOrder,
  schedules: ArrivalSchedule[],
  transactions: CoalTransaction[],
  maxSchedulesPerPo = 100
): PoOperationalSummary & { isFull: boolean } {
  const poNumNorm = (po.poNumber || '').trim().toUpperCase();
  const poSupNorm = normalizeSupplierName(po.supplierName).toUpperCase();

  const poSchedules = schedules.filter((s) => {
    if (s.status === 'CANCELLED') return false;
    if (s.poId === po.id) return true;
    const sPoNum = (s.poNumber || '').trim().toUpperCase();
    const sSup = normalizeSupplierName(s.supplierName).toUpperCase();
    return Boolean(
      poNumNorm && sPoNum === poNumNorm && (!poSupNorm || !sSup || sSup === poSupNorm)
    );
  });

  const poTransactions = transactions.filter((t) => {
    if (t.status === 'REJECTED') return false;
    if (t.poId === po.id) return true;
    const tPoNum = (t.poNumber || '').trim().toUpperCase();
    const tSup = normalizeSupplierName(t.supplierName).toUpperCase();
    return Boolean(
      poNumNorm && tPoNum === poNumNorm && (!poSupNorm || !tSup || tSup === poSupNorm)
    );
  });

  const completedScheduleIds = new Set<string>();
  poSchedules.forEach((s) => {
    if (s.status === 'COMPLETED') {
      completedScheduleIds.add(s.id);
    }
  });

  let unlinkedCompletedTxCount = 0;
  let inProgressTxCount = 0;

  poTransactions.forEach((t) => {
    if (t.status === 'COMPLETED') {
      if (t.scheduleId && poSchedules.some((s) => s.id === t.scheduleId)) {
        completedScheduleIds.add(t.scheduleId);
      } else {
        unlinkedCompletedTxCount += 1;
      }
    } else {
      inProgressTxCount += 1;
    }
  });

  const totalScheduledRits = poSchedules.length;
  const completedRits = completedScheduleIds.size + unlinkedCompletedTxCount;
  const pendingScheduleCount = poSchedules.filter((s) => !completedScheduleIds.has(s.id)).length;
  const remainingRits = Math.max(0, totalScheduledRits - completedRits);
  const remainingKg = Math.max(0, (po.targetTonnage || 0) - (po.receivedTonnage || 0));
  const progressPct =
    po.targetTonnage > 0 ? ((po.receivedTonnage || 0) / po.targetTonnage) * 100 : 0;

  const isActivePo = po.status === 'ACTIVE';
  const hasOnProgressDelivery = inProgressTxCount > 0 || pendingScheduleCount > 0;
  const isActiveOrOnProgress = isActivePo || hasOnProgressDelivery;
  const isFull = totalScheduledRits >= maxSchedulesPerPo;

  return {
    po,
    totalScheduledRits,
    completedRits,
    inProgressTxCount,
    pendingScheduleCount,
    remainingRits,
    remainingKg,
    progressPct,
    isActivePo,
    hasOnProgressDelivery,
    isActiveOrOnProgress,
    isFull,
  };
}
