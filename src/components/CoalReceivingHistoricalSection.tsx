import React, { useState, useMemo } from 'react';
import { 
  BarChart3, 
  Calendar, 
  TrendingUp, 
  Scale, 
  Truck, 
  Download, 
  Filter, 
  CheckCircle2, 
  Clock,
  Layers,
  ChevronDown,
  PlusCircle,
  FileSpreadsheet
} from 'lucide-react';
import { CoalTransaction, PurchaseOrder, ActiveTab } from '../types/coal';
import { downloadCsvFile } from '../utils/csvUtils';

export type HistoricalPeriodType = 'MINGGUAN' | 'BULANAN' | 'TAHUNAN';

interface HistoricalGroup {
  id: string;
  periodKey: string;
  label: string;
  shortLabel: string;
  dateRange: string;
  sortTimestamp: number;
  truckCount: number;
  completedTrucks: number;
  inProgressTrucks: number;
  nettoTons: number;
  targetTons: number;
  avgCalorieGAR: number | null;
  avgTotalMoisture: number | null;
  avgShrinkagePct: number | null;
  primarySupplier: string;
  isCurrent?: boolean;
}

interface CoalReceivingHistoricalSectionProps {
  transactions: CoalTransaction[];
  purchaseOrders: PurchaseOrder[];
  onNavigate?: (tab: ActiveTab, filterId?: string) => void;
}

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'
];

// Helper to calculate ISO Week number and Monday date
const getISOWeekDetails = (d: Date) => {
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7; // Monday = 0
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  const weekNumber = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  
  // Find Monday and Sunday of this week
  const monday = new Date(d);
  const diffToMonday = (d.getDay() === 0 ? -6 : 1) - d.getDay();
  monday.setDate(d.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const pad = (n: number) => String(n).padStart(2, '0');
  const rangeStr = `${pad(monday.getDate())}/${pad(monday.getMonth() + 1)} - ${pad(sunday.getDate())}/${pad(sunday.getMonth() + 1)}/${sunday.getFullYear()}`;

  return { weekNumber, monday, sunday, rangeStr };
};

// Helper to extract reliable net ton from transaction
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

export const CoalReceivingHistoricalSection: React.FC<CoalReceivingHistoricalSectionProps> = ({
  transactions,
  purchaseOrders,
  onNavigate,
}) => {
  // Period dropdown list state: Mingguan, Bulanan, Tahunan
  const [periodType, setPeriodType] = useState<HistoricalPeriodType>('MINGGUAN');
  const [selectedSupplierFilter, setSelectedSupplierFilter] = useState<string>('ALL');

  // Available distinct suppliers from real transactions
  const availableSuppliers = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach((tx) => {
      if (tx.supplierName && tx.supplierName.trim()) {
        set.add(tx.supplierName.trim());
      }
    });
    return Array.from(set);
  }, [transactions]);

  // Filter transactions by supplier if selected
  const filteredTransactions = useMemo(() => {
    if (selectedSupplierFilter === 'ALL') return transactions;
    return transactions.filter((tx) => tx.supplierName === selectedSupplierFilter);
  }, [transactions, selectedSupplierFilter]);

  // Aggregate ONLY real created transactions into period groups
  const historicalData: HistoricalGroup[] = useMemo(() => {
    if (filteredTransactions.length === 0) return [];

    const groupsMap = new Map<string, {
      periodKey: string;
      label: string;
      shortLabel: string;
      dateRange: string;
      sortTimestamp: number;
      txs: CoalTransaction[];
    }>();

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const { weekNumber: currentWeek } = getISOWeekDetails(now);

    filteredTransactions.forEach((tx) => {
      // Parse transaction date
      const dateStr = tx.gateInTime || tx.suratJalanDate || tx.weighInTime || '';
      const date = dateStr ? new Date(dateStr) : new Date();
      const validDate = isNaN(date.getTime()) ? new Date() : date;
      const yr = validDate.getFullYear();
      const mth = validDate.getMonth();

      let key = '';
      let label = '';
      let shortLabel = '';
      let dateRange = '';
      let sortTimestamp = validDate.getTime();

      if (periodType === 'MINGGUAN') {
        const { weekNumber, monday, rangeStr } = getISOWeekDetails(validDate);
        key = `${yr}-W${String(weekNumber).padStart(2, '0')}`;
        label = `Minggu ${weekNumber} (${rangeStr})`;
        shortLabel = `W-${weekNumber} (${MONTH_SHORT[mth]})`;
        dateRange = rangeStr;
        sortTimestamp = monday.getTime();
      } else if (periodType === 'BULANAN') {
        key = `${yr}-${String(mth + 1).padStart(2, '0')}`;
        label = `${MONTH_NAMES[mth]} ${yr}`;
        shortLabel = `${MONTH_SHORT[mth]} '${String(yr).slice(-2)}`;
        const lastDay = new Date(yr, mth + 1, 0).getDate();
        dateRange = `01/${String(mth + 1).padStart(2, '0')} - ${lastDay}/${String(mth + 1).padStart(2, '0')}/${yr}`;
        sortTimestamp = new Date(yr, mth, 1).getTime();
      } else {
        // TAHUNAN
        key = `${yr}`;
        label = `Tahun ${yr}`;
        shortLabel = `Thn ${yr}`;
        dateRange = `01/01/${yr} - 31/12/${yr}`;
        sortTimestamp = new Date(yr, 0, 1).getTime();
      }

      if (!groupsMap.has(key)) {
        groupsMap.set(key, {
          periodKey: key,
          label,
          shortLabel,
          dateRange,
          sortTimestamp,
          txs: [],
        });
      }

      groupsMap.get(key)!.txs.push(tx);
    });

    // Transform into computed HistoricalGroup array
    const groups: HistoricalGroup[] = Array.from(groupsMap.values()).map((g) => {
      const truckCount = g.txs.length;
      const completedTrucks = g.txs.filter((t) => t.status === 'COMPLETED').length;
      const inProgressTrucks = truckCount - completedTrucks;

      const nettoTons = Number(
        g.txs.reduce((acc, curr) => acc + getTransactionNettoTon(curr), 0).toFixed(2)
      );

      // Target kuota from associated POs (always stored in Kg -> convert to Tons)
      const poNumbersInGroup = Array.from(new Set(g.txs.map((t) => t.poNumber).filter(Boolean)));
      let targetTons = 0;

      poNumbersInGroup.forEach((poNo) => {
        const foundPo = purchaseOrders.find((p) => p.poNumber === poNo);
        if (foundPo && foundPo.targetTonnage) {
          targetTons += foundPo.targetTonnage / 1000;
        }
      });

      // If no PO target was configured, derive target from Surat Jalan or actual
      if (targetTons <= 0) {
        const sjTonSum = g.txs.reduce((acc, curr) => acc + (curr.suratJalanWeight ? curr.suratJalanWeight / 1000 : 0), 0);
        targetTons = Number((sjTonSum > 0 ? sjTonSum : nettoTons).toFixed(2));
      } else {
        targetTons = Number(targetTons.toFixed(2));
      }

      // Quality metrics averages from actual lab results
      const validCal = g.txs
        .filter((t) => t.labResults?.calorieGAR && t.labResults.calorieGAR > 0)
        .map((t) => t.labResults!.calorieGAR);
      const avgCalorieGAR = validCal.length > 0 ? Math.round(validCal.reduce((a, b) => a + b, 0) / validCal.length) : null;

      const validMoist = g.txs
        .filter((t) => t.labResults?.totalMoisture && t.labResults.totalMoisture > 0)
        .map((t) => t.labResults!.totalMoisture);
      const avgTotalMoisture = validMoist.length > 0 ? Number((validMoist.reduce((a, b) => a + b, 0) / validMoist.length).toFixed(1)) : null;

      const sumSjKg = g.txs.reduce((acc, curr) => acc + (curr.suratJalanWeight || 0), 0);
      const sumDiffKg = g.txs.reduce((acc, curr) => {
        const nettoKg = getTransactionNettoTon(curr) * 1000;
        const sjKg = curr.suratJalanWeight || 0;
        return acc + (sjKg > 0 && nettoKg > 0 ? nettoKg - sjKg : curr.weightDifference || 0);
      }, 0);
      const validShrink = g.txs
        .filter((t) => typeof t.shrinkagePercentage === 'number')
        .map((t) => t.shrinkagePercentage!);
      const avgShrinkagePct =
        sumSjKg > 0
          ? Number(((sumDiffKg / sumSjKg) * 100).toFixed(2))
          : validShrink.length > 0
            ? Number((validShrink.reduce((a, b) => a + b, 0) / validShrink.length).toFixed(2))
            : null;

      // Primary supplier in this group
      const supplierCounts = new Map<string, number>();
      g.txs.forEach((t) => {
        const name = t.supplierName || 'Tidak Disebutkan';
        supplierCounts.set(name, (supplierCounts.get(name) || 0) + 1);
      });
      let primarySupplier = '-';
      let maxCnt = 0;
      supplierCounts.forEach((count, name) => {
        if (count > maxCnt) {
          maxCnt = count;
          primarySupplier = name;
        }
      });

      // Check if this group represents the current period
      let isCurrent = false;
      if (periodType === 'MINGGUAN') {
        isCurrent = g.periodKey === `${currentYear}-W${String(currentWeek).padStart(2, '0')}`;
      } else if (periodType === 'BULANAN') {
        isCurrent = g.periodKey === `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
      } else {
        isCurrent = g.periodKey === `${currentYear}`;
      }

      return {
        id: g.periodKey,
        periodKey: g.periodKey,
        label: g.label,
        shortLabel: g.shortLabel,
        dateRange: g.dateRange,
        sortTimestamp: g.sortTimestamp,
        truckCount,
        completedTrucks,
        inProgressTrucks,
        nettoTons,
        targetTons,
        avgCalorieGAR,
        avgTotalMoisture,
        avgShrinkagePct,
        primarySupplier,
        isCurrent,
      };
    });

    // Sort chronologically (oldest to newest for natural left-to-right bar chart)
    return groups.sort((a, b) => a.sortTimestamp - b.sortTimestamp);
  }, [filteredTransactions, purchaseOrders, periodType]);

  // Overall totals across the aggregated real data
  const summary = useMemo(() => {
    if (historicalData.length === 0) {
      return {
        totalTons: 0,
        totalTarget: 0,
        totalTrucks: 0,
        completedTrucks: 0,
        inProgressTrucks: 0,
        avgTonsPerTruck: 0,
        achievementPct: 0,
        avgCalorie: null,
        avgMoisture: null,
        avgShrink: null,
      };
    }

    const totalTons = Number(historicalData.reduce((acc, curr) => acc + curr.nettoTons, 0).toFixed(2));
    // Deduplicate PO target quota across all periods so multi-week POs aren't summed multiple times
    const uniquePoNumbers = Array.from(new Set(filteredTransactions.map((t) => t.poNumber).filter(Boolean)));
    let uniquePoTargetTons = 0;
    uniquePoNumbers.forEach((poNo) => {
      const foundPo = purchaseOrders.find((p) => p.poNumber === poNo);
      if (foundPo && foundPo.targetTonnage) {
        uniquePoTargetTons += foundPo.targetTonnage / 1000;
      }
    });
    const fallbackSjTargetTons = filteredTransactions.reduce(
      (acc, curr) => acc + (curr.suratJalanWeight ? curr.suratJalanWeight / 1000 : 0),
      0
    );
    const totalTarget = Number(
      (uniquePoTargetTons > 0 ? uniquePoTargetTons : fallbackSjTargetTons > 0 ? fallbackSjTargetTons : totalTons).toFixed(2)
    );
    const totalTrucks = historicalData.reduce((acc, curr) => acc + curr.truckCount, 0);
    const completedTrucks = historicalData.reduce((acc, curr) => acc + curr.completedTrucks, 0);
    const inProgressTrucks = historicalData.reduce((acc, curr) => acc + curr.inProgressTrucks, 0);
    const avgTonsPerTruck = totalTrucks > 0 ? Number((totalTons / totalTrucks).toFixed(2)) : 0;
    const achievementPct = totalTarget > 0 ? Number(((totalTons / totalTarget) * 100).toFixed(1)) : 0;

    // Weighted calorie
    const itemsWithCal = historicalData.filter((d) => d.avgCalorieGAR !== null && d.nettoTons > 0);
    const sumCalWeighted = itemsWithCal.reduce((acc, curr) => acc + curr.avgCalorieGAR! * curr.nettoTons, 0);
    const sumCalTons = itemsWithCal.reduce((acc, curr) => acc + curr.nettoTons, 0);
    const avgCalorie = sumCalTons > 0 ? Math.round(sumCalWeighted / sumCalTons) : null;

    // Weighted moisture
    const itemsWithMoist = historicalData.filter((d) => d.avgTotalMoisture !== null && d.nettoTons > 0);
    const sumMoistWeighted = itemsWithMoist.reduce((acc, curr) => acc + curr.avgTotalMoisture! * curr.nettoTons, 0);
    const sumMoistTons = itemsWithMoist.reduce((acc, curr) => acc + curr.nettoTons, 0);
    const avgMoisture = sumMoistTons > 0 ? Number((sumMoistWeighted / sumMoistTons).toFixed(1)) : null;

    // Weighted shrinkage
    const itemsWithShrink = historicalData.filter((d) => d.avgShrinkagePct !== null && d.nettoTons > 0);
    const sumShrinkWeighted = itemsWithShrink.reduce((acc, curr) => acc + curr.avgShrinkagePct! * curr.nettoTons, 0);
    const sumShrinkTons = itemsWithShrink.reduce((acc, curr) => acc + curr.nettoTons, 0);
    const avgShrink = sumShrinkTons > 0 ? Number((sumShrinkWeighted / sumShrinkTons).toFixed(2)) : null;

    return {
      totalTons,
      totalTarget,
      totalTrucks,
      completedTrucks,
      inProgressTrucks,
      avgTonsPerTruck,
      achievementPct,
      avgCalorie,
      avgMoisture,
      avgShrink,
    };
  }, [historicalData, filteredTransactions, purchaseOrders]);

  // Max ton for scaling chart bars
  const maxTon = useMemo(() => {
    if (historicalData.length === 0) return 1;
    const max = Math.max(...historicalData.map((d) => Math.max(d.nettoTons, d.targetTons)));
    return max > 0 ? max : 1;
  }, [historicalData]);

  // Export real historical data to CSV
  const handleExportCSV = () => {
    if (historicalData.length === 0) return;

    const headers = [
      'Periode',
      'Rentang Tanggal',
      'Total Ritase Truk',
      'Ritase Selesai',
      'Ritase Dalam Proses',
      'Tonase Netto (Ton)',
      'Target Kuota (Ton)',
      'Ketercapaian (%)',
      'Rerata Kalori GAR (kcal/kg)',
      'Rerata Moisture TM (%)',
      'Rerata Susut SJ (%)',
      'Supplier Terbanyak',
    ];

    const rows = historicalData.map((item) => {
      const pct = item.targetTons > 0 ? ((item.nettoTons / item.targetTons) * 100).toFixed(1) : '0';
      return [
        item.label,
        item.dateRange,
        item.truckCount,
        item.completedTrucks,
        item.inProgressTrucks,
        item.nettoTons.toFixed(2),
        item.targetTons.toFixed(2),
        `${pct}%`,
        item.avgCalorieGAR !== null ? item.avgCalorieGAR : '-',
        item.avgTotalMoisture !== null ? item.avgTotalMoisture : '-',
        item.avgShrinkagePct !== null ? `${item.avgShrinkagePct}%` : '-',
        item.primarySupplier,
      ];
    });

    downloadCsvFile(
      `historical_real_penerimaan_batubara_${periodType.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.csv`,
      headers,
      rows
    );
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-5">
      {/* Header with Title and Dropdown List Selector */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
              <BarChart3 className="w-4 h-4 text-amber-500" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-wide">
                Riwayat Penerimaan
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Kalkulasi otomatis dari data transaksi riil yang telah di-input di Pos Security, Timbangan, QC, dan Bongkar
              </p>
            </div>
          </div>
        </div>

        {/* Controls: Dropdown List Periode, Filter Supplier & Export CSV */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Main Dropdown List for Periode as requested */}
          <div className="flex items-center gap-2 bg-white p-1 rounded-xl border border-slate-300 shadow-xs">
            <span className="text-xs font-bold text-slate-700 pl-2 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-amber-600" />
              <span>Periode:</span>
            </span>

            <div className="relative">
              <select
                value={periodType}
                onChange={(e) => setPeriodType(e.target.value as HistoricalPeriodType)}
                aria-label="Pilih Periode Riwayat Transaksi"
                className="appearance-none bg-white text-slate-900 font-bold text-xs py-1.5 pl-3 pr-8 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer shadow-xs"
              >
                <option value="MINGGUAN">📅 Mingguan (Rekap Tiap Minggu)</option>
                <option value="BULANAN">📆 Bulanan (Rekap Tiap Bulan)</option>
                <option value="TAHUNAN">📊 Tahunan (Rekap Tiap Tahun)</option>
              </select>
              <ChevronDown className="w-4 h-4 text-slate-600 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Supplier Quick Filter (if multiple suppliers exist) */}
          {availableSuppliers.length > 1 && (
            <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-slate-300 shadow-xs">
              <Filter className="w-3.5 h-3.5 text-slate-500 ml-1.5" />
              <select
                value={selectedSupplierFilter}
                onChange={(e) => setSelectedSupplierFilter(e.target.value)}
                aria-label="Filter Supplier"
                className="appearance-none bg-white text-slate-900 font-semibold text-xs py-1.5 pl-2 pr-7 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
              >
                <option value="ALL">Semua Supplier ({availableSuppliers.length})</option>
                {availableSuppliers.map((sup) => (
                  <option key={sup} value={sup}>{sup}</option>
                ))}
              </select>
            </div>
          )}

          {/* Export CSV Button */}
          {historicalData.length > 0 && (
            <button
              type="button"
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 text-xs font-bold rounded-lg border border-slate-300 transition-colors shadow-xs cursor-pointer"
              title="Download Rekap Historical CSV"
            >
              <Download className="w-3.5 h-3.5 text-amber-600" />
              <span className="hidden sm:inline">Ekspor CSV</span>
            </button>
          )}
        </div>
      </div>

      {/* When NO transactions have been created yet */}
      {historicalData.length === 0 ? (
        <div className="text-center py-12 px-4 bg-slate-50 border border-dashed border-slate-300 rounded-xl">
          <div className="w-12 h-12 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-center mx-auto mb-3 shadow-xs">
            <BarChart3 className="w-6 h-6 text-amber-700" />
          </div>
          <h4 className="text-sm font-bold text-slate-900">
            Belum Ada Transaksi Penerimaan yang Tercatat
          </h4>
          <p className="text-xs text-slate-600 max-w-lg mx-auto mt-1 leading-relaxed">
            Semua data dummy telah dihapus. Rekapitulasi historis penerimaan batubara periode <strong className="text-slate-900 font-semibold">{periodType.toLowerCase()}</strong> akan otomatis terhitung dan tersaji secara akurat dari setiap armada yang dibuat melalui alur operasional terminal.
          </p>

          {onNavigate && (
            <div className="mt-5 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => onNavigate('security')}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-lg transition-colors shadow-xs cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Input Armada di Pos Security</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('po')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-800 font-bold text-xs rounded-lg border border-slate-300 transition-colors shadow-xs cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>Lihat Purchase Order (PO)</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Summary KPI Cards: Tonase Netto and Ritase Armada */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* KPI 1: Total Tonase */}
            <div className="bg-white border border-slate-300 rounded-xl p-4 shadow-xs">
              <div className="flex items-center justify-between text-slate-600 text-xs mb-1 font-medium">
                <span>Total Tonase Netto Riil</span>
                <Scale className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-950 font-mono-num">
                  {summary.totalTons.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-xs font-bold text-slate-600">Ton</span>
              </div>
              <div className="mt-2 text-[11px] text-slate-600 flex items-center justify-between border-t border-slate-100 pt-1.5">
                <span>Target: <strong className="text-slate-900 font-mono-num font-bold">{summary.totalTarget.toLocaleString('id-ID')} Ton</strong></span>
                <span className={`font-mono-num font-bold ${summary.achievementPct >= 95 ? 'text-emerald-700' : 'text-amber-800'}`}>
                  {summary.achievementPct.toFixed(1)}% Capaian
                </span>
              </div>
            </div>

            {/* KPI 2: Total Ritase & Rata-rata Muatan */}
            <div className="bg-white border border-slate-300 rounded-xl p-4 shadow-xs">
              <div className="flex items-center justify-between text-slate-600 text-xs mb-1 font-medium">
                <span>Total Ritase Armada Diterima</span>
                <Truck className="w-4 h-4 text-sky-600" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-950 font-mono-num">
                  {summary.totalTrucks.toLocaleString('id-ID')}
                </span>
                <span className="text-xs font-bold text-slate-600">Ritase</span>
              </div>
              <div className="mt-2 text-[11px] text-slate-600 flex items-center justify-between border-t border-slate-100 pt-1.5">
                <span>{summary.completedTrucks} Selesai · {summary.inProgressTrucks} Proses</span>
                <span className="font-mono-num font-bold text-sky-800">
                  {summary.avgTonsPerTruck.toFixed(2)} T/Rit
                </span>
              </div>
            </div>
          </div>

          {/* Visual Histogram Chart (Bar Chart of Volume vs Target) */}
          <div className="bg-white border border-slate-300 rounded-xl p-5 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-amber-600" />
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Grafik Realisasi Tonase Netto Penerimaan ({periodType === 'MINGGUAN' ? 'Per Minggu' : periodType === 'BULANAN' ? 'Per Bulan' : 'Per Tahun'})
                </h4>
              </div>
              <div className="flex items-center gap-4 text-xs font-medium">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs bg-amber-500 inline-block shadow-xs" />
                  <span className="text-slate-700">Realisasi Tonase Netto</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs bg-slate-200 border border-slate-400 inline-block" />
                  <span className="text-slate-700">Target Kuota PO</span>
                </div>
              </div>
            </div>

            {/* Dynamic Bar Chart Visualization */}
            <div className="pt-20 pb-2 overflow-x-auto">
              <div className="min-w-[420px] flex items-end gap-3 sm:gap-4 h-52 px-4 border-b border-slate-300">
                {historicalData.map((item, idx) => {
                  const actualHeightPct = Math.round((item.nettoTons / maxTon) * 100);
                  const targetHeightPct = Math.round((item.targetTons / maxTon) * 100);
                  const isAchieved = item.targetTons > 0 ? item.nettoTons >= item.targetTons * 0.95 : true;
                  const tooltipHorizontalAlign =
                    historicalData.length > 1 && idx === 0
                      ? 'left-0'
                      : historicalData.length > 1 && idx === historicalData.length - 1
                        ? 'right-0'
                        : 'left-1/2 -translate-x-1/2';

                  return (
                    <div key={item.id} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                      {/* Tooltip on hover */}
                      <div
                        className={`absolute bottom-full mb-2 ${tooltipHorizontalAlign} z-30 hidden group-hover:flex flex-col items-center pointer-events-none whitespace-nowrap bg-white border border-slate-300 text-slate-900 text-[11px] px-3 py-1.5 rounded-lg shadow-lg ring-1 ring-slate-900/5 space-y-0.5`}
                      >
                        <span className="font-bold text-amber-800 leading-tight">{item.label}</span>
                        <span className="font-mono-num font-bold text-slate-900 leading-tight">
                          {item.nettoTons.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Ton ({item.truckCount} rit)
                        </span>
                        <span className="text-[10px] font-medium text-slate-600 leading-tight">
                          Target: {item.targetTons.toLocaleString('id-ID')} Ton
                        </span>
                      </div>

                      {/* Dual Bar Container: Target Behind, Actual in Front */}
                      <div className="w-full max-w-[54px] flex items-end justify-center relative h-full">
                        {/* Target Bar Background Guide */}
                        <div 
                          className="absolute w-full rounded-t bg-slate-100 border-t-2 border-slate-300 transition-all duration-300"
                          style={{ height: `${Math.min(100, Math.max(10, targetHeightPct))}%` }}
                          title={`Target: ${item.targetTons.toLocaleString('id-ID')} Ton`}
                        />

                        {/* Actual Netto Bar */}
                        <div 
                          className={`relative z-10 w-4/5 rounded-t transition-all duration-500 group-hover:brightness-105 shadow-xs ${
                            item.isCurrent
                              ? 'bg-gradient-to-t from-amber-600 to-amber-500 border-t-2 border-amber-300'
                              : isAchieved
                              ? 'bg-gradient-to-t from-amber-600 to-amber-500'
                              : 'bg-gradient-to-t from-amber-700 to-amber-600'
                          }`}
                          style={{ height: `${Math.min(100, Math.max(10, actualHeightPct))}%` }}
                        >
                          {/* Live pulsing dot for current period */}
                          {item.isCurrent && (
                            <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-300 animate-ping" />
                          )}
                        </div>
                      </div>

                      {/* Value Above Bar */}
                      <div className="mt-1 text-[10px] font-mono-num font-bold text-slate-800 group-hover:text-amber-800 transition-colors">
                        {item.nettoTons >= 1000 ? `${(item.nettoTons / 1000).toFixed(1)}k T` : `${item.nettoTons.toFixed(1)} T`}
                      </div>

                      {/* Period Label Below Axis */}
                      <div className="mt-1 text-[11px] font-bold text-slate-700 group-hover:text-slate-950 transition-colors truncate max-w-[110px] text-center">
                        {item.shortLabel}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="text-[11px] text-slate-600 flex flex-wrap items-center justify-between pt-1">
              <span>* Data dihitung 100% dari transaksi riil yang tercatat di database sistem tanpa data dummy.</span>
              <span className="text-emerald-700 font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Sinkron Real-time
              </span>
            </div>
          </div>

          {/* Detailed Historical Data Table */}
          <div className="coal-receiving-blue-card rounded-xl overflow-hidden">
            <div className="coal-receiving-blue-header px-4 py-3.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-white/15 border border-white/25 shadow-2xs">
                  <Layers className="w-4 h-4 text-sky-100" />
                </div>
                <h4 className="text-xs font-extrabold uppercase tracking-wider coal-blue-header-text">
                  Tabel Rincian Penerimaan Batubara ({periodType === 'MINGGUAN' ? 'Mingguan' : periodType === 'BULANAN' ? 'Bulanan' : 'Tahunan'})
                </h4>
              </div>
              <div className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-white/15 border border-white/30 coal-blue-header-text">
                Total Record: <strong className="font-mono-num font-extrabold">{historicalData.length}</strong> Periode Riil
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="coal-receiving-blue-table w-full text-left text-xs text-slate-900">
                <thead className="font-bold text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-3.5">Periode / Rentang Tanggal</th>
                    <th className="py-3 px-3 text-right">Ritase Truk</th>
                    <th className="py-3 px-3 text-right">Tonase Netto (Ton)</th>
                    <th className="py-3 px-3 text-right">Target Kuota (Ton)</th>
                    <th className="py-3 px-3 text-center">% Capaian</th>
                    <th className="py-3 px-3 text-right">Kalori GAR</th>
                    <th className="py-3 px-3 text-right">Moisture (TM)</th>
                    <th className="py-3 px-3 text-right">Susut SJ</th>
                    <th className="py-3 px-3.5">Supplier Utama</th>
                    <th className="py-3 px-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-200/80">
                  {historicalData.map((row) => {
                    const achievement = row.targetTons > 0 ? (row.nettoTons / row.targetTons) * 100 : 0;
                    const isTargetAchieved = achievement >= 95;

                    return (
                      <tr 
                        key={row.id} 
                        className={`transition-colors ${
                          row.isCurrent ? 'row-current-period font-medium' : ''
                        }`}
                      >
                        {/* Period Label */}
                        <td className="py-3 px-3.5 whitespace-nowrap">
                          <div className="font-bold text-slate-900 flex items-center gap-1.5">
                            <span>{row.label}</span>
                            {row.isCurrent && (
                              <span className="badge-blue-vivid px-2 py-0.5 rounded text-[10px] font-bold border">
                                Berjalan
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-blue-900/75 font-mono-num font-medium">{row.dateRange}</div>
                        </td>

                        {/* Truck Count */}
                        <td className="py-3 px-3 text-right font-mono-num font-bold text-slate-900">
                          {row.truckCount.toLocaleString('id-ID')}
                          <span className="text-[10px] text-blue-900/70 ml-1 font-sans font-normal">rit</span>
                        </td>

                        {/* Netto Tons */}
                        <td className="py-3 px-3 text-right font-mono-num font-black netto-blue-accent">
                          {row.nettoTons.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>

                        {/* Target Tons */}
                        <td className="py-3 px-3 text-right font-mono-num font-semibold text-slate-700">
                          {row.targetTons.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>

                        {/* Achievement % */}
                        <td className="py-3 px-3 text-center">
                          <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono-num font-bold border shadow-xs ${
                            isTargetAchieved 
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              : 'bg-amber-50 text-amber-800 border-amber-300'
                          }`}>
                            {achievement.toFixed(1)}%
                          </div>
                        </td>

                        {/* Calorie */}
                        <td className="py-3 px-3 text-right font-mono-num font-bold text-amber-800">
                          {row.avgCalorieGAR !== null ? (
                            <>
                              {row.avgCalorieGAR.toLocaleString('id-ID')}
                              <span className="text-[10px] text-slate-500 ml-1 font-sans font-normal">kcal</span>
                            </>
                          ) : (
                            <span className="text-slate-400 font-normal">-</span>
                          )}
                        </td>

                        {/* Moisture */}
                        <td className="py-3 px-3 text-right font-mono-num font-semibold text-slate-700">
                          {row.avgTotalMoisture !== null ? `${row.avgTotalMoisture.toFixed(1)}%` : '-'}
                        </td>

                        {/* Shrinkage */}
                        <td className="py-3 px-3 text-right font-mono-num font-bold">
                          {row.avgShrinkagePct !== null ? (
                            <span
                              className={
                                row.avgShrinkagePct <
                                -(
                                  purchaseOrders.find((po) => po.status === 'ACTIVE')?.tolerancePercentage ??
                                  purchaseOrders[0]?.tolerancePercentage ??
                                  5
                                )
                                  ? 'text-rose-700'
                                  : 'text-slate-700'
                              }
                            >
                              {row.avgShrinkagePct > 0 ? '+' : ''}{row.avgShrinkagePct.toFixed(2)}%
                            </span>
                          ) : (
                            <span className="text-slate-400 font-normal">-</span>
                          )}
                        </td>

                        {/* Supplier */}
                        <td className="py-3 px-3.5 text-slate-900 font-semibold truncate max-w-[180px]">
                          {row.primarySupplier}
                        </td>

                        {/* Status Badge */}
                        <td className="py-3 px-3 text-center">
                          <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold tracking-wide border shadow-xs ${
                            isTargetAchieved
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              : row.isCurrent
                              ? 'badge-blue-vivid'
                              : 'bg-amber-50 text-amber-800 border-amber-300'
                          }`}>
                            {isTargetAchieved ? 'TERCAPAI' : row.isCurrent ? 'BERJALAN' : 'EVALUASI'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                {/* Total Summary Footer Row */}
                <tfoot className="font-bold text-[11px]">
                  <tr>
                    <td className="py-3.5 px-3.5 uppercase tracking-wider">
                      TOTAL & RATA-RATA ({periodType})
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono-num font-bold">
                      {summary.totalTrucks.toLocaleString('id-ID')} <span className="tfoot-muted-blue text-[10px] font-sans font-normal">rit</span>
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono-num font-black">
                      {summary.totalTons.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Ton
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono-num font-semibold">
                      {summary.totalTarget.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Ton
                    </td>
                    <td className="py-3.5 px-3 text-center font-mono-num font-extrabold">
                      {summary.achievementPct.toFixed(1)}%
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono-num font-bold">
                      {summary.avgCalorie !== null ? `${summary.avgCalorie.toLocaleString('id-ID')} kcal` : '-'}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono-num font-semibold">
                      {summary.avgMoisture !== null ? `${summary.avgMoisture.toFixed(1)}%` : '-'}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono-num font-bold">
                      {summary.avgShrink !== null ? `${summary.avgShrink > 0 ? '+' : ''}${summary.avgShrink.toFixed(2)}%` : '-'}
                    </td>
                    <td colSpan={2} className="py-3.5 px-3 text-center font-medium">
                      <span className="tfoot-muted-blue">Rerata muatan:</span>{' '}
                      <strong className="font-mono-num font-extrabold">{summary.avgTonsPerTruck.toFixed(2)} Ton/rit</strong>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
