import React, { useState, useMemo, useEffect } from 'react';
import { 
  Truck, 
  Scale, 
  FlaskConical, 
  Warehouse, 
  ShieldCheck, 
  TrendingUp, 
  AlertTriangle, 
  Clock, 
  ArrowRight, 
  CheckCircle2, 
  Calendar, 
  Layers,
  History,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  Search,
  Printer,
  FileText,
  Activity,
  TimerReset,
  Filter,
  Check,
  ChevronRight,
  Trash2,
  X,
  Building2,
  LayoutDashboard
} from 'lucide-react';
import { PurchaseOrder, ArrivalSchedule, CoalTransaction, ActiveTab } from '../types/coal';
import { calculateDuration, getOperationalTimeline } from '../utils/timeUtils';
import { resolveTransactionRitInfo, getScheduleRitDetails } from '../utils/ritUtils';
import { formatDisplayTicketNumber } from '../utils/ticketUtils';
import { TransactionTimelineModal } from './TransactionTimelineModal';
import { CoalReceivingHistoricalSection } from './CoalReceivingHistoricalSection';
import { SupplierPerformanceChart } from './SupplierPerformanceChart';

interface DashboardOverviewProps {
  purchaseOrders: PurchaseOrder[];
  schedules: ArrivalSchedule[];
  transactions: CoalTransaction[];
  onNavigate: (tab: ActiveTab, filterId?: string) => void;
  onOpenTicket?: (tx: CoalTransaction) => void;
  onCheckInSchedule?: (schedule: ArrivalSchedule) => void;
  onDeleteTransaction?: (txId: string) => void;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  purchaseOrders,
  schedules,
  transactions,
  onNavigate,
  onOpenTicket,
  onCheckInSchedule,
  onDeleteTransaction,
}) => {
  // Modal & Expandable State
  const [selectedTimelineTx, setSelectedTimelineTx] = useState<CoalTransaction | null>(null);
  const [deletingTx, setDeletingTx] = useState<CoalTransaction | null>(null);
  const [expandedTxId, setExpandedTxId] = useState<string | null>(null);
  const [isAlertExpanded, setIsAlertExpanded] = useState<boolean>(true);
  const [historyFilter, setHistoryFilter] = useState<'ALL' | 'COMPLETED' | 'IN_PROGRESS'>('ALL');
  const [historySearch, setHistorySearch] = useState('');
  const [historySupplierFilter, setHistorySupplierFilter] = useState('');
  // Filter pencarian per kolom header pada tabel Durasi Waktu Riwayat Bongkar
  const [histColPlate, setHistColPlate] = useState('');
  const [histColRit, setHistColRit] = useState('');
  const [histColStatus, setHistColStatus] = useState('');
  const [histColDriver, setHistColDriver] = useState('');
  const [histColPoSupplier, setHistColPoSupplier] = useState('');
  const [histColDate, setHistColDate] = useState('');
  const [histColTimeline, setHistColTimeline] = useState('');
  const [historyPage, setHistoryPage] = useState<number>(1);
  const HISTORY_PAGE_SIZE = 8;

  // Filter khusus untuk tabel Monitoring Penerimaan Melebihi Toleransi (> 5%)
  const [toleranceTypeFilter, setToleranceTypeFilter] = useState<'ALL' | 'EXCESS_SHRINKAGE' | 'SURPLUS'>('ALL');
  const [toleranceSupplierFilter, setToleranceSupplierFilter] = useState<string>('');
  const [tolerancePage, setTolerancePage] = useState<number>(1);
  const TOLERANCE_PAGE_SIZE = 10;

  const [kpiScope, setKpiScope] = useState<'TODAY' | 'ALL'>('ALL');

  const isSameLocalDate = (isoString?: string, refDate = new Date()) => {
    if (!isoString) return false;
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return false;
    return (
      d.getFullYear() === refDate.getFullYear() &&
      d.getMonth() === refDate.getMonth() &&
      d.getDate() === refDate.getDate()
    );
  };

  // Compute operational statistics
  const allCompleted = useMemo(
    () => transactions.filter((t) => t.status === 'COMPLETED'),
    [transactions]
  );

  const todayCompletedCount = useMemo(() => {
    const today = new Date();
    return allCompleted.filter((t) => isSameLocalDate(t.gateOutTime || t.gateInTime, today)).length;
  }, [allCompleted]);

  const completedToday = useMemo(() => {
    if (kpiScope === 'ALL') return allCompleted;
    const today = new Date();
    return allCompleted.filter((t) => isSameLocalDate(t.gateOutTime || t.gateInTime, today));
  }, [allCompleted, kpiScope]);

  const totalTonsToday = completedToday.reduce((acc, curr) => acc + (curr.nettoTons || 0), 0);

  const totalKgRealized = useMemo(() => {
    return completedToday.reduce((acc, curr) => {
      if (typeof curr.nettoWeight === 'number' && curr.nettoWeight > 0) {
        return acc + curr.nettoWeight;
      }
      if (typeof curr.nettoTons === 'number' && curr.nettoTons > 0) {
        return acc + Math.round(curr.nettoTons * 1000);
      }
      if (curr.grossWeight && curr.tareWeight && curr.grossWeight > curr.tareWeight) {
        return acc + (curr.grossWeight - curr.tareWeight);
      }
      return acc;
    }, 0);
  }, [completedToday]);

  const totalSuratJalanKg = completedToday.reduce((acc, curr) => acc + (curr.suratJalanWeight || 0), 0);
  const totalWeightDiffKg = completedToday.reduce((acc, curr) => {
    const netto =
      typeof curr.nettoWeight === 'number' && curr.nettoWeight > 0
        ? curr.nettoWeight
        : curr.grossWeight && curr.tareWeight && curr.grossWeight > curr.tareWeight
          ? curr.grossWeight - curr.tareWeight
          : (curr.nettoTons || 0) * 1000;
    const sj = curr.suratJalanWeight || 0;
    return acc + (sj > 0 && netto > 0 ? netto - sj : curr.weightDifference || 0);
  }, 0);
  const totalShrinkageTons = totalWeightDiffKg / 1000;
  const avgShrinkagePct =
    totalSuratJalanKg > 0
      ? (totalWeightDiffKg / totalSuratJalanKg) * 100
      : completedToday.length > 0
        ? completedToday.reduce((acc, curr) => acc + (curr.shrinkagePercentage || 0), 0) / completedToday.length
        : 0;
  const activeContractTolerancePct =
    purchaseOrders.find((po) => po.status === 'ACTIVE')?.tolerancePercentage ??
    purchaseOrders[0]?.tolerancePercentage ??
    5;
  const toleranceAllowanceTons = (totalSuratJalanKg * (activeContractTolerancePct / 100)) / 1000;
  const excessShrinkageTons =
    avgShrinkagePct < -activeContractTolerancePct
      ? Math.max(0, Math.abs(totalShrinkageTons) - toleranceAllowanceTons)
      : 0;
  const excessShrinkagePct =
    avgShrinkagePct < -activeContractTolerancePct
      ? Math.abs(avgShrinkagePct) - activeContractTolerancePct
      : 0;

  const validCalorieList = completedToday
    .filter((t) => t.labResults?.calorieGAR && t.labResults.calorieGAR > 0)
    .map((t) => t.labResults!.calorieGAR);
  const avgCalorie = validCalorieList.length > 0
    ? Math.round(validCalorieList.reduce((a, b) => a + b, 0) / validCalorieList.length)
    : 0;

  // Pipeline Counts
  const scheduledCount = schedules.filter((s) => s.status === 'SCHEDULED' || s.status === 'ON_WAY').length;
  const gateInCount = transactions.filter((t) => t.status === 'GATE_IN').length;
  const weighInCount = transactions.filter((t) => t.status === 'TIMBANG_MASUK').length;
  const unloadingCount = transactions.filter((t) => t.status === 'BONGKAR' || t.status === 'QC_CHECK').length;
  const weighOutCount = transactions.filter((t) => t.status === 'TIMBANG_KELUAR').length;
  const pendingIndependentQcCount = transactions.filter(
    (t) => (Boolean(t.weighOutTime) || t.status === 'GATE_OUT' || t.status === 'COMPLETED') && !t.qcTime
  ).length;
  const completedQcCount = transactions.filter((t) => Boolean(t.qcTime)).length;
  const completedCount = allCompleted.length;

  // Notifikasi Keterlambatan: Jadwal yang seharusnya ada kiriman namun belum ada kedatangan di Pos Security
  const overdueDeliveryAlerts = useMemo(() => {
    const today = new Date();
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth();
    const todayDate = today.getDate();
    const todayMid = new Date(todayYear, todayMonth, todayDate).getTime();

    // Set of scheduleIds that already checked in at Security
    const arrivedScheduleIds = new Set<string>();
    transactions.forEach((tx) => {
      if (tx.scheduleId) arrivedScheduleIds.add(tx.scheduleId);
    });

    return schedules
      .filter((s) => {
        // Exclude cancelled or schedules that have already arrived / entered operational flow
        if (s.status !== 'SCHEDULED' && s.status !== 'ON_WAY' && s.status !== 'OVERDUE') return false;
        // Exclude if already in transactions
        if (arrivedScheduleIds.has(s.id)) return false;

        // Parse ETA Date
        const dateStr = s.etaDateTime ? (s.etaDateTime.includes('T') ? s.etaDateTime.split('T')[0] : s.etaDateTime.slice(0, 10)) : '';
        if (!dateStr) return false;

        const parts = dateStr.split('-');
        if (parts.length === 3) {
          const schTime = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])).getTime();
          // Condition: scheduled date is today or in the past (seharusnya sudah ada kiriman)
          return schTime <= todayMid;
        }
        return false;
      })
      .map((s) => {
        const dateStr = s.etaDateTime ? (s.etaDateTime.includes('T') ? s.etaDateTime.split('T')[0] : s.etaDateTime.slice(0, 10)) : '';
        const parts = dateStr.split('-');
        const schDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        const diffMs = todayMid - schDate.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        return {
          ...s,
          diffDays,
          isToday: diffDays === 0,
          isOverdue: diffDays > 0,
          formattedEtaDate: `${String(schDate.getDate()).padStart(2, '0')}/${String(schDate.getMonth() + 1).padStart(2, '0')}/${schDate.getFullYear()}`,
        };
      })
      .sort((a, b) => b.diffDays - a.diffDays);
  }, [schedules, transactions]);

  const totalPendingTonnage = useMemo(() => {
    return overdueDeliveryAlerts.reduce((acc, curr) => acc + (curr.estimatedTonnage || 0), 0);
  }, [overdueDeliveryAlerts]);

  const totalPendingTrucks = useMemo(() => {
    return overdueDeliveryAlerts.reduce((acc, curr) => acc + (curr.estimatedTruckCount || 1), 0);
  }, [overdueDeliveryAlerts]);

  const overdueDaysCount = useMemo(() => {
    return overdueDeliveryAlerts.filter((a) => a.isOverdue).length;
  }, [overdueDeliveryAlerts]);

  const todayDueCount = useMemo(() => {
    return overdueDeliveryAlerts.filter((a) => a.isToday).length;
  }, [overdueDeliveryAlerts]);

  // Trucks currently inside the terminal
  const activeTrucksInside = useMemo(
    () => transactions.filter((t) => t.status !== 'COMPLETED' && t.status !== 'REJECTED'),
    [transactions]
  );

  // Daftar Khusus: Penerimaan Batubara yang Melebihi Toleransi 5% (Target Kuota vs Berat Netto Penerimaan)
  const outOfToleranceReceivings = useMemo(() => {
    const TOLERANCE_THRESHOLD_PCT = 5;
    const DEFAULT_TARGET_QUOTA_KG = 30000;

    const getScheduleQuotaKg = (sch: ArrivalSchedule): number => {
      const rawKg = Number(sch.estimatedTonnage || 0);
      if (rawKg <= 0) return 0;
      const trucks = Math.max(1, Number(sch.estimatedTruckCount || 1));
      return Math.round(rawKg / trucks);
    };

    const resolveTargetQuotaKg = (tx: CoalTransaction, ritNumber: number): number => {
      if (tx.scheduleId) {
        const directSch = schedules.find((s) => s.id === tx.scheduleId);
        if (directSch) {
          const kg = getScheduleQuotaKg(directSch);
          if (kg > 0) return kg;
        }
      }

      const normPoNum = (tx.poNumber || '').trim().toLowerCase();
      const samePoSchedules = schedules.filter((s) => {
        if (s.status === 'CANCELLED') return false;
        if (tx.poId && s.poId === tx.poId) return true;
        return Boolean(normPoNum) && (s.poNumber || '').trim().toLowerCase() === normPoNum;
      });

      if (samePoSchedules.length > 0) {
        const byRit = samePoSchedules.find(
          (s) => getScheduleRitDetails(s, schedules).ritNumber === ritNumber && getScheduleQuotaKg(s) > 0
        );
        if (byRit) return getScheduleQuotaKg(byRit);

        const txDate = (tx.scheduledDeliveryDate || tx.gateInTime || '').slice(0, 10);
        if (txDate) {
          const byDate = samePoSchedules.find(
            (s) => (s.etaDateTime || '').slice(0, 10) === txDate && getScheduleQuotaKg(s) > 0
          );
          if (byDate) return getScheduleQuotaKg(byDate);
        }

        const firstValid = samePoSchedules.find((s) => getScheduleQuotaKg(s) > 0);
        if (firstValid) return getScheduleQuotaKg(firstValid);
      }

      return DEFAULT_TARGET_QUOTA_KG;
    };

    return transactions
      .filter((tx) => tx.status !== 'REJECTED')
      .map((tx) => {
        const nettoKg =
          typeof tx.nettoWeight === 'number' && tx.nettoWeight > 0
            ? tx.nettoWeight
            : tx.grossWeight && tx.tareWeight && tx.grossWeight > tx.tareWeight
              ? tx.grossWeight - tx.tareWeight
              : (tx.nettoTons || 0) * 1000;

        if (nettoKg <= 0) return null;

        const ritInfo = resolveTransactionRitInfo(tx, transactions, schedules);
        const targetQuotaKg = resolveTargetQuotaKg(tx, ritInfo.ritNumber);
        if (targetQuotaKg <= 0) return null;

        const diffKg = nettoKg - targetQuotaKg;
        const tolerancePct = Number(((diffKg / targetQuotaKg) * 100).toFixed(2));
        const po =
          (tx.poId ? purchaseOrders.find((p) => p.id === tx.poId) : undefined) ||
          purchaseOrders.find(
            (p) => (p.poNumber || '').trim().toLowerCase() === (tx.poNumber || '').trim().toLowerCase()
          );
        const poTolerancePct = Number(po?.tolerancePercentage) > 0 ? Number(po!.tolerancePercentage) : TOLERANCE_THRESHOLD_PCT;
        const effectiveLimitPct = Math.min(TOLERANCE_THRESHOLD_PCT, poTolerancePct);

        if (Math.abs(tolerancePct) <= effectiveLimitPct) return null;

        const alertType: 'EXCESS_SHRINKAGE' | 'SURPLUS' =
          tolerancePct < -effectiveLimitPct ? 'EXCESS_SHRINKAGE' : 'SURPLUS';
        const excessPct = Math.max(0, Math.abs(tolerancePct) - effectiveLimitPct);
        const excessKg = Math.max(0, Math.abs(diffKg) - targetQuotaKg * (effectiveLimitPct / 100));

        return {
          tx,
          targetQuotaKg,
          nettoKg,
          diffKg,
          tolerancePct,
          effectiveLimitPct,
          alertType,
          excessPct,
          excessKg,
          ritInfo,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort(
        (a, b) =>
          new Date(b.tx.gateInTime || b.tx.weighOutTime || 0).getTime() -
          new Date(a.tx.gateInTime || a.tx.weighOutTime || 0).getTime()
      );
  }, [transactions, purchaseOrders, schedules]);

  const toleranceSupplierOptions = useMemo(() => {
    const set = new Set<string>();
    outOfToleranceReceivings.forEach((item) => {
      const name = (item.tx.supplierName || '').trim();
      if (name) set.add(name);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'));
  }, [outOfToleranceReceivings]);

  const filteredOutOfToleranceReceivings = useMemo(() => {
    return outOfToleranceReceivings.filter((item) => {
      if (toleranceTypeFilter !== 'ALL' && item.alertType !== toleranceTypeFilter) {
        return false;
      }
      if (
        toleranceSupplierFilter &&
        (item.tx.supplierName || '').trim() !== toleranceSupplierFilter
      ) {
        return false;
      }
      return true;
    });
  }, [outOfToleranceReceivings, toleranceTypeFilter, toleranceSupplierFilter]);

  useEffect(() => {
    setTolerancePage(1);
  }, [toleranceTypeFilter, toleranceSupplierFilter, outOfToleranceReceivings.length]);

  const toleranceTotalPages = Math.max(
    1,
    Math.ceil(filteredOutOfToleranceReceivings.length / TOLERANCE_PAGE_SIZE)
  );
  const safeTolerancePage = Math.min(tolerancePage, toleranceTotalPages);
  const toleranceStartIndex = (safeTolerancePage - 1) * TOLERANCE_PAGE_SIZE;
  const toleranceEndIndex = Math.min(
    toleranceStartIndex + TOLERANCE_PAGE_SIZE,
    filteredOutOfToleranceReceivings.length
  );
  const paginatedOutOfToleranceReceivings = useMemo(
    () => filteredOutOfToleranceReceivings.slice(toleranceStartIndex, toleranceEndIndex),
    [filteredOutOfToleranceReceivings, toleranceStartIndex, toleranceEndIndex]
  );

  const outOfToleranceStats = useMemo(() => {
    const shrinkageCount = outOfToleranceReceivings.filter(
      (i) => i.alertType === 'EXCESS_SHRINKAGE'
    ).length;
    const surplusCount = outOfToleranceReceivings.filter(
      (i) => i.alertType === 'SURPLUS'
    ).length;
    const totalExcessKg = outOfToleranceReceivings.reduce(
      (sum, i) => sum + i.excessKg,
      0
    );
    return { shrinkageCount, surplusCount, totalExcessKg };
  }, [outOfToleranceReceivings]);

  // Compute sub-process averages across completed transactions (QC-PA excluded from process duration)
  const subProcessAverages = useMemo(() => {
    if (completedToday.length === 0) {
      return {
        avgGateInToWeighIn: 0,
        avgWeighInToUnloading: 0,
        avgUnloadingToWeighOut: 0,
        avgWeighOutToGateOut: 0,
        avgTotalCycleMinutes: 0,
        avgTotalCycleHours: 0,
        count: 0,
      };
    }

    let sum1 = 0;
    let sum2 = 0;
    let sum3 = 0;
    let sum4 = 0;
    let sumTotal = 0;

    completedToday.forEach((tx) => {
      const { checkpoints, totalDuration } = getOperationalTimeline(tx);
      sum1 += checkpoints[1]?.durationMinutesFromPrevious || 0;
      sum2 += checkpoints[2]?.durationMinutesFromPrevious || 0;
      sum3 += checkpoints[3]?.durationMinutesFromPrevious || 0;
      sum4 += checkpoints[4]?.durationMinutesFromPrevious || 0;
      sumTotal += totalDuration.totalMinutes || 0;
    });

    const n = completedToday.length;
    return {
      avgGateInToWeighIn: Math.round(sum1 / n),
      avgWeighInToUnloading: Math.round(sum2 / n),
      avgUnloadingToWeighOut: Math.round(sum3 / n),
      avgWeighOutToGateOut: Math.round(sum4 / n),
      avgTotalCycleMinutes: Math.round(sumTotal / n),
      avgTotalCycleHours: Number((sumTotal / n / 60).toFixed(2)),
      count: n,
    };
  }, [completedToday]);

  // Base filter (status & search) before supplier dropdown filter
  const baseFilteredHistoryTrucks = useMemo(() => {
    return transactions.filter((t) => {
      if (historyFilter === 'COMPLETED' && t.status !== 'COMPLETED') return false;
      if (historyFilter === 'IN_PROGRESS' && (t.status === 'COMPLETED' || t.status === 'REJECTED')) return false;

      if (!historySearch.trim()) return true;
      const q = historySearch.toLowerCase();
      const ritInfo = resolveTransactionRitInfo(t, transactions, schedules);
      return (
        t.vehiclePlate.toLowerCase().includes(q) ||
        t.driverName.toLowerCase().includes(q) ||
        t.poNumber.toLowerCase().includes(q) ||
        t.supplierName.toLowerCase().includes(q) ||
        ritInfo.ritCategory.toLowerCase().includes(q) ||
        (t.ticketNumber && (t.ticketNumber.toLowerCase().includes(q) || formatDisplayTicketNumber(t.ticketNumber).toLowerCase().includes(q)))
      );
    });
  }, [transactions, schedules, historyFilter, historySearch]);

  // Registered supplier dropdown options (dari PO, Jadwal, dan Transaksi terdaftar)
  const registeredHistorySuppliers = useMemo(() => {
    const countMap = new Map<string, number>();

    purchaseOrders.forEach((po) => {
      const name = (po.supplierName || '').trim();
      if (name && !countMap.has(name)) {
        countMap.set(name, 0);
      }
    });

    schedules.forEach((sch) => {
      const name = (sch.supplierName || '').trim();
      if (name && !countMap.has(name)) {
        countMap.set(name, 0);
      }
    });

    transactions.forEach((t) => {
      const name = (t.supplierName || '').trim();
      if (name && !countMap.has(name)) {
        countMap.set(name, 0);
      }
    });

    baseFilteredHistoryTrucks.forEach((t) => {
      const name = (t.supplierName || '').trim();
      if (name) {
        countMap.set(name, (countMap.get(name) || 0) + 1);
      }
    });

    return Array.from(countMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, 'id'));
  }, [purchaseOrders, schedules, transactions, baseFilteredHistoryTrucks]);

  const isAnyHistoryColFilterActive = Boolean(
    histColPlate ||
      histColRit ||
      histColStatus ||
      histColDriver ||
      histColPoSupplier ||
      histColDate ||
      histColTimeline
  );

  const handleResetHistoryColFilters = () => {
    setHistColPlate('');
    setHistColRit('');
    setHistColStatus('');
    setHistColDriver('');
    setHistColPoSupplier('');
    setHistColDate('');
    setHistColTimeline('');
  };

  // Filter list for the history section (termasuk filter dropdown supplier & filter per kolom)
  const filteredHistoryTrucks = useMemo(() => {
    return baseFilteredHistoryTrucks.filter((t) => {
      if (historySupplierFilter && (t.supplierName || '').trim() !== historySupplierFilter) {
        return false;
      }
      if (histColPlate.trim()) {
        const q = histColPlate.toLowerCase().trim();
        if (!(t.vehiclePlate || '').toLowerCase().includes(q)) return false;
      }
      if (histColRit.trim()) {
        const q = histColRit.toLowerCase().trim();
        const ritInfo = resolveTransactionRitInfo(t, transactions, schedules);
        const combined = `${ritInfo.ritCategory} ${ritInfo.ritRemarks}`.toLowerCase();
        if (!combined.includes(q)) return false;
      }
      if (histColStatus) {
        if (histColStatus === 'BONGKAR') {
          if (t.status !== 'BONGKAR' && t.status !== 'QC_CHECK') return false;
        } else if (t.status !== histColStatus) {
          return false;
        }
      }
      if (histColDriver.trim()) {
        const q = histColDriver.toLowerCase().trim();
        const combined = `${t.driverName || ''} ${t.transporterName || ''}`.toLowerCase();
        if (!combined.includes(q)) return false;
      }
      if (histColPoSupplier.trim()) {
        const q = histColPoSupplier.toLowerCase().trim();
        const combined = `${t.poNumber || ''} ${t.supplierName || ''}`.toLowerCase();
        if (!combined.includes(q)) return false;
      }
      if (histColDate.trim()) {
        const q = histColDate.toLowerCase().trim();
        const formatted = t.gateInTime
          ? new Date(t.gateInTime)
              .toLocaleDateString('id-ID', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              })
              .toLowerCase()
          : '';
        const isoDate = (t.gateInTime || '').slice(0, 10).toLowerCase();
        if (!formatted.includes(q) && !isoDate.includes(q)) return false;
      }
      if (histColTimeline.trim()) {
        const q = histColTimeline.toLowerCase().trim();
        const { totalDuration } = getOperationalTimeline(t);
        if (!(totalDuration.text || '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [
    baseFilteredHistoryTrucks,
    historySupplierFilter,
    histColPlate,
    histColRit,
    histColStatus,
    histColDriver,
    histColPoSupplier,
    histColDate,
    histColTimeline,
    transactions,
    schedules,
  ]);

  // Reset pagination to page 1 when filters change
  useEffect(() => {
    setHistoryPage(1);
  }, [
    historyFilter,
    historySearch,
    historySupplierFilter,
    histColPlate,
    histColRit,
    histColStatus,
    histColDriver,
    histColPoSupplier,
    histColDate,
    histColTimeline,
  ]);

  const totalHistoryPages = Math.max(1, Math.ceil(filteredHistoryTrucks.length / HISTORY_PAGE_SIZE));
  const safeHistoryPage = Math.min(historyPage, totalHistoryPages);
  const historyStartIdx = (safeHistoryPage - 1) * HISTORY_PAGE_SIZE;
  const paginatedHistoryTrucks = useMemo(
    () => filteredHistoryTrucks.slice(historyStartIdx, historyStartIdx + HISTORY_PAGE_SIZE),
    [filteredHistoryTrucks, historyStartIdx]
  );

  // Build compact page list for pagination controls
  const historyPageNumbers = useMemo(() => {
    const pages: (number | 'ellipsis')[] = [];
    if (totalHistoryPages <= 7) {
      for (let i = 1; i <= totalHistoryPages; i++) pages.push(i);
      return pages;
    }
    pages.push(1);
    if (safeHistoryPage > 3) pages.push('ellipsis');
    const start = Math.max(2, safeHistoryPage - 1);
    const end = Math.min(totalHistoryPages - 1, safeHistoryPage + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (safeHistoryPage < totalHistoryPages - 2) pages.push('ellipsis');
    pages.push(totalHistoryPages);
    return pages;
  }, [totalHistoryPages, safeHistoryPage]);

  const formatMinutesBadge = (minutes: number) => {
    if (minutes <= 0) return '-';
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hrs > 0) return `${hrs}j ${mins}m`;
    return `${mins} mnt`;
  };

  const toggleExpand = (id: string) => {
    setExpandedTxId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="space-y-6">
      {/* Top Dashboard Header & KPI Scope Switcher Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-300 rounded-xl px-5 py-3.5 shadow-xs">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-slate-900 tracking-wide flex items-center gap-2">
            <LayoutDashboard className="w-5 h-5 text-amber-600 shrink-0" />
            <span>DASHBOARD</span>
          </h2>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-700 font-semibold">
            <Filter className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>Periode Ringkasan KPI:</span>
            <span className="text-[11px] font-normal text-slate-500">
              {kpiScope === 'TODAY'
                ? `Menampilkan transaksi selesai pada tanggal ${new Date().toLocaleDateString('id-ID')}`
                : `Menampilkan seluruh ${allCompleted.length} transaksi selesai kumulatif`}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-300 text-xs">
          <button
            type="button"
            onClick={() => setKpiScope('ALL')}
            className={`px-3 py-1 rounded-md font-bold transition-colors cursor-pointer ${
              kpiScope === 'ALL'
                ? 'bg-amber-500 text-slate-950 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Semua Data ({allCompleted.length})
          </button>
          <button
            type="button"
            onClick={() => setKpiScope('TODAY')}
            className={`px-3 py-1 rounded-md font-bold transition-colors cursor-pointer ${
              kpiScope === 'TODAY'
                ? 'bg-amber-500 text-slate-950 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Hari Ini ({todayCompletedCount})
          </button>
        </div>
      </div>

      {/* Top Welcome & KPI Metric Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>{kpiScope === 'TODAY' ? 'Tonase Netto Hari Ini' : 'Total Tonase Netto'}</span>
            <Scale className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl lg:text-3xl font-bold text-white font-mono-num">
              {totalTonsToday.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs font-semibold text-slate-400">Ton</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-400">
            Dari <span className="text-emerald-400 font-semibold font-mono-num">{completedToday.length}</span> armada ritase selesai
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Qty Realisasi Penerimaan (Kg)</span>
            <TrendingUp className="w-4 h-4 text-amber-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl lg:text-3xl font-bold text-amber-900 font-mono-num">
              {totalKgRealized.toLocaleString('id-ID')}
            </span>
            <span className="text-xs font-semibold text-slate-500">Kg</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500">
            {completedToday.length > 0 ? (
              <span>Setara <strong className="text-slate-800 font-mono-num font-bold">{(totalKgRealized / 1000).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Ton</strong> ({completedToday.length} armada)</span>
            ) : (
              <span>Belum ada armada selesai ditimbang</span>
            )}
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Rata-Rata Deviasi Susut SJ</span>
            <TrendingUp className={`w-4 h-4 ${avgShrinkagePct < -activeContractTolerancePct ? 'text-rose-400' : 'text-emerald-400'}`} />
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl lg:text-3xl font-bold font-mono-num ${avgShrinkagePct < -activeContractTolerancePct ? 'text-rose-400' : 'text-emerald-400'}`}>
              {avgShrinkagePct > 0 ? '+' : ''}{avgShrinkagePct.toFixed(2)}%
            </span>
            <span className="text-xs font-semibold text-slate-400 font-mono-num">
              ({totalShrinkageTons > 0 ? '+' : ''}{totalShrinkageTons.toFixed(2)} Ton)
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-400 space-y-0.5">
            <div>
              Batas toleransi kontrak: <span className="text-slate-300 font-semibold">±{activeContractTolerancePct}%</span>
              {totalSuratJalanKg > 0 && (
                <span className="font-mono-num text-slate-500 ml-1">(±{toleranceAllowanceTons.toFixed(2)} Ton)</span>
              )}
            </div>
            {completedToday.length > 0 && (
              <div className={`font-semibold ${excessShrinkageTons > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                {excessShrinkageTons > 0
                  ? `Di luar toleransi (> ${activeContractTolerancePct}%): -${excessShrinkagePct.toFixed(2)}% (-${excessShrinkageTons.toFixed(2)} Ton)`
                  : `✓ Dalam batas toleransi (±${activeContractTolerancePct}%)`}
              </div>
            )}
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Armada Aktif di Terminal</span>
            <Truck className="w-4 h-4 text-sky-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl lg:text-3xl font-bold text-sky-400 font-mono-num">
              {activeTrucksInside.length}
            </span>
            <span className="text-xs font-semibold text-slate-400">Truk Sedang Proses</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-400">
            <span className="text-amber-400 font-semibold font-mono-num">{scheduledCount}</span> armada dalam perjalanan (ETA)
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* NOTIFIKASI PERINGATAN: JADWAL KIRIMAN BELUM ADA KEDATANGAN DI POS SECURITY */}
      {/* ========================================================================= */}
      {overdueDeliveryAlerts.length > 0 && (
        <div className="bg-amber-50/95 border-2 border-amber-400 rounded-xl p-4 sm:p-5 shadow-sm space-y-3.5 transition-all">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0 mt-0.5">
                <AlertTriangle className="w-5 h-5 text-amber-700 animate-pulse" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-bold text-amber-950 tracking-wide">
                    Peringatan: Jadwal Kiriman Belum Ada Kedatangan di Pos Security
                  </h3>
                  {overdueDaysCount > 0 && (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300 shadow-xs flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-rose-600 animate-ping" />
                      {overdueDaysCount} Pengiriman Terlambat
                    </span>
                  )}
                  {todayDueCount > 0 && (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-xs">
                      {todayDueCount} Jadwal Hari Ini Menunggu
                    </span>
                  )}
                </div>
                <p className="text-xs text-amber-900/80 mt-1 leading-relaxed">
                  Terdapat <strong className="font-bold text-amber-950 font-mono-num">{overdueDeliveryAlerts.length}</strong> jadwal pengiriman batubara (total estimasi <strong className="font-bold text-amber-950 font-mono-num">{(totalPendingTonnage / 1000).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Ton</strong> / <span className="font-mono-num">{totalPendingTonnage.toLocaleString('id-ID')} Kg</span> · <strong className="font-bold text-amber-950 font-mono-num">{totalPendingTrucks} Truk</strong>) yang seharusnya tiba tanggal hari ini atau sebelumnya, namun belum tercatat check-in masuk di Pos Security.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
              <button
                type="button"
                onClick={() => setIsAlertExpanded(!isAlertExpanded)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-amber-100 text-amber-950 text-xs font-bold rounded-lg border border-amber-300 transition-colors shadow-xs cursor-pointer"
              >
                <span>{isAlertExpanded ? 'Tutup Rincian' : `Lihat Rincian (${overdueDeliveryAlerts.length})`}</span>
                {isAlertExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              <button
                type="button"
                onClick={() => onNavigate('schedules')}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold rounded-lg transition-colors shadow-xs cursor-pointer"
              >
                Kelola Jadwal
              </button>
            </div>
          </div>

          {/* Rincian Daftar Jadwal yang Belum Check-in di Pos Security */}
          {isAlertExpanded && (
            <div className="pt-2 border-t border-amber-200/80 space-y-2.5">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {overdueDeliveryAlerts.map((sch) => (
                  <div
                    key={sch.id}
                    className="p-3 bg-white border border-amber-300 rounded-lg shadow-xs space-y-2 hover:border-amber-400 transition-all"
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      <div className="min-w-0">
                        <div className="text-xs font-mono font-bold text-amber-900">
                          PO: {sch.poNumber}
                        </div>
                        <div className="text-xs font-bold text-slate-900 truncate">
                          {sch.supplierName}
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wide border shadow-xs shrink-0 ${
                        sch.isOverdue
                          ? 'bg-rose-50 text-rose-800 border-rose-300 font-bold'
                          : 'bg-amber-50 text-amber-900 border-amber-300 font-bold'
                      }`}>
                        {sch.isOverdue ? `Terlambat ${sch.diffDays} Hari` : 'Jadwal Hari Ini (Belum Tiba)'}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-600 space-y-0.5 pt-1 border-t border-slate-100">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1 text-slate-500 shrink-0">
                          <Calendar className="w-3 h-3 text-amber-600" />
                          <span>Tanggal Seharusnya:</span>
                        </span>
                        <strong className="text-slate-900 font-mono-num font-bold">{sch.formattedEtaDate}</strong>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-500 shrink-0">Estimasi Muatan:</span>
                        <strong className="text-slate-900 font-mono-num font-bold text-right">
                          {(Number(sch.estimatedTonnage) / 1000).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Ton ({Number(sch.estimatedTonnage).toLocaleString('id-ID')} Kg · {sch.estimatedTruckCount || 1} Truk)
                        </strong>
                      </div>
                      {sch.originMine && (
                        <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500">
                          <span className="shrink-0">Asal Tambang:</span>
                          <span className="text-slate-700 truncate text-right">{sch.originMine}</span>
                        </div>
                      )}
                    </div>

                    <div className="pt-2 flex items-center justify-end gap-1.5 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => {
                          if (onCheckInSchedule) {
                            onCheckInSchedule(sch);
                          } else {
                            onNavigate('security');
                          }
                        }}
                        className="w-full py-1.5 px-2 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold rounded flex items-center justify-center gap-1 shadow-xs cursor-pointer transition-colors"
                        title="Langsung Check-In armada ini di Pos Security"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Check-In di Pos Security</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MONITORING KHUSUS: PENERIMAAN MELEBIHI TOLERANSI SUSUT (> 5%)             */}
      {/* ========================================================================= */}
      <div
        className={`bg-white rounded-xl p-5 shadow-xs space-y-4 border-2 ${
          outOfToleranceReceivings.length > 0
            ? 'border-rose-300'
            : 'border-slate-300'
        }`}
      >
        {/* Header Judul Khusus */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div className="flex items-start gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 border ${
                outOfToleranceReceivings.length > 0
                  ? 'bg-rose-50 border-rose-300'
                  : 'bg-emerald-50 border-emerald-300'
              }`}
            >
              {outOfToleranceReceivings.length > 0 ? (
                <AlertTriangle className="w-5 h-5 text-rose-600" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              )}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-black text-slate-900 tracking-wide uppercase">
                  Monitoring Penerimaan Melebihi Toleransi (&gt; 5%)
                </h3>
                {outOfToleranceReceivings.length > 0 ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300 font-mono-num">
                    <span className="w-2 h-2 rounded-full bg-rose-600 animate-ping" />
                    {outOfToleranceReceivings.length} Armada Di Luar Toleransi
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 font-mono-num">
                    0 Armada · Semua Dalam Toleransi (±5%)
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                Daftar khusus monitoring nomor RIT, Nopol armada, Supplier, dan rincian selisih Target Kuota per jadwal pengiriman terhadap Berat Netto penerimaan yang melebihi batas toleransi 5%.
              </p>
            </div>
          </div>

          {/* Filter Cepat saat terdapat data melebihi toleransi */}
          {outOfToleranceReceivings.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center bg-slate-100 border border-slate-300 rounded-lg p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setToleranceTypeFilter('ALL')}
                  className={`px-2.5 py-1 rounded font-bold transition-colors cursor-pointer ${
                    toleranceTypeFilter === 'ALL'
                      ? 'bg-rose-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Semua ({outOfToleranceReceivings.length})
                </button>
                <button
                  type="button"
                  onClick={() => setToleranceTypeFilter('EXCESS_SHRINKAGE')}
                  className={`px-2.5 py-1 rounded font-bold transition-colors cursor-pointer ${
                    toleranceTypeFilter === 'EXCESS_SHRINKAGE'
                      ? 'bg-rose-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Susut &gt;5% ({outOfToleranceStats.shrinkageCount})
                </button>
                <button
                  type="button"
                  onClick={() => setToleranceTypeFilter('SURPLUS')}
                  className={`px-2.5 py-1 rounded font-bold transition-colors cursor-pointer ${
                    toleranceTypeFilter === 'SURPLUS'
                      ? 'bg-amber-500 text-slate-950 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Surplus &gt;5% ({outOfToleranceStats.surplusCount})
                </button>
              </div>

              {toleranceSupplierOptions.length > 1 && (
                <div className="relative flex items-center">
                  <Building2 className="w-3.5 h-3.5 text-rose-600 absolute left-2.5 pointer-events-none" />
                  <select
                    aria-label="Filter Supplier Melebihi Toleransi"
                    value={toleranceSupplierFilter}
                    onChange={(e) => setToleranceSupplierFilter(e.target.value)}
                    className="bg-white border border-slate-300 hover:border-rose-400 focus:border-rose-500 rounded-lg pl-8 pr-6 py-1.5 text-[11px] font-semibold text-slate-800 focus:outline-none cursor-pointer max-w-[220px]"
                  >
                    <option value="">Semua Supplier ({toleranceSupplierOptions.length})</option>
                    {toleranceSupplierOptions.map((sup) => (
                      <option key={sup} value={sup}>
                        {sup}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Ringkasan Cepat saat ada penerimaan > 5% */}
        {outOfToleranceReceivings.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
            <div className="px-3.5 py-2.5 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-between">
              <span className="text-rose-900 font-medium">Kurang / Susut (&lt; -5%):</span>
              <strong className="font-mono-num font-black text-rose-700">
                {outOfToleranceStats.shrinkageCount} Rit
              </strong>
            </div>
            <div className="px-3.5 py-2.5 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-between">
              <span className="text-amber-950 font-medium">Surplus / Lebih (&gt; +5%):</span>
              <strong className="font-mono-num font-black text-amber-800">
                {outOfToleranceStats.surplusCount} Rit
              </strong>
            </div>
            <div className="px-3.5 py-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
              <span className="text-slate-700 font-medium">Total Kelebihan Selisih (&gt; 5%):</span>
              <strong className="font-mono-num font-black text-rose-700">
                {outOfToleranceStats.totalExcessKg.toLocaleString('id-ID', {
                  maximumFractionDigits: 0,
                })}{' '}
                Kg ({(outOfToleranceStats.totalExcessKg / 1000).toFixed(2)} T)
              </strong>
            </div>
          </div>
        )}

        {/* Tabel Kolom Khusus Penerimaan Melebihi Toleransi (> 5%) */}
        <div className="overflow-x-auto rounded-xl border border-slate-300 bg-white">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 text-slate-700 border-b-2 border-slate-300 font-bold uppercase text-[10.5px] tracking-wide">
              <tr>
                <th className="py-2.5 px-3 whitespace-nowrap">Tgl Kedatangan</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Rit Ke-</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Nopol &amp; No. Tiket</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Driver &amp; Angkutan</th>
                <th className="py-2.5 px-3 whitespace-nowrap">PO, Supplier &amp; SJ</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">Target Kuota vs Netto</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">Selisih &amp; Toleransi (%)</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">Kelebihan (&gt; 5%)</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredOutOfToleranceReceivings.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-7 px-4 text-center bg-emerald-50/40">
                    <div className="inline-flex items-center gap-2 text-emerald-800 font-bold text-xs">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>
                        {outOfToleranceReceivings.length === 0
                          ? 'Aman — Tidak ada data penerimaan batubara yang melebihi batas toleransi 5%.'
                          : 'Tidak ada data yang cocok dengan filter jenis/supplier di atas.'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1">
                      {outOfToleranceReceivings.length === 0
                        ? 'Apabila ada transaksi dengan selisih Target Kuota vs Berat Netto penerimaan di atas 5%, data nomor RIT, Nopol, Driver, PO/Supplier, serta nilai kelebihannya akan otomatis tampil di kolom khusus ini.'
                        : 'Ubah pilihan filter untuk melihat seluruh armada di luar toleransi 5%.'}
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedOutOfToleranceReceivings.map((item) => {
                  const { tx, targetQuotaKg, nettoKg, diffKg, tolerancePct, effectiveLimitPct, alertType, excessPct, excessKg, ritInfo } = item;
                  const isShrinkage = alertType === 'EXCESS_SHRINKAGE';
                  const formattedDate = tx.gateInTime
                    ? new Date(tx.gateInTime).toLocaleDateString('id-ID', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })
                    : '-';
                  const formattedTime = tx.gateInTime
                    ? `${new Date(tx.gateInTime).toLocaleTimeString('id-ID', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })} WIB`
                    : '-';

                  return (
                    <tr
                      key={tx.id}
                      className={
                        isShrinkage
                          ? 'bg-rose-50/35 hover:bg-rose-50/70 transition-colors'
                          : 'bg-amber-50/35 hover:bg-amber-50/70 transition-colors'
                      }
                    >
                      {/* 0. TGL KEDATANGAN */}
                      <td className="py-2.5 px-3 align-middle whitespace-nowrap font-mono-num">
                        <div className="text-xs font-bold text-slate-900 flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>{formattedDate}</span>
                        </div>
                        <div className="text-[10px] font-semibold text-amber-700 mt-0.5 pl-4">
                          {formattedTime}
                        </div>
                      </td>

                      {/* 1. RIT KE- */}
                      <td className="py-2.5 px-3 align-middle">
                        <span className="inline-block px-2.5 py-1 rounded-lg bg-rose-100 text-rose-900 border border-rose-300 font-mono-num font-black text-xs whitespace-nowrap">
                          {ritInfo.ritCategory}
                        </span>
                        {ritInfo.ritRemarks && (
                          <div
                            className="text-[10px] text-slate-600 mt-0.5 max-w-[160px] truncate"
                            title={ritInfo.ritRemarks}
                          >
                            {ritInfo.ritRemarks}
                          </div>
                        )}
                      </td>

                      {/* 2. NOPOL & TIKET */}
                      <td className="py-2.5 px-3 align-middle whitespace-nowrap">
                        <span className="inline-block font-mono text-xs font-black text-slate-900 bg-amber-100 px-2 py-0.5 rounded border border-amber-300 tracking-wider">
                          {tx.vehiclePlate}
                        </span>
                        <div className="text-[10px] font-mono-num text-slate-600 mt-0.5">
                          {formatDisplayTicketNumber(tx.ticketNumber)}
                        </div>
                      </td>

                      {/* 3. DRIVER & ANGKUTAN */}
                      <td className="py-2.5 px-3 align-middle whitespace-nowrap">
                        <div className="text-xs font-bold text-slate-900">
                          {tx.driverName || '-'}
                        </div>
                        {tx.transporterName && (
                          <div className="text-[10px] text-slate-600 mt-0.5">
                            {tx.transporterName}
                          </div>
                        )}
                      </td>

                      {/* 4. PO, SUPPLIER & SJ */}
                      <td className="py-2.5 px-3 align-middle">
                        <div className="font-mono text-[11px] font-bold text-amber-800 whitespace-nowrap">
                          {tx.poNumber}
                          <span className="text-slate-500 font-normal ml-1.5">
                            SJ: {tx.suratJalanNumber || '-'}
                          </span>
                        </div>
                        <div
                          className="text-[11px] font-semibold text-slate-800 max-w-[220px] truncate"
                          title={tx.supplierName}
                        >
                          {tx.supplierName}
                        </div>
                      </td>

                      {/* 5. TARGET KUOTA vs NETTO */}
                      <td className="py-2.5 px-3 align-middle text-right font-mono-num whitespace-nowrap">
                        <div className="text-[11px] text-slate-600">
                          Target Kuota: <strong className="text-amber-800">{targetQuotaKg.toLocaleString('id-ID')} Kg</strong>
                        </div>
                        <div className="text-[11px] text-emerald-800">
                          Netto: <strong>{nettoKg.toLocaleString('id-ID')} Kg</strong>
                        </div>
                      </td>

                      {/* 6. SELISIH & TOLERANSI (%) */}
                      <td className="py-2.5 px-3 align-middle text-right font-mono-num whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 rounded font-black text-xs border ${
                            isShrinkage
                              ? 'bg-rose-100 text-rose-800 border-rose-300'
                              : 'bg-amber-100 text-amber-900 border-amber-300'
                          }`}
                        >
                          {tolerancePct > 0 ? '+' : ''}
                          {tolerancePct.toFixed(2)}%
                        </span>
                        <div className="text-[10px] font-bold text-slate-700 mt-0.5">
                          {diffKg > 0 ? '+' : ''}
                          {diffKg.toLocaleString('id-ID')} Kg ({isShrinkage ? 'Kurang' : 'Surplus'})
                        </div>
                      </td>

                      {/* 7. KELEBIHAN (> 5%) */}
                      <td className="py-2.5 px-3 align-middle text-right font-mono-num whitespace-nowrap">
                        <div className="text-xs font-black text-rose-700">
                          +{excessPct.toFixed(2)}% di atas {effectiveLimitPct}%
                        </div>
                        <div className="text-[10px] font-semibold text-rose-800">
                          {excessKg.toLocaleString('id-ID', { maximumFractionDigits: 0 })} Kg (
                          {(excessKg / 1000).toFixed(2)} T)
                        </div>
                      </td>

                      {/* 8. AKSI */}
                      <td className="py-2.5 px-3 align-middle text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedTimelineTx(tx)}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg border border-slate-300 transition-colors cursor-pointer"
                            title="Lihat Timeline Durasi Lengkap"
                          >
                            <History className="w-3.5 h-3.5 text-amber-700" />
                          </button>
                          {onOpenTicket && (
                            <button
                              type="button"
                              onClick={() => onOpenTicket(tx)}
                              className="p-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg transition-colors font-bold cursor-pointer"
                              title="Cetak Dokumen Berita Acara In Out"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Kontrol (Maksimal 10 Data per Halaman) */}
        {filteredOutOfToleranceReceivings.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 text-xs">
            <div className="text-slate-600 font-mono-num">
              Menampilkan{' '}
              <span className="font-bold text-slate-900">
                {toleranceStartIndex + 1}–{toleranceEndIndex}
              </span>{' '}
              dari{' '}
              <span className="font-bold text-slate-900">
                {filteredOutOfToleranceReceivings.length}
              </span>{' '}
              armada · Halaman{' '}
              <span className="font-bold text-rose-700">{safeTolerancePage}</span> /{' '}
              <span className="font-bold text-slate-900">{toleranceTotalPages}</span>{' '}
              <span className="text-[11px] text-slate-500">
                (Maks. {TOLERANCE_PAGE_SIZE} data/halaman)
              </span>
            </div>

            {toleranceTotalPages > 1 && (
              <div className="flex items-center flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setTolerancePage((p) => Math.max(1, p - 1))}
                  disabled={safeTolerancePage <= 1}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 font-semibold hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Sebelumnya</span>
                </button>

                {Array.from({ length: toleranceTotalPages }, (_, idx) => idx + 1)
                  .filter(
                    (page) =>
                      page === 1 ||
                      page === toleranceTotalPages ||
                      Math.abs(page - safeTolerancePage) <= 1
                  )
                  .reduce<(number | 'ellipsis')[]>((acc, page, idx, arr) => {
                    if (idx > 0 && page - arr[idx - 1] > 1) {
                      acc.push('ellipsis');
                    }
                    acc.push(page);
                    return acc;
                  }, [])
                  .map((entry, idx) =>
                    entry === 'ellipsis' ? (
                      <span
                        key={`tol-ellipsis-${idx}`}
                        className="px-1.5 text-slate-400 font-mono-num select-none"
                      >
                        ...
                      </span>
                    ) : (
                      <button
                        key={`tol-page-${entry}`}
                        type="button"
                        onClick={() => setTolerancePage(entry)}
                        className={`min-w-[30px] px-2 py-1.5 rounded-lg border font-mono-num font-bold transition-colors cursor-pointer ${
                          entry === safeTolerancePage
                            ? 'bg-rose-600 text-white border-rose-600 shadow-2xs'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        {entry}
                      </button>
                    )
                  )}

                <button
                  type="button"
                  onClick={() => setTolerancePage((p) => Math.min(toleranceTotalPages, p + 1))}
                  disabled={safeTolerancePage >= toleranceTotalPages}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 font-semibold hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <span>Berikutnya</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Visual Pipeline Progression Radar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 tracking-wide flex items-center gap-2">
              <Layers className="w-5 h-5 text-amber-600" />
              <span>Alur Proses Operasional</span>
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Pantau antrean dan progres armada di setiap tahapan stasiun terminal secara real-time
            </p>
          </div>
          <div className="text-xs text-slate-600">
            Total Armada Terdaftar: <span className="text-slate-950 font-bold font-mono-num">{transactions.length + scheduledCount}</span> Unit
          </div>
        </div>

        {/* 5-Step Operational Pipeline Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* Step 1: ETA Scheduled */}
          <div 
            onClick={() => onNavigate('schedules')}
            className="cursor-pointer bg-slate-950/60 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 rounded-lg p-3.5 transition-all text-left relative overflow-hidden group"
          >
            <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
              <span className="font-semibold text-slate-300">1. Jadwal Pengiriman</span>
              <Calendar className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-2xl font-bold text-white font-mono-num mb-1">
              {scheduledCount}
            </div>
            <p className="text-[11px] text-slate-500 group-hover:text-slate-300 transition-colors">
              Pengiriman terjadwal
            </p>
          </div>

          {/* Step 2: Gate In Security */}
          <div 
            onClick={() => onNavigate('security')}
            className="cursor-pointer bg-slate-950/60 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 rounded-lg p-3.5 transition-all text-left group"
          >
            <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
              <span className="font-semibold text-slate-300">2. Pos Security</span>
              <ShieldCheck className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-bold text-white font-mono-num mb-1">
              {gateInCount}
            </div>
            <p className="text-[11px] text-slate-500 group-hover:text-slate-300 transition-colors">
              Antri pemeriksaan masuk
            </p>
          </div>

          {/* Step 3: Weigh In Gross */}
          <div 
            onClick={() => onNavigate('weigh-in')}
            className="cursor-pointer bg-slate-950/60 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 rounded-lg p-3.5 transition-all text-left group"
          >
            <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
              <span className="font-semibold text-slate-300">3. Timbang Masuk</span>
              <Scale className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-bold text-white font-mono-num mb-1">
              {weighInCount}
            </div>
            <p className="text-[11px] text-slate-500 group-hover:text-slate-300 transition-colors">
              Gross & Verifikasi SJ
            </p>
          </div>

          {/* Step 4: Unloading */}
          <div 
            onClick={() => onNavigate('unloading')}
            className="cursor-pointer bg-slate-950/60 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 rounded-lg p-3.5 transition-all text-left group"
          >
            <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
              <span className="font-semibold text-slate-300">4. Bongkar</span>
              <Warehouse className="w-4 h-4 text-sky-400" />
            </div>
            <div className="text-2xl font-bold text-white font-mono-num mb-1">
              {unloadingCount}
            </div>
            <p className="text-[11px] text-slate-500 group-hover:text-slate-300 transition-colors">
              Dumping di Stockpile
            </p>
          </div>

          {/* Step 5: Weigh Out Tare */}
          <div 
            onClick={() => onNavigate('weigh-out')}
            className="cursor-pointer bg-slate-950/60 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 rounded-lg p-3.5 transition-all text-left group"
          >
            <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
              <span className="font-semibold text-slate-300">5. Timbang Keluar</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold text-white font-mono-num mb-1">
              {weighOutCount}
            </div>
            <p className="text-[11px] text-slate-500 group-hover:text-slate-300 transition-colors">
              Tare & Netto Final
            </p>
          </div>
        </div>

        {/* Independent Post-Process QC-PA Bar (Placed After Timbang Keluar, Excluded from Hours) */}
        <div
          onClick={() => onNavigate('qc')}
          className="mt-3 cursor-pointer bg-slate-950/60 hover:bg-slate-800/80 border border-dashed border-slate-700 hover:border-indigo-500/60 rounded-lg p-3.5 transition-all flex flex-wrap items-center justify-between gap-3 group"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center shrink-0">
              <FlaskConical className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-200">
                  Uji Lab Independen (Pasca Timbang Keluar): QC-PA
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                  Diluar Hitungan Jam Proses · Estimasi Lab ≥24 Jam
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Diupdate terpisah oleh PIC QC setelah proses armada selesai tanpa mengganggu hitungan durasi Gate In s.d. Timbang Keluar / Gate Out.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 font-mono-num">
            <div className="text-right">
              <span className="text-[10px] text-slate-400 font-sans block">Menunggu Update PIC QC</span>
              <strong className="text-base font-bold text-amber-400">{pendingIndependentQcCount} Rit</strong>
              <span className="text-[10px] text-slate-500 ml-1.5">({completedQcCount} Selesai Lab)</span>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-amber-400 transition-colors" />
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION: HISTORICAL DATA PENERIMAAN BATUBARA (MINGGUAN, BULANAN, TAHUNAN) */}
      {/* ========================================================================= */}
      <CoalReceivingHistoricalSection
        transactions={transactions}
        purchaseOrders={purchaseOrders}
        onNavigate={onNavigate}
      />

      {/* ========================================================================= */}
      {/* SECTION: GRAFIK PERFORMA SUPPLIER BATUBARA                                */}
      {/* ========================================================================= */}
      <SupplierPerformanceChart
        transactions={transactions}
        purchaseOrders={purchaseOrders}
      />

      {/* ========================================================================= */}
      {/* SECTION: RIWAYAT SISTEM INTEGRASI & BREAKDOWN WAKTU PROSES PER SUB-PROSES */}
      {/* ========================================================================= */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-5">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-amber-600" />
              <h3 className="text-base font-bold text-slate-900 tracking-wide uppercase">
                RIWAYAT BONGKAR
              </h3>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Riwayat operasional & turnaround time armada dari Pos Security (Gate In) hingga selesai bongkar dan keluar gerbang, dilengkapi rincian durasi per sub-proses.
            </p>
          </div>

          {/* Search & Filter Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
              <input
                type="text"
                placeholder="Cari Nopol / Driver / PO..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 w-44 sm:w-56"
              />
            </div>

            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setHistoryFilter('ALL')}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                  historyFilter === 'ALL'
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Semua ({transactions.length})
              </button>
              <button
                type="button"
                onClick={() => setHistoryFilter('COMPLETED')}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                  historyFilter === 'COMPLETED'
                    ? 'bg-emerald-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Selesai Gerbang ({completedCount})
              </button>
              <button
                type="button"
                onClick={() => setHistoryFilter('IN_PROGRESS')}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                  historyFilter === 'IN_PROGRESS'
                    ? 'bg-blue-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Sedang Proses ({activeTrucksInside.length})
              </button>
            </div>
          </div>
        </div>

        {/* Benchmark / Rata-Rata Durasi Tiap Sub-Proses (Tanpa QC-PA) */}
        <div className="bg-slate-950/70 border border-slate-800/90 rounded-xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Rata-Rata Waktu Siklus Operasional (Gate In s.d. Gate Out · Diluar QC-PA)
            </span>
            <span className="text-[11px] text-slate-400 font-mono-num">
              Sampel: <strong className="text-white">{subProcessAverages.count}</strong> armada selesai checkout
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 text-xs font-mono-num">
            {/* Total Siklus (Solid Enterprise KPI Panel) */}
            <div className="p-3 bg-amber-500/10 border border-amber-500/40 rounded-lg shadow-xs">
              <span className="text-[10px] text-slate-400 font-sans block uppercase font-bold">Total Waktu Siklus</span>
              <div className="text-lg font-black text-amber-400 mt-0.5">
                {formatMinutesBadge(subProcessAverages.avgTotalCycleMinutes)}
              </div>
              <span className="text-[10px] text-slate-400 font-sans">
                {subProcessAverages.avgTotalCycleMinutes > 0 ? `${subProcessAverages.avgTotalCycleMinutes} Menit` : 'Rata-rata siklus'}
              </span>
            </div>

            {/* Sub-Proses 1: Pos Security -> Timbang Masuk */}
            <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
              <span className="text-[10px] text-slate-400 font-sans block uppercase font-semibold">1. Antre Timbang In</span>
              <div className="text-base font-bold text-white mt-0.5">
                {formatMinutesBadge(subProcessAverages.avgGateInToWeighIn)}
              </div>
              <span className="text-[10px] text-slate-500 font-sans">Gate In ➔ Timbang In</span>
            </div>

            {/* Sub-Proses 2: Timbang Masuk -> Bongkar Stockpile */}
            <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
              <span className="text-[10px] text-slate-400 font-sans block uppercase font-semibold">2. Dumping Stockpile</span>
              <div className="text-base font-bold text-sky-300 mt-0.5">
                {formatMinutesBadge(subProcessAverages.avgWeighInToUnloading)}
              </div>
              <span className="text-[10px] text-slate-500 font-sans">Timbang In ➔ Bongkar</span>
            </div>

            {/* Sub-Proses 3: Bongkar -> Timbang Keluar */}
            <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
              <span className="text-[10px] text-slate-400 font-sans block uppercase font-semibold">3. Timbang Keluar (Tare)</span>
              <div className="text-base font-bold text-emerald-300 mt-0.5">
                {formatMinutesBadge(subProcessAverages.avgUnloadingToWeighOut)}
              </div>
              <span className="text-[10px] text-slate-500 font-sans">Bongkar ➔ Timbang Out</span>
            </div>

            {/* Sub-Proses 4: Timbang Keluar -> Gate Out */}
            <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
              <span className="text-[10px] text-slate-400 font-sans block uppercase font-semibold">4. Checkout Gerbang</span>
              <div className="text-base font-bold text-rose-300 mt-0.5">
                {formatMinutesBadge(subProcessAverages.avgWeighOutToGateOut)}
              </div>
              <span className="text-[10px] text-slate-500 font-sans">Timbang Out ➔ Gate Out</span>
            </div>
          </div>
        </div>

        {/* Subheader Durasi Waktu Riwayat Bongkar langsung di atas daftar kartu armada */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <Warehouse className="w-5 h-5 text-amber-600" />
            <h3 className="text-base font-bold text-slate-900 tracking-wide">
              Durasi Waktu Riwayat Bongkar
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Dropdown Filter Nama Supplier Terdaftar */}
            <div className="relative flex items-center">
              <Building2 className="w-3.5 h-3.5 text-amber-600 absolute left-2.5 pointer-events-none" />
              <select
                aria-label="Filter Nama Supplier Terdaftar"
                value={historySupplierFilter}
                onChange={(e) => setHistorySupplierFilter(e.target.value)}
                className="appearance-none bg-white border border-slate-300 hover:border-amber-500 focus:border-amber-500 focus:outline-none rounded-lg pl-8 pr-8 py-1.5 text-xs font-semibold text-slate-800 shadow-xs cursor-pointer transition-colors min-w-[220px] max-w-[300px]"
              >
                <option value="">
                  Semua Supplier ({baseFilteredHistoryTrucks.length} Armada)
                </option>
                {registeredHistorySuppliers.map((sup) => (
                  <option key={sup.name} value={sup.name}>
                    {sup.name} ({sup.count} Armada)
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 pointer-events-none" />
            </div>

            {historySupplierFilter && (
              <button
                type="button"
                onClick={() => setHistorySupplierFilter('')}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 transition-colors cursor-pointer"
                title="Reset filter supplier"
              >
                <X className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            )}

            <span className="px-2.5 py-1.5 rounded-lg bg-slate-100 border border-slate-300 text-xs font-mono-num font-bold text-slate-700">
              {filteredHistoryTrucks.length} Armada
            </span>
          </div>
        </div>

        {/* List of Vehicles with Expandable Sub-Process Breakdown (8 data per halaman + Pagination) */}
        {transactions.length === 0 ? (
          <div className="text-center py-10 bg-slate-950/40 border border-dashed border-slate-800 rounded-xl text-slate-500">
            <Clock className="w-10 h-10 mx-auto mb-2 text-slate-600" />
            <p className="text-sm font-semibold text-slate-300">Belum ada riwayat transaksi armada pada sistem.</p>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Saat armada baru dicatat di Pos Security (Gate In & Gate Out) dan melewati stasiun timbang, data waktu proses dan breakdown tiap tahapan akan otomatis tercatat dan tersaji di sini secara real-time.
            </p>
            <button
              type="button"
              onClick={() => onNavigate('security')}
              className="mt-4 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-lg transition-colors shadow-sm cursor-pointer"
            >
              Mulai Input Armada di Pos Security
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="overflow-x-auto rounded-xl border border-slate-300 bg-white shadow-xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-700 border-b-2 border-slate-300 font-bold uppercase text-[11px] tracking-wide">
                  <tr>
                    <th className="py-3 px-3 whitespace-nowrap">Nopol</th>
                    <th className="py-3 px-3 whitespace-nowrap">RIT</th>
                    <th className="py-3 px-3 whitespace-nowrap">Status</th>
                    <th className="py-3 px-3 whitespace-nowrap">Nama Driver</th>
                    <th className="py-3 px-3 whitespace-nowrap">PO / Supplier</th>
                    <th className="py-3 px-3 whitespace-nowrap">Tgl Kedatangan</th>
                    <th className="py-3 px-3 whitespace-nowrap">Timeline</th>
                    <th className="py-3 px-3 text-right whitespace-nowrap">Aksi</th>
                  </tr>
                  {/* Baris Pencarian Per Kolom Header */}
                  <tr className="bg-slate-50 border-t border-slate-200 font-normal normal-case tracking-normal">
                    {/* 1. Nopol */}
                    <th className="px-2 py-2">
                      <div className="relative flex items-center">
                        <Search className="w-3 h-3 text-slate-400 absolute left-2 pointer-events-none" />
                        <input
                          type="text"
                          value={histColPlate}
                          onChange={(e) => setHistColPlate(e.target.value)}
                          placeholder="Cari Nopol..."
                          className="w-full min-w-[105px] pl-6 pr-5 py-1 text-[11px] rounded border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 shadow-2xs"
                        />
                        {histColPlate && (
                          <button
                            type="button"
                            onClick={() => setHistColPlate('')}
                            className="absolute right-1 text-slate-400 hover:text-slate-700 text-xs px-0.5 cursor-pointer"
                            title="Hapus filter nopol"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </th>

                    {/* 2. RIT */}
                    <th className="px-2 py-2">
                      <div className="relative flex items-center">
                        <Search className="w-3 h-3 text-slate-400 absolute left-2 pointer-events-none" />
                        <input
                          type="text"
                          value={histColRit}
                          onChange={(e) => setHistColRit(e.target.value)}
                          placeholder="Cari RIT..."
                          className="w-full min-w-[90px] pl-6 pr-5 py-1 text-[11px] rounded border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 shadow-2xs"
                        />
                        {histColRit && (
                          <button
                            type="button"
                            onClick={() => setHistColRit('')}
                            className="absolute right-1 text-slate-400 hover:text-slate-700 text-xs px-0.5 cursor-pointer"
                            title="Hapus filter RIT"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </th>

                    {/* 3. Status */}
                    <th className="px-2 py-2">
                      <select
                        value={histColStatus}
                        onChange={(e) => setHistColStatus(e.target.value)}
                        className="w-full min-w-[130px] px-2 py-1 text-[11px] rounded border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 shadow-2xs cursor-pointer"
                      >
                        <option value="">Semua Status</option>
                        <option value="COMPLETED">Selesai (Keluar)</option>
                        <option value="GATE_IN">Gate In</option>
                        <option value="TIMBANG_MASUK">Timbang Masuk</option>
                        <option value="BONGKAR">Proses Bongkar</option>
                        <option value="TIMBANG_KELUAR">Timbang Keluar</option>
                        <option value="GATE_OUT">Menunggu Gate Out</option>
                        <option value="REJECTED">Ditolak / Retur</option>
                      </select>
                    </th>

                    {/* 4. Nama Driver */}
                    <th className="px-2 py-2">
                      <div className="relative flex items-center">
                        <Search className="w-3 h-3 text-slate-400 absolute left-2 pointer-events-none" />
                        <input
                          type="text"
                          value={histColDriver}
                          onChange={(e) => setHistColDriver(e.target.value)}
                          placeholder="Cari Driver..."
                          className="w-full min-w-[110px] pl-6 pr-5 py-1 text-[11px] rounded border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 shadow-2xs"
                        />
                        {histColDriver && (
                          <button
                            type="button"
                            onClick={() => setHistColDriver('')}
                            className="absolute right-1 text-slate-400 hover:text-slate-700 text-xs px-0.5 cursor-pointer"
                            title="Hapus filter driver"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </th>

                    {/* 5. PO / Supplier */}
                    <th className="px-2 py-2">
                      <div className="relative flex items-center">
                        <Search className="w-3 h-3 text-slate-400 absolute left-2 pointer-events-none" />
                        <input
                          type="text"
                          value={histColPoSupplier}
                          onChange={(e) => setHistColPoSupplier(e.target.value)}
                          placeholder="Cari PO / Supplier..."
                          className="w-full min-w-[140px] pl-6 pr-5 py-1 text-[11px] rounded border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 shadow-2xs"
                        />
                        {histColPoSupplier && (
                          <button
                            type="button"
                            onClick={() => setHistColPoSupplier('')}
                            className="absolute right-1 text-slate-400 hover:text-slate-700 text-xs px-0.5 cursor-pointer"
                            title="Hapus filter PO / Supplier"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </th>

                    {/* 6. Tgl Kedatangan */}
                    <th className="px-2 py-2">
                      <div className="relative flex items-center">
                        <Search className="w-3 h-3 text-slate-400 absolute left-2 pointer-events-none" />
                        <input
                          type="text"
                          value={histColDate}
                          onChange={(e) => setHistColDate(e.target.value)}
                          placeholder="Cari Tanggal..."
                          className="w-full min-w-[105px] pl-6 pr-5 py-1 text-[11px] rounded border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 shadow-2xs"
                        />
                        {histColDate && (
                          <button
                            type="button"
                            onClick={() => setHistColDate('')}
                            className="absolute right-1 text-slate-400 hover:text-slate-700 text-xs px-0.5 cursor-pointer"
                            title="Hapus filter tanggal"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </th>

                    {/* 7. Timeline */}
                    <th className="px-2 py-2">
                      <div className="relative flex items-center">
                        <Search className="w-3 h-3 text-slate-400 absolute left-2 pointer-events-none" />
                        <input
                          type="text"
                          value={histColTimeline}
                          onChange={(e) => setHistColTimeline(e.target.value)}
                          placeholder="Cari Durasi..."
                          className="w-full min-w-[105px] pl-6 pr-5 py-1 text-[11px] rounded border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 shadow-2xs"
                        />
                        {histColTimeline && (
                          <button
                            type="button"
                            onClick={() => setHistColTimeline('')}
                            className="absolute right-1 text-slate-400 hover:text-slate-700 text-xs px-0.5 cursor-pointer"
                            title="Hapus filter durasi"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </th>

                    {/* 8. Aksi / Reset Filter */}
                    <th className="px-2 py-2 text-right">
                      {isAnyHistoryColFilterActive ? (
                        <button
                          type="button"
                          onClick={handleResetHistoryColFilters}
                          className="inline-flex items-center justify-center gap-1 px-2 py-1 text-[11px] font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-300 rounded shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
                          title="Reset semua filter pencarian kolom"
                        >
                          <X className="w-3 h-3" />
                          <span>Reset</span>
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-400 font-medium">Filter</span>
                      )}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredHistoryTrucks.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-10 px-4 text-center bg-slate-50/50">
                        <Clock className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                        <p className="text-sm font-semibold text-slate-700">
                          Tidak ada data riwayat bongkar yang sesuai dengan filter pencarian.
                        </p>
                        <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                          {historySupplierFilter
                            ? `Belum ada transaksi bongkar untuk supplier "${historySupplierFilter}" pada filter saat ini.`
                            : 'Coba ubah kata kunci pencarian pada kolom di atas atau reset semua filter.'}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setHistorySupplierFilter('');
                            setHistorySearch('');
                            setHistoryFilter('ALL');
                            handleResetHistoryColFilters();
                          }}
                          className="mt-3 px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-lg transition-colors shadow-xs cursor-pointer"
                        >
                          Reset Semua Filter
                        </button>
                      </td>
                    </tr>
                  ) : (
                  paginatedHistoryTrucks.map((tx) => {
                    const { checkpoints, totalDuration } = getOperationalTimeline(tx);
                    const ritInfo = resolveTransactionRitInfo(tx, transactions, schedules);
                    const isExpanded = expandedTxId === tx.id;
                    const isCompleted = tx.status === 'COMPLETED';
                    const formattedArrivalDate = tx.gateInTime
                      ? new Date(tx.gateInTime).toLocaleDateString('id-ID', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })
                      : '-';

                    return (
                      <React.Fragment key={tx.id}>
                        <tr
                          className={`transition-colors ${
                            isExpanded
                              ? 'bg-amber-50/40'
                              : isCompleted
                                ? 'bg-white hover:bg-slate-50'
                                : 'bg-amber-50/20 hover:bg-amber-50/50'
                          }`}
                        >
                          {/* 1. NOPOL */}
                          <td className="py-3 px-3 align-middle whitespace-nowrap">
                            <span className="inline-block font-mono text-sm font-black text-amber-900 bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-300 tracking-wider">
                              {tx.vehiclePlate}
                            </span>
                          </td>

                          {/* 2. RIT */}
                          <td className="py-3 px-3 align-middle whitespace-nowrap">
                            <span className="inline-block text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-sky-50 text-sky-800 border border-sky-300">
                              {ritInfo.ritCategory}
                            </span>
                          </td>

                          {/* 3. STATUS */}
                          <td className="py-3 px-3 align-middle whitespace-nowrap">
                            <span
                              className={`inline-block px-2.5 py-1 rounded text-[11px] font-bold ${
                                isCompleted
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              }`}
                            >
                              {isCompleted ? 'SELESAI (SUDAH KELUAR GERBANG)' : `SEDANG PROSES (${tx.status})`}
                            </span>
                          </td>

                          {/* 4. NAMA DRIVER */}
                          <td className="py-3 px-3 align-middle whitespace-nowrap">
                            <span className="text-xs font-bold text-slate-900">
                              {tx.driverName || '-'}
                            </span>
                          </td>

                          {/* 5. PO / SUPPLIER */}
                          <td className="py-3 px-3 align-middle">
                            <div className="font-mono text-xs font-bold text-amber-800 whitespace-nowrap">
                              {tx.poNumber}
                            </div>
                            <div className="text-[11px] text-slate-600 font-medium leading-snug max-w-[240px] truncate" title={tx.supplierName}>
                              {tx.supplierName}
                            </div>
                          </td>

                          {/* 6. TGL KEDATANGAN */}
                          <td className="py-3 px-3 align-middle whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-900 px-2.5 py-1 rounded border border-slate-300 font-mono-num font-bold text-xs">
                              {formattedArrivalDate}
                            </span>
                          </td>

                          {/* 7. TIMELINE */}
                          <td className="py-3 px-3 align-middle whitespace-nowrap font-mono-num">
                            <div className="text-[10px] text-slate-500 font-sans font-medium leading-tight">
                              Total Durasi Operasional
                            </div>
                            <div className="text-xs font-black text-amber-900 flex items-center gap-1.5 mt-0.5">
                              <Clock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                              <span>{totalDuration.text}</span>
                            </div>
                          </td>

                          {/* 8. AKSI */}
                          <td className="py-3 px-3 align-middle text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => toggleExpand(tx.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition-colors cursor-pointer whitespace-nowrap"
                              >
                                <span>{isExpanded ? 'Tutup Rincian' : 'Rincian Breakdown'}</span>
                                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </button>

                              <button
                                type="button"
                                onClick={() => setSelectedTimelineTx(tx)}
                                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-lg border border-slate-700 transition-colors cursor-pointer"
                                title="Buka Timeline Grafis Lengkap"
                              >
                                <History className="w-4 h-4" />
                              </button>

                              {onOpenTicket && isCompleted && (
                                <button
                                  type="button"
                                  onClick={() => onOpenTicket(tx)}
                                  className="p-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg transition-colors font-bold cursor-pointer"
                                  title="Cetak Dokumen Berita Acara In Out"
                                >
                                  <Printer className="w-4 h-4" />
                                </button>
                              )}

                              {onDeleteTransaction && (
                                <button
                                  type="button"
                                  onClick={() => setDeletingTx(tx)}
                                  className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 rounded-lg transition-colors font-bold cursor-pointer"
                                  title="Hapus Riwayat Bongkar"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* Expandable Sub-Process Breakdown View */}
                        {isExpanded && (
                          <tr className="bg-slate-50/90">
                            <td colSpan={8} className="p-4 border-t border-slate-200">
                              <div className="space-y-3">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs text-slate-600">
                                  <span className="font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1">
                                    <Activity className="w-3.5 h-3.5 text-amber-600" />
                                    Rincian Durasi Per Masing-Masing Sub-Proses:
                                  </span>
                                  <span className="font-mono-num text-slate-700">
                                    Tgl Kedatangan: <strong className="text-slate-950 font-bold">{formattedArrivalDate}</strong> · Masuk: <strong className="text-slate-950">{checkpoints[0]?.formattedTime} WIB</strong> ➔ Keluar: <strong className="text-slate-950">{checkpoints[checkpoints.length - 1]?.formattedTime !== '-' ? checkpoints[checkpoints.length - 1]?.formattedTime + ' WIB' : 'Masih di dalam'}</strong>
                                  </span>
                                </div>

                                {/* 5-Stage Operational Sub-Process Breakdown Grid (Diluar QC-PA) */}
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-2.5 text-xs">
                                  {/* Sub-Proses 1: Gate In */}
                                  <div className="p-3 rounded-lg bg-white border border-slate-300 space-y-1 shadow-xs flex flex-col justify-between">
                                    <div className="space-y-1">
                                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-900">
                                        <span className="flex items-center gap-1">
                                          <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                                          1. Gate In Posko
                                        </span>
                                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">Done</span>
                                      </div>
                                      <div className="text-[10px] font-mono-num text-slate-700">
                                        Tgl: <strong className="text-slate-950 font-bold">{formattedArrivalDate}</strong>
                                      </div>
                                      <div className="text-[11px] font-mono-num text-slate-700">
                                        Waktu: <strong className="text-slate-950 font-bold">{checkpoints[0]?.formattedTime} WIB</strong>
                                      </div>
                                      <div className="text-[10px] text-slate-600 truncate">
                                        Petugas: {tx.securityOfficer || 'Security Posko'}
                                      </div>
                                      <div className="text-[10px] text-slate-600 truncate">
                                        SJ: {tx.suratJalanNumber}
                                      </div>
                                    </div>
                                    {tx.securityNotes?.trim() && (
                                      <div className="mt-2 pt-1.5 border-t border-slate-200">
                                        <div className="p-1.5 rounded bg-amber-50 border border-amber-200 text-[10px] text-slate-800 leading-snug break-words">
                                          <span className="font-bold text-amber-900 inline-flex items-center gap-1 mr-1">
                                            <FileText className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                                            Catatan:
                                          </span>
                                          <span>{tx.securityNotes.trim()}</span>
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  {/* Sub-Proses 2: Timbang Masuk */}
                                  <div className="p-3 rounded-lg bg-white border border-slate-300 space-y-1 shadow-xs flex flex-col justify-between">
                                    <div className="space-y-1">
                                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-900">
                                        <span className="flex items-center gap-1">
                                          <Scale className="w-3.5 h-3.5 text-blue-600" />
                                          2. Timbang In (Gross)
                                        </span>
                                        {checkpoints[1]?.durationFromPrevious && (
                                          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                            {checkpoints[1]?.durationFromPrevious}
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[11px] font-mono-num text-slate-700">
                                        Waktu: <strong className="text-slate-950 font-bold">{checkpoints[1]?.formattedTime} {checkpoints[1]?.formattedTime !== '-' ? 'WIB' : ''}</strong>
                                      </div>
                                      <div className="text-[10px] text-slate-600 truncate">
                                        Gross: {tx.grossWeight > 0 ? `${(tx.grossWeight / 1000).toFixed(2)} Ton` : '-'}
                                      </div>
                                      <div className="text-[10px] text-slate-600 truncate">
                                        Operator: {tx.weighInOperator || 'JT-01'}
                                      </div>
                                    </div>
                                    {tx.weighInNotes?.trim() && (
                                      <div className="mt-2 pt-1.5 border-t border-slate-200">
                                        <div className="p-1.5 rounded bg-blue-50 border border-blue-200 text-[10px] text-slate-800 leading-snug break-words">
                                          <span className="font-bold text-blue-900 inline-flex items-center gap-1 mr-1">
                                            <FileText className="w-2.5 h-2.5 text-blue-600 shrink-0" />
                                            Catatan:
                                          </span>
                                          <span>{tx.weighInNotes.trim()}</span>
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  {/* Sub-Proses 3: Bongkar Muatan */}
                                  <div className="p-3 rounded-lg bg-white border border-slate-300 space-y-1 shadow-xs flex flex-col justify-between">
                                    <div className="space-y-1">
                                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-900">
                                        <span className="flex items-center gap-1">
                                          <Warehouse className="w-3.5 h-3.5 text-sky-600" />
                                          3. Bongkar Muatan
                                        </span>
                                        {checkpoints[2]?.durationFromPrevious && (
                                          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                            {checkpoints[2]?.durationFromPrevious}
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[11px] font-mono-num text-slate-700">
                                        Waktu: <strong className="text-slate-950 font-bold">{checkpoints[2]?.formattedTime} {checkpoints[2]?.formattedTime !== '-' ? 'WIB' : ''}</strong>
                                      </div>
                                      <div className="text-[10px] text-slate-600 truncate">
                                        Lokasi: {tx.unloadingStockpile || tx.assignedStockpile || 'Stockpile Utama'}
                                      </div>
                                      <div className="text-[10px] text-slate-600 truncate">
                                        Tally: {tx.unloadingChecker || '-'}
                                      </div>
                                    </div>
                                    {tx.unloadingNotes?.trim() && (
                                      <div className="mt-2 pt-1.5 border-t border-slate-200">
                                        <div className="p-1.5 rounded bg-sky-50 border border-sky-200 text-[10px] text-slate-800 leading-snug break-words">
                                          <span className="font-bold text-sky-900 inline-flex items-center gap-1 mr-1">
                                            <FileText className="w-2.5 h-2.5 text-sky-600 shrink-0" />
                                            Catatan:
                                          </span>
                                          <span>{tx.unloadingNotes.trim()}</span>
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  {/* Sub-Proses 4: Timbang Keluar */}
                                  <div className="p-3 rounded-lg bg-white border border-slate-300 space-y-1 shadow-xs flex flex-col justify-between">
                                    <div className="space-y-1">
                                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-900">
                                        <span className="flex items-center gap-1">
                                          <Scale className="w-3.5 h-3.5 text-emerald-600" />
                                          4. Timbang Out (Tare)
                                        </span>
                                        {checkpoints[3]?.durationFromPrevious && (
                                          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                            {checkpoints[3]?.durationFromPrevious}
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[11px] font-mono-num text-slate-700">
                                        Waktu: <strong className="text-slate-950 font-bold">{checkpoints[3]?.formattedTime} {checkpoints[3]?.formattedTime !== '-' ? 'WIB' : ''}</strong>
                                      </div>
                                      <div className="text-[10px] text-slate-700 truncate font-mono">
                                        Netto: <strong className="text-emerald-700 font-bold">{(tx.nettoTons || 0).toFixed(2)} Ton</strong>
                                      </div>
                                      <div className="text-[10px] text-slate-600 truncate font-mono">
                                        Susut: {tx.shrinkagePercentage !== undefined ? `${tx.shrinkagePercentage > 0 ? '+' : ''}${tx.shrinkagePercentage.toFixed(2)}%` : '-'}
                                      </div>
                                    </div>
                                    {tx.weighOutNotes?.trim() && (
                                      <div className="mt-2 pt-1.5 border-t border-slate-200">
                                        <div className="p-1.5 rounded bg-emerald-50 border border-emerald-200 text-[10px] text-slate-800 leading-snug break-words">
                                          <span className="font-bold text-emerald-900 inline-flex items-center gap-1 mr-1">
                                            <FileText className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                                            Catatan:
                                          </span>
                                          <span>{tx.weighOutNotes.trim()}</span>
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  {/* Sub-Proses 5: Gate Out Posko */}
                                  <div className="p-3 rounded-lg bg-white border border-slate-300 space-y-1 shadow-xs flex flex-col justify-between">
                                    <div className="space-y-1">
                                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-900">
                                        <span className="flex items-center gap-1">
                                          <Truck className="w-3.5 h-3.5 text-rose-600" />
                                          5. Gate Out Posko
                                        </span>
                                        {checkpoints[4]?.durationFromPrevious && (
                                          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                            {checkpoints[4]?.durationFromPrevious}
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[11px] font-mono-num text-slate-700">
                                        Waktu: <strong className="text-slate-950 font-bold">{checkpoints[4]?.formattedTime} {checkpoints[4]?.formattedTime !== '-' ? 'WIB' : ''}</strong>
                                      </div>
                                      <div className="text-[10px] text-slate-600 truncate">
                                        Petugas: {tx.gateOutOfficer || 'Pos Security Utama'}
                                      </div>
                                      <div className="text-[10px] font-bold text-emerald-700 truncate">
                                        {isCompleted ? 'Resmi Keluar Gerbang' : 'Menunggu Checkout'}
                                      </div>
                                    </div>
                                    {tx.gateOutNotes?.trim() && (
                                      <div className="mt-2 pt-1.5 border-t border-slate-200">
                                        <div className="p-1.5 rounded bg-rose-50 border border-rose-200 text-[10px] text-slate-800 leading-snug break-words">
                                          <span className="font-bold text-rose-900 inline-flex items-center gap-1 mr-1">
                                            <FileText className="w-2.5 h-2.5 text-rose-600 shrink-0" />
                                            Catatan:
                                          </span>
                                          <span>{tx.gateOutNotes.trim()}</span>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Independent Post-Process QC-PA Status Strip */}
                                <div className="p-2.5 rounded-lg bg-white border border-slate-300 space-y-1.5 text-[11px]">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                      <FlaskConical className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                                      <span className="font-bold text-slate-900">Uji Lab QC-PA (Pasca Proses):</span>
                                      {tx.qcTime || tx.labResults?.calorieGAR ? (
                                        <span className="text-slate-700 font-mono">
                                          Sample <strong className="text-slate-950">{tx.sampleId || '-'}</strong> · {tx.labResults?.calorieGAR || '-'} kcal · TM {tx.labResults?.totalMoisture !== undefined ? `${Number(tx.labResults.totalMoisture).toFixed(1)}%` : '-'} · <strong className="text-emerald-700">{tx.qcStatus || 'UPDATED'}</strong>
                                        </span>
                                      ) : (
                                        <span className="text-amber-800 font-semibold">
                                          Menunggu Update PIC QC (Estimasi Lab ≥24 Jam)
                                        </span>
                                      )}
                                    </div>
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-300">
                                      Independen · Diluar Hitungan Jam Proses
                                    </span>
                                  </div>
                                  {tx.qcDecisionNotes?.trim() && (
                                    <div className="pt-1.5 border-t border-slate-200">
                                      <div className="px-2 py-1 rounded bg-purple-50 border border-purple-200 text-[10px] text-slate-800 leading-snug break-words">
                                        <span className="font-bold text-purple-900 inline-flex items-center gap-1 mr-1">
                                          <FileText className="w-2.5 h-2.5 text-purple-600 shrink-0" />
                                          Catatan QC:
                                        </span>
                                        <span>{tx.qcDecisionNotes.trim()}</span>
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* Card Footer Bar */}
                                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-[11px] text-slate-600 border-t border-slate-300 font-mono-num">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span>ID Transaksi: <strong className="text-slate-900 font-bold">{tx.id}</strong></span>
                                    {tx.ticketNumber && <span>· Tiket: <strong className="text-slate-900 font-bold">{formatDisplayTicketNumber(tx.ticketNumber)}</strong></span>}
                                    <span>· Tgl Kedatangan: <strong className="text-amber-900 font-bold">{formattedArrivalDate}</strong></span>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setSelectedTimelineTx(tx)}
                                      className="text-amber-700 hover:text-amber-900 font-bold underline font-sans text-xs cursor-pointer"
                                    >
                                      Buka Modal Timeline Grafis Lengkap →
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer Bar (8 Data per Halaman) */}
            {filteredHistoryTrucks.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 mt-2 border-t border-slate-200">
              <div className="text-xs text-slate-600 font-mono-num">
                Menampilkan{' '}
                <strong className="text-slate-900 font-bold">
                  {historyStartIdx + 1}–{Math.min(historyStartIdx + HISTORY_PAGE_SIZE, filteredHistoryTrucks.length)}
                </strong>{' '}
                dari{' '}
                <strong className="text-slate-900 font-bold">{filteredHistoryTrucks.length}</strong> Armada
                <span className="text-slate-400 mx-1.5">·</span>
                <span>
                  Halaman <strong className="text-slate-900 font-bold">{safeHistoryPage}</strong> / {totalHistoryPages}
                </span>
              </div>

              {totalHistoryPages > 1 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    disabled={safeHistoryPage <= 1}
                    onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      safeHistoryPage <= 1
                        ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                        : 'bg-white hover:bg-slate-100 text-slate-800 border-slate-300 cursor-pointer shadow-xs'
                    }`}
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Sebelumnya</span>
                  </button>

                  <div className="flex items-center gap-1">
                    {historyPageNumbers.map((pageItem, idx) =>
                      pageItem === 'ellipsis' ? (
                        <span key={`ellipsis-${idx}`} className="px-1.5 text-xs text-slate-500 select-none">
                          …
                        </span>
                      ) : (
                        <button
                          key={pageItem}
                          type="button"
                          onClick={() => setHistoryPage(pageItem)}
                          className={`min-w-[32px] h-8 px-2 rounded-lg text-xs font-mono-num font-bold border transition-colors cursor-pointer ${
                            pageItem === safeHistoryPage
                              ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-xs'
                              : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                          }`}
                        >
                          {pageItem}
                        </button>
                      )
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={safeHistoryPage >= totalHistoryPages}
                    onClick={() => setHistoryPage((p) => Math.min(totalHistoryPages, p + 1))}
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      safeHistoryPage >= totalHistoryPages
                        ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                        : 'bg-white hover:bg-slate-100 text-slate-800 border-slate-300 cursor-pointer shadow-xs'
                    }`}
                  >
                    <span>Berikutnya</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
            )}
          </div>
        )}
      </div>

      {/* Two Column Layout: Active Armada In-Plant & PO Quota Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Live Radar of Trucks Currently In Progress */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 tracking-wide flex items-center gap-2">
                <Truck className="w-5 h-5 text-sky-600" />
                <span>Outstanding Armada Proses Penerimaan</span>
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Klik kartu armada untuk langsung memproses ke tahap berikutnya
              </p>
            </div>
            <span className="text-xs text-slate-700 font-mono-num font-bold">
              {activeTrucksInside.length} Kendaraan
            </span>
          </div>

          {activeTrucksInside.length === 0 ? (
            <div className="text-center py-10 text-slate-500">
              <Truck className="w-10 h-10 mx-auto mb-2 text-slate-600" />
              <p className="text-sm">Tidak ada armada yang sedang antri atau beroperasi di dalam area terminal.</p>
              <button
                type="button"
                onClick={() => onNavigate('security')}
                className="mt-3 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-lg transition-colors"
              >
                Check-In Armada Baru di Pos Security
              </button>
            </div>
          ) : (
            <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
              {activeTrucksInside.map((tx) => {
                let badgeColor = 'text-amber-400 bg-amber-500/10 border-amber-500/30';
                let nextActionTab: ActiveTab = 'weigh-in';
                let nextActionLabel = 'Lanjut Timbang Masuk';

                if (tx.status === 'GATE_IN') {
                  badgeColor = 'text-blue-400 bg-blue-500/10 border-blue-500/30';
                  nextActionTab = 'weigh-in';
                  nextActionLabel = 'Timbang Gross (Masuk)';
                } else if (tx.status === 'TIMBANG_MASUK') {
                  badgeColor = 'text-amber-400 bg-amber-500/10 border-amber-500/30';
                  nextActionTab = 'unloading';
                  nextActionLabel = 'Bongkar di Stockpile';
                } else if (tx.status === 'QC_CHECK') {
                  badgeColor = 'text-sky-400 bg-sky-500/10 border-sky-500/30';
                  nextActionTab = 'unloading';
                  nextActionLabel = 'Bongkar di Stockpile';
                } else if (tx.status === 'BONGKAR') {
                  badgeColor = 'text-sky-400 bg-sky-500/10 border-sky-500/30';
                  nextActionTab = 'weigh-out';
                  nextActionLabel = 'Timbang Tare (Keluar)';
                } else if (tx.status === 'TIMBANG_KELUAR') {
                  badgeColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
                  nextActionTab = 'weigh-out';
                  nextActionLabel = 'Timbang Tare';
                } else if (tx.status === 'GATE_OUT') {
                  badgeColor = 'text-rose-400 bg-rose-500/10 border-rose-500/30';
                  nextActionTab = 'security';
                  nextActionLabel = 'Checkout Gerbang Keluar';
                }

                return (
                  <div
                    key={tx.id}
                    className="p-3.5 bg-slate-950/70 border border-slate-800/90 rounded-lg hover:border-slate-700 transition-colors flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono-num text-sm font-bold text-white tracking-wide bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                          {tx.vehiclePlate}
                        </span>
                        <span className="text-xs font-semibold text-slate-300">
                          {tx.driverName}
                        </span>
                        <span className="text-xs text-slate-500">· {tx.transporterName}</span>
                      </div>
                      <div className="text-xs text-slate-400 flex flex-wrap items-center gap-2">
                        <span>PO: <strong className="text-slate-300 font-mono-num">{tx.poNumber}</strong></span>
                        <span>·</span>
                        <span>Supplier: <strong className="text-slate-300">{tx.supplierName}</strong></span>
                        {tx.suratJalanWeight > 0 && (
                          <>
                            <span>·</span>
                            <span>SJ: <strong className="text-slate-300 font-mono-num">{(tx.suratJalanWeight / 1000).toFixed(2)} Ton</strong></span>
                          </>
                        )}
                        {tx.grossWeight > 0 && (
                          <>
                            <span>·</span>
                            <span>Gross: <strong className="text-amber-400 font-mono-num">{(tx.grossWeight / 1000).toFixed(2)} Ton</strong></span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-1 text-[11px] font-semibold rounded border ${badgeColor}`}>
                        {tx.status}
                      </span>
                      <button
                        type="button"
                        onClick={() => onNavigate(nextActionTab, tx.id)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition-colors whitespace-nowrap"
                      >
                        <span>{nextActionLabel}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-amber-400" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right 1 Col: Purchase Order (PO) Quota & Progress */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 tracking-wide flex items-center gap-2">
                <Warehouse className="w-5 h-5 text-emerald-600" />
                <span>Monitoring Outstanding PO Batubara</span>
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">Realisasi tonase vs kontrak</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('po')}
              className="text-xs text-amber-400 hover:text-amber-300 font-medium"
            >
              Lihat Semua PO
            </button>
          </div>

          <div className="space-y-4">
            {purchaseOrders.length === 0 ? (
              <div className="text-center py-6 text-slate-500 text-xs">
                Belum ada Purchase Order (PO) aktif.
              </div>
            ) : (
              purchaseOrders.map((po) => {
                const pct = po.targetTonnage > 0 ? (po.receivedTonnage / po.targetTonnage) * 100 : 0;
                const remaining = Math.max(0, po.targetTonnage - po.receivedTonnage);

                return (
                  <div key={po.id} className="p-3 bg-slate-950/60 rounded-lg border border-slate-800/80">
                    <div className="flex justify-between items-start mb-1">
                      <div>
                        <div className="text-xs font-bold text-slate-200 font-mono-num">{po.poNumber}</div>
                        <div className="text-xs text-slate-400 truncate max-w-[190px]">{po.supplierName}</div>
                      </div>
                      <span className="text-xs font-mono-num font-bold text-amber-400">
                        {pct.toFixed(1)}%
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-800 rounded-full h-2 my-2 overflow-hidden">
                      <div 
                        className="bg-amber-500 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>

                    <div className="flex justify-between items-center text-[11px] text-slate-400 font-mono-num">
                      <span>Diterima: <strong className="text-emerald-400">{po.receivedTonnage.toLocaleString('id-ID')} Kg</strong></span>
                      <span>Qty PO: <strong className="text-slate-300">{po.targetTonnage.toLocaleString('id-ID')} Kg</strong></span>
                      <span>Sisa: <strong className="text-slate-300">{remaining.toLocaleString('id-ID')} Kg</strong></span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Modal Detailed Graphical Timeline */}
      {selectedTimelineTx && (
        <TransactionTimelineModal
          transaction={selectedTimelineTx}
          onClose={() => setSelectedTimelineTx(null)}
        />
      )}

      {/* Modal Konfirmasi Hapus Riwayat Bongkar */}
      {deletingTx && onDeleteTransaction && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
          onClick={() => setDeletingTx(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-tx-modal-title"
            className="w-full max-w-md rounded-2xl bg-white border border-slate-300 shadow-2xl overflow-hidden text-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-rose-50/80">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-700 shrink-0">
                  <Trash2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 id="delete-tx-modal-title" className="text-sm font-bold text-slate-900">
                    Hapus Data Riwayat Bongkar?
                  </h3>
                  <p className="text-xs text-slate-600">
                    Konfirmasi penghapusan transaksi armada
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeletingTx(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 transition-colors cursor-pointer"
                title="Tutup"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3 text-xs">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Nomor Polisi:</span>
                  <strong className="font-mono font-bold text-slate-900">{deletingTx.vehiclePlate}</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">No. RIT:</span>
                  <strong className="font-mono font-bold text-sky-800">
                    {resolveTransactionRitInfo(deletingTx, transactions, schedules).ritCategory}
                  </strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Driver / PO:</span>
                  <strong className="text-slate-900">
                    {deletingTx.driverName} · {deletingTx.poNumber}
                  </strong>
                </div>
                {deletingTx.nettoWeight > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Netto Terealisasi:</span>
                    <strong className="font-mono font-bold text-emerald-700">
                      {deletingTx.nettoWeight.toLocaleString('id-ID')} Kg ({(deletingTx.nettoWeight / 1000).toFixed(2)} Ton)
                    </strong>
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-rose-200 bg-rose-50/80 p-3 text-rose-900 leading-relaxed">
                Data transaksi ini akan dihapus permanen.
                {deletingTx.status === 'COMPLETED' && deletingTx.nettoWeight > 0
                  ? ' Realisasi tonase PO akan otomatis dikurangi sesuai berat netto transaksi ini.'
                  : ''}
                {deletingTx.scheduleId
                  ? ' Status jadwal pengiriman terkait juga akan dikembalikan ke Terjadwal.'
                  : ''}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-200 bg-slate-50">
              <button
                type="button"
                onClick={() => setDeletingTx(null)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  const targetId = deletingTx.id;
                  setDeletingTx(null);
                  onDeleteTransaction(targetId);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition-colors shadow-xs cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Ya, Hapus Data</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
