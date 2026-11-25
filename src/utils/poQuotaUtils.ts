import { ArrivalSchedule, CoalTransaction, PurchaseOrder } from '../types/coal';

export interface PoQuotaCheckResult {
  poId: string;
  poNumber: string;
  supplierName: string;
  // Ritase metrics
  registeredRitCount: number;
  recordedRitCount: number;
  projectedRitCount: number;
  excessRitCount: number;
  isExcessRit: boolean;
  isUnscheduledRit: boolean;
  // Qty PO metrics (Kg)
  targetQtyKg: number;
  completedReceivedKg: number;
  inProcessQtyKg: number;
  currentCommittedKg: number;
  incomingQtyKg: number;
  projectedTotalKg: number;
  remainingBeforeIncomingKg: number;
  excessQtyKg: number;
  isExcessQty: boolean;
  // Scheduled total vs PO target (detects over-scheduled POs proactively)
  scheduledTotalKg: number;
  scheduledExcessQtyKg: number;
  isScheduledOverQty: boolean;
  // Combined flags
  hasExcessAlert: boolean;
  alertReasons: string[];
}

const getTxRealizedKg = (tx: CoalTransaction): number => {
  if (typeof tx.nettoWeight === 'number' && tx.nettoWeight > 0) return tx.nettoWeight;
  if (typeof tx.nettoTons === 'number' && tx.nettoTons > 0) return Math.round(tx.nettoTons * 1000);
  if (typeof tx.grossWeight === 'number' && typeof tx.tareWeight === 'number' && tx.grossWeight > tx.tareWeight) {
    return tx.grossWeight - tx.tareWeight;
  }
  return Number(tx.suratJalanWeight || 0);
};

const getTxInProcessKg = (tx: CoalTransaction): number => {
  if (typeof tx.suratJalanWeight === 'number' && tx.suratJalanWeight > 0) return tx.suratJalanWeight;
  if (typeof tx.grossWeight === 'number' && tx.grossWeight > 0) return tx.grossWeight;
  return 0;
};

/**
 * Evaluates whether a PO has excess delivery trips (ritase) and/or excess PO tonnage (Qty PO)
 * relative to registered schedules and target PO contract tonnage.
 */
export function evaluatePoQuotaStatus(
  po: PurchaseOrder,
  schedules: ArrivalSchedule[],
  transactions: CoalTransaction[],
  options?: {
    incomingWeightKg?: number;
    incomingRitCount?: number;
    hasSelectedSchedule?: boolean;
  }
): PoQuotaCheckResult {
  const incomingQtyKg = Math.max(0, Number(options?.incomingWeightKg || 0));
  const incomingRitCount = Math.max(0, Number(options?.incomingRitCount || 0));

  // Registered active schedules for this PO (excluding CANCELLED)
  const poActiveSchedules = schedules.filter(
    (s) => s.poId === po.id && s.status !== 'CANCELLED'
  );
  const registeredRitCount = poActiveSchedules.reduce(
    (sum, s) => sum + Math.max(1, Number(s.estimatedTruckCount || 1)),
    0
  );
  const scheduledTotalKg = poActiveSchedules.reduce(
    (sum, s) => sum + Math.max(0, Number(s.estimatedTonnage || 0)),
    0
  );

  // Recorded non-rejected transactions for this PO
  const poValidTxs = transactions.filter(
    (tx) => tx.poId === po.id && tx.status !== 'REJECTED'
  );
  const recordedRitCount = poValidTxs.length;
  const projectedRitCount = recordedRitCount + incomingRitCount;

  const completedTxs = poValidTxs.filter((tx) => tx.status === 'COMPLETED');
  const inProcessTxs = poValidTxs.filter((tx) => tx.status !== 'COMPLETED');

  const completedSumKg = completedTxs.reduce((sum, tx) => sum + getTxRealizedKg(tx), 0);
  const completedReceivedKg = Math.max(Number(po.receivedTonnage || 0), completedSumKg);
  const inProcessQtyKg = inProcessTxs.reduce((sum, tx) => sum + getTxInProcessKg(tx), 0);

  const targetQtyKg = Math.max(0, Number(po.targetTonnage || 0));
  const currentCommittedKg = completedReceivedKg + inProcessQtyKg;
  const projectedTotalKg = currentCommittedKg + incomingQtyKg;
  const remainingBeforeIncomingKg = targetQtyKg - currentCommittedKg;

  const excessRitCount =
    registeredRitCount > 0 ? Math.max(0, projectedRitCount - registeredRitCount) : 0;
  const isExcessRit = excessRitCount > 0;
  const isUnscheduledRit =
    incomingRitCount > 0 && registeredRitCount === 0 && !options?.hasSelectedSchedule;

  const excessQtyKg = targetQtyKg > 0 ? Math.max(0, projectedTotalKg - targetQtyKg) : 0;
  const isExcessQty = excessQtyKg > 0;

  const scheduledExcessQtyKg =
    targetQtyKg > 0 ? Math.max(0, scheduledTotalKg - targetQtyKg) : 0;
  const isScheduledOverQty = scheduledExcessQtyKg > 0;

  const alertReasons: string[] = [];
  if (isExcessRit) {
    alertReasons.push(
      `Kelebihan ${excessRitCount} Rit kirim (${projectedRitCount} Rit dari ${registeredRitCount} Rit terdaftar)`
    );
  } else if (isUnscheduledRit) {
    alertReasons.push(
      `Belum ada jadwal rit terdaftar pada PO ${po.poNumber} (Check-In di luar jadwal)`
    );
  }

  if (isExcessQty) {
    alertReasons.push(
      `Kelebihan Qty PO sebesar +${excessQtyKg.toLocaleString('id-ID')} Kg (+${(excessQtyKg / 1000).toFixed(2)} Ton)`
    );
  } else if (incomingRitCount === 0 && isScheduledOverQty) {
    alertReasons.push(
      `Total estimasi jadwal terdaftar (${scheduledTotalKg.toLocaleString('id-ID')} Kg) melebihi Qty PO sebesar +${scheduledExcessQtyKg.toLocaleString('id-ID')} Kg (+${(scheduledExcessQtyKg / 1000).toFixed(2)} Ton)`
    );
  }

  const hasExcessAlert =
    isExcessRit ||
    isUnscheduledRit ||
    isExcessQty ||
    (incomingRitCount === 0 && isScheduledOverQty);

  return {
    poId: po.id,
    poNumber: po.poNumber,
    supplierName: po.supplierName,
    registeredRitCount,
    recordedRitCount,
    projectedRitCount,
    excessRitCount,
    isExcessRit,
    isUnscheduledRit,
    targetQtyKg,
    completedReceivedKg,
    inProcessQtyKg,
    currentCommittedKg,
    incomingQtyKg,
    projectedTotalKg,
    remainingBeforeIncomingKg,
    excessQtyKg,
    isExcessQty,
    scheduledTotalKg,
    scheduledExcessQtyKg,
    isScheduledOverQty,
    hasExcessAlert,
    alertReasons,
  };
}
