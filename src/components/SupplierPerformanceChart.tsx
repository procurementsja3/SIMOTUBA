import React, { useMemo, useState } from 'react';
import {
  TrendingUp,
  CheckCircle2,
  Building2,
  Truck,
  Clock,
  Calendar,
} from 'lucide-react';
import { CoalTransaction, PurchaseOrder } from '../types/coal';
import { getOperationalTimeline } from '../utils/timeUtils';

interface SupplierPerformanceChartProps {
  transactions: CoalTransaction[];
  purchaseOrders: PurchaseOrder[];
}

type ChartMode = 'SUPPLIER' | 'AVG_DELIVERY' | 'AVG_TIMELINE';
type PeriodGranularity = 'MINGGUAN' | 'BULANAN' | 'TAHUNAN';

interface SupplierPerformanceItem {
  key: string;
  supplierName: string;
  nettoTons: number;
  targetTons: number;
  achievementPct: number;
  truckCount: number;
  poCount: number;
  avgShrinkagePct: number | null;
  isTopPerformer: boolean;
}

interface DeliverySupplierBreakdown {
  key: string;
  supplierName: string;
  totalNettoTons: number;
  truckCount: number;
  avgTonsPerRit: number;
}

interface DeliveryPeriodItem {
  id: string;
  label: string;
  shortLabel: string;
  totalNettoTons: number;
  truckCount: number;
  activeDays: number;
  avgTonsPerRit: number;
  avgTonsPerDay: number;
  avgRitsPerDay: number;
  isCurrent: boolean;
  suppliers: DeliverySupplierBreakdown[];
}

interface DeliverySupplierSummary {
  key: string;
  supplierName: string;
  totalNettoTons: number;
  truckCount: number;
  periodCount: number;
  periodLabels: string[];
  activeDays: number;
  avgTonsPerRit: number;
  avgRitsPerPeriod: number;
  avgTonsPerPeriod: number;
}

interface TimelineSupplierBreakdown {
  key: string;
  supplierName: string;
  completedCount: number;
  avgDurationSec: number;
  minDurationSec: number;
  maxDurationSec: number;
}

interface TimelinePeriodItem {
  id: string;
  label: string;
  shortLabel: string;
  completedCount: number;
  avgDurationSec: number;
  minDurationSec: number;
  maxDurationSec: number;
  avgWeighInMin: number;
  avgUnloadingMin: number;
  avgWeighOutMin: number;
  avgGateOutMin: number;
  isCurrent: boolean;
  suppliers: TimelineSupplierBreakdown[];
}

interface TimelineSupplierSummary {
  key: string;
  supplierName: string;
  completedCount: number;
  periodCount: number;
  periodLabels: string[];
  avgDurationSec: number;
  minDurationSec: number;
  maxDurationSec: number;
  avgWeighInMin: number;
  avgUnloadingMin: number;
  avgWeighOutMin: number;
  avgGateOutMin: number;
}

const MONTH_NAMES_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

const MONTH_SHORT_ID = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des',
];

const getISOWeekDetails = (d: Date) => {
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  const weekNumber = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  const isoYear = target.getFullYear();

  const monday = new Date(d);
  const diffToMonday = (d.getDay() === 0 ? -6 : 1) - d.getDay();
  monday.setDate(d.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const pad = (n: number) => String(n).padStart(2, '0');
  const rangeStr = `${pad(monday.getDate())}/${pad(monday.getMonth() + 1)} - ${pad(sunday.getDate())}/${pad(sunday.getMonth() + 1)}/${sunday.getFullYear()}`;

  return { weekNumber, isoYear, monday, sunday, rangeStr };
};

const getTransactionDate = (tx: CoalTransaction): Date | null => {
  const raw = tx.gateInTime || tx.weighOutTime || tx.gateOutTime || tx.createdAt;
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getPeriodBucketMeta = (date: Date, period: PeriodGranularity) => {
  const y = date.getFullYear();
  const m = date.getMonth();

  if (period === 'MINGGUAN') {
    const wk = getISOWeekDetails(date);
    const key = `${wk.isoYear}-W${String(wk.weekNumber).padStart(2, '0')}`;
    const shortLabel = `W-${wk.weekNumber} (${MONTH_SHORT_ID[m]})`;
    const label = `Minggu ke-${wk.weekNumber} · ${wk.rangeStr}`;
    return { key, shortLabel, label };
  }

  if (period === 'BULANAN') {
    const key = `${y}-${String(m + 1).padStart(2, '0')}`;
    const shortLabel = `${MONTH_SHORT_ID[m]} ${y}`;
    const label = `${MONTH_NAMES_ID[m]} ${y}`;
    return { key, shortLabel, label };
  }

  const key = `${y}`;
  return { key, shortLabel: `${y}`, label: `Tahun ${y}` };
};

const getTransactionNettoTon = (tx: CoalTransaction): number => {
  if (typeof tx.nettoTons === 'number' && tx.nettoTons > 0) return tx.nettoTons;
  if (typeof tx.nettoWeight === 'number' && tx.nettoWeight > 0) return tx.nettoWeight / 1000;
  if (typeof tx.grossWeight === 'number' && typeof tx.tareWeight === 'number' && tx.grossWeight > tx.tareWeight) {
    return (tx.grossWeight - tx.tareWeight) / 1000;
  }
  if (typeof tx.suratJalanWeight === 'number' && tx.suratJalanWeight > 0) {
    return tx.suratJalanWeight / 1000;
  }
  return 0;
};

const formatDurationShort = (seconds: number): string => {
  const totalMins = Math.max(0, Math.round(seconds / 60));
  if (totalMins <= 0) return '0 mnt';
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hrs > 0) return mins > 0 ? `${hrs}j ${mins}m` : `${hrs}j`;
  return `${mins} mnt`;
};

const formatDurationLong = (seconds: number): string => {
  const totalMins = Math.max(0, Math.round(seconds / 60));
  if (totalMins <= 0) return '0 Menit';
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hrs > 0) return mins > 0 ? `${hrs} Jam ${mins} Menit` : `${hrs} Jam`;
  return `${mins} Menit`;
};

export const SupplierPerformanceChart: React.FC<SupplierPerformanceChartProps> = ({
  transactions,
  purchaseOrders,
}) => {
  const [chartMode, setChartMode] = useState<ChartMode>('SUPPLIER');
  const [periodType, setPeriodType] = useState<PeriodGranularity>('MINGGUAN');
  const [supplierFilter, setSupplierFilter] = useState<string>('ALL');

  const registeredSuppliers = useMemo(() => {
    const set = new Set<string>();
    purchaseOrders.forEach((po) => {
      if (po.supplierName?.trim()) set.add(po.supplierName.trim());
    });
    transactions.forEach((tx) => {
      if (tx.supplierName?.trim()) set.add(tx.supplierName.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id-ID'));
  }, [purchaseOrders, transactions]);

  const scopedTransactions = useMemo(() => {
    if (supplierFilter === 'ALL') return transactions;
    const target = supplierFilter.trim().toLowerCase();
    return transactions.filter((tx) => (tx.supplierName || '').trim().toLowerCase() === target);
  }, [transactions, supplierFilter]);

  // =========================================================================
  // MODE 1: PERFORMA SUPPLIER (Realisasi Tonase Netto vs Target Kuota PO)
  // =========================================================================
  const supplierData: SupplierPerformanceItem[] = useMemo(() => {
    const map = new Map<
      string,
      {
        supplierName: string;
        nettoTons: number;
        targetTons: number;
        truckCount: number;
        poCount: number;
        shrinkageSum: number;
        shrinkageCount: number;
      }
    >();

    const ensureEntry = (rawName: string) => {
      const cleanName = rawName.trim();
      const key = cleanName.toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          supplierName: cleanName,
          nettoTons: 0,
          targetTons: 0,
          truckCount: 0,
          poCount: 0,
          shrinkageSum: 0,
          shrinkageCount: 0,
        });
      }
      return map.get(key)!;
    };

    purchaseOrders.forEach((po) => {
      const name = (po.supplierName || '').trim();
      if (!name) return;
      const entry = ensureEntry(name);
      entry.poCount += 1;
      entry.targetTons += Number(po.targetTonnage || 0) / 1000;
    });

    transactions.forEach((tx) => {
      if (tx.status === 'REJECTED') return;
      const name = (tx.supplierName || '').trim();
      if (!name) return;
      const netto = getTransactionNettoTon(tx);
      if (tx.status !== 'COMPLETED' && netto <= 0) return;

      const entry = ensureEntry(name);
      entry.nettoTons += netto;
      entry.truckCount += 1;
      if (typeof tx.shrinkagePercentage === 'number' && !Number.isNaN(tx.shrinkagePercentage)) {
        entry.shrinkageSum += tx.shrinkagePercentage;
        entry.shrinkageCount += 1;
      }
    });

    const list = Array.from(map.entries())
      .map(([key, item]) => {
        const achievementPct = item.targetTons > 0 ? (item.nettoTons / item.targetTons) * 100 : 0;
        const avgShrinkagePct =
          item.shrinkageCount > 0 ? item.shrinkageSum / item.shrinkageCount : null;
        return {
          key,
          supplierName: item.supplierName,
          nettoTons: item.nettoTons,
          targetTons: item.targetTons,
          achievementPct,
          truckCount: item.truckCount,
          poCount: item.poCount,
          avgShrinkagePct,
          isTopPerformer: false,
        };
      })
      .sort((a, b) => {
        if (b.nettoTons !== a.nettoTons) return b.nettoTons - a.nettoTons;
        return b.targetTons - a.targetTons;
      });

    if (list.length > 0 && list[0].nettoTons > 0) {
      list[0].isTopPerformer = true;
    }

    return list;
  }, [transactions, purchaseOrders]);

  const maxSupplierTon = useMemo(() => {
    const peak = supplierData.reduce(
      (max, item) => Math.max(max, item.nettoTons, item.targetTons),
      0
    );
    return peak > 0 ? peak : 100;
  }, [supplierData]);

  // =========================================================================
  // MODE 2: GRAFIK RATA-RATA PENGIRIMAN (Mingguan / Bulanan / Tahunan)
  // =========================================================================
  const deliveryPeriodData: DeliveryPeriodItem[] = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        label: string;
        shortLabel: string;
        totalNettoTons: number;
        truckCount: number;
        daySet: Set<string>;
        supplierMap: Map<
          string,
          {
            supplierName: string;
            totalNettoTons: number;
            truckCount: number;
          }
        >;
      }
    >();

    scopedTransactions.forEach((tx) => {
      if (tx.status === 'REJECTED') return;
      const netto = getTransactionNettoTon(tx);
      if (tx.status !== 'COMPLETED' && netto <= 0) return;

      const dt = getTransactionDate(tx);
      if (!dt) return;

      const meta = getPeriodBucketMeta(dt, periodType);
      const dayKey = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      const rawSupplier = (tx.supplierName || 'Tanpa Nama Supplier').trim();
      const supKey = rawSupplier.toLowerCase();

      if (!map.has(meta.key)) {
        map.set(meta.key, {
          id: meta.key,
          label: meta.label,
          shortLabel: meta.shortLabel,
          totalNettoTons: 0,
          truckCount: 0,
          daySet: new Set<string>(),
          supplierMap: new Map(),
        });
      }
      const bucket = map.get(meta.key)!;
      bucket.totalNettoTons += netto;
      bucket.truckCount += 1;
      bucket.daySet.add(dayKey);

      if (!bucket.supplierMap.has(supKey)) {
        bucket.supplierMap.set(supKey, {
          supplierName: rawSupplier,
          totalNettoTons: 0,
          truckCount: 0,
        });
      }
      const supEntry = bucket.supplierMap.get(supKey)!;
      supEntry.totalNettoTons += netto;
      supEntry.truckCount += 1;
    });

    const sorted = Array.from(map.values())
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((item) => {
        const activeDays = Math.max(1, item.daySet.size);
        const suppliers: DeliverySupplierBreakdown[] = Array.from(item.supplierMap.entries())
          .map(([key, sup]) => ({
            key,
            supplierName: sup.supplierName,
            totalNettoTons: sup.totalNettoTons,
            truckCount: sup.truckCount,
            avgTonsPerRit: sup.truckCount > 0 ? sup.totalNettoTons / sup.truckCount : 0,
          }))
          .sort((a, b) => b.totalNettoTons - a.totalNettoTons);

        return {
          id: item.id,
          label: item.label,
          shortLabel: item.shortLabel,
          totalNettoTons: item.totalNettoTons,
          truckCount: item.truckCount,
          activeDays,
          avgTonsPerRit: item.truckCount > 0 ? item.totalNettoTons / item.truckCount : 0,
          avgTonsPerDay: item.totalNettoTons / activeDays,
          avgRitsPerDay: item.truckCount / activeDays,
          isCurrent: false,
          suppliers,
        };
      });

    if (sorted.length > 0) {
      sorted[sorted.length - 1].isCurrent = true;
    }

    return sorted;
  }, [scopedTransactions, periodType]);

  const deliveryBySupplier: DeliverySupplierSummary[] = useMemo(() => {
    const map = new Map<
      string,
      {
        supplierName: string;
        totalNettoTons: number;
        truckCount: number;
        periodMap: Map<string, string>;
        daySet: Set<string>;
      }
    >();

    scopedTransactions.forEach((tx) => {
      if (tx.status === 'REJECTED') return;
      const netto = getTransactionNettoTon(tx);
      if (tx.status !== 'COMPLETED' && netto <= 0) return;

      const dt = getTransactionDate(tx);
      if (!dt) return;

      const meta = getPeriodBucketMeta(dt, periodType);
      const dayKey = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      const rawSupplier = (tx.supplierName || 'Tanpa Nama Supplier').trim();
      const supKey = rawSupplier.toLowerCase();

      if (!map.has(supKey)) {
        map.set(supKey, {
          supplierName: rawSupplier,
          totalNettoTons: 0,
          truckCount: 0,
          periodMap: new Map(),
          daySet: new Set(),
        });
      }
      const entry = map.get(supKey)!;
      entry.totalNettoTons += netto;
      entry.truckCount += 1;
      entry.periodMap.set(meta.key, meta.shortLabel);
      entry.daySet.add(dayKey);
    });

    return Array.from(map.entries())
      .map(([key, item]) => {
        const sortedPeriods = Array.from(item.periodMap.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([, label]) => label);
        const periodCount = Math.max(1, sortedPeriods.length);
        return {
          key,
          supplierName: item.supplierName,
          totalNettoTons: item.totalNettoTons,
          truckCount: item.truckCount,
          periodCount,
          periodLabels: sortedPeriods,
          activeDays: Math.max(1, item.daySet.size),
          avgTonsPerRit: item.truckCount > 0 ? item.totalNettoTons / item.truckCount : 0,
          avgRitsPerPeriod: item.truckCount / periodCount,
          avgTonsPerPeriod: item.totalNettoTons / periodCount,
        };
      })
      .sort((a, b) => b.totalNettoTons - a.totalNettoTons);
  }, [scopedTransactions, periodType]);

  const deliveryOverallSummary = useMemo(() => {
    const totalTons = deliveryPeriodData.reduce((s, d) => s + d.totalNettoTons, 0);
    const totalRits = deliveryPeriodData.reduce((s, d) => s + d.truckCount, 0);
    const overallAvgTonsPerRit = totalRits > 0 ? totalTons / totalRits : 0;
    const avgRitsPerPeriod =
      deliveryPeriodData.length > 0 ? totalRits / deliveryPeriodData.length : 0;
    const maxVal = deliveryPeriodData.reduce(
      (max, d) => Math.max(max, d.avgTonsPerRit, overallAvgTonsPerRit),
      0
    );
    return {
      totalTons,
      totalRits,
      overallAvgTonsPerRit,
      avgRitsPerPeriod,
      maxVal: maxVal > 0 ? maxVal * 1.15 : 40,
    };
  }, [deliveryPeriodData]);

  // =========================================================================
  // MODE 3: GRAFIK RATA-RATA TIMELINE BONGKAR (Mingguan / Bulanan / Tahunan)
  // =========================================================================
  const timelinePeriodData: TimelinePeriodItem[] = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        label: string;
        shortLabel: string;
        durationsSec: number[];
        weighInMins: number[];
        unloadingMins: number[];
        weighOutMins: number[];
        gateOutMins: number[];
        supplierMap: Map<
          string,
          {
            supplierName: string;
            durationsSec: number[];
          }
        >;
      }
    >();

    scopedTransactions.forEach((tx) => {
      if (tx.status === 'REJECTED') return;
      // Fokus pada armada yang sudah memiliki durasi bongkar / selesai keluar gerbang
      const isFinishedOrHasEnd = tx.status === 'COMPLETED' || Boolean(tx.gateOutTime);
      if (!isFinishedOrHasEnd) return;

      const { checkpoints, totalDuration } = getOperationalTimeline(tx);
      if (!totalDuration || totalDuration.totalSeconds <= 0) return;

      const dt = getTransactionDate(tx);
      if (!dt) return;

      const meta = getPeriodBucketMeta(dt, periodType);
      const rawSupplier = (tx.supplierName || 'Tanpa Nama Supplier').trim();
      const supKey = rawSupplier.toLowerCase();

      if (!map.has(meta.key)) {
        map.set(meta.key, {
          id: meta.key,
          label: meta.label,
          shortLabel: meta.shortLabel,
          durationsSec: [],
          weighInMins: [],
          unloadingMins: [],
          weighOutMins: [],
          gateOutMins: [],
          supplierMap: new Map(),
        });
      }

      const bucket = map.get(meta.key)!;
      bucket.durationsSec.push(totalDuration.totalSeconds);

      if (!bucket.supplierMap.has(supKey)) {
        bucket.supplierMap.set(supKey, {
          supplierName: rawSupplier,
          durationsSec: [],
        });
      }
      bucket.supplierMap.get(supKey)!.durationsSec.push(totalDuration.totalSeconds);

      if (typeof checkpoints[1]?.durationMinutesFromPrevious === 'number') {
        bucket.weighInMins.push(checkpoints[1].durationMinutesFromPrevious);
      }
      if (typeof checkpoints[2]?.durationMinutesFromPrevious === 'number') {
        bucket.unloadingMins.push(checkpoints[2].durationMinutesFromPrevious);
      }
      if (typeof checkpoints[3]?.durationMinutesFromPrevious === 'number') {
        bucket.weighOutMins.push(checkpoints[3].durationMinutesFromPrevious);
      }
      if (typeof checkpoints[4]?.durationMinutesFromPrevious === 'number') {
        bucket.gateOutMins.push(checkpoints[4].durationMinutesFromPrevious);
      }
    });

    const avgArr = (arr: number[]) =>
      arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

    const sorted = Array.from(map.values())
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((item) => {
        const count = item.durationsSec.length;
        const avgDurationSec = avgArr(item.durationsSec);
        const minDurationSec = count > 0 ? Math.min(...item.durationsSec) : 0;
        const maxDurationSec = count > 0 ? Math.max(...item.durationsSec) : 0;
        const suppliers: TimelineSupplierBreakdown[] = Array.from(item.supplierMap.entries())
          .map(([key, sup]) => ({
            key,
            supplierName: sup.supplierName,
            completedCount: sup.durationsSec.length,
            avgDurationSec: avgArr(sup.durationsSec),
            minDurationSec: sup.durationsSec.length > 0 ? Math.min(...sup.durationsSec) : 0,
            maxDurationSec: sup.durationsSec.length > 0 ? Math.max(...sup.durationsSec) : 0,
          }))
          .sort((a, b) => b.completedCount - a.completedCount || a.avgDurationSec - b.avgDurationSec);

        return {
          id: item.id,
          label: item.label,
          shortLabel: item.shortLabel,
          completedCount: count,
          avgDurationSec,
          minDurationSec,
          maxDurationSec,
          avgWeighInMin: Math.round(avgArr(item.weighInMins)),
          avgUnloadingMin: Math.round(avgArr(item.unloadingMins)),
          avgWeighOutMin: Math.round(avgArr(item.weighOutMins)),
          avgGateOutMin: Math.round(avgArr(item.gateOutMins)),
          isCurrent: false,
          suppliers,
        };
      });

    if (sorted.length > 0) {
      sorted[sorted.length - 1].isCurrent = true;
    }

    return sorted;
  }, [scopedTransactions, periodType]);

  const timelineBySupplier: TimelineSupplierSummary[] = useMemo(() => {
    const map = new Map<
      string,
      {
        supplierName: string;
        periodMap: Map<string, string>;
        durationsSec: number[];
        weighInMins: number[];
        unloadingMins: number[];
        weighOutMins: number[];
        gateOutMins: number[];
      }
    >();

    scopedTransactions.forEach((tx) => {
      if (tx.status === 'REJECTED') return;
      const isFinishedOrHasEnd = tx.status === 'COMPLETED' || Boolean(tx.gateOutTime);
      if (!isFinishedOrHasEnd) return;

      const { checkpoints, totalDuration } = getOperationalTimeline(tx);
      if (!totalDuration || totalDuration.totalSeconds <= 0) return;

      const dt = getTransactionDate(tx);
      if (!dt) return;

      const meta = getPeriodBucketMeta(dt, periodType);
      const rawSupplier = (tx.supplierName || 'Tanpa Nama Supplier').trim();
      const supKey = rawSupplier.toLowerCase();

      if (!map.has(supKey)) {
        map.set(supKey, {
          supplierName: rawSupplier,
          periodMap: new Map(),
          durationsSec: [],
          weighInMins: [],
          unloadingMins: [],
          weighOutMins: [],
          gateOutMins: [],
        });
      }

      const entry = map.get(supKey)!;
      entry.periodMap.set(meta.key, meta.shortLabel);
      entry.durationsSec.push(totalDuration.totalSeconds);

      if (typeof checkpoints[1]?.durationMinutesFromPrevious === 'number') {
        entry.weighInMins.push(checkpoints[1].durationMinutesFromPrevious);
      }
      if (typeof checkpoints[2]?.durationMinutesFromPrevious === 'number') {
        entry.unloadingMins.push(checkpoints[2].durationMinutesFromPrevious);
      }
      if (typeof checkpoints[3]?.durationMinutesFromPrevious === 'number') {
        entry.weighOutMins.push(checkpoints[3].durationMinutesFromPrevious);
      }
      if (typeof checkpoints[4]?.durationMinutesFromPrevious === 'number') {
        entry.gateOutMins.push(checkpoints[4].durationMinutesFromPrevious);
      }
    });

    const avgArr = (arr: number[]) =>
      arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

    return Array.from(map.entries())
      .map(([key, item]) => {
        const sortedPeriods = Array.from(item.periodMap.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([, label]) => label);
        return {
          key,
          supplierName: item.supplierName,
          completedCount: item.durationsSec.length,
          periodCount: Math.max(1, sortedPeriods.length),
          periodLabels: sortedPeriods,
          avgDurationSec: avgArr(item.durationsSec),
          minDurationSec: item.durationsSec.length > 0 ? Math.min(...item.durationsSec) : 0,
          maxDurationSec: item.durationsSec.length > 0 ? Math.max(...item.durationsSec) : 0,
          avgWeighInMin: Math.round(avgArr(item.weighInMins)),
          avgUnloadingMin: Math.round(avgArr(item.unloadingMins)),
          avgWeighOutMin: Math.round(avgArr(item.weighOutMins)),
          avgGateOutMin: Math.round(avgArr(item.gateOutMins)),
        };
      })
      .sort((a, b) => b.completedCount - a.completedCount || a.avgDurationSec - b.avgDurationSec);
  }, [scopedTransactions, periodType]);

  const timelineOverallSummary = useMemo(() => {
    const totalCount = timelinePeriodData.reduce((s, d) => s + d.completedCount, 0);
    const weightedSum = timelinePeriodData.reduce(
      (s, d) => s + d.avgDurationSec * d.completedCount,
      0
    );
    const overallAvgSec = totalCount > 0 ? weightedSum / totalCount : 0;
    const fastestSec =
      timelinePeriodData.length > 0
        ? Math.min(...timelinePeriodData.map((d) => d.minDurationSec))
        : 0;
    const slowestSec =
      timelinePeriodData.length > 0
        ? Math.max(...timelinePeriodData.map((d) => d.maxDurationSec))
        : 0;
    const maxChartSec = Math.max(overallAvgSec, slowestSec, 60);
    return {
      totalCount,
      overallAvgSec,
      fastestSec,
      slowestSec,
      maxChartSec,
    };
  }, [timelinePeriodData]);

  const periodSuffixLabel =
    periodType === 'MINGGUAN'
      ? 'Per Minggu'
      : periodType === 'BULANAN'
        ? 'Per Bulan'
        : 'Per Tahun';

  const activeTitle =
    chartMode === 'SUPPLIER'
      ? 'Grafik Performa Supplier Batubara'
      : chartMode === 'AVG_DELIVERY'
        ? `Grafik Rata-Rata Pengiriman (${periodSuffixLabel})`
        : `Grafik Rata-Rata Timeline Bongkar (${periodSuffixLabel})`;

  return (
    <div className="bg-white border border-slate-300 rounded-xl p-5 shadow-xs space-y-4">
      {/* Header Row: Title + Chart Mode Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div className="flex flex-wrap items-center gap-2">
          <TrendingUp className="w-4 h-4 text-amber-600 shrink-0" />
          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
            {activeTitle}
          </h4>
          {chartMode === 'SUPPLIER' && supplierData.length > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 border border-slate-300 text-[10px] font-bold text-slate-700 font-mono-num">
              <Building2 className="w-3 h-3 text-amber-600" />
              {supplierData.length} Supplier
            </span>
          )}
          {chartMode !== 'SUPPLIER' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-300 text-[10px] font-bold text-amber-900">
              <Building2 className="w-3 h-3 text-amber-600 shrink-0" />
              {supplierFilter !== 'ALL'
                ? supplierFilter
                : `${chartMode === 'AVG_DELIVERY' ? deliveryBySupplier.length : timelineBySupplier.length} Supplier`}
            </span>
          )}
        </div>

        {/* Mode Switcher Tabs (3 Opsi dalam 1 Grafik) */}
        <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-300 text-[11px]">
          <button
            type="button"
            onClick={() => setChartMode('SUPPLIER')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-bold transition-colors cursor-pointer ${
              chartMode === 'SUPPLIER'
                ? 'bg-amber-500 text-slate-950 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Building2 className="w-3.5 h-3.5 shrink-0" />
            <span>Performa Supplier</span>
          </button>
          <button
            type="button"
            onClick={() => setChartMode('AVG_DELIVERY')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-bold transition-colors cursor-pointer ${
              chartMode === 'AVG_DELIVERY'
                ? 'bg-amber-500 text-slate-950 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Truck className="w-3.5 h-3.5 shrink-0" />
            <span>Rata-Rata Pengiriman</span>
          </button>
          <button
            type="button"
            onClick={() => setChartMode('AVG_TIMELINE')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-bold transition-colors cursor-pointer ${
              chartMode === 'AVG_TIMELINE'
                ? 'bg-amber-500 text-slate-950 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span>Rata-Rata Timeline Bongkar</span>
          </button>
        </div>
      </div>

      {/* Sub-Controls Row: Period Filter (Mingguan/Bulanan/Tahunan) + Supplier Filter + Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {chartMode !== 'SUPPLIER' ? (
          <div className="flex flex-wrap items-center gap-2">
            {/* Period Selector */}
            <div className="inline-flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-300 text-[11px]">
              <span className="px-1.5 text-slate-500 font-semibold flex items-center gap-1">
                <Calendar className="w-3 h-3 text-amber-600" />
                Periode:
              </span>
              {(['MINGGUAN', 'BULANAN', 'TAHUNAN'] as PeriodGranularity[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriodType(p)}
                  className={`px-2.5 py-1 rounded font-bold transition-colors cursor-pointer ${
                    periodType === p
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {p === 'MINGGUAN' ? 'Mingguan' : p === 'BULANAN' ? 'Bulanan' : 'Tahunan'}
                </button>
              ))}
            </div>

            {/* Optional Supplier Filter for Average Delivery & Average Timeline */}
            <div className="relative flex items-center">
              <Building2 className="w-3.5 h-3.5 text-amber-600 absolute left-2.5 pointer-events-none" />
              <select
                aria-label="Filter Supplier Grafik"
                value={supplierFilter}
                onChange={(e) => setSupplierFilter(e.target.value)}
                className="bg-white border border-slate-300 hover:border-amber-500 focus:border-amber-500 rounded-lg pl-8 pr-6 py-1.5 text-[11px] font-semibold text-slate-800 focus:outline-none shadow-2xs cursor-pointer max-w-[230px]"
              >
                <option value="ALL">Semua Supplier ({registeredSuppliers.length})</option>
                {registeredSuppliers.map((sup) => (
                  <option key={sup} value={sup}>
                    {sup}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <div className="text-[11px] text-slate-600 font-medium">
            Perbandingan realisasi tonase netto terhadap target kontrak PO masing-masing supplier
          </div>
        )}

        {/* Dynamic Legend per Mode */}
        <div className="flex flex-wrap items-center gap-4 text-xs font-medium">
          {chartMode === 'SUPPLIER' && (
            <>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-amber-500 inline-block shadow-xs" />
                <span className="text-slate-700">Realisasi Tonase Netto</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-slate-200 border border-slate-400 inline-block" />
                <span className="text-slate-700">Target Kuota PO</span>
              </div>
            </>
          )}
          {chartMode === 'AVG_DELIVERY' && (
            <>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-amber-500 inline-block shadow-xs" />
                <span className="text-slate-700">Rata-Rata Muatan (Ton/Rit)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-slate-200 border border-slate-400 inline-block" />
                <span className="text-slate-700">Rata-Rata Keseluruhan</span>
              </div>
            </>
          )}
          {chartMode === 'AVG_TIMELINE' && (
            <>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-sky-600 inline-block shadow-xs" />
                <span className="text-slate-700">Rata-Rata Durasi Bongkar</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-slate-200 border border-slate-400 inline-block" />
                <span className="text-slate-700">Durasi Terlama (Maks)</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Compact Summary Strip for Period Modes */}
      {chartMode === 'AVG_DELIVERY' && deliveryPeriodData.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
          <div className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
            <span className="text-slate-600">Rata-Rata Muatan / Rit:</span>
            <strong className="font-mono-num font-bold text-amber-800">
              {deliveryOverallSummary.overallAvgTonsPerRit.toLocaleString('id-ID', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{' '}
              Ton/Rit
            </strong>
          </div>
          <div className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
            <span className="text-slate-600">
              Rata-Rata Rit / {periodType === 'MINGGUAN' ? 'Minggu' : periodType === 'BULANAN' ? 'Bulan' : 'Tahun'}:
            </span>
            <strong className="font-mono-num font-bold text-slate-900">
              {deliveryOverallSummary.avgRitsPerPeriod.toFixed(1)} Rit
            </strong>
          </div>
          <div className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
            <span className="text-slate-600">Total Realisasi ({deliveryOverallSummary.totalRits} Rit):</span>
            <strong className="font-mono-num font-bold text-emerald-700">
              {deliveryOverallSummary.totalTons.toLocaleString('id-ID', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{' '}
              Ton
            </strong>
          </div>
        </div>
      )}

      {chartMode === 'AVG_TIMELINE' && timelinePeriodData.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
          <div className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
            <span className="text-slate-600">Rata-Rata Timeline Bongkar:</span>
            <strong className="font-mono-num font-bold text-sky-800">
              {formatDurationLong(timelineOverallSummary.overallAvgSec)}
            </strong>
          </div>
          <div className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
            <span className="text-slate-600">Durasi Tercepat / Terlama:</span>
            <strong className="font-mono-num font-bold text-slate-900">
              {formatDurationShort(timelineOverallSummary.fastestSec)} / {formatDurationShort(timelineOverallSummary.slowestSec)}
            </strong>
          </div>
          <div className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
            <span className="text-slate-600">Total Armada Selesai:</span>
            <strong className="font-mono-num font-bold text-emerald-700">
              {timelineOverallSummary.totalCount} Armada
            </strong>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* CHART BODY 1: PERFORMA SUPPLIER                                   */}
      {/* ================================================================= */}
      {chartMode === 'SUPPLIER' && (
        supplierData.length === 0 ? (
          <div className="py-10 text-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-slate-500 text-xs">
            Belum ada data performa supplier yang tercatat pada Purchase Order maupun transaksi bongkar.
          </div>
        ) : (
          <div className="pt-28 pb-2 overflow-x-auto">
            <div className="min-w-[420px] flex items-start gap-4 sm:gap-6 px-6 pb-3 border-b border-slate-300">
              {supplierData.map((item, idx) => {
                const actualHeightPct =
                  item.nettoTons > 0 ? Math.round((item.nettoTons / maxSupplierTon) * 100) : 0;
                const targetHeightPct =
                  item.targetTons > 0 ? Math.round((item.targetTons / maxSupplierTon) * 100) : 0;
                const isAchieved =
                  item.targetTons > 0 ? item.nettoTons >= item.targetTons * 0.95 : true;
                const tooltipHorizontalAlign =
                  supplierData.length > 1 && idx === 0
                    ? 'left-0'
                    : supplierData.length > 1 && idx === supplierData.length - 1
                      ? 'right-0'
                      : 'left-1/2 -translate-x-1/2';

                return (
                  <div
                    key={item.key}
                    className="flex-1 min-w-[140px] flex flex-col items-center justify-start group relative"
                  >
                    {/* Hover Tooltip */}
                    <div
                      className={`absolute bottom-full mb-2 ${tooltipHorizontalAlign} z-30 hidden group-hover:flex flex-col items-center pointer-events-none whitespace-nowrap bg-white border border-slate-300 text-slate-900 text-[11px] px-3 py-2 rounded-lg shadow-lg ring-1 ring-slate-900/5 space-y-0.5`}
                    >
                      <span className="font-bold text-amber-800 leading-tight">
                        {item.supplierName}
                      </span>
                      <span className="font-mono-num font-bold text-slate-900 leading-tight">
                        {item.nettoTons.toLocaleString('id-ID', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{' '}
                        Ton ({item.truckCount} rit)
                      </span>
                      <span className="text-[10px] font-medium text-slate-600 leading-tight font-mono-num">
                        Target: {item.targetTons.toLocaleString('id-ID', { maximumFractionDigits: 2 })} Ton · Capaian:{' '}
                        <strong className="text-amber-800">{item.achievementPct.toFixed(1)}%</strong>
                      </span>
                      <span className="text-[10px] text-slate-500 leading-tight font-mono-num">
                        {item.poCount} PO
                        {item.avgShrinkagePct !== null
                          ? ` · Rata-rata Susut: ${item.avgShrinkagePct > 0 ? '+' : ''}${item.avgShrinkagePct.toFixed(2)}%`
                          : ''}
                      </span>
                    </div>

                    {/* Dual Bar Container */}
                    <div className="w-full max-w-[54px] flex items-end justify-center relative h-44">
                      {item.targetTons > 0 && (
                        <div
                          className="absolute bottom-0 w-full rounded-t bg-slate-100 border-t-2 border-slate-300 transition-all duration-300"
                          style={{ height: `${Math.min(100, Math.max(10, targetHeightPct))}%` }}
                          title={`Target Kuota PO: ${item.targetTons.toLocaleString('id-ID', { maximumFractionDigits: 2 })} Ton`}
                        />
                      )}
                      {item.nettoTons > 0 && (
                        <div
                          className={`relative z-10 w-4/5 rounded-t transition-all duration-500 group-hover:brightness-105 shadow-xs ${
                            item.isTopPerformer
                              ? 'bg-gradient-to-t from-amber-600 to-amber-500 border-t-2 border-amber-300'
                              : isAchieved
                                ? 'bg-gradient-to-t from-amber-600 to-amber-500'
                                : 'bg-gradient-to-t from-amber-700 to-amber-600'
                          }`}
                          style={{ height: `${Math.min(100, Math.max(8, actualHeightPct))}%` }}
                        >
                          {item.isTopPerformer && (
                            <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-300 animate-ping" />
                          )}
                        </div>
                      )}
                    </div>

                    {/* Value & Achievement Below Bar */}
                    <div className="mt-2 flex items-center gap-1 text-[10px] font-mono-num font-bold text-slate-800 group-hover:text-amber-800 transition-colors whitespace-nowrap">
                      <span>
                        {item.nettoTons >= 1000
                          ? `${(item.nettoTons / 1000).toFixed(1)}k T`
                          : `${item.nettoTons.toFixed(1)} T`}
                      </span>
                      {item.targetTons > 0 && (
                        <span className="text-amber-700">({item.achievementPct.toFixed(1)}%)</span>
                      )}
                    </div>

                    {/* Supplier Name Below Axis */}
                    <div
                      className="mt-1 min-h-[32px] flex items-start justify-center text-[11px] font-bold text-slate-800 group-hover:text-slate-950 transition-colors text-center max-w-[175px] leading-snug break-words"
                      title={item.supplierName}
                    >
                      {item.supplierName}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )
      )}

      {/* ================================================================= */}
      {/* CHART BODY 2: RATA-RATA PENGIRIMAN (Mingguan / Bulanan / Tahunan) */}
      {/* ================================================================= */}
      {chartMode === 'AVG_DELIVERY' && (
        deliveryPeriodData.length === 0 ? (
          <div className="py-10 text-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-slate-500 text-xs">
            Belum ada data pengiriman batubara untuk periode dan filter supplier yang dipilih.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="pt-44 pb-2 overflow-x-auto">
              <div className="min-w-[420px] flex items-start gap-4 sm:gap-6 px-6 pb-3 border-b border-slate-300">
                {deliveryPeriodData.map((item, idx) => {
                  const barHeightPct = Math.round(
                    (item.avgTonsPerRit / deliveryOverallSummary.maxVal) * 100
                  );
                  const benchmarkHeightPct = Math.round(
                    (deliveryOverallSummary.overallAvgTonsPerRit / deliveryOverallSummary.maxVal) * 100
                  );
                  const tooltipHorizontalAlign =
                    deliveryPeriodData.length > 1 && idx === 0
                      ? 'left-0'
                      : deliveryPeriodData.length > 1 && idx === deliveryPeriodData.length - 1
                        ? 'right-0'
                        : 'left-1/2 -translate-x-1/2';

                  return (
                    <div
                      key={item.id}
                      className="flex-1 min-w-[160px] flex flex-col items-center justify-start group relative"
                    >
                      {/* Hover Tooltip (lengkap dengan rincian per supplier) */}
                      <div
                        className={`absolute bottom-full mb-2 ${tooltipHorizontalAlign} z-30 hidden group-hover:flex flex-col items-start pointer-events-none whitespace-nowrap bg-white border border-slate-300 text-slate-900 text-[11px] px-3 py-2 rounded-lg shadow-lg ring-1 ring-slate-900/5 space-y-1`}
                      >
                        <span className="font-bold text-amber-800 leading-tight">{item.label}</span>
                        <span className="font-mono-num font-bold text-slate-900 leading-tight">
                          Rata-Rata: {item.avgTonsPerRit.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Ton/Rit
                        </span>
                        <span className="text-[10px] font-medium text-slate-600 leading-tight font-mono-num">
                          Total: {item.totalNettoTons.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Ton ({item.truckCount} Rit · {item.activeDays} Hari Aktif)
                        </span>
                        {item.suppliers.length > 0 && (
                          <div className="w-full pt-1 mt-0.5 border-t border-slate-200 space-y-0.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 block">
                              Supplier ({item.suppliers.length}):
                            </span>
                            {item.suppliers.slice(0, 3).map((sup) => (
                              <div
                                key={sup.key}
                                className="flex items-center justify-between gap-3 text-[10px] leading-tight"
                              >
                                <span className="font-semibold text-slate-800">{sup.supplierName}</span>
                                <span className="font-mono-num font-bold text-amber-800">
                                  {sup.avgTonsPerRit.toFixed(1)} T/Rit ({sup.truckCount} Rit)
                                </span>
                              </div>
                            ))}
                            {item.suppliers.length > 3 && (
                              <span className="text-[9px] text-slate-500 italic block">
                                +{item.suppliers.length - 3} supplier lainnya (lihat tabel rincian di bawah)
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Dual Bar Container */}
                      <div className="w-full max-w-[54px] flex items-end justify-center relative h-44">
                        {/* Overall Average Benchmark Guide */}
                        <div
                          className="absolute bottom-0 w-full rounded-t bg-slate-100 border-t-2 border-slate-300 transition-all duration-300"
                          style={{ height: `${Math.min(100, Math.max(10, benchmarkHeightPct))}%` }}
                          title={`Rata-Rata Keseluruhan: ${deliveryOverallSummary.overallAvgTonsPerRit.toFixed(2)} Ton/Rit`}
                        />
                        {/* Period Average Bar */}
                        <div
                          className={`relative z-10 w-4/5 rounded-t transition-all duration-500 group-hover:brightness-105 shadow-xs ${
                            item.isCurrent
                              ? 'bg-gradient-to-t from-amber-600 to-amber-500 border-t-2 border-amber-300'
                              : 'bg-gradient-to-t from-amber-700 to-amber-500'
                          }`}
                          style={{ height: `${Math.min(100, Math.max(10, barHeightPct))}%` }}
                        >
                          {item.isCurrent && (
                            <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-300 animate-ping" />
                          )}
                        </div>
                      </div>

                      {/* Primary Metric Below Bar */}
                      <div className="mt-2 flex items-center gap-1 text-[10px] font-mono-num font-bold text-slate-800 group-hover:text-amber-800 transition-colors whitespace-nowrap">
                        <span>{item.avgTonsPerRit.toFixed(1)} T/Rit</span>
                        <span className="text-slate-500">({item.truckCount} Rit)</span>
                      </div>

                      {/* Period Label Below Axis */}
                      <div
                        className="mt-0.5 text-[11px] font-bold text-slate-900 text-center max-w-[170px] leading-snug"
                        title={item.label}
                      >
                        {item.shortLabel}
                      </div>

                      {/* Supplier Names Participating in This Period */}
                      <div className="mt-1.5 w-full max-w-[190px] flex flex-col items-center gap-0.5">
                        {item.suppliers.slice(0, 3).map((sup) => (
                          <div
                            key={sup.key}
                            className="w-full px-1.5 py-0.5 rounded bg-slate-50 border border-slate-200 text-[9.5px] leading-tight text-center text-slate-700"
                            title={`${sup.supplierName}: Rata-rata ${sup.avgTonsPerRit.toFixed(2)} Ton/Rit (${sup.truckCount} Rit)`}
                          >
                            <span className="font-bold text-slate-800 break-words">
                              {sup.supplierName}
                            </span>
                            <span className="block font-mono-num text-[9px] text-amber-800 font-semibold">
                              {sup.avgTonsPerRit.toFixed(1)} T/Rit · {sup.truckCount} Rit
                            </span>
                          </div>
                        ))}
                        {item.suppliers.length > 3 && (
                          <span className="text-[9.5px] font-semibold text-slate-500">
                            +{item.suppliers.length - 3} supplier lainnya
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Rincian Rata-Rata Pengiriman Per Supplier */}
            {deliveryBySupplier.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 overflow-hidden">
                <div className="px-3.5 py-2.5 border-b border-slate-200 bg-slate-100/80 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span className="text-[11px] font-bold text-slate-900 uppercase tracking-wider">
                      Rincian Rata-Rata Pengiriman Per Supplier ({periodSuffixLabel})
                    </span>
                  </div>
                  {supplierFilter !== 'ALL' && (
                    <button
                      type="button"
                      onClick={() => setSupplierFilter('ALL')}
                      className="text-[11px] font-bold text-amber-800 hover:text-amber-950 underline cursor-pointer"
                    >
                      Tampilkan Semua Supplier
                    </button>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-white text-[10px] font-bold uppercase tracking-wider text-slate-600">
                        <th className="py-2 px-3.5">Nama Supplier</th>
                        <th className="py-2 px-3">Periode Aktif</th>
                        <th className="py-2 px-3 text-right">Rata-Rata / Rit</th>
                        <th className="py-2 px-3 text-right">
                          Rata-Rata / {periodType === 'MINGGUAN' ? 'Minggu' : periodType === 'BULANAN' ? 'Bulan' : 'Tahun'}
                        </th>
                        <th className="py-2 px-3.5 text-right">Total Realisasi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {deliveryBySupplier.map((sup) => {
                        const isSelected =
                          supplierFilter !== 'ALL' &&
                          supplierFilter.trim().toLowerCase() === sup.key;
                        return (
                          <tr
                            key={sup.key}
                            onClick={() =>
                              setSupplierFilter(isSelected ? 'ALL' : sup.supplierName)
                            }
                            className={`transition-colors cursor-pointer ${
                              isSelected ? 'bg-amber-50/70' : 'hover:bg-slate-50'
                            }`}
                            title={
                              isSelected
                                ? 'Klik untuk menampilkan semua supplier'
                                : `Klik untuk fokus grafik pada ${sup.supplierName}`
                            }
                          >
                            <td className="py-2 px-3.5 font-bold text-slate-900">
                              <div className="flex items-center gap-1.5">
                                <Building2 className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                <span>{sup.supplierName}</span>
                              </div>
                            </td>
                            <td className="py-2 px-3 text-[11px] text-slate-600 font-medium">
                              {sup.periodLabels.join(', ')}
                            </td>
                            <td className="py-2 px-3 text-right font-mono-num font-bold text-amber-800 whitespace-nowrap">
                              {sup.avgTonsPerRit.toLocaleString('id-ID', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}{' '}
                              Ton/Rit
                            </td>
                            <td className="py-2 px-3 text-right font-mono-num text-slate-800 whitespace-nowrap">
                              <strong>{sup.avgRitsPerPeriod.toFixed(1)} Rit</strong>
                              <span className="text-slate-500 ml-1">
                                ({sup.avgTonsPerPeriod.toLocaleString('id-ID', { maximumFractionDigits: 1 })} T)
                              </span>
                            </td>
                            <td className="py-2 px-3.5 text-right font-mono-num font-bold text-emerald-700 whitespace-nowrap">
                              {sup.totalNettoTons.toLocaleString('id-ID', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}{' '}
                              Ton <span className="text-slate-500 font-semibold">({sup.truckCount} Rit)</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )
      )}

      {/* ================================================================= */}
      {/* CHART BODY 3: RATA-RATA TIMELINE BONGKAR (Mingguan/Bulanan/Tahunan) */}
      {/* ================================================================= */}
      {chartMode === 'AVG_TIMELINE' && (
        timelinePeriodData.length === 0 ? (
          <div className="py-10 text-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-slate-500 text-xs">
            Belum ada data timeline bongkar armada selesai (Gate In s.d Gate Out) untuk periode dan filter supplier yang dipilih.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="pt-44 pb-2 overflow-x-auto">
              <div className="min-w-[420px] flex items-start gap-4 sm:gap-6 px-6 pb-3 border-b border-slate-300">
                {timelinePeriodData.map((item, idx) => {
                  const avgHeightPct = Math.round(
                    (item.avgDurationSec / timelineOverallSummary.maxChartSec) * 100
                  );
                  const maxHeightPct = Math.round(
                    (item.maxDurationSec / timelineOverallSummary.maxChartSec) * 100
                  );
                  const tooltipHorizontalAlign =
                    timelinePeriodData.length > 1 && idx === 0
                      ? 'left-0'
                      : timelinePeriodData.length > 1 && idx === timelinePeriodData.length - 1
                        ? 'right-0'
                        : 'left-1/2 -translate-x-1/2';

                  return (
                    <div
                      key={item.id}
                      className="flex-1 min-w-[160px] flex flex-col items-center justify-start group relative"
                    >
                      {/* Hover Tooltip (lengkap dengan rincian per supplier) */}
                      <div
                        className={`absolute bottom-full mb-2 ${tooltipHorizontalAlign} z-30 hidden group-hover:flex flex-col items-start pointer-events-none whitespace-nowrap bg-white border border-slate-300 text-slate-900 text-[11px] px-3 py-2 rounded-lg shadow-lg ring-1 ring-slate-900/5 space-y-1`}
                      >
                        <span className="font-bold text-sky-800 leading-tight">{item.label}</span>
                        <span className="font-mono-num font-bold text-slate-900 leading-tight">
                          Rata-Rata Bongkar: {formatDurationLong(item.avgDurationSec)} ({item.completedCount} Armada)
                        </span>
                        <span className="text-[10px] font-medium text-slate-600 leading-tight font-mono-num">
                          Tercepat: {formatDurationShort(item.minDurationSec)} · Terlama: {formatDurationShort(item.maxDurationSec)}
                        </span>
                        <span className="text-[10px] text-slate-500 leading-tight font-mono-num">
                          Sub-Proses: Timbang In +{item.avgWeighInMin}m · Bongkar +{item.avgUnloadingMin}m · Timbang Out +{item.avgWeighOutMin}m · Gate Out +{item.avgGateOutMin}m
                        </span>
                        {item.suppliers.length > 0 && (
                          <div className="w-full pt-1 mt-0.5 border-t border-slate-200 space-y-0.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 block">
                              Supplier ({item.suppliers.length}):
                            </span>
                            {item.suppliers.slice(0, 3).map((sup) => (
                              <div
                                key={sup.key}
                                className="flex items-center justify-between gap-3 text-[10px] leading-tight"
                              >
                                <span className="font-semibold text-slate-800">{sup.supplierName}</span>
                                <span className="font-mono-num font-bold text-sky-800">
                                  {formatDurationShort(sup.avgDurationSec)} ({sup.completedCount} Rit)
                                </span>
                              </div>
                            ))}
                            {item.suppliers.length > 3 && (
                              <span className="text-[9px] text-slate-500 italic block">
                                +{item.suppliers.length - 3} supplier lainnya (lihat tabel rincian di bawah)
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Dual Bar Container */}
                      <div className="w-full max-w-[54px] flex items-end justify-center relative h-44">
                        {/* Max Duration Background Guide */}
                        <div
                          className="absolute bottom-0 w-full rounded-t bg-slate-100 border-t-2 border-slate-300 transition-all duration-300"
                          style={{ height: `${Math.min(100, Math.max(10, maxHeightPct))}%` }}
                          title={`Durasi Terlama: ${formatDurationLong(item.maxDurationSec)}`}
                        />
                        {/* Average Turnaround Bar */}
                        <div
                          className={`relative z-10 w-4/5 rounded-t transition-all duration-500 group-hover:brightness-105 shadow-xs ${
                            item.isCurrent
                              ? 'bg-gradient-to-t from-sky-700 to-sky-500 border-t-2 border-sky-300'
                              : 'bg-gradient-to-t from-sky-700 to-sky-600'
                          }`}
                          style={{ height: `${Math.min(100, Math.max(10, avgHeightPct))}%` }}
                        >
                          {item.isCurrent && (
                            <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-300 animate-ping" />
                          )}
                        </div>
                      </div>

                      {/* Primary Metric Below Bar */}
                      <div className="mt-2 flex items-center gap-1 text-[10px] font-mono-num font-bold text-sky-900 group-hover:text-sky-700 transition-colors whitespace-nowrap">
                        <span>{formatDurationShort(item.avgDurationSec)}</span>
                        <span className="text-slate-500">({item.completedCount} Rit)</span>
                      </div>

                      {/* Period Label Below Axis */}
                      <div
                        className="mt-0.5 text-[11px] font-bold text-slate-900 text-center max-w-[170px] leading-snug"
                        title={item.label}
                      >
                        {item.shortLabel}
                      </div>

                      {/* Supplier Names Participating in This Period */}
                      <div className="mt-1.5 w-full max-w-[190px] flex flex-col items-center gap-0.5">
                        {item.suppliers.slice(0, 3).map((sup) => (
                          <div
                            key={sup.key}
                            className="w-full px-1.5 py-0.5 rounded bg-slate-50 border border-slate-200 text-[9.5px] leading-tight text-center text-slate-700"
                            title={`${sup.supplierName}: Rata-rata ${formatDurationLong(sup.avgDurationSec)} (${sup.completedCount} Armada)`}
                          >
                            <span className="font-bold text-slate-800 break-words">
                              {sup.supplierName}
                            </span>
                            <span className="block font-mono-num text-[9px] text-sky-800 font-semibold">
                              {formatDurationShort(sup.avgDurationSec)} · {sup.completedCount} Rit
                            </span>
                          </div>
                        ))}
                        {item.suppliers.length > 3 && (
                          <span className="text-[9.5px] font-semibold text-slate-500">
                            +{item.suppliers.length - 3} supplier lainnya
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Rincian Rata-Rata Timeline Bongkar Per Supplier */}
            {timelineBySupplier.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 overflow-hidden">
                <div className="px-3.5 py-2.5 border-b border-slate-200 bg-slate-100/80 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-sky-700 shrink-0" />
                    <span className="text-[11px] font-bold text-slate-900 uppercase tracking-wider">
                      Rincian Rata-Rata Timeline Bongkar Per Supplier ({periodSuffixLabel})
                    </span>
                  </div>
                  {supplierFilter !== 'ALL' && (
                    <button
                      type="button"
                      onClick={() => setSupplierFilter('ALL')}
                      className="text-[11px] font-bold text-sky-800 hover:text-sky-950 underline cursor-pointer"
                    >
                      Tampilkan Semua Supplier
                    </button>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-white text-[10px] font-bold uppercase tracking-wider text-slate-600">
                        <th className="py-2 px-3.5">Nama Supplier</th>
                        <th className="py-2 px-3">Periode Aktif</th>
                        <th className="py-2 px-3 text-right">Rata-Rata Bongkar</th>
                        <th className="py-2 px-3 text-right">Tercepat / Terlama</th>
                        <th className="py-2 px-3">Rata-Rata Sub-Proses</th>
                        <th className="py-2 px-3.5 text-right">Armada</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {timelineBySupplier.map((sup) => {
                        const isSelected =
                          supplierFilter !== 'ALL' &&
                          supplierFilter.trim().toLowerCase() === sup.key;
                        return (
                          <tr
                            key={sup.key}
                            onClick={() =>
                              setSupplierFilter(isSelected ? 'ALL' : sup.supplierName)
                            }
                            className={`transition-colors cursor-pointer ${
                              isSelected ? 'bg-sky-50/80' : 'hover:bg-slate-50'
                            }`}
                            title={
                              isSelected
                                ? 'Klik untuk menampilkan semua supplier'
                                : `Klik untuk fokus grafik pada ${sup.supplierName}`
                            }
                          >
                            <td className="py-2 px-3.5 font-bold text-slate-900">
                              <div className="flex items-center gap-1.5">
                                <Building2 className="w-3.5 h-3.5 text-sky-700 shrink-0" />
                                <span>{sup.supplierName}</span>
                              </div>
                            </td>
                            <td className="py-2 px-3 text-[11px] text-slate-600 font-medium">
                              {sup.periodLabels.join(', ')}
                            </td>
                            <td className="py-2 px-3 text-right font-mono-num font-bold text-sky-800 whitespace-nowrap">
                              {formatDurationLong(sup.avgDurationSec)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono-num text-slate-700 whitespace-nowrap">
                              {formatDurationShort(sup.minDurationSec)} / {formatDurationShort(sup.maxDurationSec)}
                            </td>
                            <td className="py-2 px-3 text-[11px] font-mono-num text-slate-600 whitespace-nowrap">
                              In +{sup.avgWeighInMin}m · Bongkar +{sup.avgUnloadingMin}m · Out +{sup.avgWeighOutMin}m · Gate +{sup.avgGateOutMin}m
                            </td>
                            <td className="py-2 px-3.5 text-right font-mono-num font-bold text-emerald-700 whitespace-nowrap">
                              {sup.completedCount} Rit
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )
      )}

      {/* Footer Note */}
      <div className="text-[11px] text-slate-600 flex flex-wrap items-center justify-between gap-2 pt-1">
        <span>
          {chartMode === 'SUPPLIER'
            ? '* Data dihitung 100% dari realisasi transaksi riil dan target kuota PO masing-masing supplier tanpa data dummy.'
            : chartMode === 'AVG_DELIVERY'
              ? '* Rata-rata pengiriman dihitung 100% dari tonase netto dan ritase transaksi riil per periode tanpa data dummy.'
              : '* Rata-rata timeline bongkar dihitung 100% dari durasi operasional Gate In s.d Gate Out armada selesai tanpa data dummy.'}
        </span>
        <span className="text-emerald-700 font-bold flex items-center gap-1">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Sinkron Real-time
        </span>
      </div>
    </div>
  );
};
