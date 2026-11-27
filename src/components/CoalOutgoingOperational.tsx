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
  BarChart3,
  History,
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
  'Boiler FBC 1',
  'Boiler FBC 2',
];

const INDONESIAN_MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const normalizeBoilerUnitName = (raw?: string): string => {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  if (/^boiler\s*(?:fbc\s*)?1$/i.test(trimmed)) return 'Boiler FBC 1';
  if (/^boiler\s*(?:fbc\s*)?2$/i.test(trimmed)) return 'Boiler FBC 2';
  return trimmed;
};

const classifyBoilerBucket = (raw?: string): 'FBC_1' | 'FBC_2' | 'OTHER' => {
  const normalized = normalizeBoilerUnitName(raw);
  if (normalized === 'Boiler FBC 1') return 'FBC_1';
  if (normalized === 'Boiler FBC 2') return 'FBC_2';
  return 'OTHER';
};

const getIsoWeekInfo = (date: Date) => {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayNum = d.getDay() || 7; // Mon=1 .. Sun=7
  // Monday of this ISO week
  const monday = new Date(d);
  monday.setDate(d.getDate() - (dayNum - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  // Thursday determines ISO week-year
  const thursday = new Date(monday);
  thursday.setDate(monday.getDate() + 3);
  const isoYear = thursday.getFullYear();
  const firstJan = new Date(isoYear, 0, 1);
  const firstJanDay = firstJan.getDay() || 7;
  const firstMonday = new Date(firstJan);
  firstMonday.setDate(firstJan.getDate() - (firstJanDay - 1) + (firstJanDay <= 4 ? 0 : 7));
  const weekNo = Math.floor((monday.getTime() - firstMonday.getTime()) / (7 * 86400000)) + 1;

  const pad = (n: number) => String(n).padStart(2, '0');
  const rangeLabel = `${pad(monday.getDate())}/${pad(monday.getMonth() + 1)} – ${pad(sunday.getDate())}/${pad(sunday.getMonth() + 1)}/${sunday.getFullYear()}`;
  return {
    isoYear,
    weekNo,
    key: `${isoYear}-W${pad(weekNo)}`,
    label: `Minggu ${weekNo} (${isoYear})`,
    rangeLabel,
  };
};

const DEFAULT_EQUIPMENTS = [
  'Wheel Loader',
  'Belt Conveyor',
  'Dump Truck Internal',
  'Excavator',
];

interface OutgoingFormState {
  date: string;
  time: string;
  shift: 'SHIFT 1' | 'SHIFT 2' | 'SHIFT 3' | 'ALL SHIFT';
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
  const [shiftFilter, setShiftFilter] = useState<'ALL' | 'SHIFT 1' | 'SHIFT 2' | 'SHIFT 3' | 'ALL SHIFT'>('ALL');
  const [lastSingleShift, setLastSingleShift] = useState<'SHIFT 1' | 'SHIFT 2' | 'SHIFT 3'>('SHIFT 1');
  const [unitFilter, setUnitFilter] = useState<string>('');

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

  const [recapPeriod, setRecapPeriod] = useState<'MINGGUAN' | 'BULANAN' | 'TAHUNAN'>('MINGGUAN');

  // Modal states
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<CoalOutgoingRecord | null>(null);
  const [deletingRecord, setDeletingRecord] = useState<CoalOutgoingRecord | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formState, setFormState] = useState<OutgoingFormState>({
    date: todayStr,
    time: getNowLocalTimeStr(),
    shift: 'SHIFT 1',
    destinationUnit: 'Boiler FBC 1',
    sourceStockpile: 'Coal Storage',
    quantityKg: '',
    equipmentUsed: 'Wheel Loader',
    operatorName: '',
    supervisorName: '',
    notes: '',
  });

  // Dynamic stockpile suggestions from POs, transactions, and existing outgoing records
  const stockpileSuggestions = useMemo(() => {
    const set = new Set<string>(['Coal Storage', 'Stockpile Utama', 'Stockpile A', 'Stockpile B']);
    const addNormalized = (raw?: string) => {
      const trimmed = raw?.trim();
      if (!trimmed) return;
      if (/^dome\s*1$/i.test(trimmed)) {
        set.add('Coal Storage');
      } else {
        set.add(trimmed);
      }
    };
    purchaseOrders.forEach((po) => {
      addNormalized(po.destinationStockpile);
    });
    transactions.forEach((tx) => {
      addNormalized(tx.unloadingStockpile);
      addNormalized(tx.assignedStockpile);
    });
    records.forEach((r) => {
      addNormalized(r.sourceStockpile);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'));
  }, [purchaseOrders, transactions, records]);

  // Dropdown unit options: Boiler FBC 1 & Boiler FBC 2 di atas, tetap menjaga unit lama jika ada di riwayat
  const unitSuggestions = useMemo(() => {
    const ordered: string[] = [...DEFAULT_UNITS];
    const seen = new Set<string>(DEFAULT_UNITS);
    records.forEach((r) => {
      const unit = normalizeBoilerUnitName(r.destinationUnit);
      if (unit && !seen.has(unit)) {
        seen.add(unit);
        ordered.push(unit);
      }
    });
    const currentUnit = normalizeBoilerUnitName(formState.destinationUnit);
    if (currentUnit && !seen.has(currentUnit)) {
      ordered.push(currentUnit);
    }
    return ordered;
  }, [records, formState.destinationUnit]);

  // Rekap Pengeluaran Periodik (Mingguan / Bulanan / Tahunan) khusus Boiler FBC 1 & Boiler FBC 2
  const periodicBoilerRecap = useMemo(() => {
    const now = new Date();
    const currentWeekKey = getIsoWeekInfo(now).key;
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const currentYearKey = String(now.getFullYear());

    interface RecapBucket {
      key: string;
      label: string;
      shortLabel: string;
      subLabel: string;
      isCurrent: boolean;
      fbc1Kg: number;
      fbc1Count: number;
      fbc2Kg: number;
      fbc2Count: number;
      otherKg: number;
      otherCount: number;
      totalKg: number;
      totalCount: number;
    }

    const map = new Map<string, RecapBucket>();

    records.forEach((r) => {
      if (!r.date) return;
      const parts = r.date.split('-').map(Number);
      if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return;
      const recDate = new Date(parts[0], parts[1] - 1, parts[2]);
      if (Number.isNaN(recDate.getTime())) return;

      let key = '';
      let label = '';
      let shortLabel = '';
      let subLabel = '';
      let isCurrent = false;

      if (recapPeriod === 'MINGGUAN') {
        const wk = getIsoWeekInfo(recDate);
        key = wk.key;
        label = wk.label;
        shortLabel = `M${wk.weekNo} '${String(wk.isoYear).slice(-2)}`;
        subLabel = wk.rangeLabel;
        isCurrent = wk.key === currentWeekKey;
      } else if (recapPeriod === 'BULANAN') {
        const y = recDate.getFullYear();
        const m = recDate.getMonth();
        key = `${y}-${String(m + 1).padStart(2, '0')}`;
        label = `${INDONESIAN_MONTHS[m]} ${y}`;
        shortLabel = `${INDONESIAN_MONTHS[m].slice(0, 3)} ${y}`;
        subLabel = `01/${String(m + 1).padStart(2, '0')} – ${String(new Date(y, m + 1, 0).getDate()).padStart(2, '0')}/${String(m + 1).padStart(2, '0')}/${y}`;
        isCurrent = key === currentMonthKey;
      } else {
        const y = recDate.getFullYear();
        key = String(y);
        label = `Tahun ${y}`;
        shortLabel = String(y);
        subLabel = `Januari – Desember ${y}`;
        isCurrent = key === currentYearKey;
      }

      const existing = map.get(key) || {
        key,
        label,
        shortLabel,
        subLabel,
        isCurrent,
        fbc1Kg: 0,
        fbc1Count: 0,
        fbc2Kg: 0,
        fbc2Count: 0,
        otherKg: 0,
        otherCount: 0,
        totalKg: 0,
        totalCount: 0,
      };

      const kg = Number(r.quantityKg) || 0;
      const bucketType = classifyBoilerBucket(r.destinationUnit);
      if (bucketType === 'FBC_1') {
        existing.fbc1Kg += kg;
        existing.fbc1Count += 1;
      } else if (bucketType === 'FBC_2') {
        existing.fbc2Kg += kg;
        existing.fbc2Count += 1;
      } else {
        existing.otherKg += kg;
        existing.otherCount += 1;
      }
      existing.totalKg += kg;
      existing.totalCount += 1;
      map.set(key, existing);
    });

    const rows = Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
    const chartRows = [...rows].reverse(); // Kronologis kiri ke kanan untuk grafik
    const totalFbc1Kg = rows.reduce((s, r) => s + r.fbc1Kg, 0);
    const totalFbc1Count = rows.reduce((s, r) => s + r.fbc1Count, 0);
    const totalFbc2Kg = rows.reduce((s, r) => s + r.fbc2Kg, 0);
    const totalFbc2Count = rows.reduce((s, r) => s + r.fbc2Count, 0);
    const totalOtherKg = rows.reduce((s, r) => s + r.otherKg, 0);
    const totalOtherCount = rows.reduce((s, r) => s + r.otherCount, 0);
    const grandTotalKg = rows.reduce((s, r) => s + r.totalKg, 0);
    const grandTotalCount = rows.reduce((s, r) => s + r.totalCount, 0);

    const rawMaxBoilerTons = chartRows.reduce(
      (max, r) => Math.max(max, r.fbc1Kg / 1000, r.fbc2Kg / 1000),
      0
    );
    const computeNiceMax = (val: number): number => {
      if (val <= 0) return 100;
      const magnitude = Math.pow(10, Math.floor(Math.log10(val)));
      const normalized = val / magnitude;
      let niceFactor = 10;
      if (normalized <= 1.2) niceFactor = 1.2;
      else if (normalized <= 1.5) niceFactor = 1.5;
      else if (normalized <= 2) niceFactor = 2;
      else if (normalized <= 2.5) niceFactor = 2.5;
      else if (normalized <= 3) niceFactor = 3;
      else if (normalized <= 4) niceFactor = 4;
      else if (normalized <= 5) niceFactor = 5;
      else if (normalized <= 6) niceFactor = 6;
      else if (normalized <= 8) niceFactor = 8;
      return Math.ceil(niceFactor * magnitude);
    };
    const chartMaxTons = computeNiceMax(rawMaxBoilerTons);

    return {
      rows,
      chartRows,
      chartMaxTons,
      totalFbc1Kg,
      totalFbc1Count,
      totalFbc2Kg,
      totalFbc2Count,
      totalOtherKg,
      totalOtherCount,
      grandTotalKg,
      grandTotalCount,
      hasOtherUnits: totalOtherKg > 0,
      avgTotalPerPeriodKg: rows.length > 0 ? grandTotalKg / rows.length : 0,
      fbc1SharePct: grandTotalKg > 0 ? (totalFbc1Kg / grandTotalKg) * 100 : 0,
      fbc2SharePct: grandTotalKg > 0 ? (totalFbc2Kg / grandTotalKg) * 100 : 0,
      fbcCombinedKg: totalFbc1Kg + totalFbc2Kg,
      fbcDiffKg: totalFbc1Kg - totalFbc2Kg,
    };
  }, [records, recapPeriod]);

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

  // Dropdown options for Unit Tujuan: selalu sediakan Boiler FBC 1 & Boiler FBC 2 (plus unit historis lain bila ada)
  const registeredUnitOptions = useMemo(() => {
    const map = new Map<string, number>();
    DEFAULT_UNITS.forEach((unit) => {
      map.set(unit, 0);
    });
    records.forEach((r) => {
      const unit = normalizeBoilerUnitName(r.destinationUnit);
      if (unit) map.set(unit, (map.get(unit) || 0) + 1);
    });
    const defaults = DEFAULT_UNITS.map((name) => ({
      name,
      count: map.get(name) || 0,
    }));
    const extras = Array.from(map.entries())
      .filter(([name]) => !DEFAULT_UNITS.includes(name))
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, 'id'));
    return [...defaults, ...extras];
  }, [records]);

  const isAnyFilterActive = Boolean(
    dateScope !== 'ALL' ||
      shiftFilter !== 'ALL' ||
      unitFilter ||
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
        if (unitFilter && normalizeBoilerUnitName(r.destinationUnit) !== unitFilter) return false;

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
    setLastSingleShift('SHIFT 1');
    setFormState({
      date: getTodayLocalDateStr(),
      time: getNowLocalTimeStr(),
      shift: 'SHIFT 1',
      destinationUnit: 'Boiler FBC 1',
      sourceStockpile: 'Coal Storage',
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
    if (rec.shift === 'SHIFT 1' || rec.shift === 'SHIFT 2' || rec.shift === 'SHIFT 3') {
      setLastSingleShift(rec.shift);
    }
    setFormState({
      date: rec.date || getTodayLocalDateStr(),
      time: rec.time || '08:00',
      shift: rec.shift || 'SHIFT 1',
      destinationUnit: normalizeBoilerUnitName(rec.destinationUnit) || 'Boiler FBC 1',
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
      setFormError('Nama operator wajib diisi.');
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
      'Nama Operator',
      'Shift Leader',
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
            {(['ALL', 'SHIFT 1', 'SHIFT 2', 'SHIFT 3', 'ALL SHIFT'] as const).map((sh) => (
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
                {sh === 'ALL' ? 'Semua Shift' : sh === 'ALL SHIFT' ? 'All Shift (1–3)' : sh}
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

          <span className="px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-300 text-xs font-mono-num font-bold text-amber-900">
            Total Tampil: {(filteredTotalKg / 1000).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Ton
          </span>
        </div>
      </div>

      {/* Main Data Table: Riwayat Pengeluaran (Output) */}
      <div className="bg-white border border-slate-300 rounded-xl overflow-hidden shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-3.5 bg-slate-50 border-b border-slate-300">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700 shrink-0">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wide">
                Riwayat Pengeluaran (Output)
              </h3>
              <p className="text-[11px] text-slate-600">
                Daftar pencatatan pengeluaran batubara harian per shift dan unit pemakaian
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono-num">
            <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 text-slate-700 font-semibold">
              <strong className="text-slate-900">{filteredRecords.length}</strong> Catatan
            </span>
          </div>
        </div>

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
                <th className="py-3 px-3 whitespace-nowrap">Nama Operator</th>
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
                    onChange={(e) =>
                      setShiftFilter(
                        e.target.value as 'ALL' | 'SHIFT 1' | 'SHIFT 2' | 'SHIFT 3' | 'ALL SHIFT'
                      )
                    }
                    className="w-full min-w-[96px] px-2 py-1 text-[11px] rounded border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                  >
                    <option value="ALL">Semua</option>
                    <option value="SHIFT 1">SHIFT 1</option>
                    <option value="SHIFT 2">SHIFT 2</option>
                    <option value="SHIFT 3">SHIFT 3</option>
                    <option value="ALL SHIFT">ALL SHIFT (1–3)</option>
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
                    rec.shift === 'ALL SHIFT'
                      ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                      : rec.shift === 'SHIFT 1'
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
                          {rec.shift === 'ALL SHIFT' ? 'ALL SHIFT (1–3)' : rec.shift}
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
                          <div className="text-[10px] text-slate-500">Shift Leader: {rec.supervisorName}</div>
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

      {/* Rekap Pengeluaran Batubara (Mingguan / Bulanan / Tahunan) — Boiler FBC 1 & Boiler FBC 2 */}
      <div className="bg-white border border-slate-300 rounded-xl overflow-hidden shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-4 sm:px-5 py-4 bg-slate-50 border-b border-slate-300">
          <div className="flex items-start gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700 shrink-0 mt-0.5">
              <BarChart3 className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wide">
                Rekap Pengeluaran Batubara ({recapPeriod === 'MINGGUAN' ? 'Mingguan' : recapPeriod === 'BULANAN' ? 'Bulanan' : 'Tahunan'}) — Boiler FBC 1 &amp; Boiler FBC 2
              </h3>
              <p className="text-[11px] text-slate-600 mt-0.5">
                Akumulasi pemakaian batubara otomatis dari data Riwayat Pengeluaran (Output) untuk evaluasi beban Boiler FBC 1 dan Boiler FBC 2
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="inline-flex items-center bg-white border border-slate-300 rounded-lg p-1 gap-0.5 shadow-2xs text-xs">
              {(['MINGGUAN', 'BULANAN', 'TAHUNAN'] as const).map((period) => (
                <button
                  key={period}
                  type="button"
                  onClick={() => setRecapPeriod(period)}
                  className={`px-3 py-1 rounded-md font-bold transition-colors cursor-pointer ${
                    recapPeriod === period
                      ? 'bg-amber-500 text-slate-950 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {period === 'MINGGUAN' ? 'Mingguan' : period === 'BULANAN' ? 'Bulanan' : 'Tahunan'}
                </button>
              ))}
            </div>

            {periodicBoilerRecap.rows.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const headers = [
                    'Periode',
                    'Rentang Tanggal',
                    'Boiler FBC 1 (Kg)',
                    'Boiler FBC 1 (Ton)',
                    'Boiler FBC 2 (Kg)',
                    'Boiler FBC 2 (Ton)',
                    ...(periodicBoilerRecap.hasOtherUnits ? ['Unit Lainnya (Kg)', 'Unit Lainnya (Ton)'] : []),
                    'Total Pengeluaran (Kg)',
                    'Total Pengeluaran (Ton)',
                    'Jumlah Input',
                  ];
                  const csvRows = periodicBoilerRecap.rows.map((r) => [
                    r.label,
                    r.subLabel,
                    r.fbc1Kg,
                    (r.fbc1Kg / 1000).toFixed(2),
                    r.fbc2Kg,
                    (r.fbc2Kg / 1000).toFixed(2),
                    ...(periodicBoilerRecap.hasOtherUnits ? [r.otherKg, (r.otherKg / 1000).toFixed(2)] : []),
                    r.totalKg,
                    (r.totalKg / 1000).toFixed(2),
                    r.totalCount,
                  ]);
                  downloadCsvFile(
                    `rekap_pengeluaran_${recapPeriod.toLowerCase()}_boiler_fbc_${todayStr}.csv`,
                    headers,
                    csvRows
                  );
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 text-xs font-semibold rounded-lg border border-slate-300 transition-colors shadow-2xs cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-emerald-700" />
                <span>Ekspor Rekap</span>
              </button>
            )}
          </div>
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          {/* 3 Kartu Ringkasan Boiler FBC 1, Boiler FBC 2, dan Gabungan */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-white via-amber-50/50 to-amber-100/50 p-3.5 shadow-2xs">
              <div className="flex items-center justify-between text-amber-900 font-bold uppercase text-[10.5px] tracking-wide">
                <span>Total Boiler FBC 1</span>
                <span className="px-2 py-0.5 rounded bg-amber-100 border border-amber-300 font-mono-num text-[10px]">
                  {periodicBoilerRecap.fbc1SharePct.toFixed(1)}%
                </span>
              </div>
              <div className="mt-1.5 flex items-baseline gap-2 font-mono-num">
                <span className="text-xl font-black text-amber-950">
                  {(periodicBoilerRecap.totalFbc1Kg / 1000).toLocaleString('id-ID', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
                <span className="text-xs font-bold text-amber-800">Ton</span>
              </div>
              <div className="mt-1 text-[11px] text-slate-600 font-mono-num">
                {periodicBoilerRecap.totalFbc1Kg.toLocaleString('id-ID')} Kg ·{' '}
                <strong className="text-slate-900">{periodicBoilerRecap.totalFbc1Count}</strong> catatan
              </div>
            </div>

            <div className="rounded-xl border border-sky-200 bg-gradient-to-br from-white via-sky-50/55 to-blue-100/45 p-3.5 shadow-2xs">
              <div className="flex items-center justify-between text-sky-900 font-bold uppercase text-[10.5px] tracking-wide">
                <span>Total Boiler FBC 2</span>
                <span className="px-2 py-0.5 rounded bg-sky-100 border border-sky-300 font-mono-num text-[10px]">
                  {periodicBoilerRecap.fbc2SharePct.toFixed(1)}%
                </span>
              </div>
              <div className="mt-1.5 flex items-baseline gap-2 font-mono-num">
                <span className="text-xl font-black text-sky-950">
                  {(periodicBoilerRecap.totalFbc2Kg / 1000).toLocaleString('id-ID', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
                <span className="text-xs font-bold text-sky-800">Ton</span>
              </div>
              <div className="mt-1 text-[11px] text-slate-600 font-mono-num">
                {periodicBoilerRecap.totalFbc2Kg.toLocaleString('id-ID')} Kg ·{' '}
                <strong className="text-slate-900">{periodicBoilerRecap.totalFbc2Count}</strong> catatan
              </div>
            </div>

            <div className="rounded-xl border border-slate-300 bg-gradient-to-br from-white via-slate-50 to-slate-100/80 p-3.5 shadow-2xs">
              <div className="flex items-center justify-between text-slate-700 font-bold uppercase text-[10.5px] tracking-wide">
                <span>Total Pengeluaran ({periodicBoilerRecap.rows.length} Periode)</span>
                <Flame className="w-4 h-4 text-amber-600 shrink-0" />
              </div>
              <div className="mt-1.5 flex items-baseline gap-2 font-mono-num">
                <span className="text-xl font-black text-slate-900">
                  {(periodicBoilerRecap.grandTotalKg / 1000).toLocaleString('id-ID', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
                <span className="text-xs font-bold text-slate-600">Ton</span>
              </div>
              <div className="mt-1 text-[11px] text-slate-600 font-mono-num">
                Rerata:{' '}
                <strong className="text-slate-900">
                  {(periodicBoilerRecap.avgTotalPerPeriodKg / 1000).toLocaleString('id-ID', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{' '}
                  Ton
                </strong>{' '}
                / {recapPeriod === 'MINGGUAN' ? 'minggu' : recapPeriod === 'BULANAN' ? 'bulan' : 'tahun'}
              </div>
            </div>
          </div>

          {/* Tabel Rekap Mingguan / Bulanan / Tahunan */}
          {periodicBoilerRecap.rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 py-8 px-4 text-center text-xs text-slate-600">
              Belum ada data pengeluaran batubara untuk direkap. Setelah data dicatat pada{' '}
              <strong className="text-slate-900">Riwayat Pengeluaran (Output)</strong>, rekap mingguan, bulanan, dan tahunan untuk{' '}
              <strong className="text-slate-900">Boiler FBC 1</strong> &amp;{' '}
              <strong className="text-slate-900">Boiler FBC 2</strong> akan tampil otomatis di sini.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-300">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10.5px] border-b border-slate-300">
                  <tr>
                    <th className="py-3 px-3.5 whitespace-nowrap">Periode / Rentang</th>
                    <th className="py-3 px-3 text-right whitespace-nowrap">Boiler FBC 1</th>
                    <th className="py-3 px-3 text-right whitespace-nowrap">Boiler FBC 2</th>
                    {periodicBoilerRecap.hasOtherUnits && (
                      <th className="py-3 px-3 text-right whitespace-nowrap">Unit Lainnya</th>
                    )}
                    <th className="py-3 px-3 text-right whitespace-nowrap">Total Output</th>
                    <th className="py-3 px-3.5 whitespace-nowrap min-w-[180px]">Komposisi FBC 1 vs FBC 2</th>
                    <th className="py-3 px-3 text-center whitespace-nowrap">Input</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {periodicBoilerRecap.rows.map((row) => {
                    const fbc1Pct = row.totalKg > 0 ? (row.fbc1Kg / row.totalKg) * 100 : 0;
                    const fbc2Pct = row.totalKg > 0 ? (row.fbc2Kg / row.totalKg) * 100 : 0;

                    return (
                      <tr
                        key={row.key}
                        className={`transition-colors ${row.isCurrent ? 'bg-amber-50/45' : 'hover:bg-slate-50'}`}
                      >
                        <td className="py-3 px-3.5 whitespace-nowrap">
                          <div className="font-bold text-slate-900 flex items-center gap-1.5">
                            <span>{row.label}</span>
                            {row.isCurrent && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                Berjalan
                              </span>
                            )}
                          </div>
                          <div className="text-[10.5px] text-slate-500 font-mono-num">{row.subLabel}</div>
                        </td>

                        <td className="py-3 px-3 text-right font-mono-num whitespace-nowrap">
                          <div className="font-black text-amber-900">
                            {(row.fbc1Kg / 1000).toLocaleString('id-ID', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}{' '}
                            Ton
                          </div>
                          <div className="text-[10.5px] text-slate-500">
                            {row.fbc1Kg.toLocaleString('id-ID')} Kg
                          </div>
                        </td>

                        <td className="py-3 px-3 text-right font-mono-num whitespace-nowrap">
                          <div className="font-black text-sky-900">
                            {(row.fbc2Kg / 1000).toLocaleString('id-ID', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}{' '}
                            Ton
                          </div>
                          <div className="text-[10.5px] text-slate-500">
                            {row.fbc2Kg.toLocaleString('id-ID')} Kg
                          </div>
                        </td>

                        {periodicBoilerRecap.hasOtherUnits && (
                          <td className="py-3 px-3 text-right font-mono-num whitespace-nowrap">
                            <div className="font-bold text-slate-800">
                              {(row.otherKg / 1000).toLocaleString('id-ID', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}{' '}
                              Ton
                            </div>
                            <div className="text-[10.5px] text-slate-500">
                              {row.otherKg.toLocaleString('id-ID')} Kg
                            </div>
                          </td>
                        )}

                        <td className="py-3 px-3 text-right font-mono-num whitespace-nowrap">
                          <div className="font-black text-slate-900">
                            {(row.totalKg / 1000).toLocaleString('id-ID', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}{' '}
                            Ton
                          </div>
                          <div className="text-[10.5px] text-slate-500">
                            {row.totalKg.toLocaleString('id-ID')} Kg
                          </div>
                        </td>

                        <td className="py-3 px-3.5">
                          <div className="w-full h-2.5 rounded-full bg-slate-200 overflow-hidden flex">
                            <div
                              className="h-full bg-amber-500 transition-all"
                              style={{ width: `${fbc1Pct}%` }}
                              title={`Boiler FBC 1: ${fbc1Pct.toFixed(1)}%`}
                            />
                            <div
                              className="h-full bg-sky-500 transition-all"
                              style={{ width: `${fbc2Pct}%` }}
                              title={`Boiler FBC 2: ${fbc2Pct.toFixed(1)}%`}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[10px] font-mono-num font-bold mt-1">
                            <span className="text-amber-800">FBC 1: {fbc1Pct.toFixed(1)}%</span>
                            <span className="text-sky-800">FBC 2: {fbc2Pct.toFixed(1)}%</span>
                          </div>
                        </td>

                        <td className="py-3 px-3 text-center font-mono-num font-bold text-slate-700 whitespace-nowrap">
                          {row.totalCount}x
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-100 border-t-2 border-slate-300 font-bold text-slate-900 text-[11px]">
                  <tr>
                    <td className="py-3 px-3.5 uppercase tracking-wider">
                      TOTAL REKAP ({recapPeriod})
                    </td>
                    <td className="py-3 px-3 text-right font-mono-num whitespace-nowrap">
                      <div className="font-black text-amber-900">
                        {(periodicBoilerRecap.totalFbc1Kg / 1000).toLocaleString('id-ID', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{' '}
                        Ton
                      </div>
                      <div className="text-[10px] text-slate-600 font-normal">
                        {periodicBoilerRecap.totalFbc1Kg.toLocaleString('id-ID')} Kg
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono-num whitespace-nowrap">
                      <div className="font-black text-sky-900">
                        {(periodicBoilerRecap.totalFbc2Kg / 1000).toLocaleString('id-ID', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{' '}
                        Ton
                      </div>
                      <div className="text-[10px] text-slate-600 font-normal">
                        {periodicBoilerRecap.totalFbc2Kg.toLocaleString('id-ID')} Kg
                      </div>
                    </td>
                    {periodicBoilerRecap.hasOtherUnits && (
                      <td className="py-3 px-3 text-right font-mono-num whitespace-nowrap">
                        {(periodicBoilerRecap.totalOtherKg / 1000).toLocaleString('id-ID', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{' '}
                        Ton
                      </td>
                    )}
                    <td className="py-3 px-3 text-right font-mono-num whitespace-nowrap">
                      <div className="font-black text-slate-950">
                        {(periodicBoilerRecap.grandTotalKg / 1000).toLocaleString('id-ID', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{' '}
                        Ton
                      </div>
                      <div className="text-[10px] text-slate-600 font-normal">
                        {periodicBoilerRecap.grandTotalKg.toLocaleString('id-ID')} Kg
                      </div>
                    </td>
                    <td className="py-3 px-3.5 font-mono-num text-[10.5px]">
                      <span className="text-amber-900">FBC 1: {periodicBoilerRecap.fbc1SharePct.toFixed(1)}%</span>
                      <span className="text-slate-400 mx-1.5">·</span>
                      <span className="text-sky-900">FBC 2: {periodicBoilerRecap.fbc2SharePct.toFixed(1)}%</span>
                    </td>
                    <td className="py-3 px-3 text-center font-mono-num font-bold">
                      {periodicBoilerRecap.grandTotalCount}x
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Grafik Perbandingan Boiler FBC 1 vs Boiler FBC 2 */}
          <div className="rounded-xl border border-slate-300 bg-white p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 tracking-wide flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    Grafik Perbandingan Pemakaian Batubara — Boiler FBC 1 vs Boiler FBC 2 (
                    {recapPeriod === 'MINGGUAN'
                      ? 'Per Minggu'
                      : recapPeriod === 'BULANAN'
                        ? 'Per Bulan'
                        : 'Per Tahun'}
                    )
                  </span>
                </h4>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  Perbandingan tonase pengeluaran (Ton) secara berdampingan antar unit boiler sesuai periode rekap aktif
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs font-semibold">
                <div className="flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded-xs bg-gradient-to-t from-amber-600 to-amber-400 border border-amber-600/30 inline-block" />
                  <span className="text-slate-800">Boiler FBC 1</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded-xs bg-gradient-to-t from-sky-600 to-sky-400 border border-sky-600/30 inline-block" />
                  <span className="text-slate-800">Boiler FBC 2</span>
                </div>
              </div>
            </div>

            {periodicBoilerRecap.chartRows.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/70 px-4 py-6">
                <div className="max-w-md mx-auto space-y-4">
                  {/* Baseline preview 0 Ton */}
                  <div className="flex items-end justify-center gap-10 h-28 border-b border-slate-300 pb-2 px-6">
                    <div className="flex flex-col items-center gap-1.5">
                      <span className="text-[11px] font-mono-num font-bold text-amber-800">0,00 Ton</span>
                      <div className="w-12 h-2 rounded-t bg-amber-300/80 border border-amber-400" />
                      <span className="text-[11px] font-bold text-slate-700">Boiler FBC 1</span>
                    </div>
                    <div className="flex flex-col items-center gap-1.5">
                      <span className="text-[11px] font-mono-num font-bold text-sky-800">0,00 Ton</span>
                      <div className="w-12 h-2 rounded-t bg-sky-300/80 border border-sky-400" />
                      <span className="text-[11px] font-bold text-slate-700">Boiler FBC 2</span>
                    </div>
                  </div>
                  <p className="text-center text-xs text-slate-600">
                    Grafik perbandingan <strong className="text-slate-900">Boiler FBC 1</strong> dan{' '}
                    <strong className="text-slate-900">Boiler FBC 2</strong> akan otomatis tergambar per{' '}
                    {recapPeriod === 'MINGGUAN' ? 'minggu' : recapPeriod === 'BULANAN' ? 'bulan' : 'tahun'} begitu data pengeluaran dicatat.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Area Grafik Batang Berdampingan dengan Sumbu Y */}
                <div className="overflow-x-auto pb-1">
                  <div className="min-w-[460px] pt-16 px-2">
                    <div className="flex items-stretch gap-3">
                      {/* Label Sumbu Y */}
                      <div className="w-14 shrink-0 h-56 flex flex-col justify-between items-end pr-2 text-[10.5px] font-mono-num text-slate-500 select-none pb-0.5">
                        {[1, 0.75, 0.5, 0.25, 0].map((ratio) => {
                          const tickVal = periodicBoilerRecap.chartMaxTons * ratio;
                          return (
                            <span key={ratio} className="leading-none">
                              {tickVal >= 1000
                                ? `${(tickVal / 1000).toFixed(1)}k`
                                : Number.isInteger(tickVal)
                                  ? tickVal.toLocaleString('id-ID')
                                  : tickVal.toLocaleString('id-ID', {
                                      minimumFractionDigits: 1,
                                      maximumFractionDigits: 1,
                                    })}
                            </span>
                          );
                        })}
                      </div>

                      {/* Grid & Grouped Bars */}
                      <div className="flex-1 relative">
                        {/* Garis bantu horizontal */}
                        <div className="absolute inset-x-0 top-0 h-56 flex flex-col justify-between pointer-events-none">
                          {[0, 1, 2, 3, 4].map((idx) => (
                            <div
                              key={idx}
                              className={`w-full ${
                                idx === 4 ? 'border-b border-slate-400' : 'border-b border-dashed border-slate-200'
                              }`}
                            />
                          ))}
                        </div>

                        {/* Kolom Periode */}
                        <div className="relative z-10 flex items-end justify-around gap-3 sm:gap-5 px-2 sm:px-4">
                          {periodicBoilerRecap.chartRows.map((row, idx) => {
                            const fbc1Tons = row.fbc1Kg / 1000;
                            const fbc2Tons = row.fbc2Kg / 1000;
                            const fbc1HeightPct =
                              fbc1Tons > 0
                                ? Math.max(4, Math.min(100, (fbc1Tons / periodicBoilerRecap.chartMaxTons) * 100))
                                : 0;
                            const fbc2HeightPct =
                              fbc2Tons > 0
                                ? Math.max(4, Math.min(100, (fbc2Tons / periodicBoilerRecap.chartMaxTons) * 100))
                                : 0;
                            const boilerSumKg = row.fbc1Kg + row.fbc2Kg;
                            const fbc1RelPct = boilerSumKg > 0 ? (row.fbc1Kg / boilerSumKg) * 100 : 0;
                            const fbc2RelPct = boilerSumKg > 0 ? (row.fbc2Kg / boilerSumKg) * 100 : 0;
                            const diffTons = fbc1Tons - fbc2Tons;
                            const tooltipAlign =
                              periodicBoilerRecap.chartRows.length > 1 && idx === 0
                                ? 'left-0'
                                : periodicBoilerRecap.chartRows.length > 1 &&
                                    idx === periodicBoilerRecap.chartRows.length - 1
                                  ? 'right-0'
                                  : 'left-1/2 -translate-x-1/2';

                            const formatShortTon = (t: number) => {
                              if (t <= 0) return '0';
                              if (t >= 1000) return `${(t / 1000).toFixed(1)}k`;
                              return t.toLocaleString('id-ID', {
                                minimumFractionDigits: t < 10 ? 2 : 1,
                                maximumFractionDigits: t < 10 ? 2 : 1,
                              });
                            };

                            return (
                              <div
                                key={row.key}
                                className="flex-1 max-w-[140px] flex flex-col items-center group relative"
                              >
                                {/* Hover Tooltip Detail */}
                                <div
                                  className={`absolute bottom-full mb-2 ${tooltipAlign} z-30 hidden group-hover:flex flex-col pointer-events-none whitespace-nowrap bg-white border border-slate-300 text-slate-900 text-[11px] px-3 py-2 rounded-lg shadow-lg ring-1 ring-slate-900/5 space-y-1`}
                                >
                                  <div className="font-bold text-slate-900 border-b border-slate-200 pb-1">
                                    {row.label}
                                    <span className="block text-[10px] font-normal text-slate-500 font-mono-num">
                                      {row.subLabel}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between gap-4 font-mono-num">
                                    <span className="text-amber-800 font-semibold">Boiler FBC 1:</span>
                                    <span className="font-bold text-amber-950">
                                      {fbc1Tons.toLocaleString('id-ID', {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                      })}{' '}
                                      Ton ({fbc1RelPct.toFixed(1)}%)
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between gap-4 font-mono-num">
                                    <span className="text-sky-800 font-semibold">Boiler FBC 2:</span>
                                    <span className="font-bold text-sky-950">
                                      {fbc2Tons.toLocaleString('id-ID', {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                      })}{' '}
                                      Ton ({fbc2RelPct.toFixed(1)}%)
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between gap-4 font-mono-num border-t border-slate-100 pt-1 text-[10.5px]">
                                    <span className="text-slate-600">Selisih (FBC 1 − FBC 2):</span>
                                    <span className="font-bold text-slate-900">
                                      {diffTons > 0 ? '+' : ''}
                                      {diffTons.toLocaleString('id-ID', {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                      })}{' '}
                                      Ton
                                    </span>
                                  </div>
                                </div>

                                {/* Sepasang Batang FBC 1 & FBC 2 */}
                                <div className="w-full h-56 flex items-end justify-center gap-1.5 sm:gap-2">
                                  {/* Bar Boiler FBC 1 */}
                                  <div className="flex-1 max-w-[38px] h-full flex items-end justify-center">
                                    <div
                                      className={`relative w-full rounded-t-md transition-all duration-300 ${
                                        fbc1Tons > 0
                                          ? 'bg-gradient-to-t from-amber-600 via-amber-500 to-amber-400 group-hover:brightness-105 shadow-xs'
                                          : 'bg-slate-200/80 h-[2px]'
                                      }`}
                                      style={fbc1Tons > 0 ? { height: `${fbc1HeightPct}%` } : undefined}
                                      title={`Boiler FBC 1 (${row.label}): ${fbc1Tons.toFixed(2)} Ton`}
                                    >
                                      <span className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-mono-num font-bold text-amber-900 leading-none">
                                        {formatShortTon(fbc1Tons)}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Bar Boiler FBC 2 */}
                                  <div className="flex-1 max-w-[38px] h-full flex items-end justify-center">
                                    <div
                                      className={`relative w-full rounded-t-md transition-all duration-300 ${
                                        fbc2Tons > 0
                                          ? 'bg-gradient-to-t from-sky-600 via-sky-500 to-sky-400 group-hover:brightness-105 shadow-xs'
                                          : 'bg-slate-200/80 h-[2px]'
                                      }`}
                                      style={fbc2Tons > 0 ? { height: `${fbc2HeightPct}%` } : undefined}
                                      title={`Boiler FBC 2 (${row.label}): ${fbc2Tons.toFixed(2)} Ton`}
                                    >
                                      <span className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-mono-num font-bold text-sky-900 leading-none">
                                        {formatShortTon(fbc2Tons)}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* Label Periode Sumbu X */}
                                <div className="mt-2 text-center">
                                  <div
                                    className={`text-[11px] font-bold leading-tight truncate max-w-[115px] ${
                                      row.isCurrent ? 'text-amber-800' : 'text-slate-800'
                                    }`}
                                  >
                                    {row.shortLabel}
                                  </div>
                                  <div className="text-[10px] font-mono-num text-slate-500 leading-tight mt-0.5">
                                    {((row.fbc1Kg + row.fbc2Kg) / 1000).toLocaleString('id-ID', {
                                      minimumFractionDigits: 1,
                                      maximumFractionDigits: 1,
                                    })}{' '}
                                    T
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="mt-1 pl-16 text-[10.5px] text-slate-500 font-mono-num">
                      Satuan sumbu Y: Ton Batubara · Arahkan kursor ke batang periode untuk rincian &amp; selisih
                    </div>
                  </div>
                </div>

                {/* Bar Perbandingan Kumulatif Head-to-Head FBC 1 vs FBC 2 */}
                <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3.5 space-y-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-slate-800">
                      Proporsi Kumulatif Boiler FBC 1 vs Boiler FBC 2
                    </span>
                    <span className="font-mono-num text-[11px] text-slate-700">
                      Selisih:{' '}
                      <strong className="text-slate-950">
                        {(Math.abs(periodicBoilerRecap.fbcDiffKg) / 1000).toLocaleString('id-ID', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{' '}
                        Ton
                      </strong>{' '}
                      {periodicBoilerRecap.fbcDiffKg > 0
                        ? '(Boiler FBC 1 lebih tinggi)'
                        : periodicBoilerRecap.fbcDiffKg < 0
                          ? '(Boiler FBC 2 lebih tinggi)'
                          : '(Seimbang)'}
                    </span>
                  </div>

                  {(() => {
                    const combined = periodicBoilerRecap.fbcCombinedKg;
                    const fbc1HeadPct = combined > 0 ? (periodicBoilerRecap.totalFbc1Kg / combined) * 100 : 50;
                    const fbc2HeadPct = combined > 0 ? (periodicBoilerRecap.totalFbc2Kg / combined) * 100 : 50;
                    return (
                      <>
                        <div className="w-full h-3 rounded-full bg-slate-200 overflow-hidden flex">
                          <div
                            className="h-full bg-gradient-to-r from-amber-600 to-amber-400 transition-all duration-300"
                            style={{ width: `${fbc1HeadPct}%` }}
                          />
                          <div
                            className="h-full bg-gradient-to-r from-sky-500 to-sky-600 transition-all duration-300"
                            style={{ width: `${fbc2HeadPct}%` }}
                          />
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono-num">
                          <span className="font-bold text-amber-900">
                            Boiler FBC 1:{' '}
                            {(periodicBoilerRecap.totalFbc1Kg / 1000).toLocaleString('id-ID', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}{' '}
                            Ton ({fbc1HeadPct.toFixed(1)}%)
                          </span>
                          <span className="font-bold text-sky-900">
                            Boiler FBC 2:{' '}
                            {(periodicBoilerRecap.totalFbc2Kg / 1000).toLocaleString('id-ID', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}{' '}
                            Ton ({fbc2HeadPct.toFixed(1)}%)
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal Tambah / Edit Pengeluaran Batubara (Full Space Layout) */}
      {isFormModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs p-2 sm:p-4"
          onClick={() => setIsFormModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="outgoing-form-title"
            className="w-full max-w-[96vw] h-[calc(100vh-1rem)] sm:h-[calc(100vh-2rem)] rounded-2xl bg-white border border-slate-300 shadow-2xl overflow-hidden text-slate-900 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Sticky */}
            <div className="flex items-center justify-between px-5 sm:px-7 py-4 border-b border-slate-200 bg-slate-50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700 shrink-0">
                  <Flame className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="outgoing-form-title" className="text-base font-extrabold text-slate-900 tracking-tight">
                    {editingRecord ? 'Edit Pengeluaran Batubara' : 'Input Pengeluaran Batubara Harian'}
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Catat jumlah pemakaian / pengeluaran batubara operasional dari stockpile (per shift maupun total All Shift 1–3)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsFormModalOpen(false)}
                className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/80 transition-colors cursor-pointer"
                title="Tutup"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body Form Full-Space */}
            <form onSubmit={handleSubmitForm} className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto px-5 sm:px-7 py-5 sm:py-6 space-y-5 text-xs sm:text-sm">
                {formError && (
                  <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 font-semibold flex items-center gap-2 text-xs">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Tanggal Pengeluaran *
                    </label>
                    <div className="relative">
                      <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                      <input
                        type="date"
                        required
                        value={formState.date}
                        onChange={(e) => setFormState((prev) => ({ ...prev, date: e.target.value }))}
                        className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 text-xs sm:text-sm font-mono-num"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Jam Pencatatan
                    </label>
                    <div className="relative">
                      <Clock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                      <input
                        type="time"
                        value={formState.time}
                        onChange={(e) => setFormState((prev) => ({ ...prev, time: e.target.value }))}
                        className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 text-xs sm:text-sm font-mono-num"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                      <label className="text-xs font-bold text-slate-700">
                        Shift Kerja *
                      </label>
                      <label className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-emerald-300 bg-emerald-50 text-[11px] font-bold text-emerald-900 cursor-pointer select-none hover:bg-emerald-100 transition-colors">
                        <input
                          type="checkbox"
                          checked={formState.shift === 'ALL SHIFT'}
                          onChange={(e) => {
                            if (e.target.checked) {
                              if (formState.shift !== 'ALL SHIFT') {
                                setLastSingleShift(formState.shift);
                              }
                              setFormState((prev) => ({ ...prev, shift: 'ALL SHIFT' }));
                            } else {
                              setFormState((prev) => ({ ...prev, shift: lastSingleShift }));
                            }
                          }}
                          className="w-3.5 h-3.5 accent-emerald-600 rounded cursor-pointer"
                        />
                        <span>Mode All Shift (Shift 1–3)</span>
                      </label>
                    </div>

                    <select
                      value={formState.shift}
                      onChange={(e) => {
                        const val = e.target.value as 'SHIFT 1' | 'SHIFT 2' | 'SHIFT 3' | 'ALL SHIFT';
                        if (val !== 'ALL SHIFT') {
                          setLastSingleShift(val);
                        }
                        setFormState((prev) => ({
                          ...prev,
                          shift: val,
                        }));
                      }}
                      className={`w-full px-3 py-2.5 rounded-lg border text-xs sm:text-sm font-semibold cursor-pointer ${
                        formState.shift === 'ALL SHIFT'
                          ? 'border-emerald-400 bg-emerald-50/40 text-emerald-950'
                          : 'border-slate-300'
                      }`}
                    >
                      <option value="SHIFT 1">SHIFT 1</option>
                      <option value="SHIFT 2">SHIFT 2</option>
                      <option value="SHIFT 3">SHIFT 3</option>
                      <option value="ALL SHIFT">ALL SHIFT (Total Pengeluaran Shift 1–3)</option>
                    </select>

                    {formState.shift === 'ALL SHIFT' && (
                      <p className="mt-1.5 text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md px-2.5 py-1">
                        Mode All Shift aktif: Qty dicatat sebagai pengeluaran total akumulasi Shift 1 s/d Shift 3.
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Unit Tujuan / Pemakaian *
                    </label>
                    <select
                      required
                      value={formState.destinationUnit}
                      onChange={(e) =>
                        setFormState((prev) => ({ ...prev, destinationUnit: e.target.value }))
                      }
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-xs sm:text-sm font-semibold cursor-pointer"
                    >
                      {unitSuggestions.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Asal Stockpile Batubara *
                    </label>
                    <input
                      type="text"
                      required
                      list="outgoing-stockpile-options"
                      placeholder="Contoh: Coal Storage"
                      value={formState.sourceStockpile}
                      onChange={(e) =>
                        setFormState((prev) => ({ ...prev, sourceStockpile: e.target.value }))
                      }
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-xs sm:text-sm"
                    />
                    <datalist id="outgoing-stockpile-options">
                      {stockpileSuggestions.map((sp) => (
                        <option key={sp} value={sp} />
                      ))}
                    </datalist>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="flex items-center justify-between text-xs font-bold text-slate-700 mb-1.5">
                      <span>
                        {formState.shift === 'ALL SHIFT'
                          ? 'Qty Pengeluaran Total Shift 1–3 (Kg) *'
                          : 'Qty Pengeluaran (Kg) *'}
                      </span>
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
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-xs sm:text-sm font-mono-num font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
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
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-xs sm:text-sm"
                    />
                    <datalist id="outgoing-equipment-options">
                      {DEFAULT_EQUIPMENTS.map((eq) => (
                        <option key={eq} value={eq} />
                      ))}
                    </datalist>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Nama Operator *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Masukkan nama operator"
                      value={formState.operatorName}
                      onChange={(e) =>
                        setFormState((prev) => ({ ...prev, operatorName: e.target.value }))
                      }
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-xs sm:text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Shift Leader
                    </label>
                    <input
                      type="text"
                      placeholder="Opsional: nama Shift Leader"
                      value={formState.supervisorName}
                      onChange={(e) =>
                        setFormState((prev) => ({ ...prev, supervisorName: e.target.value }))
                      }
                      className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-xs sm:text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Keterangan Operasional
                  </label>
                  <textarea
                    rows={4}
                    placeholder="Catatan tambahan (misal: pemakaian rutin feeding boiler shift pagi, total akumulasi shift 1-3, kondisi batubara, dll.)"
                    value={formState.notes}
                    onChange={(e) => setFormState((prev) => ({ ...prev, notes: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-xs sm:text-sm"
                  />
                </div>
              </div>

              {/* Footer Sticky */}
              <div className="flex items-center justify-end gap-2.5 px-5 sm:px-7 py-4 border-t border-slate-200 bg-slate-50 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsFormModalOpen(false)}
                  className="px-5 py-2.5 rounded-lg text-xs sm:text-sm font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs sm:text-sm font-bold bg-amber-500 hover:bg-amber-600 text-slate-950 transition-colors shadow-xs cursor-pointer"
                >
                  <Save className="w-4 h-4" />
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
