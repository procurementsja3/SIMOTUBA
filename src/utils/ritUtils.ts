import { ArrivalSchedule, CoalTransaction } from '../types/coal';

export interface ResolvedRitInfo {
  ritNumber: number;
  ritCategory: string;
  ritRemarks: string;
}

export const extractRitNumberFromText = (text?: string): number | null => {
  if (!text) return null;
  const match = text.match(/\bRIT(?:\s*KE)?\s*[-:#.]?\s*(\d+)\b/i);
  if (!match) return null;
  const parsed = parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export const getScheduleRitDetails = (
  sch: ArrivalSchedule,
  allSchedules: ArrivalSchedule[]
): ResolvedRitInfo => {
  const fromRemarks = extractRitNumberFromText(sch.remarks);
  if (fromRemarks) {
    return {
      ritNumber: fromRemarks,
      ritCategory: `RIT ${fromRemarks}`,
      ritRemarks: sch.remarks?.trim() || `PENGIRIMAN BATUBARA RIT KE-${fromRemarks}`,
    };
  }

  const poSchedules = allSchedules
    .filter((s) => s.poId === sch.poId)
    .sort((a, b) => {
      const timeA = new Date(a.etaDateTime || 0).getTime();
      const timeB = new Date(b.etaDateTime || 0).getTime();
      if (timeA !== timeB) return timeA - timeB;
      return (a.id || '').localeCompare(b.id || '');
    });

  const idx = poSchedules.findIndex((s) => s.id === sch.id);
  const ritNumber = idx >= 0 ? idx + 1 : 1;

  return {
    ritNumber,
    ritCategory: `RIT ${ritNumber}`,
    ritRemarks: sch.remarks?.trim() || `PENGIRIMAN BATUBARA RIT KE-${ritNumber}`,
  };
};

export const resolveTransactionRitInfo = (
  tx: CoalTransaction,
  allTransactions: CoalTransaction[],
  schedules: ArrivalSchedule[] = []
): ResolvedRitInfo => {
  const linkedSchedule = tx.scheduleId
    ? schedules.find((s) => s.id === tx.scheduleId)
    : undefined;

  // 1. Explicit RIT category stored on transaction
  if (tx.ritCategory && tx.ritCategory.trim()) {
    const explicitNum =
      extractRitNumberFromText(tx.ritCategory) ||
      extractRitNumberFromText(tx.ritRemarks) ||
      1;
    const normalizedCat = extractRitNumberFromText(tx.ritCategory)
      ? `RIT ${explicitNum}`
      : tx.ritCategory.trim().toUpperCase();

    return {
      ritNumber: explicitNum,
      ritCategory: normalizedCat,
      ritRemarks:
        tx.ritRemarks?.trim() ||
        linkedSchedule?.remarks?.trim() ||
        `PENGIRIMAN BATUBARA RIT KE-${explicitNum}`,
    };
  }

  // 2. Linked schedule in system
  if (linkedSchedule) {
    const schRit = getScheduleRitDetails(linkedSchedule, schedules);
    return {
      ritNumber: schRit.ritNumber,
      ritCategory: schRit.ritCategory,
      ritRemarks: tx.ritRemarks?.trim() || schRit.ritRemarks,
    };
  }

  // 3. Fallback: chronological order within the same PO
  const samePoTxs = allTransactions
    .filter((t) =>
      tx.poId ? t.poId === tx.poId : t.poNumber === tx.poNumber
    )
    .sort((a, b) => {
      const timeA = new Date(a.gateInTime || a.suratJalanDate || 0).getTime();
      const timeB = new Date(b.gateInTime || b.suratJalanDate || 0).getTime();
      if (timeA !== timeB) return timeA - timeB;
      const ticketCmp = (a.ticketNumber || '').localeCompare(b.ticketNumber || '');
      if (ticketCmp !== 0) return ticketCmp;
      return (a.id || '').localeCompare(b.id || '');
    });

  const idx = samePoTxs.findIndex((t) => t.id === tx.id);
  const ritNumber = idx >= 0 ? idx + 1 : 1;

  return {
    ritNumber,
    ritCategory: `RIT ${ritNumber}`,
    ritRemarks: tx.ritRemarks?.trim() || `PENGIRIMAN BATUBARA RIT KE-${ritNumber}`,
  };
};
