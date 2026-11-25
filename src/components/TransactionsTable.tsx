import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileText, 
  Search, 
  Download, 
  Printer, 
  CheckCircle2, 
  Clock, 
  Filter, 
  ArrowRight,
  TrendingDown,
  TrendingUp,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Pencil,
  Calendar,
  X,
  Save,
  AlertTriangle,
  Building2
} from 'lucide-react';
import { CoalTransaction, PurchaseOrder, ArrivalSchedule, ActiveTab } from '../types/coal';
import { TransactionTimelineModal } from './TransactionTimelineModal';
import { calculateDuration } from '../utils/timeUtils';
import { resolveTransactionRitInfo } from '../utils/ritUtils';
import {
  calculateToleranceMetrics,
  validateWeighOutWeights,
  validateTransactionChronology,
} from '../utils/toleranceUtils';
import { downloadCsvFile } from '../utils/csvUtils';
import { formatDisplayTicketNumber } from '../utils/ticketUtils';

interface TransactionsTableProps {
  transactions: CoalTransaction[];
  purchaseOrders: PurchaseOrder[];
  schedules?: ArrivalSchedule[];
  onOpenTicket: (tx: CoalTransaction) => void;
  onNavigateToStage: (tab: ActiveTab, txId: string) => void;
  onUpdateTransaction?: (updatedTx: CoalTransaction) => void;
  canEditTransactions?: boolean;
}

const extractLocalDate = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const extractLocalTime = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${min}`;
};

const combineDateAndTimeToIso = (dateStr: string, timeStr: string, fallbackIso?: string): string | undefined => {
  if (!dateStr && !timeStr) return undefined;
  const base = fallbackIso && !Number.isNaN(new Date(fallbackIso).getTime())
    ? new Date(fallbackIso)
    : new Date();

  if (dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    if (y && m && d) base.setFullYear(y, m - 1, d);
  }
  if (timeStr) {
    const [hh, mm] = timeStr.split(':').map(Number);
    if (!Number.isNaN(hh) && !Number.isNaN(mm)) {
      base.setHours(hh, mm, 0, 0);
    }
  }
  return base.toISOString();
};

export const TransactionsTable: React.FC<TransactionsTableProps> = ({
  transactions,
  purchaseOrders,
  schedules = [],
  onOpenTicket,
  onNavigateToStage,
  onUpdateTransaction,
  canEditTransactions = true,
}) => {
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [supplierFilter, setSupplierFilter] = useState<string>('');
  // Per-column header search filters
  const [colDate, setColDate] = useState('');
  const [colTicket, setColTicket] = useState('');
  const [colPlateDriver, setColPlateDriver] = useState('');
  const [colPoSupplier, setColPoSupplier] = useState('');
  const [colSj, setColSj] = useState('');
  const [colGross, setColGross] = useState('');
  const [colTare, setColTare] = useState('');
  const [colNetto, setColNetto] = useState('');
  const [colSusut, setColSusut] = useState('');
  const [colQc, setColQc] = useState('');
  const [colRemarks, setColRemarks] = useState('');
  const [selectedTimelineTx, setSelectedTimelineTx] = useState<CoalTransaction | null>(null);
  const [editingTx, setEditingTx] = useState<CoalTransaction | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    vehiclePlate: string;
    driverName: string;
    driverPhone: string;
    transporterName: string;
    suratJalanNumber: string;
    suratJalanWeight: string;
    tarpCondition: 'BAIK_RAPAT' | 'RUSAK_ROBEK' | 'TANPA_TERPAL';
    securityNotes: string;
    ritCategory: string;
    ritRemarks: string;
    assignedStockpile: string;
    grossWeight: string;
    tareWeight: string;
    gateInDate: string;
    gateInTime: string;
    securityOfficer: string;
    weighInDate: string;
    weighInTime: string;
    weighInOperator: string;
    unloadingDate: string;
    unloadingTime: string;
    unloadingChecker: string;
    weighOutDate: string;
    weighOutTime: string;
    weighOutOperator: string;
    gateOutDate: string;
    gateOutTime: string;
    gateOutOfficer: string;
  } | null>(null);

  const handleOpenEdit = (tx: CoalTransaction) => {
    const resolvedRit = resolveTransactionRitInfo(tx, transactions, schedules);
    setEditError(null);
    setEditingTx(tx);
    setEditForm({
      vehiclePlate: tx.vehiclePlate || '',
      driverName: tx.driverName || '',
      driverPhone: tx.driverPhone || '',
      transporterName: tx.transporterName || '',
      suratJalanNumber: tx.suratJalanNumber || '',
      suratJalanWeight: tx.suratJalanWeight > 0 ? String(tx.suratJalanWeight) : '',
      tarpCondition: tx.tarpCondition || 'BAIK_RAPAT',
      securityNotes: tx.securityNotes || '',
      ritCategory: resolvedRit.ritCategory,
      ritRemarks: resolvedRit.ritRemarks,
      assignedStockpile: tx.assignedStockpile || tx.unloadingStockpile || '',
      grossWeight: tx.grossWeight > 0 ? String(tx.grossWeight) : '',
      tareWeight: tx.tareWeight > 0 ? String(tx.tareWeight) : '',
      gateInDate: extractLocalDate(tx.gateInTime),
      gateInTime: extractLocalTime(tx.gateInTime),
      securityOfficer: tx.securityOfficer || '',
      weighInDate: extractLocalDate(tx.weighInTime),
      weighInTime: extractLocalTime(tx.weighInTime),
      weighInOperator: tx.weighInOperator || '',
      unloadingDate: extractLocalDate(tx.unloadingEndTime),
      unloadingTime: extractLocalTime(tx.unloadingEndTime),
      unloadingChecker: tx.unloadingChecker || '',
      weighOutDate: extractLocalDate(tx.weighOutTime),
      weighOutTime: extractLocalTime(tx.weighOutTime),
      weighOutOperator: tx.weighOutOperator || '',
      gateOutDate: extractLocalDate(tx.gateOutTime),
      gateOutTime: extractLocalTime(tx.gateOutTime),
      gateOutOfficer: tx.gateOutOfficer || '',
    });
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTx || !editForm || !onUpdateTransaction) return;
    setEditError(null);

    const nextGross = Number(editForm.grossWeight) || 0;
    const nextTare = Number(editForm.tareWeight) || 0;
    const nextSjWeight = Number(editForm.suratJalanWeight) || 0;

    if (nextTare > 0) {
      const weightValidation = validateWeighOutWeights(nextGross, nextTare);
      if (!weightValidation.valid) {
        setEditError(weightValidation.error || 'Berat timbangan Gross & Tare tidak valid.');
        return;
      }
    }

    const nextGateInIso = combineDateAndTimeToIso(editForm.gateInDate, editForm.gateInTime, editingTx.gateInTime) || editingTx.gateInTime;
    const nextWeighInIso = combineDateAndTimeToIso(editForm.weighInDate, editForm.weighInTime, editingTx.weighInTime || nextGateInIso);
    const nextUnloadingIso = combineDateAndTimeToIso(editForm.unloadingDate, editForm.unloadingTime, editingTx.unloadingEndTime || nextWeighInIso || nextGateInIso);
    const nextWeighOutIso = combineDateAndTimeToIso(editForm.weighOutDate, editForm.weighOutTime, editingTx.weighOutTime || nextUnloadingIso || nextGateInIso);
    const nextGateOutIso = combineDateAndTimeToIso(editForm.gateOutDate, editForm.gateOutTime, editingTx.gateOutTime || nextWeighOutIso || nextGateInIso);

    const chronoCheck = validateTransactionChronology({
      gateInTime: nextGateInIso,
      weighInTime: nextWeighInIso,
      unloadingEndTime: nextUnloadingIso,
      weighOutTime: nextWeighOutIso,
      gateOutTime: nextGateOutIso,
    });
    if (!chronoCheck.valid) {
      setEditError(chronoCheck.error || 'Urutan tanggal/jam tahapan operasional tidak valid.');
      return;
    }

    const po = purchaseOrders.find((p) => p.id === editingTx.poId);
    const tol = po?.tolerancePercentage || 5;
    const metrics = calculateToleranceMetrics({
      grossWeight: nextGross,
      tareWeight: nextTare,
      suratJalanWeight: nextSjWeight,
      tolerancePercentage: tol,
    });

    const updatedTx: CoalTransaction = {
      ...editingTx,
      vehiclePlate: editForm.vehiclePlate.toUpperCase().trim() || editingTx.vehiclePlate,
      driverName: editForm.driverName.trim() || editingTx.driverName,
      driverPhone: editForm.driverPhone.trim(),
      transporterName: editForm.transporterName.trim(),
      suratJalanNumber: editForm.suratJalanNumber.trim(),
      suratJalanWeight: nextSjWeight,
      tarpCondition: editForm.tarpCondition,
      securityNotes: editForm.securityNotes.trim(),
      ritCategory: editForm.ritCategory.trim() || undefined,
      ritRemarks: editForm.ritRemarks.trim() || undefined,
      assignedStockpile: editForm.assignedStockpile.trim() || editingTx.assignedStockpile,
      unloadingStockpile: editForm.assignedStockpile.trim() || editingTx.unloadingStockpile,
      grossWeight: nextGross,
      tareWeight: nextTare,
      initialDiscrepancy: metrics.initialDiscrepancy,
      nettoWeight: metrics.nettoWeight,
      nettoTons: metrics.nettoTons,
      weightDifference: metrics.weightDifference,
      shrinkagePercentage: metrics.shrinkagePercentage,
      toleranceStatus: metrics.nettoWeight > 0 ? metrics.toleranceStatus : editingTx.toleranceStatus,
      claimPenaltyKg: metrics.nettoWeight > 0 ? metrics.claimPenaltyKg : editingTx.claimPenaltyKg,
      gateInTime: nextGateInIso,
      securityOfficer: editForm.securityOfficer.trim(),
      weighInTime: nextWeighInIso,
      weighInOperator: editForm.weighInOperator.trim(),
      unloadingEndTime: nextUnloadingIso,
      unloadingChecker: editForm.unloadingChecker.trim(),
      weighOutTime: nextWeighOutIso,
      weighOutOperator: editForm.weighOutOperator.trim(),
      gateOutTime: nextGateOutIso,
      gateOutOfficer: editForm.gateOutOfficer.trim(),
    };

    onUpdateTransaction(updatedTx);
    setEditingTx(null);
    setEditForm(null);
    setEditError(null);
  };

  const isAnyColumnFilterActive = Boolean(
    colDate.trim() ||
      colTicket.trim() ||
      colPlateDriver.trim() ||
      colPoSupplier.trim() ||
      colSj.trim() ||
      colGross.trim() ||
      colTare.trim() ||
      colNetto.trim() ||
      colSusut.trim() ||
      colQc.trim() ||
      colRemarks.trim() ||
      statusFilter !== 'ALL'
  );

  const handleResetColumnFilters = () => {
    setColDate('');
    setColTicket('');
    setColPlateDriver('');
    setColPoSupplier('');
    setColSj('');
    setColGross('');
    setColTare('');
    setColNetto('');
    setColSusut('');
    setColQc('');
    setColRemarks('');
    setStatusFilter('ALL');
  };

  // Base filter (status dan seluruh kolom pencarian header — sebelum dropdown supplier)
  const baseFilteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      const ritInfo = resolveTransactionRitInfo(tx, transactions, schedules);

      if (statusFilter !== 'ALL' && tx.status !== statusFilter) return false;

      // Filter kolom: Tgl Kedatangan
      if (colDate.trim()) {
        const dq = colDate.toLowerCase().trim();
        const dateStr = tx.gateInTime
          ? new Date(tx.gateInTime).toLocaleDateString('id-ID', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            }).toLowerCase()
          : '';
        const timeStr = tx.gateInTime
          ? `${new Date(tx.gateInTime).toLocaleTimeString('id-ID', {
              hour: '2-digit',
              minute: '2-digit',
            })} wib`.toLowerCase()
          : '';
        const isoDate = (tx.gateInTime || '').slice(0, 10).toLowerCase();
        if (!dateStr.includes(dq) && !timeStr.includes(dq) && !isoDate.includes(dq)) return false;
      }

      // Filter kolom: No Tiket & Antrean
      if (colTicket.trim()) {
        const tq = colTicket.toLowerCase().trim();
        const displayTicket = formatDisplayTicketNumber(tx.ticketNumber);
        const combined = `${displayTicket} ${tx.ticketNumber || ''} ${tx.queueNumber || ''}`.toLowerCase();
        if (!combined.includes(tq)) return false;
      }

      // Filter kolom: No Polisi / Driver
      if (colPlateDriver.trim()) {
        const pq = colPlateDriver.toLowerCase().trim();
        const combined = `${tx.vehiclePlate || ''} ${tx.driverName || ''} ${tx.transporterName || ''}`.toLowerCase();
        if (!combined.includes(pq)) return false;
      }

      // Filter kolom: PO & Supplier
      if (colPoSupplier.trim()) {
        const psq = colPoSupplier.toLowerCase().trim();
        const combined = `${tx.poNumber || ''} ${tx.supplierName || ''}`.toLowerCase();
        if (!combined.includes(psq)) return false;
      }

      // Filter kolom: Surat Jalan (SJ)
      if (colSj.trim()) {
        const sjq = colSj.toLowerCase().trim();
        const sjTon = ((tx.suratJalanWeight || 0) / 1000).toFixed(2);
        const combined = `${tx.suratJalanNumber || ''} ${tx.suratJalanWeight || 0} ${sjTon} ton`.toLowerCase();
        if (!combined.includes(sjq)) return false;
      }

      // Filter kolom: Gross (kg)
      if (colGross.trim()) {
        const gq = colGross.toLowerCase().trim().replace(/\s+/g, '');
        const rawGross = String(tx.grossWeight || 0);
        const fmtGross = (tx.grossWeight || 0).toLocaleString('id-ID');
        if (!rawGross.includes(gq) && !fmtGross.toLowerCase().includes(gq)) return false;
      }

      // Filter kolom: Tare (kg)
      if (colTare.trim()) {
        const trq = colTare.toLowerCase().trim().replace(/\s+/g, '');
        const rawTare = String(tx.tareWeight || 0);
        const fmtTare = (tx.tareWeight || 0).toLocaleString('id-ID');
        if (!rawTare.includes(trq) && !fmtTare.toLowerCase().includes(trq)) return false;
      }

      // Filter kolom: Netto Pabrik
      if (colNetto.trim()) {
        const nq = colNetto.toLowerCase().trim();
        const rawNetto = String(tx.nettoWeight || 0);
        const fmtNetto = `${(tx.nettoWeight || 0).toLocaleString('id-ID')} kg ${(tx.nettoTons || 0).toFixed(2)} ton`.toLowerCase();
        if (!rawNetto.includes(nq.replace(/\s+/g, '')) && !fmtNetto.includes(nq)) return false;
      }

      // Filter kolom: Susut (%)
      if (colSusut.trim()) {
        const sq = colSusut.toLowerCase().trim();
        const susutStr =
          tx.status === 'COMPLETED'
            ? `${tx.shrinkagePercentage > 0 ? '+' : ''}${tx.shrinkagePercentage.toFixed(2)}%`
            : '-';
        if (!susutStr.toLowerCase().includes(sq)) return false;
      }

      // Filter kolom: Kualitas QC
      if (colQc.trim()) {
        const qcq = colQc.toLowerCase().trim();
        const qcText = tx.labResults?.calorieGAR
          ? `${tx.labResults.calorieGAR} kcal tm ${Number(tx.labResults.totalMoisture).toFixed(1)}% ${tx.qcStatus || ''} ${tx.visualAssessment?.moistureVisual || ''}`
          : Boolean(tx.weighOutTime) || tx.status === 'GATE_OUT' || tx.status === 'COMPLETED'
            ? 'menunggu pic qc'
            : 'pasca timbang out';
        if (!qcText.toLowerCase().includes(qcq)) return false;
      }

      // Filter kolom: Keterangan
      if (colRemarks.trim()) {
        const rq = colRemarks.toLowerCase().trim();
        const combined = `${ritInfo.ritCategory} ${ritInfo.ritRemarks} ${tx.securityNotes || ''}`.toLowerCase();
        if (!combined.includes(rq)) return false;
      }

      return true;
    });
  }, [
    transactions,
    schedules,
    statusFilter,
    colDate,
    colTicket,
    colPlateDriver,
    colPoSupplier,
    colSj,
    colGross,
    colTare,
    colNetto,
    colSusut,
    colQc,
    colRemarks,
  ]);

  // Daftar nama supplier yang sudah terinput (dari transaksi, PO, dan jadwal) diurutkan alfabetis
  const registeredSupplierOptions = useMemo(() => {
    const countMap = new Map<string, number>();

    transactions.forEach((tx) => {
      const name = (tx.supplierName || '').trim();
      if (name && !countMap.has(name)) countMap.set(name, 0);
    });
    purchaseOrders.forEach((po) => {
      const name = (po.supplierName || '').trim();
      if (name && !countMap.has(name)) countMap.set(name, 0);
    });
    schedules.forEach((sch) => {
      const name = (sch.supplierName || '').trim();
      if (name && !countMap.has(name)) countMap.set(name, 0);
    });

    baseFilteredTransactions.forEach((tx) => {
      const name = (tx.supplierName || '').trim();
      if (name) {
        countMap.set(name, (countMap.get(name) || 0) + 1);
      }
    });

    return Array.from(countMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, 'id'));
  }, [transactions, purchaseOrders, schedules, baseFilteredTransactions]);

  const filteredTransactions = useMemo(() => {
    if (!supplierFilter) return baseFilteredTransactions;
    return baseFilteredTransactions.filter(
      (tx) => (tx.supplierName || '').trim() === supplierFilter
    );
  }, [baseFilteredTransactions, supplierFilter]);

  // Sort transactions: input terbaru ditampilkan paling atas (newest first)
  const sortedTransactions = useMemo(() => {
    return [...filteredTransactions].sort((a, b) => {
      const timeA = new Date(a.gateInTime || a.suratJalanDate || 0).getTime();
      const timeB = new Date(b.gateInTime || b.suratJalanDate || 0).getTime();
      if (timeA !== timeB) return timeB - timeA;
      return (b.id || '').localeCompare(a.id || '');
    });
  }, [filteredTransactions]);

  // Pagination Operasional Batubara (Maksimal 10 data per halaman)
  const TX_PAGE_SIZE = 10;
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    statusFilter,
    supplierFilter,
    colDate,
    colTicket,
    colPlateDriver,
    colPoSupplier,
    colSj,
    colGross,
    colTare,
    colNetto,
    colSusut,
    colQc,
    colRemarks,
  ]);

  const totalPages = Math.max(1, Math.ceil(sortedTransactions.length / TX_PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * TX_PAGE_SIZE;
  const endIndex = Math.min(startIndex + TX_PAGE_SIZE, sortedTransactions.length);
  const paginatedTransactions = sortedTransactions.slice(startIndex, endIndex);

  const exportToCSV = () => {
    const headers = [
      'Tanggal Kedatangan (Pos)',
      'No Tiket',
      'No Antrean',
      'Status',
      'No PO',
      'Supplier',
      'No Polisi',
      'Driver',
      'Transporter',
      'Jam Gate In',
      'No Surat Jalan',
      'Berat SJ (kg)',
      'Gross Timbang Masuk (kg)',
      'Tare Timbang Keluar (kg)',
      'Netto Pabrik (kg)',
      'Netto (Ton)',
      'Susut (kg)',
      'Persentase Susut (%)',
      'Kalori QC (kcal/kg)',
      'Total Moisture (%)',
      'Ash (%)',
      'Sulfur (%)',
      'Status QC',
      'Stockpile Alokasi',
      'Kategori RIT',
      'Keterangan Pengiriman',
      'Jam Gate Out'
    ];

    const rows = sortedTransactions.map((tx) => {
      const ritInfo = resolveTransactionRitInfo(tx, transactions, schedules);
      return [
        tx.gateInTime ? new Date(tx.gateInTime).toLocaleDateString('id-ID') : '',
        formatDisplayTicketNumber(tx.ticketNumber),
        tx.queueNumber,
        tx.status,
        tx.poNumber,
        tx.supplierName,
        tx.vehiclePlate,
        tx.driverName,
        tx.transporterName,
        tx.gateInTime || '',
        tx.suratJalanNumber,
        tx.suratJalanWeight || 0,
        tx.grossWeight || 0,
        tx.tareWeight || 0,
        tx.nettoWeight || 0,
        tx.nettoTons || 0,
        tx.weightDifference || 0,
        tx.shrinkagePercentage || 0,
        tx.labResults?.calorieGAR || '',
        tx.labResults?.totalMoisture || '',
        tx.labResults?.ashContent || '',
        tx.labResults?.totalSulfur || '',
        tx.qcStatus || '',
        tx.assignedStockpile || '',
        ritInfo.ritCategory,
        ritInfo.ritRemarks,
        tx.gateOutTime || '',
      ];
    });

    downloadCsvFile(
      `rekap_transaksi_batubara_${new Date().toISOString().slice(0, 10)}.csv`,
      headers,
      rows
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-slate-300 rounded-xl p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <FileText className="w-5 h-5 text-amber-500 shrink-0" />
            <span className="text-slate-900">Riwayat Operasional Penerimaan Batubara</span>
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Log komprehensif data kedatangan armada, verifikasi surat jalan, rekonsiliasi timbangan jembatan, dan parameter uji mutu QC
          </p>
        </div>
      </div>

      {/* Filter Tabs (Kiri) + Dropdown Supplier & Ekspor CSV (Kanan) */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-400">Status Alur:</span>
          <div className="flex flex-wrap items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
            {[
              { id: 'ALL', label: 'Semua' },
              { id: 'GATE_IN', label: 'Gate In' },
              { id: 'TIMBANG_MASUK', label: 'Timbang Gross' },
              { id: 'BONGKAR', label: 'Bongkar' },
              { id: 'TIMBANG_KELUAR', label: 'Timbang Tare' },
              { id: 'GATE_OUT', label: 'Gate Out (Penyelesaian)' },
              { id: 'COMPLETED', label: 'Selesai (Completed)' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setStatusFilter(item.id)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                  statusFilter === item.id
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Dropdown Filter Nama Supplier yang Sudah Terinput */}
          <div className="relative flex items-center">
            <Building2 className="w-3.5 h-3.5 text-amber-600 absolute left-2.5 pointer-events-none" />
            <select
              aria-label="Filter Nama Supplier"
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="appearance-none bg-white border border-slate-300 hover:border-amber-500 focus:border-amber-500 focus:outline-none rounded-lg pl-8 pr-8 py-1.5 text-xs font-semibold text-slate-800 shadow-xs cursor-pointer transition-colors min-w-[210px] max-w-[290px]"
            >
              <option value="">
                Semua Supplier ({baseFilteredTransactions.length} Data)
              </option>
              {registeredSupplierOptions.map((sup) => (
                <option key={sup.name} value={sup.name}>
                  {sup.name} ({sup.count} Data)
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 pointer-events-none" />
          </div>

          {supplierFilter && (
            <button
              type="button"
              onClick={() => setSupplierFilter('')}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 transition-colors cursor-pointer"
              title="Reset filter supplier"
            >
              <X className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          )}

          <button
            type="button"
            onClick={exportToCSV}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition-colors shadow-sm cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Ekspor CSV / Excel</span>
          </button>
        </div>
      </div>

      {/* Full Data Container (Mobile Cards + Desktop Table) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        {/* Mobile View: Cards (Visible on screens below md) */}
        <div className="block md:hidden divide-y divide-slate-800">
          {filteredTransactions.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              Tidak ada transaksi yang cocok dengan filter pencarian.
            </div>
          ) : (
            paginatedTransactions.map((tx) => {
              let badgeStyle = 'text-slate-400 bg-slate-800 border-slate-700';
              if (tx.status === 'COMPLETED') badgeStyle = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
              else if (tx.status === 'GATE_IN') badgeStyle = 'text-blue-400 bg-blue-500/10 border-blue-500/30';
              else if (tx.status === 'TIMBANG_MASUK') badgeStyle = 'text-amber-400 bg-amber-500/10 border-amber-500/30';
              else if (tx.status === 'QC_CHECK') badgeStyle = 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30';
              else if (tx.status === 'BONGKAR') badgeStyle = 'text-sky-400 bg-sky-500/10 border-sky-500/30';
              else if (tx.status === 'TIMBANG_KELUAR') badgeStyle = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
              else if (tx.status === 'GATE_OUT') badgeStyle = 'text-rose-400 bg-rose-500/10 border-rose-500/30';

              let nextTab: ActiveTab = 'weigh-in';
              if (tx.status === 'GATE_IN') nextTab = 'weigh-in';
              else if (tx.status === 'TIMBANG_MASUK') nextTab = 'unloading';
              else if (tx.status === 'QC_CHECK') nextTab = 'unloading';
              else if (tx.status === 'BONGKAR') nextTab = 'weigh-out';
              else if (tx.status === 'TIMBANG_KELUAR') nextTab = 'security';
              else if (tx.status === 'GATE_OUT') nextTab = 'security';

              const ritInfo = resolveTransactionRitInfo(tx, transactions, schedules);
              const ritBadgeClass =
                ritInfo.ritNumber === 1
                  ? 'bg-amber-50 text-amber-900 border-amber-300'
                  : ritInfo.ritNumber === 2
                    ? 'bg-sky-50 text-sky-900 border-sky-300'
                    : 'bg-indigo-50 text-indigo-900 border-indigo-300';

              return (
                <div key={tx.id} className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono-num text-sm font-bold text-white bg-slate-950 px-2.5 py-1 rounded-md border border-slate-700 tracking-wider">
                      {tx.vehiclePlate}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono-num font-bold text-amber-400">
                        {tx.queueNumber}
                      </span>
                      <span className={`px-2 py-0.5 text-[10px] font-semibold rounded border ${badgeStyle}`}>
                        {tx.status}
                      </span>
                    </div>
                  </div>

                  <div className="text-xs space-y-1">
                    <div className="flex justify-between text-slate-200 font-semibold">
                      <span>{tx.driverName}</span>
                      <span className="font-mono-num text-slate-400 text-[11px]">{formatDisplayTicketNumber(tx.ticketNumber)}</span>
                    </div>
                    <div className="text-slate-400 text-[11px] truncate">
                      {tx.supplierName} · <span className="font-mono-num text-slate-300">{tx.poNumber}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded border font-mono-num ${ritBadgeClass}`}>
                        {ritInfo.ritCategory}
                      </span>
                      <span className="text-[11px] text-slate-600 whitespace-normal break-words">
                        {ritInfo.ritRemarks}
                      </span>
                    </div>
                  </div>

                  {/* 3-metric compact box */}
                  <div className="grid grid-cols-3 gap-2 bg-slate-950/70 p-2.5 rounded-lg border border-slate-800 text-center font-mono-num">
                    <div>
                      <span className="text-[9px] text-slate-500 block uppercase">Muatan SJ</span>
                      <span className="text-xs text-slate-300 font-bold">
                        {(tx.suratJalanWeight / 1000).toFixed(2)} T
                      </span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-500 block uppercase">Netto Pabrik</span>
                      <span className="text-xs font-bold text-emerald-400">
                        {tx.nettoTons ? `${tx.nettoTons.toFixed(2)} T` : '-'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-500 block uppercase">Susut (%)</span>
                      <span className={`text-xs font-bold ${
                        (tx.shrinkagePercentage || 0) < -(purchaseOrders.find((p) => p.id === tx.poId)?.tolerancePercentage || 5)
                          ? 'text-rose-400'
                          : 'text-slate-300'
                      }`}>
                        {tx.shrinkagePercentage !== undefined && tx.shrinkagePercentage !== 0
                          ? `${tx.shrinkagePercentage > 0 ? '+' : ''}${tx.shrinkagePercentage.toFixed(2)}%`
                          : '-'}
                      </span>
                    </div>
                  </div>

                  {/* Mobile Actions */}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] text-slate-400 font-mono-num">
                      Masuk: {tx.gateInTime ? `${new Date(tx.gateInTime).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${new Date(tx.gateInTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB` : '-'}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {tx.status !== 'COMPLETED' && tx.status !== 'REJECTED' && (
                        <button
                          type="button"
                          onClick={() => onNavigateToStage(nextTab, tx.id)}
                          className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-lg transition-colors whitespace-nowrap shadow-sm"
                        >
                          Proses
                        </button>
                      )}
                      {canEditTransactions && (
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(tx)}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-sky-400 rounded-lg text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
                          title="Edit Jam & Data Operasional"
                        >
                          <Pencil className="w-3.5 h-3.5 text-sky-600" />
                          <span>Edit</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setSelectedTimelineTx(tx)}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium border border-slate-700 transition-colors"
                        title="Lihat Timeline Durasi Waktu"
                      >
                        <Clock className="w-3.5 h-3.5 text-amber-400" />
                        <span>Timeline</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenTicket(tx)}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium border border-slate-700 transition-colors"
                        title="Cetak Tiket Timbang Resmi"
                      >
                        <Printer className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Tiket</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop View: Full Table (Hidden on small mobile screens) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 font-semibold uppercase text-[11px]">
              <tr>
                <th className="py-3 px-3">Tgl Kedatangan</th>
                <th className="py-3 px-3">No Tiket & Antrean</th>
                <th className="py-3 px-3">No Polisi / Driver</th>
                <th className="py-3 px-3">PO & Supplier</th>
                <th className="py-3 px-3">Surat Jalan (SJ)</th>
                <th className="py-3 px-3 text-right">Gross (kg)</th>
                <th className="py-3 px-3 text-right">Tare (kg)</th>
                <th className="py-3 px-3 text-right">Netto Pabrik</th>
                <th className="py-3 px-3 text-right">Susut (%)</th>
                <th className="py-3 px-3">Kualitas QC</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Keterangan</th>
                <th className="py-3 px-3 text-right">Aksi</th>
              </tr>
              {/* Baris Pencarian di Bawah Masing-Masing Header */}
              <tr className="bg-slate-50/90 border-t border-slate-200">
                <th className="px-2 py-2 font-normal normal-case">
                  <div className="relative flex items-center">
                    <Search className="w-3 h-3 text-slate-400 absolute left-2 pointer-events-none" />
                    <input
                      type="text"
                      value={colDate}
                      onChange={(e) => setColDate(e.target.value)}
                      placeholder="Cari Tgl..."
                      className="w-full min-w-[92px] pl-6 pr-5 py-1 text-[11px] rounded border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 shadow-2xs"
                    />
                    {colDate && (
                      <button
                        type="button"
                        onClick={() => setColDate('')}
                        className="absolute right-1 text-slate-400 hover:text-slate-700 text-xs px-0.5 cursor-pointer"
                        title="Hapus filter tanggal"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </th>

                <th className="px-2 py-2 font-normal normal-case">
                  <div className="relative flex items-center">
                    <Search className="w-3 h-3 text-slate-400 absolute left-2 pointer-events-none" />
                    <input
                      type="text"
                      value={colTicket}
                      onChange={(e) => setColTicket(e.target.value)}
                      placeholder="Cari Tiket..."
                      className="w-full min-w-[100px] pl-6 pr-5 py-1 text-[11px] rounded border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 shadow-2xs"
                    />
                    {colTicket && (
                      <button
                        type="button"
                        onClick={() => setColTicket('')}
                        className="absolute right-1 text-slate-400 hover:text-slate-700 text-xs px-0.5 cursor-pointer"
                        title="Hapus filter tiket"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </th>

                <th className="px-2 py-2 font-normal normal-case">
                  <div className="relative flex items-center">
                    <Search className="w-3 h-3 text-slate-400 absolute left-2 pointer-events-none" />
                    <input
                      type="text"
                      value={colPlateDriver}
                      onChange={(e) => setColPlateDriver(e.target.value)}
                      placeholder="Cari Nopol..."
                      className="w-full min-w-[105px] pl-6 pr-5 py-1 text-[11px] rounded border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 shadow-2xs"
                    />
                    {colPlateDriver && (
                      <button
                        type="button"
                        onClick={() => setColPlateDriver('')}
                        className="absolute right-1 text-slate-400 hover:text-slate-700 text-xs px-0.5 cursor-pointer"
                        title="Hapus filter nopol/driver"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </th>

                <th className="px-2 py-2 font-normal normal-case">
                  <div className="relative flex items-center">
                    <Search className="w-3 h-3 text-slate-400 absolute left-2 pointer-events-none" />
                    <input
                      type="text"
                      value={colPoSupplier}
                      onChange={(e) => setColPoSupplier(e.target.value)}
                      placeholder="Cari PO/Supp..."
                      className="w-full min-w-[115px] pl-6 pr-5 py-1 text-[11px] rounded border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 shadow-2xs"
                    />
                    {colPoSupplier && (
                      <button
                        type="button"
                        onClick={() => setColPoSupplier('')}
                        className="absolute right-1 text-slate-400 hover:text-slate-700 text-xs px-0.5 cursor-pointer"
                        title="Hapus filter PO/supplier"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </th>

                <th className="px-2 py-2 font-normal normal-case">
                  <div className="relative flex items-center">
                    <Search className="w-3 h-3 text-slate-400 absolute left-2 pointer-events-none" />
                    <input
                      type="text"
                      value={colSj}
                      onChange={(e) => setColSj(e.target.value)}
                      placeholder="Cari No SJ..."
                      className="w-full min-w-[95px] pl-6 pr-5 py-1 text-[11px] rounded border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 shadow-2xs"
                    />
                    {colSj && (
                      <button
                        type="button"
                        onClick={() => setColSj('')}
                        className="absolute right-1 text-slate-400 hover:text-slate-700 text-xs px-0.5 cursor-pointer"
                        title="Hapus filter surat jalan"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </th>

                <th className="px-2 py-2 font-normal normal-case">
                  <div className="relative flex items-center">
                    <Search className="w-3 h-3 text-slate-400 absolute left-2 pointer-events-none" />
                    <input
                      type="text"
                      value={colGross}
                      onChange={(e) => setColGross(e.target.value)}
                      placeholder="Gross..."
                      className="w-full min-w-[78px] pl-6 pr-4 py-1 text-[11px] rounded border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 shadow-2xs"
                    />
                    {colGross && (
                      <button
                        type="button"
                        onClick={() => setColGross('')}
                        className="absolute right-1 text-slate-400 hover:text-slate-700 text-xs px-0.5 cursor-pointer"
                        title="Hapus filter gross"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </th>

                <th className="px-2 py-2 font-normal normal-case">
                  <div className="relative flex items-center">
                    <Search className="w-3 h-3 text-slate-400 absolute left-2 pointer-events-none" />
                    <input
                      type="text"
                      value={colTare}
                      onChange={(e) => setColTare(e.target.value)}
                      placeholder="Tare..."
                      className="w-full min-w-[76px] pl-6 pr-4 py-1 text-[11px] rounded border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 shadow-2xs"
                    />
                    {colTare && (
                      <button
                        type="button"
                        onClick={() => setColTare('')}
                        className="absolute right-1 text-slate-400 hover:text-slate-700 text-xs px-0.5 cursor-pointer"
                        title="Hapus filter tare"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </th>

                <th className="px-2 py-2 font-normal normal-case">
                  <div className="relative flex items-center">
                    <Search className="w-3 h-3 text-slate-400 absolute left-2 pointer-events-none" />
                    <input
                      type="text"
                      value={colNetto}
                      onChange={(e) => setColNetto(e.target.value)}
                      placeholder="Netto..."
                      className="w-full min-w-[82px] pl-6 pr-4 py-1 text-[11px] rounded border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 shadow-2xs"
                    />
                    {colNetto && (
                      <button
                        type="button"
                        onClick={() => setColNetto('')}
                        className="absolute right-1 text-slate-400 hover:text-slate-700 text-xs px-0.5 cursor-pointer"
                        title="Hapus filter netto"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </th>

                <th className="px-2 py-2 font-normal normal-case">
                  <div className="relative flex items-center">
                    <Search className="w-3 h-3 text-slate-400 absolute left-2 pointer-events-none" />
                    <input
                      type="text"
                      value={colSusut}
                      onChange={(e) => setColSusut(e.target.value)}
                      placeholder="Susut..."
                      className="w-full min-w-[74px] pl-6 pr-4 py-1 text-[11px] rounded border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 shadow-2xs"
                    />
                    {colSusut && (
                      <button
                        type="button"
                        onClick={() => setColSusut('')}
                        className="absolute right-1 text-slate-400 hover:text-slate-700 text-xs px-0.5 cursor-pointer"
                        title="Hapus filter susut"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </th>

                <th className="px-2 py-2 font-normal normal-case">
                  <div className="relative flex items-center">
                    <Search className="w-3 h-3 text-slate-400 absolute left-2 pointer-events-none" />
                    <input
                      type="text"
                      value={colQc}
                      onChange={(e) => setColQc(e.target.value)}
                      placeholder="Cari QC..."
                      className="w-full min-w-[90px] pl-6 pr-5 py-1 text-[11px] rounded border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 shadow-2xs"
                    />
                    {colQc && (
                      <button
                        type="button"
                        onClick={() => setColQc('')}
                        className="absolute right-1 text-slate-400 hover:text-slate-700 text-xs px-0.5 cursor-pointer"
                        title="Hapus filter kualitas QC"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </th>

                <th className="px-2 py-2 font-normal normal-case">
                  <select
                    aria-label="Filter Status Kolom"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full min-w-[96px] px-2 py-1 text-[11px] rounded border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 shadow-2xs cursor-pointer"
                  >
                    <option value="ALL">Semua</option>
                    <option value="GATE_IN">GATE_IN</option>
                    <option value="TIMBANG_MASUK">TIMBANG_MASUK</option>
                    <option value="BONGKAR">BONGKAR</option>
                    <option value="TIMBANG_KELUAR">TIMBANG_KELUAR</option>
                    <option value="GATE_OUT">GATE_OUT</option>
                    <option value="COMPLETED">COMPLETED</option>
                  </select>
                </th>

                <th className="px-2 py-2 font-normal normal-case">
                  <div className="relative flex items-center">
                    <Search className="w-3 h-3 text-slate-400 absolute left-2 pointer-events-none" />
                    <input
                      type="text"
                      value={colRemarks}
                      onChange={(e) => setColRemarks(e.target.value)}
                      placeholder="Cari RIT/Ket..."
                      className="w-full min-w-[115px] pl-6 pr-5 py-1 text-[11px] rounded border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 shadow-2xs"
                    />
                    {colRemarks && (
                      <button
                        type="button"
                        onClick={() => setColRemarks('')}
                        className="absolute right-1 text-slate-400 hover:text-slate-700 text-xs px-0.5 cursor-pointer"
                        title="Hapus filter keterangan"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </th>

                <th className="px-2 py-2 text-right font-normal normal-case">
                  <button
                    type="button"
                    disabled={!isAnyColumnFilterActive && !supplierFilter}
                    onClick={() => {
                      handleResetColumnFilters();
                      setSupplierFilter('');
                    }}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-[11px] font-semibold transition-colors ${
                      isAnyColumnFilterActive || supplierFilter
                        ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-300 cursor-pointer'
                        : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                    }`}
                    title="Reset seluruh kolom pencarian & filter"
                  >
                    <X className="w-3 h-3" />
                    <span>Reset</span>
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-300">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-8 text-center text-slate-500">
                    Tidak ada transaksi yang cocok dengan filter pencarian.
                  </td>
                </tr>
              ) : (
                paginatedTransactions.map((tx) => {
                  let badgeStyle = 'text-slate-400 bg-slate-800 border-slate-700';
                  if (tx.status === 'COMPLETED') badgeStyle = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
                  else if (tx.status === 'GATE_IN') badgeStyle = 'text-blue-400 bg-blue-500/10 border-blue-500/30';
                  else if (tx.status === 'TIMBANG_MASUK') badgeStyle = 'text-amber-400 bg-amber-500/10 border-amber-500/30';
                  else if (tx.status === 'QC_CHECK') badgeStyle = 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30';
                  else if (tx.status === 'BONGKAR') badgeStyle = 'text-sky-400 bg-sky-500/10 border-sky-500/30';
                  else if (tx.status === 'TIMBANG_KELUAR') badgeStyle = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
                  else if (tx.status === 'GATE_OUT') badgeStyle = 'text-rose-400 bg-rose-500/10 border-rose-500/30';

                  let nextTab: ActiveTab = 'weigh-in';
                  if (tx.status === 'GATE_IN') nextTab = 'weigh-in';
                  else if (tx.status === 'TIMBANG_MASUK') nextTab = 'unloading';
                  else if (tx.status === 'QC_CHECK') nextTab = 'unloading';
                  else if (tx.status === 'BONGKAR') nextTab = 'weigh-out';
                  else if (tx.status === 'TIMBANG_KELUAR') nextTab = 'security';
                  else if (tx.status === 'GATE_OUT') nextTab = 'security';

                  const ritInfo = resolveTransactionRitInfo(tx, transactions, schedules);
                  const ritBadgeClass =
                    ritInfo.ritNumber === 1
                      ? 'bg-amber-50 text-amber-900 border-amber-300'
                      : ritInfo.ritNumber === 2
                        ? 'bg-sky-50 text-sky-900 border-sky-300'
                        : 'bg-indigo-50 text-indigo-900 border-indigo-300';

                  return (
                    <tr key={tx.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-3 font-mono-num whitespace-nowrap">
                        <div className="font-bold text-slate-200">
                          {tx.gateInTime
                            ? new Date(tx.gateInTime).toLocaleDateString('id-ID', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                              })
                            : '-'}
                        </div>
                        <div className="text-[11px] text-amber-400 font-semibold">
                          {tx.gateInTime
                            ? `${new Date(tx.gateInTime).toLocaleTimeString('id-ID', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })} WIB`
                            : '-'}
                        </div>
                      </td>

                      <td className="py-3 px-3 font-mono-num">
                        <div className="font-bold text-slate-200">{formatDisplayTicketNumber(tx.ticketNumber)}</div>
                        <div className="text-[11px] text-amber-400 font-semibold">{tx.queueNumber}</div>
                      </td>

                      <td className="py-3 px-3">
                        <span className="font-mono-num font-bold text-white bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                          {tx.vehiclePlate}
                        </span>
                        <div className="text-[11px] text-slate-300 font-medium mt-0.5">{tx.driverName}</div>
                      </td>

                      <td className="py-3 px-3">
                        <div className="font-mono-num font-semibold text-amber-400">{tx.poNumber}</div>
                        <div className="text-[11px] text-slate-400 truncate max-w-[130px]">{tx.supplierName}</div>
                      </td>

                      <td className="py-3 px-3 font-mono-num">
                        <div className="text-slate-300 font-medium">{tx.suratJalanNumber}</div>
                        <div className="text-[11px] text-slate-400">
                          {(tx.suratJalanWeight / 1000).toFixed(2)} Ton
                        </div>
                      </td>

                      <td className="py-3 px-3 text-right font-mono-num">
                        {tx.grossWeight > 0 ? (
                          <span className="text-slate-200 font-semibold">{tx.grossWeight.toLocaleString('id-ID')}</span>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>

                      <td className="py-3 px-3 text-right font-mono-num">
                        {tx.tareWeight > 0 ? (
                          <span className="text-slate-200 font-semibold">{tx.tareWeight.toLocaleString('id-ID')}</span>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>

                      <td className="py-3 px-3 text-right font-mono-num">
                        {tx.nettoWeight > 0 ? (
                          <div>
                            <span className="font-bold text-emerald-400">{tx.nettoWeight.toLocaleString('id-ID')} kg</span>
                            <div className="text-[11px] text-slate-400">{tx.nettoTons.toFixed(2)} Ton</div>
                          </div>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>

                      <td className="py-3 px-3 text-right font-mono-num">
                        {tx.status === 'COMPLETED' ? (
                          <span className={`font-semibold ${
                            tx.shrinkagePercentage < -(purchaseOrders.find((p) => p.id === tx.poId)?.tolerancePercentage || 5)
                              ? 'text-rose-400'
                              : 'text-emerald-400'
                          }`}>
                            {tx.shrinkagePercentage > 0 ? '+' : ''}{tx.shrinkagePercentage.toFixed(2)}%
                          </span>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>

                      <td className="py-3 px-3">
                        {tx.labResults?.calorieGAR ? (
                          <div className="text-[11px] font-mono-num">
                            <span className="font-semibold text-slate-200">{tx.labResults.calorieGAR} kcal · TM {Number(tx.labResults.totalMoisture).toFixed(1)}%</span>
                            <span className="text-[10px] text-emerald-400 block">{tx.qcStatus} {tx.visualAssessment?.moistureVisual ? `· Visual ${tx.visualAssessment.moistureVisual}` : ''}</span>
                          </div>
                        ) : (Boolean(tx.weighOutTime) || tx.status === 'GATE_OUT' || tx.status === 'COMPLETED') ? (
                          <button
                            type="button"
                            onClick={() => onNavigateToStage('qc', tx.id)}
                            className="text-[11px] text-amber-400 hover:text-amber-300 font-semibold underline text-left cursor-pointer"
                            title="Update hasil uji lab QC-PA (diluar alur operasional)"
                          >
                            Menunggu PIC QC
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-500">Pasca Timbang Out</span>
                        )}
                      </td>

                      <td className="py-3 px-3">
                        <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded border ${badgeStyle}`}>
                          {tx.status}
                        </span>
                      </td>

                      <td className="py-3 px-3 min-w-[165px] max-w-[230px]">
                        <div className="space-y-1">
                          <span className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded border font-mono-num ${ritBadgeClass}`}>
                            {ritInfo.ritCategory}
                          </span>
                          <div className="text-[11px] text-slate-700 font-medium whitespace-normal break-words leading-snug">
                            {ritInfo.ritRemarks}
                          </div>
                          {tx.securityNotes && (
                            <div className="text-[10px] text-slate-500 whitespace-normal break-words leading-snug">
                              Catatan: {tx.securityNotes}
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {tx.status !== 'COMPLETED' && tx.status !== 'REJECTED' && (
                            <button
                              type="button"
                              onClick={() => onNavigateToStage(nextTab, tx.id)}
                              className="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-[11px] rounded transition-colors whitespace-nowrap"
                              title="Lanjutkan ke stasiun berikutnya"
                            >
                              Proses
                            </button>
                          )}

                          {canEditTransactions && (
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(tx)}
                              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-sky-600 hover:text-sky-700 rounded border border-slate-700 transition-colors cursor-pointer"
                              title="Edit Jam & Data Operasional"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => setSelectedTimelineTx(tx)}
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-400 rounded border border-slate-700 transition-colors"
                            title="Lihat Timeline Durasi Waktu"
                          >
                            <Clock className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => onOpenTicket(tx)}
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded border border-slate-700 transition-colors"
                            title="Cetak Tiket Timbang Resmi"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar Riwayat Operasional Batubara (Maks 10 per halaman) */}
        {sortedTransactions.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-slate-950/90 border-t border-slate-800 text-xs">
            <div className="text-slate-400 font-medium">
              Menampilkan <span className="font-bold text-slate-200 font-mono-num">{startIndex + 1}</span> - <span className="font-bold text-slate-200 font-mono-num">{endIndex}</span> dari <span className="font-bold text-slate-200 font-mono-num">{sortedTransactions.length}</span> transaksi
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safeCurrentPage <= 1}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                  safeCurrentPage <= 1
                    ? 'opacity-40 cursor-not-allowed bg-slate-900 text-slate-500 border-slate-800'
                    : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700 cursor-pointer shadow-2xs'
                }`}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Sebelumnya</span>
              </button>

              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((pageNum) => {
                  if (
                    totalPages > 7 &&
                    pageNum !== 1 &&
                    pageNum !== totalPages &&
                    Math.abs(pageNum - safeCurrentPage) > 1
                  ) {
                    if (pageNum === 2 || pageNum === totalPages - 1) {
                      return <span key={pageNum} className="px-1 text-slate-500 font-mono-num">...</span>;
                    }
                    return null;
                  }

                  const isActive = pageNum === safeCurrentPage;
                  return (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => setCurrentPage(pageNum)}
                      className={`w-7 h-7 flex items-center justify-center rounded-lg text-xs font-bold font-mono-num transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-amber-500 text-slate-950 border border-amber-500 shadow-2xs'
                          : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safeCurrentPage >= totalPages}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                  safeCurrentPage >= totalPages
                    ? 'opacity-40 cursor-not-allowed bg-slate-900 text-slate-500 border-slate-800'
                    : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700 cursor-pointer shadow-2xs'
                }`}
              >
                <span>Selanjutnya</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedTimelineTx && (
        <TransactionTimelineModal
          transaction={selectedTimelineTx}
          onClose={() => setSelectedTimelineTx(null)}
        />
      )}

      {/* Modal Edit Data & Jam Riwayat Operasional Batubara */}
      {editingTx && editForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white border border-slate-300 rounded-2xl max-w-3xl w-full p-4 sm:p-6 shadow-2xl my-4 sm:my-8 max-h-[92vh] overflow-y-auto text-slate-900"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4 gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex flex-wrap items-center gap-2">
                  <Pencil className="w-4 h-4 text-sky-600 shrink-0" />
                  <span>Edit Riwayat Operasional Penerimaan Batubara</span>
                  <span className="font-mono-num text-xs font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                    {editingTx.vehiclePlate} · {formatDisplayTicketNumber(editingTx.ticketNumber)}
                  </span>
                </h3>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  Revisi tanggal, jam input operasional (WIB), petugas, data surat jalan, maupun berat timbangan.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingTx(null);
                  setEditForm(null);
                }}
                className="text-slate-500 hover:text-slate-900 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-5">
              {editError && (
                <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs font-semibold text-rose-900 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{editError}</span>
                </div>
              )}
              {/* Section 1: Data Armada, Driver & Surat Jalan */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                  1. Data Armada, Pengemudi & Surat Jalan
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-900 mb-1">
                      Nomor Polisi (Nopol) *
                    </label>
                    <input
                      type="text"
                      required
                      value={editForm.vehiclePlate}
                      onChange={(e) => setEditForm({ ...editForm, vehiclePlate: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 font-mono font-bold uppercase focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-900 mb-1">
                      Nama Driver *
                    </label>
                    <input
                      type="text"
                      required
                      value={editForm.driverName}
                      onChange={(e) => setEditForm({ ...editForm, driverName: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-900 mb-1">
                      No HP Driver
                    </label>
                    <input
                      type="text"
                      value={editForm.driverPhone}
                      onChange={(e) => setEditForm({ ...editForm, driverPhone: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 font-mono-num focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-900 mb-1">
                      Transporter / Angkutan
                    </label>
                    <input
                      type="text"
                      value={editForm.transporterName}
                      onChange={(e) => setEditForm({ ...editForm, transporterName: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-900 mb-1">
                      No. Surat Jalan *
                    </label>
                    <input
                      type="text"
                      required
                      value={editForm.suratJalanNumber}
                      onChange={(e) => setEditForm({ ...editForm, suratJalanNumber: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 font-mono-num focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-900 mb-1">
                      Berat Surat Jalan (Kg) *
                    </label>
                    <input
                      type="number"
                      min={0}
                      required
                      value={editForm.suratJalanWeight}
                      onChange={(e) => setEditForm({ ...editForm, suratJalanWeight: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 font-mono-num focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-900 mb-1">
                      Kondisi Terpal
                    </label>
                    <select
                      value={editForm.tarpCondition}
                      onChange={(e) => setEditForm({ ...editForm, tarpCondition: e.target.value as any })}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-amber-500"
                    >
                      <option value="BAIK_RAPAT">Baik, Rapat, Tidak Ada Bocor</option>
                      <option value="RUSAK_ROBEK">Ada Robekan / Kurang Rapat</option>
                      <option value="TANPA_TERPAL">Tanpa Terpal (Peringatan Khusus)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-900 mb-1">
                      Catatan Pos Security
                    </label>
                    <input
                      type="text"
                      value={editForm.securityNotes}
                      onChange={(e) => setEditForm({ ...editForm, securityNotes: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-900 mb-1">
                      Kategori RIT Pengiriman
                    </label>
                    <select
                      value={editForm.ritCategory}
                      onChange={(e) => {
                        const nextCat = e.target.value;
                        const numMatch = nextCat.match(/\d+/);
                        const nextNum = numMatch ? numMatch[0] : '';
                        const isAutoRemarks =
                          !editForm.ritRemarks.trim() ||
                          /^PENGIRIMAN BATUBARA RIT KE-\d+$/i.test(editForm.ritRemarks.trim());
                        setEditForm({
                          ...editForm,
                          ritCategory: nextCat,
                          ritRemarks:
                            isAutoRemarks && nextNum
                              ? `PENGIRIMAN BATUBARA RIT KE-${nextNum}`
                              : editForm.ritRemarks,
                        });
                      }}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 font-bold focus:outline-none focus:border-amber-500"
                    >
                      {Array.from({ length: 20 }, (_, idx) => `RIT ${idx + 1}`).map((ritOpt) => (
                        <option key={ritOpt} value={ritOpt}>
                          {ritOpt}
                        </option>
                      ))}
                      {!/^RIT \d+$/i.test(editForm.ritCategory) && editForm.ritCategory && (
                        <option value={editForm.ritCategory}>{editForm.ritCategory}</option>
                      )}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-900 mb-1">
                      Keterangan Identitas Pengiriman RIT
                    </label>
                    <input
                      type="text"
                      value={editForm.ritRemarks}
                      onChange={(e) => setEditForm({ ...editForm, ritRemarks: e.target.value })}
                      placeholder="Contoh: PENGIRIMAN BATUBARA RIT KE-1"
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Edit Input Tanggal & Jam Operasional */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                    <span>2. Edit Input Tanggal & Jam Tahapan Operasional (WIB)</span>
                  </h4>
                  {(() => {
                    const gInIso = combineDateAndTimeToIso(editForm.gateInDate, editForm.gateInTime, editingTx.gateInTime);
                    const gOutIso =
                      combineDateAndTimeToIso(editForm.gateOutDate, editForm.gateOutTime, editingTx.gateOutTime) ||
                      combineDateAndTimeToIso(editForm.weighOutDate, editForm.weighOutTime, editingTx.weighOutTime);
                    const dur = gInIso ? calculateDuration(gInIso, gOutIso) : null;
                    return dur ? (
                      <span className="text-[11px] font-mono-num font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded">
                        Estimasi Durasi: {dur.text}
                      </span>
                    ) : null;
                  })()}
                </div>

                <div className="space-y-2.5">
                  {(
                    [
                      {
                        label: '1. Gate In (Pos Security Masuk)',
                        dateKey: 'gateInDate' as const,
                        timeKey: 'gateInTime' as const,
                        officerKey: 'securityOfficer' as const,
                        officerPlaceholder: 'Nama petugas security...',
                        required: true,
                      },
                      {
                        label: '2. Timbang Masuk (Gross)',
                        dateKey: 'weighInDate' as const,
                        timeKey: 'weighInTime' as const,
                        officerKey: 'weighInOperator' as const,
                        officerPlaceholder: 'Nama operator timbang masuk...',
                        required: false,
                      },
                      {
                        label: '3. Selesai Bongkar Stockpile',
                        dateKey: 'unloadingDate' as const,
                        timeKey: 'unloadingTime' as const,
                        officerKey: 'unloadingChecker' as const,
                        officerPlaceholder: 'Nama operator bongkar...',
                        required: false,
                      },
                      {
                        label: '4. Timbang Keluar (Tare)',
                        dateKey: 'weighOutDate' as const,
                        timeKey: 'weighOutTime' as const,
                        officerKey: 'weighOutOperator' as const,
                        officerPlaceholder: 'Nama operator timbang keluar...',
                        required: false,
                      },
                      {
                        label: '5. Gate Out (Keluar Gerbang)',
                        dateKey: 'gateOutDate' as const,
                        timeKey: 'gateOutTime' as const,
                        officerKey: 'gateOutOfficer' as const,
                        officerPlaceholder: 'Nama petugas posko gate out...',
                        required: false,
                      },
                    ] as const
                  ).map((stage) => (
                    <div
                      key={stage.label}
                      className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center bg-white p-2.5 rounded-lg border border-slate-200"
                    >
                      <div className="sm:col-span-4 text-xs font-bold text-slate-900">
                        {stage.label} {stage.required && <span className="text-rose-600">*</span>}
                      </div>

                      <div className="sm:col-span-3 relative flex items-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            const input = e.currentTarget.parentElement?.querySelector('input[type="date"]') as HTMLInputElement | null;
                            try {
                              input?.showPicker?.();
                            } catch {
                              input?.focus();
                            }
                          }}
                          className="absolute left-2 text-amber-600 hover:text-amber-700 p-0.5 rounded cursor-pointer z-10"
                          title="Pilih tanggal sistem"
                        >
                          <Calendar className="w-3.5 h-3.5" />
                        </button>
                        <input
                          type="date"
                          required={stage.required}
                          value={editForm[stage.dateKey]}
                          onChange={(e) => setEditForm({ ...editForm, [stage.dateKey]: e.target.value })}
                          className="w-full bg-white border border-slate-300 rounded pl-7 pr-2 py-1.5 text-xs text-slate-900 font-mono-num focus:outline-none focus:border-amber-500"
                          style={{ colorScheme: 'light' }}
                        />
                      </div>

                      <div className="sm:col-span-2 relative flex items-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            const input = e.currentTarget.parentElement?.querySelector('input[type="time"]') as HTMLInputElement | null;
                            try {
                              input?.showPicker?.();
                            } catch {
                              input?.focus();
                            }
                          }}
                          className="absolute left-2 text-amber-600 hover:text-amber-700 p-0.5 rounded cursor-pointer z-10"
                          title="Pilih jam sistem"
                        >
                          <Clock className="w-3.5 h-3.5" />
                        </button>
                        <input
                          type="time"
                          required={stage.required}
                          value={editForm[stage.timeKey]}
                          onChange={(e) => setEditForm({ ...editForm, [stage.timeKey]: e.target.value })}
                          className="w-full bg-white border border-slate-300 rounded pl-7 pr-1.5 py-1.5 text-xs text-slate-900 font-mono-num font-semibold focus:outline-none focus:border-amber-500"
                          style={{ colorScheme: 'light' }}
                        />
                      </div>

                      <div className="sm:col-span-3">
                        <input
                          type="text"
                          placeholder={stage.officerPlaceholder}
                          value={editForm[stage.officerKey]}
                          onChange={(e) => setEditForm({ ...editForm, [stage.officerKey]: e.target.value })}
                          className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-amber-500"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Section 3: Data Timbangan & Stockpile */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                  3. Data Timbangan & Lokasi Stockpile
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-900 mb-1">
                      Gross Timbang Masuk (Kg)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={editForm.grossWeight}
                      onChange={(e) => setEditForm({ ...editForm, grossWeight: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 font-mono-num focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-900 mb-1">
                      Tare Timbang Keluar (Kg)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={editForm.tareWeight}
                      onChange={(e) => setEditForm({ ...editForm, tareWeight: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 font-mono-num focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-900 mb-1">
                      Stockpile Alokasi / Bongkar
                    </label>
                    <input
                      type="text"
                      value={editForm.assignedStockpile}
                      onChange={(e) => setEditForm({ ...editForm, assignedStockpile: e.target.value })}
                      placeholder="Contoh: Stockpile Utama"
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                {Number(editForm.grossWeight) > 0 && Number(editForm.tareWeight) > 0 && (
                  <div className="flex flex-wrap items-center gap-4 text-xs bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 font-mono-num">
                    <span className="text-slate-700">
                      Netto Kalkulasi:{' '}
                      <strong className="text-emerald-800">
                        {Math.max(0, Number(editForm.grossWeight) - Number(editForm.tareWeight)).toLocaleString('id-ID')} kg (
                        {(Math.max(0, Number(editForm.grossWeight) - Number(editForm.tareWeight)) / 1000).toFixed(2)} Ton)
                      </strong>
                    </span>
                    {Number(editForm.suratJalanWeight) > 0 && (
                      <span className="text-slate-700">
                        Selisih vs SJ:{' '}
                        <strong className="text-amber-800">
                          {(
                            ((Math.max(0, Number(editForm.grossWeight) - Number(editForm.tareWeight)) -
                              Number(editForm.suratJalanWeight)) /
                              Number(editForm.suratJalanWeight)) *
                            100
                          ).toFixed(2)}
                          %
                        </strong>
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setEditingTx(null);
                    setEditForm(null);
                  }}
                  className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-lg transition-colors shadow-sm cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>Simpan Perubahan</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
