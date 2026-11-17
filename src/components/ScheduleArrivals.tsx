import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  Clock, 
  Plus, 
  Search, 
  Building2, 
  AlertTriangle,
  CheckCircle2, 
  Layers,
  Trash2,
  X,
  ChevronRight,
  Pencil,
  FileSpreadsheet,
  RotateCcw,
  FilterX
} from 'lucide-react';
import { PurchaseOrder, ArrivalSchedule, CoalTransaction } from '../types/coal';

export const MAX_SCHEDULES_PER_PO = 20;

interface MultiRowItem {
  id: string;
  etaDateTime: string;
  estimatedTonnage: string | number;
  estimatedTruckCount: string | number;
  remarks: string;
}

interface ScheduleArrivalsProps {
  schedules: ArrivalSchedule[];
  purchaseOrders: PurchaseOrder[];
  transactions?: CoalTransaction[];
  isAdmin?: boolean;
  onSaveSchedule: (schedule: ArrivalSchedule | ArrivalSchedule[]) => void;
  onCheckInToSecurity?: (schedule: ArrivalSchedule) => void;
  onUpdateSchedule?: (schedule: ArrivalSchedule) => void;
  onDeleteSchedule?: (scheduleId: string) => void;
  initialPoId?: string | null;
  onClearInitialPoId?: () => void;
}

export const ScheduleArrivals: React.FC<ScheduleArrivalsProps> = ({
  schedules,
  purchaseOrders,
  transactions = [],
  isAdmin = true,
  onSaveSchedule,
  onUpdateSchedule,
  onDeleteSchedule,
  initialPoId,
  onClearInitialPoId,
}) => {
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [deletingSchedule, setDeletingSchedule] = useState<ArrivalSchedule | null>(null);
  const [inputMode, setInputMode] = useState<'MULTI'>('MULTI');

  // Per-column search filters for table headers
  const [colSearchId, setColSearchId] = useState('');
  const [colSearchPo, setColSearchPo] = useState('');
  const [colSearchEta, setColSearchEta] = useState('');
  const [colSearchTonnage, setColSearchTonnage] = useState('');
  const [colSearchTruck, setColSearchTruck] = useState('');
  const [colSearchSupplier, setColSearchSupplier] = useState('');
  const [colSearchStatus, setColSearchStatus] = useState('');
  const [colSearchRemarks, setColSearchRemarks] = useState('');

  const isAnyColFilterActive = Boolean(
    colSearchId ||
    colSearchPo ||
    colSearchEta ||
    colSearchTonnage ||
    colSearchTruck ||
    colSearchSupplier ||
    colSearchStatus ||
    colSearchRemarks
  );

  const activeColFilterCount = [
    colSearchId,
    colSearchPo,
    colSearchEta,
    colSearchTonnage,
    colSearchTruck,
    colSearchSupplier,
    colSearchStatus,
    colSearchRemarks
  ].filter(Boolean).length;

  const handleResetColFilters = () => {
    setColSearchId('');
    setColSearchPo('');
    setColSearchEta('');
    setColSearchTonnage('');
    setColSearchTruck('');
    setColSearchSupplier('');
    setColSearchStatus('');
    setColSearchRemarks('');
  };

  // State for Revising / Editing an existing schedule
  const [editingSchedule, setEditingSchedule] = useState<ArrivalSchedule | null>(null);
  const [editScheduleData, setEditScheduleData] = useState<{
    etaDateTime: string;
    estimatedTonnage: string | number;
    estimatedTruckCount: string | number;
    status: ArrivalSchedule['status'];
    remarks: string;
  }>({
    etaDateTime: '',
    estimatedTonnage: '',
    estimatedTruckCount: 1,
    status: 'ON_WAY',
    remarks: '',
  });

  const activePos = purchaseOrders.filter((po) => po.status === 'ACTIVE');

  // Date only formatter DD/MM/YYYY
  const formatDateOnly = (dateStr: string) => {
    if (!dateStr) return '-';
    const cleanStr = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
    const parts = cleanStr.split('-');
    if (parts.length === 3) {
      const [y, m, d] = parts;
      return `${d}/${m}/${y}`;
    }
    return dateStr;
  };

  // Selected PO in Modal
  const initialSelectedPoId = initialPoId || activePos[0]?.id || purchaseOrders[0]?.id || '';
  const [selectedPoId, setSelectedPoId] = useState<string>(initialSelectedPoId);

  const getInitialPoScheduleCount = (poId: string) =>
    poId ? schedules.filter((s) => s.poId === poId).length : 0;

  const createDefaultFirstRow = (poId: string): MultiRowItem => ({
    id: `row-${Date.now()}-1`,
    etaDateTime: new Date().toISOString().slice(0, 10),
    estimatedTonnage: '30000',
    estimatedTruckCount: 1,
    remarks: `PENGIRIMAN BATUBARA RIT KE-${getInitialPoScheduleCount(poId) + 1}`,
  });

  // Single Form State (Allows fluid manual typing and revision)
  const [singleFormData, setSingleFormData] = useState<{
    etaDateTime: string;
    estimatedTonnage: string | number;
    estimatedTruckCount: string | number;
    originMine: string;
    remarks: string;
  }>({
    etaDateTime: new Date().toISOString().slice(0, 10),
    estimatedTonnage: '30000',
    estimatedTruckCount: 1,
    originMine: '',
    remarks: '',
  });

  // Multi Rows State for Batch Adding (up to 20 per PO, allows fluid manual typing and revision)
  const [multiRows, setMultiRows] = useState<MultiRowItem[]>(() => [
    createDefaultFirstRow(initialSelectedPoId),
  ]);

  // Default interval hours for subsequent rows
  const defaultIntervalHours = 2;

  // Watch for initialPoId passed from PO Management
  useEffect(() => {
    if (initialPoId) {
      setSelectedPoId(initialPoId);
      setMultiRows([createDefaultFirstRow(initialPoId)]);
      setIsModalOpen(true);
      if (onClearInitialPoId) {
        onClearInitialPoId();
      }
    }
  }, [initialPoId, onClearInitialPoId]);

  // Selected PO object
  const currentPo = purchaseOrders.find((p) => p.id === selectedPoId) || activePos[0];

  // Count existing schedules for the currently selected PO
  const poExistingSchedules = selectedPoId
    ? schedules.filter((s) => s.poId === selectedPoId)
    : [];
  const poScheduleCount = poExistingSchedules.length;
  const remainingQuota = Math.max(0, MAX_SCHEDULES_PER_PO - poScheduleCount);
  const isQuotaFull = poScheduleCount >= MAX_SCHEDULES_PER_PO;

  const OPERATIONAL_PROGRESS_STATUSES = new Set([
    'ARRIVED_GATE',
    'GATE_IN',
    'TIMBANG_MASUK',
    'QC_CHECK',
    'BONGKAR',
    'TIMBANG_KELUAR',
    'GATE_OUT',
    'COMPLETED',
    'REJECTED',
  ]);

  // Temukan transaksi operasional terbaru yang terhubung dengan jadwal ini
  const getLinkedTransaction = (sch: ArrivalSchedule): CoalTransaction | undefined => {
    const directMatches = transactions.filter((tx) => tx.scheduleId === sch.id);
    if (directMatches.length > 0) {
      return directMatches[0];
    }
    return undefined;
  };

  // Status kedatangan efektif (otomatis mengikuti alur transaksi operasional bila sudah check-in)
  const getEffectiveScheduleStatus = (sch: ArrivalSchedule): string => {
    if (sch.status === 'CANCELLED') return 'CANCELLED';
    const linkedTx = getLinkedTransaction(sch);
    if (linkedTx) {
      if (linkedTx.status === 'GATE_IN') return 'ARRIVED_GATE';
      if (linkedTx.status === 'QC_CHECK') return 'BONGKAR';
      return linkedTx.status;
    }
    if (sch.status && sch.status !== 'ON_WAY' && sch.status !== 'SCHEDULED' && sch.status !== 'OVERDUE') {
      return sch.status;
    }
    if (sch.status === 'OVERDUE') return 'OVERDUE';
    if (sch.etaDateTime) {
      const todayStr = new Date().toISOString().slice(0, 10);
      const etaStr = sch.etaDateTime.includes('T') ? sch.etaDateTime.split('T')[0] : sch.etaDateTime;
      if (etaStr < todayStr) return 'OVERDUE';
    }
    return sch.status || 'ON_WAY';
  };

  // Helper to detect if a schedule is overdue (past ETA date and hasn't arrived)
  const isScheduleOverdue = (sch: ArrivalSchedule) => {
    const eff = getEffectiveScheduleStatus(sch);
    return eff === 'OVERDUE';
  };

  const getScheduleStatusBadge = (sch: ArrivalSchedule) => {
    const eff = getEffectiveScheduleStatus(sch);
    switch (eff) {
      case 'CANCELLED':
        return {
          label: 'Batal / No-Show',
          badgeStyle: 'text-rose-700 bg-rose-50 border-rose-300 font-semibold',
        };
      case 'OVERDUE':
        return {
          label: 'Lewat Jadwal (Overdue)',
          badgeStyle: 'text-amber-800 bg-amber-100 border-amber-400 font-bold',
        };
      case 'ARRIVED_GATE':
      case 'GATE_IN':
        return {
          label: 'Tiba di Pos Security',
          badgeStyle: 'text-blue-800 bg-blue-50 border-blue-300 font-semibold',
        };
      case 'TIMBANG_MASUK':
        return {
          label: 'Timbang Masuk (Gross)',
          badgeStyle: 'text-amber-800 bg-amber-50 border-amber-300 font-semibold',
        };
      case 'BONGKAR':
      case 'QC_CHECK':
        return {
          label: 'Bongkar di Stockpile',
          badgeStyle: 'text-sky-800 bg-sky-50 border-sky-300 font-semibold',
        };
      case 'TIMBANG_KELUAR':
        return {
          label: 'Timbang Keluar (Tare)',
          badgeStyle: 'text-teal-800 bg-teal-50 border-teal-300 font-semibold',
        };
      case 'GATE_OUT':
        return {
          label: 'Menunggu Gate Out',
          badgeStyle: 'text-indigo-800 bg-indigo-50 border-indigo-300 font-semibold',
        };
      case 'COMPLETED':
        return {
          label: 'Selesai (Sudah Keluar)',
          badgeStyle: 'text-emerald-800 bg-emerald-100 border-emerald-400 font-bold',
        };
      case 'REJECTED':
        return {
          label: 'Ditolak / Retur',
          badgeStyle: 'text-rose-800 bg-rose-100 border-rose-400 font-bold',
        };
      case 'ON_WAY':
        return {
          label: 'Sedang di Jalan',
          badgeStyle: 'text-sky-800 bg-sky-50 border-sky-300 font-semibold',
        };
      default:
        return {
          label: 'Terjadwal',
          badgeStyle: 'text-slate-700 bg-slate-100 border-slate-300 font-semibold',
        };
    }
  };

  // Filtered schedules for table view & mobile cards
  const filteredSchedules = schedules.filter((sch) => {
    const effStatus = getEffectiveScheduleStatus(sch);

    // 1. Top Bar Status Filter
    if (statusFilter !== 'ALL') {
      if (statusFilter === 'IN_PROCESS') {
        if (!OPERATIONAL_PROGRESS_STATUSES.has(effStatus) || effStatus === 'COMPLETED' || effStatus === 'REJECTED') {
          return false;
        }
      } else if (effStatus !== statusFilter) {
        return false;
      }
    }

    // 3. Col Search: ID Jadwal
    if (colSearchId) {
      const q = colSearchId.toLowerCase().trim();
      if (!sch.id.toLowerCase().includes(q)) return false;
    }

    // 4. Col Search: Nomor PO & Kuota
    if (colSearchPo) {
      const q = colSearchPo.toLowerCase().trim();
      if (!sch.poNumber.toLowerCase().includes(q)) return false;
    }

    // 5. Col Search: Tanggal Estimasi Tiba (ETA)
    if (colSearchEta) {
      const q = colSearchEta.toLowerCase().trim();
      const rawEta = sch.etaDateTime || '';
      const formattedEta = formatDateOnly(rawEta).toLowerCase();
      if (!rawEta.toLowerCase().includes(q) && !formattedEta.includes(q)) return false;
    }

    // 6. Col Search: Estimasi Berat Muatan (Kg)
    if (colSearchTonnage) {
      const q = colSearchTonnage.toLowerCase().trim().replace(/[,.]/g, '');
      const rawTon = String(sch.estimatedTonnage);
      const formattedTon = Number(sch.estimatedTonnage).toLocaleString('id-ID');
      const tonVal = (Number(sch.estimatedTonnage) / 1000).toString();
      if (!rawTon.includes(q) && !formattedTon.includes(colSearchTonnage.trim()) && !tonVal.includes(q)) return false;
    }

    // 7. Col Search: Estimasi Ritase
    if (colSearchTruck) {
      const q = colSearchTruck.trim();
      const truckCount = String(sch.estimatedTruckCount || 1);
      if (!truckCount.includes(q)) return false;
    }

    // 8. Col Search: Nama Supplier
    if (colSearchSupplier) {
      const q = colSearchSupplier.toLowerCase().trim();
      if (!sch.supplierName.toLowerCase().includes(q)) return false;
    }

    // 9. Col Search: Status Kedatangan
    if (colSearchStatus) {
      if (colSearchStatus === 'IN_PROCESS') {
        if (!OPERATIONAL_PROGRESS_STATUSES.has(effStatus) || effStatus === 'COMPLETED' || effStatus === 'REJECTED') {
          return false;
        }
      } else if (effStatus !== colSearchStatus) {
        return false;
      }
    }

    // 10. Col Search: Keterangan
    if (colSearchRemarks) {
      const q = colSearchRemarks.toLowerCase().trim();
      const remarks = (sch.remarks || '').toLowerCase();
      if (!remarks.includes(q)) return false;
    }

    return true;
  });

  // Handle PO Change in modal
  const handlePoChange = (newPoId: string) => {
    setSelectedPoId(newPoId);
    const count = schedules.filter((s) => s.poId === newPoId).length;
    const remaining = Math.max(0, MAX_SCHEDULES_PER_PO - count);

    const nextRows =
      multiRows.length > remaining && remaining > 0
        ? multiRows.slice(0, remaining)
        : multiRows;

    setMultiRows(
      nextRows.map((row, idx) => {
        const isAutoOrEmpty =
          !row.remarks.trim() || /^PENGIRIMAN BATUBARA RIT KE-\d+$/i.test(row.remarks.trim());
        return isAutoOrEmpty
          ? { ...row, remarks: `PENGIRIMAN BATUBARA RIT KE-${count + idx + 1}` }
          : row;
      })
    );
  };

  // Add 1 row in multi mode
  const handleAddMultiRow = () => {
    if (multiRows.length >= remainingQuota) {
      setCreateError(`Maksimal ${MAX_SCHEDULES_PER_PO} data per PO. Sisa slot yang tersedia untuk PO ini adalah ${remainingQuota} data.`);
      return;
    }
    setCreateError(null);

    const lastRow = multiRows[multiRows.length - 1];
    let nextDateStr = new Date().toISOString().slice(0, 10);
    if (lastRow && lastRow.etaDateTime) {
      nextDateStr = lastRow.etaDateTime.slice(0, 10);
    }

    const newRowIndex = poScheduleCount + multiRows.length + 1;
    const newRow: MultiRowItem = {
      id: `row-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      etaDateTime: nextDateStr,
      estimatedTonnage: 30000,
      estimatedTruckCount: 1,
      remarks: `PENGIRIMAN BATUBARA RIT KE-${newRowIndex}`,
    };

    setMultiRows([...multiRows, newRow]);
  };

  // Quick Generate N Rows
  const handleQuickGenerateRows = (countToAdd: number) => {
    const maxCanAdd = Math.min(countToAdd, remainingQuota);
    if (maxCanAdd <= 0) {
      setCreateError('Kuota 20 data untuk PO ini sudah penuh.');
      return;
    }
    setCreateError(null);

    const todayDateStr = new Date().toISOString().slice(0, 10);
    const generated: MultiRowItem[] = [];

    for (let i = 0; i < maxCanAdd; i++) {
      const rowNumber = poScheduleCount + i + 1;
      generated.push({
        id: `row-gen-${Date.now()}-${i}`,
        etaDateTime: todayDateStr,
        estimatedTonnage: 30000,
        estimatedTruckCount: 1,
        remarks: `PENGIRIMAN BATUBARA RIT KE-${rowNumber}`,
      });
    }

    setMultiRows(generated);
  };

  // Remove a row in multi mode
  const handleRemoveMultiRow = (rowId: string) => {
    if (multiRows.length <= 1) {
      setCreateError('Minimal 1 data jadwal harus ada.');
      return;
    }
    setCreateError(null);
    const filtered = multiRows.filter((r) => r.id !== rowId);
    setMultiRows(
      filtered.map((row, idx) => {
        const isAutoOrEmpty =
          !row.remarks.trim() || /^PENGIRIMAN BATUBARA RIT KE-\d+$/i.test(row.remarks.trim());
        return isAutoOrEmpty
          ? { ...row, remarks: `PENGIRIMAN BATUBARA RIT KE-${poScheduleCount + idx + 1}` }
          : row;
      })
    );
  };

  // Update a field in multi mode
  const handleUpdateMultiRow = (
    rowId: string,
    field: keyof MultiRowItem,
    value: string | number
  ) => {
    let cleanVal = value;
    if (field === 'estimatedTonnage' || field === 'estimatedTruckCount') {
      if (typeof cleanVal === 'string') {
        if (cleanVal.length > 1 && cleanVal.startsWith('0') && !cleanVal.startsWith('0.')) {
          cleanVal = cleanVal.replace(/^0+/, '');
        }
      }
    }
    setMultiRows(
      multiRows.map((r) => (r.id === rowId ? { ...r, [field]: cleanVal } : r))
    );
  };

  // Open Edit / Revisi Modal for existing schedule
  const handleOpenEditSchedule = (sch: ArrivalSchedule) => {
    setEditError(null);
    setEditingSchedule(sch);
    setEditScheduleData({
      etaDateTime: sch.etaDateTime ? sch.etaDateTime.slice(0, 10) : new Date().toISOString().slice(0, 10),
      estimatedTonnage: sch.estimatedTonnage,
      estimatedTruckCount: sch.estimatedTruckCount || 1,
      status: (sch.status as any) || 'ON_WAY',
      remarks: sch.remarks || '',
    });
  };

  // Save Edit / Revisi for schedule
  const handleSaveEditSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSchedule) return;
    setEditError(null);

    if (!editScheduleData.estimatedTonnage || Number(editScheduleData.estimatedTonnage) <= 0) {
      setEditError('Mohon isi Estimasi Berat Muatan (Kg) yang valid (> 0).');
      return;
    }

    const updated: ArrivalSchedule = {
      ...editingSchedule,
      etaDateTime: editScheduleData.etaDateTime,
      estimatedTonnage: Number(editScheduleData.estimatedTonnage),
      estimatedTruckCount: Number(editScheduleData.estimatedTruckCount) || 1,
      status: editScheduleData.status,
      remarks: editScheduleData.remarks.trim(),
    };

    if (onUpdateSchedule) {
      onUpdateSchedule(updated);
    }
    setEditingSchedule(null);
    setEditError(null);
  };

  // Submit Single Schedule
  const handleSingleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    if (!currentPo) {
      setCreateError('Pilih Purchase Order aktif terlebih dahulu.');
      return;
    }

    if (poScheduleCount >= MAX_SCHEDULES_PER_PO) {
      setCreateError(`Maksimal ${MAX_SCHEDULES_PER_PO} data jadwal kedatangan untuk PO ${currentPo.poNumber} telah tercapai.`);
      return;
    }

    const newSchedule: ArrivalSchedule = {
      id: `SCH-${Date.now().toString().slice(-6)}`,
      poId: currentPo.id,
      poNumber: currentPo.poNumber,
      supplierName: currentPo.supplierName,
      etaDateTime: singleFormData.etaDateTime,
      estimatedTonnage: Number(singleFormData.estimatedTonnage),
      estimatedTruckCount: Number(singleFormData.estimatedTruckCount) || 1,
      originMine: singleFormData.originMine,
      status: 'ON_WAY',
      remarks: singleFormData.remarks,
    };

    onSaveSchedule(newSchedule);
    setIsModalOpen(false);
  };

  // Submit Multi Schedules (Batch)
  const handleMultiSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    if (!currentPo) {
      setCreateError('Pilih Purchase Order aktif terlebih dahulu.');
      return;
    }

    if (multiRows.length === 0) {
      setCreateError('Tambahkan minimal 1 baris jadwal pengiriman.');
      return;
    }

    if (poScheduleCount + multiRows.length > MAX_SCHEDULES_PER_PO) {
      setCreateError(
        `Total data (${poScheduleCount + multiRows.length}) melebihi kuota maksimal ${MAX_SCHEDULES_PER_PO} data untuk PO ini.`
      );
      return;
    }

    const timestamp = Date.now().toString().slice(-6);
    const newSchedules: ArrivalSchedule[] = multiRows.map((row, idx) => ({
      id: `SCH-${timestamp}-${(idx + 1).toString().padStart(2, '0')}`,
      poId: currentPo.id,
      poNumber: currentPo.poNumber,
      supplierName: currentPo.supplierName,
      etaDateTime: row.etaDateTime,
      estimatedTonnage: Number(row.estimatedTonnage),
      estimatedTruckCount: Number(row.estimatedTruckCount) || 1,
      originMine: currentPo.destinationStockpile || 'Pit Hauling',
      status: 'ON_WAY',
      remarks: row.remarks || `PENGIRIMAN BATUBARA RIT KE-${poScheduleCount + idx + 1}`,
    }));

    onSaveSchedule(newSchedules);
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-slate-300 rounded-xl p-5 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Calendar className="w-5 h-5 text-amber-600 shrink-0" />
              Jadwal Pengiriman Batubara (Real-Time ETA Dispatch)
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-300">
              Maks. 20 Data / PO
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-1">
            Monitoring perkiraan waktu tiba (ETA) pengiriman batubara per PO dari tambang/pelabuhan. Setiap PO dapat menampung maksimal 20 data pengiriman.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isAdmin ? (
            <button
              type="button"
              onClick={() => {
                const targetPoId = selectedPoId || activePos[0]?.id || purchaseOrders[0]?.id || '';
                if (activePos.length > 0 && !selectedPoId) {
                  setSelectedPoId(targetPoId);
                }
                setCreateError(null);
                setMultiRows([createDefaultFirstRow(targetPoId)]);
                setIsModalOpen(true);
              }}
              className="flex items-center justify-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-lg transition-colors shadow-xs whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Buat Jadwal Pengiriman</span>
            </button>
          ) : (
            <span className="px-3 py-1.5 bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg">
              Mode Lihat (Admin Only untuk Ubah Jadwal)
            </span>
          )}
        </div>
      </div>

      {/* Section Title: RIWAYAT JADWAL PENGIRIMAN */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-300">
        <h3 className="text-sm font-bold text-slate-900 tracking-wide uppercase flex items-center gap-2">
          <Calendar className="w-4 h-4 text-amber-600 shrink-0" />
          <span>RIWAYAT JADWAL PENGIRIMAN</span>
        </h3>
        <span className="text-xs font-mono-num font-bold text-slate-700 bg-white px-2.5 py-1 rounded-md border border-slate-300">
          {filteredSchedules.length} Data Jadwal
        </span>
      </div>

      {/* Filter Tabs & Quick Action */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2 text-xs overflow-x-auto pb-1 scrollbar-none">
          <span className="text-slate-400 shrink-0">Filter Status:</span>
          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 shrink-0">
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                statusFilter === 'ALL' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Semua Jadwal ({schedules.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('ON_WAY')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                statusFilter === 'ON_WAY' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Sedang di Perjalanan ({schedules.filter((s) => getEffectiveScheduleStatus(s) === 'ON_WAY').length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('IN_PROCESS')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                statusFilter === 'IN_PROCESS' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Proses Operasional ({schedules.filter((s) => {
                const eff = getEffectiveScheduleStatus(s);
                return OPERATIONAL_PROGRESS_STATUSES.has(eff) && eff !== 'COMPLETED' && eff !== 'REJECTED';
              }).length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('COMPLETED')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                statusFilter === 'COMPLETED' ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-emerald-400 hover:text-emerald-300'
              }`}
            >
              Selesai ({schedules.filter((s) => getEffectiveScheduleStatus(s) === 'COMPLETED').length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('SCHEDULED')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                statusFilter === 'SCHEDULED' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Terjadwal ({schedules.filter((s) => getEffectiveScheduleStatus(s) === 'SCHEDULED').length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('OVERDUE')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                statusFilter === 'OVERDUE' ? 'bg-rose-500 text-white font-bold' : 'text-rose-400 hover:text-rose-300'
              }`}
            >
              Lewat Jadwal ({schedules.filter((s) => isScheduleOverdue(s)).length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('CANCELLED')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                statusFilter === 'CANCELLED' ? 'bg-slate-700 text-white font-bold' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Batal / No-Show ({schedules.filter((s) => getEffectiveScheduleStatus(s) === 'CANCELLED').length})
            </button>
          </div>
        </div>

        {/* Operational Note for Overdue / No-Show Vendor */}
        {schedules.some((s) => isScheduleOverdue(s)) && (
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-bold text-amber-300">Peringatan Keterlambatan Vendor:</span> Terdapat jadwal yang telah melewati tanggal estimasi tiba (ETA) namun belum masuk Pos Security. Anda dapat klik <span className="font-bold text-sky-300">Revisi</span> untuk memundurkan tanggal ETA (Reschedule) atau ubah status ke <span className="font-bold text-rose-300">CANCELLED (Batal)</span>.
            </div>
          </div>
        )}
      </div>

      {/* Schedules Mobile Cards List */}
      <div className="block md:hidden space-y-3">
        {filteredSchedules.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-center text-slate-500 text-xs">
            Tidak ada jadwal kedatangan sesuai kriteria filter.
          </div>
        ) : (
          filteredSchedules.map((sch) => {
            const poAllSchedules = schedules.filter((s) => s.poId === sch.poId);
            const poIndex = poAllSchedules.findIndex((s) => s.id === sch.id);
            const poTotal = poAllSchedules.length;
            const badge = getScheduleStatusBadge(sch);
            const linkedTx = getLinkedTransaction(sch);

            return (
              <div key={sch.id} className="bg-white border border-slate-300 rounded-xl p-4 space-y-3 shadow-xs">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono-num font-bold text-amber-800 text-sm">{sch.poNumber}</span>
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-300">
                        #{poIndex >= 0 ? poIndex + 1 : 1}/{poTotal}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-slate-900 mt-0.5">{sch.supplierName}</div>
                    <div className="text-[10px] font-mono text-slate-500">{sch.id}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`inline-block px-2 py-0.5 text-[10px] rounded border ${badge.badgeStyle}`}>
                      {badge.label}
                    </span>
                    {linkedTx && (
                      <div className="text-[10px] font-mono font-semibold text-slate-600 mt-0.5">
                        {linkedTx.vehiclePlate}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs bg-slate-950/70 p-2.5 rounded-lg border border-slate-800/80 font-mono-num">
                  <div>
                    <span className="text-[10px] text-slate-500 block">Estimasi Berat Muatan (Kg)</span>
                    <span className="font-bold text-emerald-400 text-sm">
                      {Number(sch.estimatedTonnage).toLocaleString('id-ID')} Kg
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">Ritase / Armada</span>
                    <span className="font-bold text-slate-200">{sch.estimatedTruckCount || 1} Armada</span>
                  </div>
                  <div className="col-span-2 pt-1 border-t border-slate-900 flex items-center justify-between text-[11px]">
                    <span className="text-slate-400 flex items-center gap-1 font-sans">
                      <Calendar className="w-3.5 h-3.5 text-amber-500" />
                      ETA: {formatDateOnly(sch.etaDateTime)}
                    </span>
                  </div>
                </div>

                {sch.remarks && (
                  <p className="text-[11px] text-slate-400 italic">
                    "{sch.remarks}"
                  </p>
                )}

                {isAdmin && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenEditSchedule(sch)}
                      className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-sky-400 border border-sky-500/30 font-semibold text-xs rounded-lg transition-colors shadow-xs"
                      title="Revisi Estimasi Berat Muatan atau Tanggal ETA"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>Revisi Jadwal</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Schedules List Table (Desktop/Tablet) */}
      <div className="hidden md:block bg-white border border-slate-300 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto scrollbar-none">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-700 border-b border-slate-300 font-bold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-3 whitespace-nowrap">ID Jadwal</th>
                <th className="py-3 px-3 whitespace-nowrap">Nomor PO & Kuota</th>
                <th className="py-3 px-3 whitespace-nowrap">Tanggal Estimasi Tiba (ETA)</th>
                <th className="py-3 px-3 whitespace-nowrap text-right">Estimasi Berat Muatan (Kg)</th>
                <th className="py-3 px-3 whitespace-nowrap text-center">Estimasi Ritase</th>
                <th className="py-3 px-3 whitespace-nowrap">Nama Supplier</th>
                <th className="py-3 px-3 whitespace-nowrap">Status Kedatangan</th>
                <th className="py-3 px-3">Keterangan</th>
                <th className="py-3 px-3 text-center whitespace-nowrap min-w-[210px]">Aksi</th>
              </tr>
              {/* BARIS KOLOM PENCARIAN DI BAWAH MASING-MASING HEADER */}
              <tr className="bg-slate-50 border-t border-slate-200 font-normal lowercase tracking-normal">
                {/* 1. ID Jadwal */}
                <th className="px-2 py-2">
                  <div className="relative flex items-center">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 pointer-events-none" />
                    <input
                      type="text"
                      value={colSearchId}
                      onChange={(e) => setColSearchId(e.target.value)}
                      placeholder="Cari ID..."
                      className="w-full pl-7 pr-6 py-1 text-[11px] font-normal normal-case rounded border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 shadow-2xs"
                    />
                    {colSearchId && (
                      <button
                        type="button"
                        onClick={() => setColSearchId('')}
                        className="absolute right-1.5 text-slate-400 hover:text-slate-600 text-xs px-1 cursor-pointer"
                        title="Hapus pencarian ID"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </th>

                {/* 2. Nomor PO & Kuota */}
                <th className="px-2 py-2">
                  <div className="relative flex items-center">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 pointer-events-none" />
                    <input
                      type="text"
                      value={colSearchPo}
                      onChange={(e) => setColSearchPo(e.target.value)}
                      placeholder="Cari No PO..."
                      className="w-full pl-7 pr-6 py-1 text-[11px] font-normal normal-case rounded border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 shadow-2xs"
                    />
                    {colSearchPo && (
                      <button
                        type="button"
                        onClick={() => setColSearchPo('')}
                        className="absolute right-1.5 text-slate-400 hover:text-slate-600 text-xs px-1 cursor-pointer"
                        title="Hapus pencarian PO"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </th>

                {/* 3. Tanggal Estimasi Tiba (ETA) */}
                <th className="px-2 py-2">
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      value={colSearchEta}
                      onChange={(e) => setColSearchEta(e.target.value)}
                      placeholder="Cari Tgl / ETA..."
                      className="w-full pl-2 pr-6 py-1 text-[11px] font-normal normal-case rounded border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 shadow-2xs"
                    />
                    {colSearchEta && (
                      <button
                        type="button"
                        onClick={() => setColSearchEta('')}
                        className="absolute right-1 text-slate-400 hover:text-slate-600 text-xs px-1 cursor-pointer"
                        title="Hapus filter ETA"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </th>

                {/* 4. Estimasi Berat Muatan (Kg) */}
                <th className="px-2 py-2">
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      value={colSearchTonnage}
                      onChange={(e) => setColSearchTonnage(e.target.value)}
                      placeholder="Cari Berat (Kg)..."
                      className="w-full pl-2 pr-6 py-1 text-[11px] text-right font-normal normal-case rounded border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 shadow-2xs"
                    />
                    {colSearchTonnage && (
                      <button
                        type="button"
                        onClick={() => setColSearchTonnage('')}
                        className="absolute right-1 text-slate-400 hover:text-slate-600 text-xs px-1 cursor-pointer"
                        title="Hapus filter berat"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </th>

                {/* 5. Estimasi Ritase */}
                <th className="px-2 py-2">
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      value={colSearchTruck}
                      onChange={(e) => setColSearchTruck(e.target.value)}
                      placeholder="Jml rit..."
                      className="w-full pl-2 pr-6 py-1 text-[11px] text-center font-normal normal-case rounded border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 shadow-2xs"
                    />
                    {colSearchTruck && (
                      <button
                        type="button"
                        onClick={() => setColSearchTruck('')}
                        className="absolute right-1 text-slate-400 hover:text-slate-600 text-xs px-1 cursor-pointer"
                        title="Hapus filter ritase"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </th>

                {/* 6. Nama Supplier */}
                <th className="px-2 py-2">
                  <div className="relative flex items-center">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 pointer-events-none" />
                    <input
                      type="text"
                      value={colSearchSupplier}
                      onChange={(e) => setColSearchSupplier(e.target.value)}
                      placeholder="Cari Supplier..."
                      className="w-full pl-7 pr-6 py-1 text-[11px] font-normal normal-case rounded border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 shadow-2xs"
                    />
                    {colSearchSupplier && (
                      <button
                        type="button"
                        onClick={() => setColSearchSupplier('')}
                        className="absolute right-1.5 text-slate-400 hover:text-slate-600 text-xs px-1 cursor-pointer"
                        title="Hapus filter supplier"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </th>

                {/* 7. Status Kedatangan */}
                <th className="px-2 py-2">
                  <select
                    value={colSearchStatus}
                    onChange={(e) => setColSearchStatus(e.target.value)}
                    className="w-full px-1.5 py-1 text-[11px] font-normal normal-case rounded border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 shadow-2xs cursor-pointer"
                  >
                    <option value="">Semua Status</option>
                    <option value="ON_WAY">Sedang di Jalan</option>
                    <option value="SCHEDULED">Terjadwal</option>
                    <option value="ARRIVED_GATE">Tiba di Pos Security</option>
                    <option value="TIMBANG_MASUK">Timbang Masuk (Gross)</option>
                    <option value="BONGKAR">Bongkar di Stockpile</option>
                    <option value="TIMBANG_KELUAR">Timbang Keluar (Tare)</option>
                    <option value="GATE_OUT">Menunggu Gate Out</option>
                    <option value="COMPLETED">Selesai (Sudah Keluar)</option>
                    <option value="OVERDUE">Lewat Jadwal</option>
                    <option value="CANCELLED">Batal / No-Show</option>
                  </select>
                </th>

                {/* 8. Keterangan */}
                <th className="px-2 py-2">
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      value={colSearchRemarks}
                      onChange={(e) => setColSearchRemarks(e.target.value)}
                      placeholder="Cari Keterangan..."
                      className="w-full pl-2 pr-6 py-1 text-[11px] font-normal normal-case rounded border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 shadow-2xs"
                    />
                    {colSearchRemarks && (
                      <button
                        type="button"
                        onClick={() => setColSearchRemarks('')}
                        className="absolute right-1 text-slate-400 hover:text-slate-600 text-xs px-1 cursor-pointer"
                        title="Hapus filter keterangan"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </th>

                {/* 9. Aksi / Reset */}
                <th className="px-2 py-2 text-center">
                  {isAnyColFilterActive ? (
                    <button
                      type="button"
                      onClick={handleResetColFilters}
                      className="inline-flex items-center justify-center gap-1.5 w-full px-2.5 py-1 text-[11px] font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-300 rounded shadow-2xs transition-colors cursor-pointer"
                      title="Reset semua filter kolom"
                    >
                      <FilterX className="w-3.5 h-3.5" />
                      <span>Reset ({activeColFilterCount})</span>
                    </button>
                  ) : (
                    <div className="flex items-center justify-center gap-1 text-[10px] text-slate-600 font-medium py-1">
                      <Search className="w-3 h-3 text-slate-400" />
                      <span>Filter Kolom</span>
                    </div>
                  )}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-700 font-mono-num">
              {filteredSchedules.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center bg-slate-50/50">
                    <div className="flex flex-col items-center justify-center gap-2 max-w-md mx-auto">
                      <Search className="w-8 h-8 text-slate-400" />
                      <p className="text-sm font-bold text-slate-800 font-sans">Tidak Ada Jadwal Kedatangan Yang Cocok</p>
                      <p className="text-xs text-slate-500 font-sans">
                        Tidak ditemukan jadwal kedatangan yang sesuai dengan kriteria pencarian kolom atau filter.
                      </p>
                      {(isAnyColFilterActive || statusFilter !== 'ALL') && (
                        <button
                          type="button"
                          onClick={() => {
                            setStatusFilter('ALL');
                            handleResetColFilters();
                          }}
                          className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-lg shadow-2xs transition-colors cursor-pointer font-sans"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Reset Semua Filter Kolom
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredSchedules.map((sch) => {
                  const badge = getScheduleStatusBadge(sch);
                  const linkedTx = getLinkedTransaction(sch);

                  // Calculate this schedule's index within its PO
                  const poAllSchedules = schedules.filter((s) => s.poId === sch.poId);
                  const poIndex = poAllSchedules.findIndex((s) => s.id === sch.id);
                  const poTotal = poAllSchedules.length;

                  return (
                    <tr key={sch.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-3">
                        <span className="font-mono-num font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-300 text-xs">
                          {sch.id}
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        <div className="font-mono-num font-bold text-amber-800 flex items-center gap-1.5">
                          <span>{sch.poNumber}</span>
                          <span 
                            className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-300"
                            title={`Data ke-${poIndex >= 0 ? poIndex + 1 : 1} dari total ${poTotal} data di PO ini (maksimal 20)`}
                          >
                            #{poIndex >= 0 ? poIndex + 1 : 1}/{poTotal}
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-3 font-mono-num">
                        <div className="text-slate-800 font-semibold flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>{formatDateOnly(sch.etaDateTime)}</span>
                        </div>
                      </td>

                      <td className="py-3 px-3 font-mono-num text-right">
                        <span className="font-bold text-emerald-800 text-xs block">
                          {Number(sch.estimatedTonnage).toLocaleString('id-ID')} Kg
                        </span>
                        <span className="text-[10px] text-slate-500 block">
                          ({(Number(sch.estimatedTonnage) / 1000).toFixed(2)} Ton)
                        </span>
                      </td>

                      <td className="py-3 px-3 font-mono-num text-center">
                        <span className="text-slate-800 font-medium">{sch.estimatedTruckCount || 1} Armada</span>
                      </td>

                      <td className="py-3 px-3 font-sans">
                        <div className="text-slate-900 font-bold flex items-center gap-1.5 text-xs">
                          <Building2 className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span className="truncate max-w-[200px]">{sch.supplierName}</span>
                        </div>
                      </td>

                      <td className="py-3 px-3 font-sans">
                        <div className="space-y-0.5">
                          <span className={`inline-block px-2 py-0.5 text-[11px] rounded border whitespace-nowrap ${badge.badgeStyle}`}>
                            {badge.label}
                          </span>
                          {linkedTx && (
                            <div className="text-[10px] font-mono text-slate-600 font-semibold flex items-center gap-1">
                              <span>{linkedTx.vehiclePlate}</span>
                              {linkedTx.nettoTons > 0 && (
                                <span className="text-emerald-700">· {linkedTx.nettoTons.toFixed(2)} T</span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-3 text-slate-700 text-[11px] min-w-[160px] max-w-[240px] whitespace-normal break-words leading-relaxed font-sans">
                        {sch.remarks || '-'}
                      </td>

                      <td className="py-3 px-3 text-center font-sans">
                        {isAdmin ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenEditSchedule(sch)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-300 font-semibold text-xs rounded-lg transition-colors shadow-2xs cursor-pointer"
                              title="Revisi Estimasi Berat Muatan atau Rincian Jadwal Ini"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              <span>Revisi</span>
                            </button>
                            {onDeleteSchedule && (
                              <button
                                type="button"
                                onClick={() => setDeletingSchedule(sch)}
                                className="inline-flex items-center gap-1 p-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 font-semibold text-xs rounded-lg transition-colors cursor-pointer"
                                title="Hapus Jadwal (Kembalikan Kuota)"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 font-medium">Read-only</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Add Schedule (Supports Single & Multi/Batch up to 20 data per PO) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
          <div className="bg-white border border-slate-300 rounded-2xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl my-4 sm:my-8 max-h-[90vh] overflow-y-auto text-slate-900">
            {/* Modal Header */}
            <div className="flex justify-between items-center pb-3 border-b border-slate-200 mb-4">
              <div className="flex items-center gap-2.5">
                <Calendar className="w-5 h-5 text-amber-600 shrink-0" />
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                    Input Jadwal Pengiriman
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Maksimal 20 data jadwal pengiriman dalam 1 Purchase Order (PO)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-500 hover:text-slate-900 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* PO Selector Field */}
            <div className="space-y-2 mb-4">
              <label className="block text-xs font-medium text-slate-300">
                Pilih Purchase Order (PO) Aktif *
              </label>
              <select
                required
                value={selectedPoId}
                onChange={(e) => handlePoChange(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-medium"
              >
                {activePos.length === 0 ? (
                  <option value="">(Belum ada PO aktif — Silakan buat PO baru terlebih dahulu)</option>
                ) : (
                  activePos.map((po) => {
                    const count = schedules.filter((s) => s.poId === po.id).length;
                    const isPoFull = count >= MAX_SCHEDULES_PER_PO;
                    return (
                      <option key={po.id} value={po.id}>
                        [{count}/{MAX_SCHEDULES_PER_PO} Data{isPoFull ? ' - PENUH' : ''}] {po.poNumber} — {po.supplierName} (Sisa Kuota: {(po.targetTonnage - po.receivedTonnage).toLocaleString('id-ID')} Kg)
                      </option>
                    );
                  })
                )}
              </select>

              {/* Quota Progress Banner for Selected PO */}
              <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-amber-400" />
                    Status Kuota Jadwal PO Ini:
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                    isQuotaFull 
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' 
                      : remainingQuota <= 5
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  }`}>
                    {poScheduleCount} / {MAX_SCHEDULES_PER_PO} Terdaftar ({isQuotaFull ? 'KUOTA PENUH' : `Sisa ${remainingQuota} slot`})
                  </span>
                </div>

                {/* Visual Progress Bar (20 steps) */}
                <div className="w-full bg-slate-900 h-2.5 rounded-full overflow-hidden flex border border-slate-800 p-0.5">
                  <div 
                    className={`h-full rounded-full transition-all duration-300 ${
                      isQuotaFull ? 'bg-rose-500' : poScheduleCount > 15 ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${(poScheduleCount / MAX_SCHEDULES_PER_PO) * 100}%` }}
                  />
                </div>

                {isQuotaFull && (
                  <p className="text-[11px] text-rose-400 font-medium flex items-center gap-1 mt-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    Batas maksimal 20 data jadwal kedatangan untuk PO ini sudah tercapai (20/20). Anda tidak dapat menambah jadwal lagi pada PO ini.
                  </p>
                )}
              </div>
            </div>

            {/* Schedule Entry Form */}
            <form onSubmit={handleMultiSubmit} className="space-y-4">
              {createError && (
                <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs font-semibold text-rose-900 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{createError}</span>
                </div>
              )}
                {/* Multi Entry Action Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                  <span className="text-xs font-bold text-slate-800">
                    Daftar Jadwal Pengiriman ({multiRows.length} data):
                  </span>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleAddMultiRow()}
                      disabled={multiRows.length >= remainingQuota || isQuotaFull}
                      className="px-2.5 py-1 bg-white hover:bg-slate-100 disabled:opacity-50 text-slate-800 text-xs font-semibold rounded border border-slate-300 transition-colors flex items-center gap-1 shadow-xs cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5 text-amber-600" />
                      <span>Tambah 1 Baris</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleQuickGenerateRows(5)}
                      disabled={remainingQuota < 5 || isQuotaFull}
                      className="px-2.5 py-1 bg-white hover:bg-slate-100 disabled:opacity-50 text-slate-700 text-xs font-medium rounded border border-slate-300 transition-colors shadow-xs cursor-pointer"
                    >
                      + Isi 5 Jadwal
                    </button>

                    <button
                      type="button"
                      onClick={() => handleQuickGenerateRows(10)}
                      disabled={remainingQuota < 10 || isQuotaFull}
                      className="px-2.5 py-1 bg-white hover:bg-slate-100 disabled:opacity-50 text-slate-700 text-xs font-medium rounded border border-slate-300 transition-colors shadow-xs cursor-pointer"
                    >
                      + Isi 10 Jadwal
                    </button>

                    <button
                      type="button"
                      onClick={() => handleQuickGenerateRows(remainingQuota)}
                      disabled={remainingQuota <= 0 || isQuotaFull}
                      className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-semibold rounded border border-amber-300 transition-colors shadow-xs cursor-pointer"
                    >
                      Isi Sisa Slot ({remainingQuota} Jadwal)
                    </button>
                  </div>
                </div>

                {/* Rows List */}
                <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                  {multiRows.map((row, idx) => {
                    const rowSlotNumber = poScheduleCount + idx + 1;
                    return (
                      <div
                        key={row.id}
                        className="bg-slate-50/80 border border-slate-200 rounded-xl p-3.5 space-y-2.5 relative group shadow-xs"
                      >
                        <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
                          <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5 font-mono-num">
                            <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 flex items-center justify-center text-[10px] font-bold">
                              {idx + 1}
                            </span>
                            Data Jadwal #{idx + 1} (Jadwal ke-{rowSlotNumber} dari 20)
                          </span>

                          <button
                            type="button"
                            onClick={() => handleRemoveMultiRow(row.id)}
                            disabled={multiRows.length <= 1}
                            className="p-1 text-slate-400 hover:text-rose-600 disabled:opacity-30 transition-colors cursor-pointer"
                            title="Hapus baris jadwal ini"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Tanggal Estimasi Tiba (ETA) *
                            </label>
                            <div className="relative flex items-center">
                              <button
                                type="button"
                                onClick={(e) => {
                                  const input = (e.currentTarget.parentElement?.querySelector('input[type="date"]') as HTMLInputElement);
                                  try {
                                    input?.showPicker?.();
                                  } catch (err) {
                                    input?.focus();
                                  }
                                }}
                                className="absolute left-2.5 text-amber-600 hover:text-amber-700 p-0.5 hover:bg-amber-50 rounded transition-transform hover:scale-110 active:scale-95 cursor-pointer z-10"
                                title="Klik untuk membuka kalender otomatis"
                              >
                                <Calendar className="w-3.5 h-3.5" />
                              </button>
                              <input
                                type="date"
                                required
                                value={row.etaDateTime}
                                onClick={(e) => {
                                  try {
                                    (e.currentTarget as HTMLInputElement).showPicker?.();
                                  } catch (err) {}
                                }}
                                onChange={(e) => handleUpdateMultiRow(row.id, 'etaDateTime', e.target.value)}
                                className="w-full bg-white border border-slate-300 rounded pl-8 pr-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-amber-500 font-mono-num cursor-pointer"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Estimasi Berat Muatan (Kg) *
                            </label>
                            <input
                              type="number"
                              min={1}
                              required
                              value={row.estimatedTonnage}
                              onChange={(e) => handleUpdateMultiRow(row.id, 'estimatedTonnage', e.target.value)}
                              placeholder="Contoh: 28201"
                              className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-amber-500 font-mono-num"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                              Estimasi Rit / Truk
                            </label>
                            <input
                              type="number"
                              min={1}
                              value={row.estimatedTruckCount}
                              onChange={(e) => handleUpdateMultiRow(row.id, 'estimatedTruckCount', Number(e.target.value))}
                              className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-amber-500 font-mono-num"
                            />
                          </div>
                        </div>

                        <div>
                          <input
                            type="text"
                            placeholder="Catatan / keterangan pengiriman (opsional)"
                            value={row.remarks}
                            onChange={(e) => handleUpdateMultiRow(row.id, 'remarks', e.target.value.toUpperCase())}
                            className="w-full bg-white border border-slate-300 rounded px-2.5 py-1 text-[11px] text-slate-900 placeholder-slate-400 focus:outline-none focus:border-amber-500 uppercase"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Multi Summary */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-slate-600">Total Jadwal Baru: </span>
                    <strong className="text-slate-900 font-mono-num font-bold">{multiRows.length} Data</strong>
                    <span className="text-slate-500 text-[11px] ml-2">
                      (Total setelah simpan: <strong className="text-amber-800 font-mono-num font-bold">{poScheduleCount + multiRows.length}/20</strong>)
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-600">Total Muatan: </span>
                    <strong className="text-emerald-800 font-mono-num font-bold">
                      {multiRows.reduce((sum, r) => sum + Number(r.estimatedTonnage || 0), 0).toLocaleString('id-ID')} Kg
                    </strong>
                  </div>
                </div>

                <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors border border-slate-300 cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isQuotaFull || multiRows.length === 0 || poScheduleCount + multiRows.length > MAX_SCHEDULES_PER_PO}
                    className={`px-5 py-2 font-bold text-xs rounded-lg transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer ${
                      isQuotaFull || multiRows.length === 0 || poScheduleCount + multiRows.length > MAX_SCHEDULES_PER_PO
                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                        : 'bg-amber-500 hover:bg-amber-600 text-slate-950'
                    }`}
                  >
                    <Plus className="w-4 h-4" />
                    <span>Simpan {multiRows.length} Jadwal Pengiriman</span>
                  </button>
                </div>
              </form>
          </div>
        </div>
      )}

      {/* ===================== MODAL REVISI JADWAL PENGIRIMAN ===================== */}
      {editingSchedule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-4 sm:p-6 shadow-2xl my-4 flex flex-col">
            {/* Header */}
            <div className="flex justify-between items-center pb-3 border-b border-slate-800 mb-4 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  <Pencil className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">
                    Revisi Jadwal Pengiriman
                  </h3>
                  <p className="text-xs text-slate-400">
                    Revisi estimasi berat muatan atau jadwal ID <strong className="text-amber-400 font-mono-num">{editingSchedule.id}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingSchedule(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveEditSchedule} className="space-y-4">
              {editError && (
                <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs font-semibold text-rose-900 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{editError}</span>
                </div>
              )}
              {/* Sync Notice Badge */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs">
                <FileSpreadsheet className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>
                  Perubahan data jadwal otomatis disinkronkan ke <strong>Google Sheets</strong> (tab <em>JADWAL_KEDATANGAN</em>).
                </span>
              </div>

              {/* Readonly Info */}
              <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 text-xs grid grid-cols-2 gap-2">
                <div>
                  <span className="text-slate-400 block text-[10px]">Nomor PO:</span>
                  <span className="font-bold text-amber-400 font-mono-num">{editingSchedule.poNumber}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Supplier:</span>
                  <span className="font-semibold text-white truncate block">{editingSchedule.supplierName}</span>
                </div>
              </div>

              {/* Editable Fields */}
              <div className="space-y-3.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Estimasi Berat Muatan (Kg) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={editScheduleData.estimatedTonnage}
                    onChange={(e) => {
                      let val = e.target.value;
                      if (val.length > 1 && val.startsWith('0') && !val.startsWith('0.')) {
                        val = val.replace(/^0+/, '');
                      }
                      setEditScheduleData({ ...editScheduleData, estimatedTonnage: val });
                    }}
                    placeholder="Contoh: 28201"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-amber-400 font-bold focus:outline-none focus:border-amber-500 font-mono-num text-sm"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    {editScheduleData.estimatedTonnage && Number(editScheduleData.estimatedTonnage) > 0
                      ? `Setara dengan ${(Number(editScheduleData.estimatedTonnage) / 1000).toFixed(2)} Ton`
                      : 'Masukkan berat muatan batubara dalam satuan Kilogram'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Tanggal Estimasi Tiba (ETA) <span className="text-rose-600">*</span>
                    </label>
                    <div className="relative flex items-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          const input = (e.currentTarget.parentElement?.querySelector('input[type="date"]') as HTMLInputElement);
                          try {
                            input?.showPicker?.();
                          } catch (err) {
                            input?.focus();
                          }
                        }}
                        className="absolute left-3 text-amber-600 hover:text-amber-700 p-0.5 hover:bg-amber-50 rounded transition-transform hover:scale-110 active:scale-95 cursor-pointer z-10"
                        title="Klik untuk membuka kalender otomatis"
                      >
                        <Calendar className="w-4 h-4" />
                      </button>
                      <input
                        type="date"
                        required
                        value={editScheduleData.etaDateTime}
                        onClick={(e) => {
                          try {
                            (e.currentTarget as HTMLInputElement).showPicker?.();
                          } catch (err) {}
                        }}
                        onChange={(e) => setEditScheduleData({ ...editScheduleData, etaDateTime: e.target.value })}
                        className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-amber-500 font-mono-num cursor-pointer"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Estimasi Ritase / Armada
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={editScheduleData.estimatedTruckCount}
                      onChange={(e) => setEditScheduleData({ ...editScheduleData, estimatedTruckCount: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono-num"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Status Kedatangan
                  </label>
                  <select
                    value={editScheduleData.status}
                    onChange={(e) => setEditScheduleData({ ...editScheduleData, status: e.target.value as ArrivalSchedule['status'] })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-semibold"
                  >
                    <option value="ON_WAY">Sedang di Jalan (ON_WAY)</option>
                    <option value="SCHEDULED">Terjadwal (SCHEDULED)</option>
                    <option value="ARRIVED_GATE">Tiba di Pos Security (ARRIVED_GATE)</option>
                    <option value="TIMBANG_MASUK">Timbang Masuk / Gross (TIMBANG_MASUK)</option>
                    <option value="BONGKAR">Bongkar di Stockpile (BONGKAR)</option>
                    <option value="TIMBANG_KELUAR">Timbang Keluar / Tare (TIMBANG_KELUAR)</option>
                    <option value="GATE_OUT">Menunggu Gate Out (GATE_OUT)</option>
                    <option value="COMPLETED">Selesai / Keluar Pabrik (COMPLETED)</option>
                    <option value="OVERDUE">Lewat Jadwal / Terlambat (OVERDUE)</option>
                    <option value="CANCELLED">Batal Pengiriman / No-Show (CANCELLED)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Keterangan / Catatan Tambahan
                  </label>
                  <input
                    type="text"
                    value={editScheduleData.remarks}
                    onChange={(e) => setEditScheduleData({ ...editScheduleData, remarks: e.target.value })}
                    placeholder="Contoh: Pengiriman rit ke-1 atau instruksi khusus..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
                {onDeleteSchedule && (
                  <button
                    type="button"
                    onClick={() => setDeletingSchedule(editingSchedule)}
                    className="mr-auto px-3.5 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 border border-rose-500/30 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus Jadwal (Kembalikan Kuota)</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setEditingSchedule(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-500 hover:bg-sky-600 text-slate-950 font-bold text-xs rounded-lg transition-colors shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Simpan Revisi & Sinkronkan</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== MODAL KONFIRMASI HAPUS JADWAL ===================== */}
      {deletingSchedule && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 backdrop-blur-xs p-3">
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white border border-rose-200 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4 text-slate-900"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-200 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Hapus Jadwal Pengiriman?</h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Kuota slot PO akan dikembalikan setelah jadwal dihapus.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-600">ID Jadwal:</span>
                <span className="font-bold font-mono-num text-slate-900">{deletingSchedule.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Nomor PO:</span>
                <span className="font-bold font-mono-num text-amber-700">{deletingSchedule.poNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Supplier:</span>
                <span className="font-semibold text-slate-900">{deletingSchedule.supplierName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Estimasi Berat:</span>
                <span className="font-mono-num text-emerald-700 font-bold">
                  {Number(deletingSchedule.estimatedTonnage).toLocaleString('id-ID')} Kg
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setDeletingSchedule(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onDeleteSchedule) {
                    onDeleteSchedule(deletingSchedule.id);
                  }
                  if (editingSchedule?.id === deletingSchedule.id) {
                    setEditingSchedule(null);
                  }
                  setDeletingSchedule(null);
                }}
                className="px-4 py-2 bg-rose-100 hover:bg-rose-200 text-rose-900 border border-rose-300 font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Ya, Hapus Jadwal</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
