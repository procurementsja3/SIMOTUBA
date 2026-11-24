import React, { useState, useMemo, useEffect } from 'react';
import {
  Flame,
  Plus,
  Download,
  Search,
  Pencil,
  Trash2,
  X,
  Save,
  Calendar,
  Clock,
  Warehouse,
  Scale,
  TrendingDown,
  PackageCheck,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Building2,
  AlertTriangle,
} from 'lucide-react';
import {
  CoalOutgoingRecord,
  CoalTransaction,
  PurchaseOrder,
} from '../types/coal';
import { downloadCsvFile } from '../utils/csvUtils';

interface CoalOutgoingOperationalProps {
  records: CoalOutgoingRecord[];
  transactions: CoalTransaction[];
  purchaseOrders: PurchaseOrder[];
  onAddRecord: (record: Omit<CoalOutgoingRecord, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdateRecord: (record: CoalOutgoingRecord) => void;
  onDeleteRecord: (id: string) => void;
}

const getTodayLocalDateStr = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getNowLocalTimeStr = (): string => {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
};

const formatDisplayDate = (dateStr?: string): string => {
  if (!dateStr) return '-';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
};

const DEFAULT_UNITS = [
  'Boiler 1',
  'Boiler 2',
  'Boiler 3',
  'Line Produksi',
  'Transfer Stockpile',
];

const DEFAULT_EQUIPMENTS = [
  'Wheel Loader',
  'Belt Conveyor',
  'Dump Truck Internal',
  'Excavator',
];

interface OutgoingFormState {
  date: string;
  time: string;
  shift: 'SHIFT 1' | 'SHIFT 2' | 'SHIFT 3';
  destinationUnit: string;
  sourceStockpile: string;
  quantityKg: string;
  equipmentUsed: string;
  operatorName: string;
  supervisorName: string;
  notes: string;
}

export const CoalOutgoingOperational: React.FC<CoalOutgoingOperationalProps> = ({
  records,
  transactions,
  purchaseOrders,
  onAddRecord,
  onUpdateRecord,
  onDeleteRecord,
}) => {
  const todayStr = getTodayLocalDateStr();

  // Scope & top-level filters
  const [dateScope, setDateScope] = useState<'ALL' | 'TODAY'>('ALL');
  const [shiftFilter, setShiftFilter] = useState<'ALL' | 'SHIFT 1' | 'SHIFT 2' | 'SHIFT 3'>('ALL');
  const [unitFilter, setUnitFilter] = useState<string>('');
  const [stockpileFilter, setStockpileFilter] = useState<string>('');

  // Per-column header search filters
  const [colDate, setColDate] = useState('');
  const [colUnit, setColUnit] = useState('');
  const [colStockpile, setColStockpile] = useState('');
  const [colQtyKg, setColQtyKg] = useState('');
  const [colQtyTon, setColQtyTon] = useState('');
  const [colEquipment, setColEquipment] = useState('');
  const [colOperator, setColOperator] = useState('');
  const [colNotes, setColNotes] = useState('');

  // Pagination (10 per page)
  const PAGE_SIZE = 10;
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Modal states
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<CoalOutgoingRecord | null>(null);
  const [deletingRecord, setDeletingRecord] = useState<CoalOutgoingRecord | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formState, setFormState] = useState<OutgoingFormState>({
    date: todayStr,
    time: getNowLocalTimeStr(),
    shift: 'SHIFT 1',
    destinationUnit: 'Boiler 1',
    sourceStockpile: 'Stockpile Utama',
    quantityKg: '',
    equipmentUsed: 'Wheel Loader',
    operatorName: '',
    supervisorName: '',
    notes: '',
  });

  // Dynamic stockpile suggestions from POs, transactions, and existing outgoing records
  const stockpileSuggestions = useMemo(() => {
    const set = new Set<string>(['Stockpile Utama', 'Stockpile A', 'Stockpile B', 'Dome 1']);
    purchaseOrders.forEach((po) => {
      if (po.destinationStockpile?.trim()) set.add(po.destinationStockpile.trim());
    });
    transactions.forEach((tx) => {
      if (tx.unloadingStockpile?.trim()) set.add(tx.unloadingStockpile.trim());
      if (tx.assignedStockpile?.trim()) set.add(tx.assignedStockpile.trim());
    });
    records.forEach((r) => {
      if (r.sourceStockpile?.trim()) set.add(r.sourceStockpile.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'));
  }, [purchaseOrders, transactions, records]);

  // Dynamic unit suggestions
  const unitSuggestions = useMemo(() => {
    const set = new Set<string>(DEFAULT_UNITS);
    records.forEach((r) => {
      if (r.destinationUnit?.trim()) set.add(r.destinationUnit.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'));
  }, [records]);

  // KPI Metrics
  const kpiStats = useMemo(() => {
    const todayRecords = records.filter((r) => r.date === todayStr);
    const todayKg = todayRecords.reduce((acc, r) => acc + (Number(r.quantityKg) || 0), 0);
    const totalOutgoingKg = records.reduce((acc, r) => acc + (Number(r.quantityKg) || 0), 0);

    const totalIncomingKg = transactions
      .filter((t) => t.status === 'COMPLETED')
      .reduce((acc, t) => {
        if (typeof t.nettoWeight === 'number' && t.nettoWeight > 0) return acc + t.nettoWeight;
        if (typeof t.nettoTons === 'number' && t.nettoTons > 0) return acc + Math.round(t.nettoTons * 1000);
        return acc;
      }, 0);

    const estimatedStockBalanceKg = totalIncomingKg - totalOutgoingKg;

    return {
      todayCount: todayRecords.length,
      todayKg,
      todayTons: todayKg / 1000,
      totalCount: records.length,
      totalOutgoingKg,
      totalOutgoingTons: totalOutgoingKg / 1000,
      totalIncomingKg,
      totalIncomingTons: totalIncomingKg / 1000,
      estimatedStockBalanceKg,
      estimatedStockBalanceTons: estimatedStockBalanceKg / 1000,
    };
  }, [records, transactions, todayStr]);

  // Dropdown options for Unit Tujuan & Stockpile Asal based on recorded data
  const registeredUnitOptions = useMemo(() => {
    const map = new Map<string, number>();
    records.forEach((r) => {
      const unit = (r.destinationUnit || '').trim();
      if (unit) map.set(unit, (map.get(unit) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, 'id'));
  }, [records]);

  const registeredStockpileOptions = useMemo(() => {
    const map = new Map<string, number>();
    records.forEach((r) => {
      const sp = (r.sourceStockpile || '').trim();
      if (sp) map.set(sp, (map.get(sp) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, 'id'));
  }, [records]);

  const isAnyFilterActive = Boolean(
    dateScope !== 'ALL' ||
      shiftFilter !== 'ALL' ||
      unitFilter ||
      stockpileFilter ||
      colDate.trim() ||
      colUnit.trim() ||
      colStockpile.trim() ||
      colQtyKg.trim() ||
      colQtyTon.trim() ||
      colEquipment.trim() ||
      colOperator.trim() ||
      colNotes.trim()
  );

  const handleResetAllFilters = () => {
    setDateScope('ALL');
    setShiftFilter('ALL');
    setUnitFilter('');
    setStockpileFilter('');
    setColDate('');
    setColUnit('');
    setColStockpile('');
    setColQtyKg('');
    setColQtyTon('');
    setColEquipment('');
    setColOperator('');
    setColNotes('');
  };

  // Filtered & sorted records (newest first)
  const filteredRecords = useMemo(() => {
    return records
      .filter((r) => {
        if (dateScope === 'TODAY' && r.date !== todayStr) return false;
        if (shiftFilter !== 'ALL' && r.shift !== shiftFilter) return false;
        if (unitFilter && (r.destinationUnit || '').trim() !== unitFilter) return false;
        if (stockpileFilter && (r.sourceStockpile || '').trim() !== stockpileFilter) return false;

        if (colDate.trim()) {
          const q = colDate.toLowerCase().trim();
          const disp = `${formatDisplayDate(r.date)} ${r.date} ${r.time || ''}`.toLowerCase();
          if (!disp.includes(q)) return false;
        }
        if (colUnit.trim()) {
          const q = colUnit.toLowerCase().trim();
          if (!(r.destinationUnit || '').toLowerCase().includes(q)) return false;
        }
        if (colStockpile.trim()) {
          const q = colStockpile.toLowerCase().trim();
          if (!(r.sourceStockpile || '').toLowerCase().includes(q)) return false;
        }
        if (colQtyKg.trim()) {
          const q = colQtyKg.toLowerCase().trim().replace(/\s+/g, '');
          const raw = String(r.quantityKg || 0);
          const fmt = (r.quantityKg || 0).toLocaleString('id-ID').toLowerCase();
          if (!raw.includes(q) && !fmt.includes(q)) return false;
        }
        if (colQtyTon.trim()) {
          const q = colQtyTon.toLowerCase().trim();
          const fmt = `${(r.quantityTons || 0).toFixed(2)} ton`;
          if (!fmt.includes(q)) return false;
        }
        if (colEquipment.trim()) {
          const q = colEquipment.toLowerCase().trim();
          if (!(r.equipmentUsed || '').toLowerCase().includes(q)) return false;
        }
        if (colOperator.trim()) {
          const q = colOperator.toLowerCase().trim();
          const combined = `${r.operatorName || ''} ${r.supervisorName || ''}`.toLowerCase();
          if (!combined.includes(q)) return false;
        }
        if (colNotes.trim()) {
          const q = colNotes.toLowerCase().trim();
          if (!(r.notes || '').toLowerCase().includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const keyA = `${a.date || ''}T${a.time || '00:00'}`;
        const keyB = `${b.date || ''}T${b.time || '00:00'}`;
        if (keyA !== keyB) return keyB.localeCompare(keyA);
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      });
  }, [
    records,
    dateScope,
    todayStr,
    shiftFilter,
    unitFilter,
    stockpileFilter,
    colDate,
    colUnit,
    colStockpile,
    colQtyKg,
    colQtyTon,
    colEquipment,
    colOperator,
    colNotes,
  ]);

  const filteredTotalKg = useMemo(
    () => filteredRecords.reduce((acc, r) => acc + (Number(r.quantityKg) || 0), 0),
    [filteredRecords]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [
    dateScope,
    shiftFilter,
    unitFilter,
    stockpileFilter,
    colDate,
    colUnit,
    colStockpile,
    colQtyKg,
    colQtyTon,
    colEquipment,
    colOperator,
    colNotes,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * PAGE_SIZE;
  const endIndex = Math.min(startIndex + PAGE_SIZE, filteredRecords.length);
  const paginatedRecords = filteredRecords.slice(startIndex, endIndex);

  const openAddModal = () => {
    setEditingRecord(null);
    setFormError(null);
    setFormState({
      date: getTodayLocalDateStr(),
      time: getNowLocalTimeStr(),
      shift: 'SHIFT 1',
      destinationUnit: 'Boiler 1',
      sourceStockpile: stockpileSuggestions[0] || 'Stockpile Utama',
      quantityKg: '',
      equipmentUsed: 'Wheel Loader',
      operatorName: '',
      supervisorName: '',
      notes: '',
    });
    setIsFormModalOpen(true);
  };

  const openEditModal = (rec: CoalOutgoingRecord) => {
    setEditingRecord(rec);
    setFormError(null);
    setFormState({
      date: rec.date || getTodayLocalDateStr(),
      time: rec.time || '08:00',
      shift: rec.shift || 'SHIFT 1',
      destinationUnit: rec.destinationUnit || '',
      sourceStockpile: rec.sourceStockpile || '',
      quantityKg: rec.quantityKg > 0 ? String(rec.quantityKg) : '',
      equipmentUsed: rec.equipmentUsed || '',
      operatorName: rec.operatorName || '',
      supervisorName: rec.supervisorName || '',
      notes: rec.notes || '',
    });
    setIsFormModalOpen(true);
  };

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const qtyKg = Number(formState.quantityKg);
    if (!formState.date) {
      setFormError('Tanggal pengeluaran wajib diisi.');
      return;
    }
    if (!formState.destinationUnit.trim()) {
      setFormError('Unit tujuan pemakaian/pengeluaran wajib diisi.');
      return;
    }
    if (!formState.sourceStockpile.trim()) {
      setFormError('Asal stockpile batubara wajib diisi.');
      return;
    }
    if (!Number.isFinite(qtyKg) || qtyKg <= 0) {
      setFormError('Qty pengeluaran (Kg) harus lebih besar dari 0.');
      return;
    }
    if (!formState.operatorName.trim()) {
      setFormError('Nama operator / petugas pencatat wajib diisi.');
      return;
    }

    const payload = {
      date: formState.date,
      time: formState.time || getNowLocalTimeStr(),
      shift: formState.shift,
      destinationUnit: formState.destinationUnit.trim(),
      sourceStockpile: formState.sourceStockpile.trim(),
      quantityKg: Math.round(qtyKg),
      quantityTons: Number((qtyKg / 1000).toFixed(3)),
      equipmentUsed: formState.equipmentUsed.trim() || undefined,
      operatorName: formState.operatorName.trim(),
      supervisorName: formState.supervisorName.trim() || undefined,
      notes: formState.notes.trim() || undefined,
    };

    if (editingRecord) {
      onUpdateRecord({
        ...editingRecord,
        ...payload,
        updatedAt: new Date().toISOString(),
      });
    } else {
      onAddRecord(payload);
    }

    setIsFormModalOpen(false);
    setEditingRecord(null);
    setFormError(null);
  };

  const handleExportCsv = () => {
    const headers = [
      'Tanggal',
      'Jam',
      'Shift',
      'Unit Tujuan',
      'Asal Stockpile',
      'Qty Pengeluaran (Kg)',
      'Qty Pengeluaran (Ton)',
      'Alat / Armada',
      'Operator / Petugas',
      'Pengawas / Checker',
      'Keterangan',
    ];

    const rows = filteredRecords.map((r) => [
      formatDisplayDate(r.date),
      r.time || '',
      r.shift,
      r.destinationUnit,
      r.sourceStockpile,
      r.quantityKg,
      Number(r.quantityTons || 0).toFixed(2),
      r.equipmentUsed || '',
      r.operatorName,
      r.supervisorName || '',
      r.notes || '',
    ]);

    downloadCsvFile(
      `operasional_pengeluaran_batubara_${getTodayLocalDateStr()}.csv`,
      headers,
      rows
    );
  };

  const parsedPreviewTons =
    Number(formState.quantityKg) > 0
      ? (Number(formState.quantityKg) / 1000).toLocaleString('id-ID', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 3,
        })
      : '0,00';

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-slate-300 rounded-xl p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Flame className="w-5 h-5 text-amber-600 shrink-0" />
            <span className="text-slate-900">Operasional Pengeluaran Batubara</span>
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Pencatatan harian pengeluaran & pemakaian batubara dari stockpile ke boiler, unit produksi, maupun transfer internal
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold rounded-lg transition-colors shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Input Pengeluaran Batubara</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-800 text-xs font-semibold rounded-lg border border-slate-300 transition-colors shadow-xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-emerald-700" />
            <span>Ekspor CSV / Excel</span>
          </button>
        </div>
      </div>

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-300 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-600 text-xs font-semibold mb-1">
            <span>Pengeluaran Hari Ini</span>
            <Flame className="w-4 h-4 text-amber-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 font-mono-num">
              {kpiStats.todayTons.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs font-semibold text-slate-500">Ton</span>
          </div>
          <div className="mt-1.5 text-[11px] text-slate-600 font-mono-num">
            {kpiStats.todayKg.toLocaleString('id-ID')} Kg · <strong className="text-amber-800">{kpiStats.todayCount}</strong> pencatatan hari ini
          </div>
        </div>

        <div className="bg-white border border-slate-300 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-600 text-xs font-semibold mb-1">
            <span>Total Pengeluaran Kumulatif</span>
            <TrendingDown className="w-4 h-4 text-rose-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-rose-800 font-mono-num">
              {kpiStats.totalOutgoingTons.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs font-semibold text-slate-500">Ton</span>
          </div>
          <div className="mt-1.5 text-[11px] text-slate-600 font-mono-num">
            {kpiStats.totalOutgoingKg.toLocaleString('id-ID')} Kg · <strong className="text-slate-900">{kpiStats.totalCount}</strong> total catatan
          </div>
        </div>

        <div className="bg-white border border-slate-300 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-600 text-xs font-semibold mb-1">
            <span>Total Penerimaan Netto (Masuk)</span>
            <Scale className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-800 font-mono-num">
              {kpiStats.totalIncomingTons.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs font-semibold text-slate-500">Ton</span>
          </div>
          <div className="mt-1.5 text-[11px] text-slate-600 font-mono-num">
            {kpiStats.totalIncomingKg.toLocaleString('id-ID')} Kg terealisasi di terminal
          </div>
        </div>

        <div className="bg-white border border-slate-300 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-600 text-xs font-semibold mb-1">
            <span>Estimasi Saldo Stok Batubara</span>
            <PackageCheck className="w-4 h-4 text-sky-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold font-mono-num ${
                kpiStats.estimatedStockBalanceKg < 0 ? 'text-rose-700' : 'text-sky-900'
              }`}
            >
              {kpiStats.estimatedStockBalanceTons.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs font-semibold text-slate-500">Ton</span>
          </div>
          <div className="mt-1.5 text-[11px] text-slate-600 font-mono-num">
            {kpiStats.estimatedStockBalanceKg.toLocaleString('id-ID')} Kg (Masuk − Keluar)
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Scope Hari Ini / Semua */}
          <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-300 shadow-2xs">
            <button
              type="button"
              onClick={() => setDateScope('ALL')}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                dateScope === 'ALL'
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Semua ({records.length})
            </button>
            <button
              type="button"
              onClick={() => setDateScope('TODAY')}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                dateScope === 'TODAY'
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Hari Ini ({kpiStats.todayCount})
            </button>
          </div>

          {/* Shift Filter */}
          <div className="flex flex-wrap items-center gap-1 bg-white p-1 rounded-lg border border-slate-300 shadow-2xs">
            {(['ALL', 'SHIFT 1', 'SHIFT 2', 'SHIFT 3'] as const).map((sh) => (
              <button
                key={sh}
                type="button"
                onClick={() => setShiftFilter(sh)}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                  shiftFilter === sh
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {sh === 'ALL' ? 'Semua Shift' : sh}
              </button>
            ))}
          </div>
        </div>

        {/* Right Dropdown Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex items-center">
            <Building2 className="w-3.5 h-3.5 text-amber-600 absolute left-2.5 pointer-events-none" />
            <select
              aria-label="Filter Unit Tujuan"
              value={unitFilter}
              onChange={(e) => setUnitFilter(e.target.value)}
              className="appearance-none bg-white border border-slate-300 hover:border-amber-500 focus:border-amber-500 focus:outline-none rounded-lg pl-8 pr-8 py-1.5 text-xs font-semibold text-slate-800 shadow-2xs cursor-pointer min-w-[175px]"
            >
              <option value="">Semua Unit Tujuan</option>
              {registeredUnitOptions.map((u) => (
                <option key={u.name} value={u.name}>
                  {u.name} ({u.count} Data)
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 pointer-events-none" />
          </div>

          <div className="relative flex items-center">
            <Warehouse className="w-3.5 h-3.5 text-sky-600 absolute left-2.5 pointer-events-none" />
            <select
              aria-label="Filter Asal Stockpile"
              value={stockpileFilter}
              onChange={(e) => setStockpileFilter(e.target.value)}
              className="appearance-none bg-white border border-slate-300 hover:border-amber-500 focus:border-amber-500 focus:outline-none rounded-lg pl-8 pr-8 py-1.5 text-xs font-semibold text-slate-800 shadow-2xs cursor-pointer min-w-[175px]"
            >
              <option value="">Semua Stockpile</option>
              {registeredStockpileOptions.map((sp) => (
                <option key={sp.name} value={sp.name}>
                  {sp.name} ({sp.count} Data)
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 pointer-events-none" />
          </div>

          <span className="px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-300 text-xs font-mono-num font-bold text-amber-900">
            Total Tampil: {(filteredTotalKg / 1000).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Ton
          </span>
        </div>
      </div>

      {/* Main Data Table */}
      <div className="bg-white border border-slate-300 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 text-slate-700 border-b border-slate-300 font-bold uppercase text-[11px]">
              <tr>
                <th className="py-3 px-3 whitespace-nowrap">Tgl & Jam</th>
                <th className="py-3 px-3 whitespace-nowrap">Shift</th>
                <th className="py-3 px-3 whitespace-nowrap">Unit Tujuan</th>
                <th className="py-3 px-3 whitespace-nowrap">Asal Stockpile</th>
                <th className="py-3 px-3 text-right whitespace-nowrap">Qty (Kg)</th>
                <th className="py-3 px-3 text-right whitespace-nowrap">Qty (Ton)</th>
                <th className="py-3 px-3 whitespace-nowrap">Alat / Armada</th>
                <th className="py-3 px-3 whitespace-nowrap">Operator / Petugas</th>
                <th className="py-3 px-3 whitespace-nowrap">Keterangan</th>
                <th className="py-3 px-3 text-right whitespace-nowrap">Aksi</th>
              </tr>

              {/* Baris Pencarian Per Kolom */}
              <tr className="bg-slate-50 border-t border-slate-200">
                <th className="px-2 py-2 font-normal normal-case">
                  <div className="relative flex items-center">
                    <Search className="w-3 h-3 text-slate-400 absolute left-2 pointer-events-none" />
                    <input
                      type="text"
                      value={colDate}
                      onChange={(e) => setColDate(e.target.value)}
                      placeholder="Cari Tgl/Jam..."
                      className="w-full min-w-[96px] pl-6 pr-5 py-1 text-[11px] rounded border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                    {colDate && (
                      <button
                        type="button"
                        onClick={() => setColDate('')}
                        className="absolute right-1 text-slate-400 hover:text-slate-700 text-xs px-0.5 cursor-pointer"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </th>

                <th className="px-2 py-2 font-normal normal-case">
                  <select
                    aria-label="Filter Shift Kolom"
                    value={shiftFilter}
                    onChange={(e) => setShiftFilter(e.target.value as 'ALL' | 'SHIFT 1' | 'SHIFT 2' | 'SHIFT 3')}
                    className="w-full min-w-[84px] px-2 py-1 text-[11px] rounded border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                  >
                    <option value="ALL">Semua</option>
                    <option value="SHIFT 1">SHIFT 1</option>
                    <option value="SHIFT 2">SHIFT 2</option>
                    <option value="SHIFT 3">SHIFT 3</option>
                  </select>
                </th>

                <th className="px-2 py-2 font-normal normal-case">
                  <div className="relative flex items-center">
                    <Search className="w-3 h-3 text-slate-400 absolute left-2 pointer-events-none" />
                    <input
                      type="text"
                      value={colUnit}
                      onChange={(e) => setColUnit(e.target.value)}
                      placeholder="Cari Unit..."
                      className="w-full min-w-[100px] pl-6 pr-5 py-1 text-[11px] rounded border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                    {colUnit && (
                      <button
                        type="button"
                        onClick={() => setColUnit('')}
                        className="absolute right-1 text-slate-400 hover:text-slate-700 text-xs px-0.5 cursor-pointer"
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
                      value={colStockpile}
                      onChange={(e) => setColStockpile(e.target.value)}
                      placeholder="Cari Stockpile..."
                      className="w-full min-w-[105px] pl-6 pr-5 py-1 text-[11px] rounded border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                    {colStockpile && (
                      <button
                        type="button"
                        onClick={() => setColStockpile('')}
                        className="absolute right-1 text-slate-400 hover:text-slate-700 text-xs px-0.5 cursor-pointer"
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
                      value={colQtyKg}
                      onChange={(e) => setColQtyKg(e.target.value)}
                      placeholder="Kg..."
                      className="w-full min-w-[78px] pl-6 pr-4 py-1 text-[11px] rounded border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                </th>

                <th className="px-2 py-2 font-normal normal-case">
                  <div className="relative flex items-center">
                    <Search className="w-3 h-3 text-slate-400 absolute left-2 pointer-events-none" />
                    <input
                      type="text"
                      value={colQtyTon}
                      onChange={(e) => setColQtyTon(e.target.value)}
                      placeholder="Ton..."
                      className="w-full min-w-[76px] pl-6 pr-4 py-1 text-[11px] rounded border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                </th>

                <th className="px-2 py-2 font-normal normal-case">
                  <div className="relative flex items-center">
                    <Search className="w-3 h-3 text-slate-400 absolute left-2 pointer-events-none" />
                    <input
                      type="text"
                      value={colEquipment}
                      onChange={(e) => setColEquipment(e.target.value)}
                      placeholder="Cari Alat..."
                      className="w-full min-w-[96px] pl-6 pr-5 py-1 text-[11px] rounded border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                </th>

                <th className="px-2 py-2 font-normal normal-case">
                  <div className="relative flex items-center">
                    <Search className="w-3 h-3 text-slate-400 absolute left-2 pointer-events-none" />
                    <input
                      type="text"
                      value={colOperator}
                      onChange={(e) => setColOperator(e.target.value)}
                      placeholder="Cari Operator..."
                      className="w-full min-w-[105px] pl-6 pr-5 py-1 text-[11px] rounded border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                </th>

                <th className="px-2 py-2 font-normal normal-case">
                  <div className="relative flex items-center">
                    <Search className="w-3 h-3 text-slate-400 absolute left-2 pointer-events-none" />
                    <input
                      type="text"
                      value={colNotes}
                      onChange={(e) => setColNotes(e.target.value)}
                      placeholder="Cari Ket..."
                      className="w-full min-w-[105px] pl-6 pr-5 py-1 text-[11px] rounded border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                </th>

                <th className="px-2 py-2 text-right font-normal normal-case">
                  <button
                    type="button"
                    disabled={!isAnyFilterActive}
                    onClick={handleResetAllFilters}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-[11px] font-semibold transition-colors ${
                      isAnyFilterActive
                        ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-300 cursor-pointer'
                        : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                    }`}
                    title="Reset seluruh filter"
                  >
                    <X className="w-3 h-3" />
                    <span>Reset</span>
                  </button>
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 px-4 text-center">
                    <Flame className="w-9 h-9 text-slate-300 mx-auto mb-2" />
                    {records.length === 0 ? (
                      <div className="space-y-2">
                        <p className="text-sm font-bold text-slate-700">
                          Belum ada data Operasional Pengeluaran Batubara.
                        </p>
                        <p className="text-xs text-slate-500 max-w-md mx-auto">
                          Klik tombol <strong>Input Pengeluaran Batubara</strong> di atas untuk mencatat pemakaian batubara harian per shift dan unit tujuan.
                        </p>
                        <button
                          type="button"
                          onClick={openAddModal}
                          className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-lg transition-colors cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Input Pengeluaran Pertama</span>
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-sm font-bold text-slate-700">
                          Tidak ada data pengeluaran yang cocok dengan filter pencarian.
                        </p>
                        <button
                          type="button"
                          onClick={handleResetAllFilters}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-lg transition-colors cursor-pointer"
                        >
                          Reset Semua Filter
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                paginatedRecords.map((rec) => {
                  const shiftBadge =
                    rec.shift === 'SHIFT 1'
                      ? 'bg-amber-50 text-amber-900 border-amber-300'
                      : rec.shift === 'SHIFT 2'
                        ? 'bg-sky-50 text-sky-900 border-sky-300'
                        : 'bg-indigo-50 text-indigo-900 border-indigo-300';

                  return (
                    <tr key={rec.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-3 whitespace-nowrap font-mono-num">
                        <div className="font-bold text-slate-900">{formatDisplayDate(rec.date)}</div>
                        <div className="text-[11px] text-amber-800 font-semibold">
                          {rec.time ? `${rec.time} WIB` : '-'}
                        </div>
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className={`inline-block px-2 py-0.5 rounded border text-[10px] font-bold font-mono-num ${shiftBadge}`}>
                          {rec.shift}
                        </span>
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="font-bold text-slate-900">{rec.destinationUnit}</span>
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 border border-slate-300 text-[11px] font-semibold text-slate-800">
                          <Warehouse className="w-3 h-3 text-sky-600" />
                          {rec.sourceStockpile}
                        </span>
                      </td>

                      <td className="py-3 px-3 text-right whitespace-nowrap font-mono-num font-bold text-slate-900">
                        {rec.quantityKg.toLocaleString('id-ID')} kg
                      </td>

                      <td className="py-3 px-3 text-right whitespace-nowrap font-mono-num font-bold text-amber-900">
                        {Number(rec.quantityTons || 0).toFixed(2)} Ton
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap text-slate-700 font-medium">
                        {rec.equipmentUsed || '-'}
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="font-semibold text-slate-900">{rec.operatorName}</div>
                        {rec.supervisorName && (
                          <div className="text-[10px] text-slate-500">Pengawas: {rec.supervisorName}</div>
                        )}
                      </td>

                      <td className="py-3 px-3 min-w-[150px] max-w-[240px]">
                        <div className="text-[11px] text-slate-700 whitespace-normal break-words leading-snug">
                          {rec.notes || <span className="text-slate-400">-</span>}
                        </div>
                      </td>

                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(rec)}
                            className="p-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 transition-colors cursor-pointer"
                            title="Edit data pengeluaran"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingRecord(rec)}
                            className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors cursor-pointer"
                            title="Hapus data pengeluaran"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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

        {/* Pagination Bar */}
        {filteredRecords.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-slate-50 border-t border-slate-200 text-xs">
            <div className="text-slate-600 font-mono-num">
              Menampilkan <strong className="text-slate-900">{startIndex + 1}</strong>–<strong className="text-slate-900">{endIndex}</strong> dari <strong className="text-slate-900">{filteredRecords.length}</strong> data pengeluaran
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={safeCurrentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                    safeCurrentPage <= 1
                      ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                      : 'bg-white hover:bg-slate-100 text-slate-800 border-slate-300 cursor-pointer'
                  }`}
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Sebelumnya</span>
                </button>

                <span className="px-2.5 py-1 rounded bg-white border border-slate-300 font-mono-num font-bold text-slate-800">
                  {safeCurrentPage} / {totalPages}
                </span>

                <button
                  type="button"
                  disabled={safeCurrentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                    safeCurrentPage >= totalPages
                      ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                      : 'bg-white hover:bg-slate-100 text-slate-800 border-slate-300 cursor-pointer'
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

      {/* Modal Tambah / Edit Pengeluaran Batubara */}
      {isFormModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
          onClick={() => setIsFormModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="outgoing-form-title"
            className="w-full max-w-2xl rounded-2xl bg-white border border-slate-300 shadow-2xl overflow-hidden text-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700 shrink-0">
                  <Flame className="w-4 h-4" />
                </div>
                <div>
                  <h3 id="outgoing-form-title" className="text-sm font-bold text-slate-900">
                    {editingRecord ? 'Edit Pengeluaran Batubara' : 'Input Pengeluaran Batubara Harian'}
                  </h3>
                  <p className="text-xs text-slate-600">
                    Catat jumlah pemakaian / pengeluaran batubara operasional dari stockpile
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsFormModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 transition-colors cursor-pointer"
                title="Tutup"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="p-5 space-y-4 text-xs">
              {formError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-rose-800 font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Tanggal Pengeluaran *
                  </label>
                  <div className="relative">
                    <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                    <input
                      type="date"
                      required
                      value={formState.date}
                      onChange={(e) => setFormState((prev) => ({ ...prev, date: e.target.value }))}
                      className="w-full pl-8 pr-2.5 py-2 rounded-lg border border-slate-300 text-xs font-mono-num"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Jam Pencatatan
                  </label>
                  <div className="relative">
                    <Clock className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                    <input
                      type="time"
                      value={formState.time}
                      onChange={(e) => setFormState((prev) => ({ ...prev, time: e.target.value }))}
                      className="w-full pl-8 pr-2.5 py-2 rounded-lg border border-slate-300 text-xs font-mono-num"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Shift Kerja *
                  </label>
                  <select
                    value={formState.shift}
                    onChange={(e) =>
                      setFormState((prev) => ({
                        ...prev,
                        shift: e.target.value as 'SHIFT 1' | 'SHIFT 2' | 'SHIFT 3',
                      }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold cursor-pointer"
                  >
                    <option value="SHIFT 1">SHIFT 1</option>
                    <option value="SHIFT 2">SHIFT 2</option>
                    <option value="SHIFT 3">SHIFT 3</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Unit Tujuan / Pemakaian *
                  </label>
                  <input
                    type="text"
                    required
                    list="outgoing-unit-options"
                    placeholder="Contoh: Boiler 1, Boiler 2, Line Produksi"
                    value={formState.destinationUnit}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, destinationUnit: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs"
                  />
                  <datalist id="outgoing-unit-options">
                    {unitSuggestions.map((u) => (
                      <option key={u} value={u} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Asal Stockpile Batubara *
                  </label>
                  <input
                    type="text"
                    required
                    list="outgoing-stockpile-options"
                    placeholder="Contoh: Stockpile Utama"
                    value={formState.sourceStockpile}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, sourceStockpile: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs"
                  />
                  <datalist id="outgoing-stockpile-options">
                    {stockpileSuggestions.map((sp) => (
                      <option key={sp} value={sp} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="flex items-center justify-between font-bold text-slate-700 mb-1">
                    <span>Qty Pengeluaran (Kg) *</span>
                    <span className="font-mono-num text-amber-800 font-bold">
                      ≈ {parsedPreviewTons} Ton
                    </span>
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    step="any"
                    placeholder="Contoh: 15000"
                    value={formState.quantityKg}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, quantityKg: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-mono-num font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Alat / Armada Pengangkut
                  </label>
                  <input
                    type="text"
                    list="outgoing-equipment-options"
                    placeholder="Contoh: Wheel Loader / Belt Conveyor"
                    value={formState.equipmentUsed}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, equipmentUsed: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs"
                  />
                  <datalist id="outgoing-equipment-options">
                    {DEFAULT_EQUIPMENTS.map((eq) => (
                      <option key={eq} value={eq} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Operator / Petugas *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Nama operator / petugas input"
                    value={formState.operatorName}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, operatorName: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Pengawas / Checker
                  </label>
                  <input
                    type="text"
                    placeholder="Opsional: nama pengawas shift"
                    value={formState.supervisorName}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, supervisorName: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Keterangan Operasional
                </label>
                <textarea
                  rows={2}
                  placeholder="Catatan tambahan (misal: pemakaian rutin feeding boiler shift pagi, kondisi batubara, dll.)"
                  value={formState.notes}
                  onChange={(e) => setFormState((prev) => ({ ...prev, notes: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsFormModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-600 text-slate-950 transition-colors shadow-xs cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{editingRecord ? 'Simpan Perubahan' : 'Simpan Pengeluaran'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Hapus */}
      {deletingRecord && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
          onClick={() => setDeletingRecord(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-2xl bg-white border border-slate-300 shadow-2xl overflow-hidden text-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-rose-50/80">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-700 shrink-0">
                  <Trash2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Hapus Data Pengeluaran?</h3>
                  <p className="text-xs text-slate-600">Tindakan ini tidak dapat dibatalkan</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeletingRecord(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-2 text-xs">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Tanggal / Shift:</span>
                  <strong className="font-mono-num text-slate-900">
                    {formatDisplayDate(deletingRecord.date)} · {deletingRecord.shift}
                  </strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Unit Tujuan:</span>
                  <strong className="text-slate-900">{deletingRecord.destinationUnit}</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Qty Pengeluaran:</span>
                  <strong className="font-mono-num text-rose-700">
                    {deletingRecord.quantityKg.toLocaleString('id-ID')} Kg ({Number(deletingRecord.quantityTons || 0).toFixed(2)} Ton)
                  </strong>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-200 bg-slate-50">
              <button
                type="button"
                onClick={() => setDeletingRecord(null)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = deletingRecord.id;
                  setDeletingRecord(null);
                  onDeleteRecord(id);
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
