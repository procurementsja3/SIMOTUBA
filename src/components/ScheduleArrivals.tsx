import React, { useState, useEffect, useMemo } from 'react';
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
  ChevronLeft,
  ChevronRight,
  Pencil,
  FileSpreadsheet,
  RotateCcw,
  FilterX,
  Sparkles,
  Truck,
  Loader2,
  Check,
  SlidersHorizontal,
  Copy,
  ArrowDown,
  ArrowUp
} from 'lucide-react';
import { PurchaseOrder, ArrivalSchedule, CoalTransaction } from '../types/coal';

export const MAX_SCHEDULES_PER_PO = 100;

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

  // AI Schedule Advice state
  interface AiScheduleAdvice {
    ringkasanStrategi: string;
    rekomendasiDuaRitHarian: string;
    analisisAntreanDanStockpile: string;
    saranAksiCepat: string[];
    usulPembagianBaris?: Array<{
      tanggalEta: string;
      beratKg: number;
      jumlahArmada: number;
      keterangan: string;
    }>;
  }
  const [aiAdvice, setAiAdvice] = useState<AiScheduleAdvice | null>(null);
  const [isLoadingAiAdvice, setIsLoadingAiAdvice] = useState(false);
  const [aiAdviceError, setAiAdviceError] = useState<string | null>(null);

  // Manual Creation & Bulk Update Panel state
  const [isManualPanelOpen, setIsManualPanelOpen] = useState(true);
  const [manualFeedback, setManualFeedback] = useState<string | null>(null);
  const [manualConfig, setManualConfig] = useState<{
    rowCount: string;
    startDate: string;
    ritsPerDay: number;
    tonnageKg: string;
    truckCount: string;
    remarksPrefix: string;
    startRitNumber: string;
    applyDate: boolean;
    applyTonnage: boolean;
    applyTruckCount: boolean;
    applyRemarks: boolean;
  }>({
    rowCount: '2',
    startDate: new Date().toISOString().slice(0, 10),
    ritsPerDay: 2,
    tonnageKg: '30000',
    truckCount: '1',
    remarksPrefix: 'PENGIRIMAN BATUBARA RIT KE-',
    startRitNumber: '1',
    applyDate: true,
    applyTonnage: true,
    applyTruckCount: true,
    applyRemarks: true,
  });

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
      const existingCount = schedules.filter((s) => s.poId === initialPoId).length;
      setSelectedPoId(initialPoId);
      setMultiRows([createDefaultFirstRow(initialPoId)]);
      setManualConfig((prev) => ({
        ...prev,
        startRitNumber: String(existingCount + 1),
      }));
      setManualFeedback(null);
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

  const poRemainingKg = currentPo
    ? Math.max(0, Number(currentPo.targetTonnage || 0) - Number(currentPo.receivedTonnage || 0))
    : 0;
  const poScheduledKg = poExistingSchedules
    .filter((s) => s.status !== 'CANCELLED')
    .reduce((sum, s) => sum + Number(s.estimatedTonnage || 0), 0);
  const poUnscheduledKg = Math.max(0, poRemainingKg - poScheduledKg);

  // Per-date aggregation (combining existing active schedules + current modal draft rows)
  const sameDayOverview = (() => {
    const map = new Map<
      string,
      {
        date: string;
        existingSchedulesSameDate: number;
        existingTrucksSameDate: number;
        existingTonnageSameDate: number;
        draftRowsSameDate: number;
        draftTrucksSameDate: number;
        draftTonnageSameDate: number;
      }
    >();

    const ensureEntry = (date: string) => {
      if (!map.has(date)) {
        map.set(date, {
          date,
          existingSchedulesSameDate: 0,
          existingTrucksSameDate: 0,
          existingTonnageSameDate: 0,
          draftRowsSameDate: 0,
          draftTrucksSameDate: 0,
          draftTonnageSameDate: 0,
        });
      }
      return map.get(date)!;
    };

    schedules.forEach((sch) => {
      if (sch.status === 'CANCELLED' || !sch.etaDateTime) return;
      const dateKey = sch.etaDateTime.slice(0, 10);
      const entry = ensureEntry(dateKey);
      entry.existingSchedulesSameDate += 1;
      entry.existingTrucksSameDate += Math.max(1, Number(sch.estimatedTruckCount || 1));
      entry.existingTonnageSameDate += Number(sch.estimatedTonnage || 0);
    });

    multiRows.forEach((row) => {
      if (!row.etaDateTime) return;
      const dateKey = row.etaDateTime.slice(0, 10);
      const entry = ensureEntry(dateKey);
      entry.draftRowsSameDate += 1;
      entry.draftTrucksSameDate += Math.max(1, Number(row.estimatedTruckCount || 1));
      entry.draftTonnageSameDate += Number(row.estimatedTonnage || 0);
    });

    return Array.from(map.values())
      .filter((d) => d.draftRowsSameDate > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
  })();

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

  // Daftar nama supplier terdaftar (dari Jadwal, PO, dan Transaksi) diurutkan alfabetis
  const registeredSupplierOptions = useMemo(() => {
    const countMap = new Map<string, number>();

    purchaseOrders.forEach((po) => {
      const name = (po.supplierName || '').trim();
      if (name && !countMap.has(name)) countMap.set(name, 0);
    });
    transactions.forEach((tx) => {
      const name = (tx.supplierName || '').trim();
      if (name && !countMap.has(name)) countMap.set(name, 0);
    });
    schedules.forEach((sch) => {
      const name = (sch.supplierName || '').trim();
      if (name) {
        countMap.set(name, (countMap.get(name) || 0) + 1);
      }
    });

    return Array.from(countMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, 'id-ID'));
  }, [schedules, purchaseOrders, transactions]);

  // Urutan Tanggal ETA: default 'desc' (tanggal ETA paling akhir/terbaru di posisi atas)
  const [etaSortDir, setEtaSortDir] = useState<'desc' | 'asc'>('desc');

  // Tanggal Hari Ini (waktu lokal perangkat, otomatis refresh jika berganti hari)
  const getLocalTodayKey = (): string => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const [todayDateKey, setTodayDateKey] = useState<string>(() => getLocalTodayKey());

  useEffect(() => {
    const timer = window.setInterval(() => {
      const currentKey = getLocalTodayKey();
      setTodayDateKey((prev) => (prev === currentKey ? prev : currentKey));
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const extractEtaDateKey = (raw?: string): string => {
    if (!raw) return '';
    const trimmed = raw.trim();
    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    }
    const idMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (idMatch) {
      return `${idMatch[3]}-${idMatch[2].padStart(2, '0')}-${idMatch[1].padStart(2, '0')}`;
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      const d = String(parsed.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    return '';
  };

  const isScheduleEtaToday = (sch: ArrivalSchedule): boolean => {
    const effStatus = getEffectiveScheduleStatus(sch);
    if (effStatus === 'CANCELLED') return false;
    return extractEtaDateKey(sch.etaDateTime) === todayDateKey;
  };

  const todayFormattedLabel = (() => {
    const [y, m, d] = todayDateKey.split('-');
    return y && m && d ? `${d}/${m}/${y}` : todayDateKey;
  })();

  const todaySchedules = schedules.filter((sch) => isScheduleEtaToday(sch));
  const todayTotalKg = todaySchedules.reduce(
    (sum, s) => sum + (Number(s.estimatedTonnage) || 0),
    0
  );
  const isFilteringTodayEta = colSearchEta.trim() === todayFormattedLabel;

  const parseEtaSortValue = (raw?: string): number => {
    if (!raw) return 0;
    const trimmed = raw.trim();
    // Format YYYY-MM-DD atau ISO
    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const y = Number(isoMatch[1]);
      const m = Number(isoMatch[2]) - 1;
      const d = Number(isoMatch[3]);
      return new Date(y, m, d).getTime();
    }
    // Format DD/MM/YYYY
    const idMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (idMatch) {
      const d = Number(idMatch[1]);
      const m = Number(idMatch[2]) - 1;
      const y = Number(idMatch[3]);
      return new Date(y, m, d).getTime();
    }
    const parsed = new Date(trimmed).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  // Filtered schedules for table view & mobile cards, sorted by Tgl ETA
  const filteredSchedules = schedules
    .filter((sch) => {
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

      // 8. Col Filter: Nama Supplier (Dropdown Supplier Terdaftar)
      if (colSearchSupplier) {
        const selectedSup = colSearchSupplier.trim().toLowerCase();
        if ((sch.supplierName || '').trim().toLowerCase() !== selectedSup) return false;
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
    })
    .sort((a, b) => {
      const etaA = parseEtaSortValue(a.etaDateTime);
      const etaB = parseEtaSortValue(b.etaDateTime);
      if (etaA !== etaB) {
        return etaSortDir === 'desc' ? etaB - etaA : etaA - etaB;
      }
      const createdA = new Date(a.createdAt || 0).getTime() || 0;
      const createdB = new Date(b.createdAt || 0).getTime() || 0;
      if (createdA !== createdB) {
        return etaSortDir === 'desc' ? createdB - createdA : createdA - createdB;
      }
      return etaSortDir === 'desc'
        ? b.id.localeCompare(a.id)
        : a.id.localeCompare(b.id);
    });

  // Pagination Riwayat Jadwal Pengiriman (Maksimal 15 data per halaman)
  const SCHEDULE_PAGE_SIZE = 15;
  const [schedulePage, setSchedulePage] = useState<number>(1);

  useEffect(() => {
    setSchedulePage(1);
  }, [
    statusFilter,
    colSearchId,
    colSearchPo,
    colSearchEta,
    colSearchTonnage,
    colSearchTruck,
    colSearchSupplier,
    colSearchStatus,
    colSearchRemarks,
    etaSortDir,
  ]);

  const totalSchedulePages = Math.max(1, Math.ceil(filteredSchedules.length / SCHEDULE_PAGE_SIZE));
  const safeSchedulePage = Math.min(schedulePage, totalSchedulePages);
  const scheduleStartIdx = (safeSchedulePage - 1) * SCHEDULE_PAGE_SIZE;
  const scheduleEndIdx = Math.min(scheduleStartIdx + SCHEDULE_PAGE_SIZE, filteredSchedules.length);
  const paginatedSchedules = filteredSchedules.slice(scheduleStartIdx, scheduleEndIdx);

  const schedulePageNumbers: (number | 'ellipsis')[] = (() => {
    const pages: (number | 'ellipsis')[] = [];
    if (totalSchedulePages <= 7) {
      for (let i = 1; i <= totalSchedulePages; i++) pages.push(i);
      return pages;
    }
    pages.push(1);
    if (safeSchedulePage > 3) pages.push('ellipsis');
    const start = Math.max(2, safeSchedulePage - 1);
    const end = Math.min(totalSchedulePages - 1, safeSchedulePage + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (safeSchedulePage < totalSchedulePages - 2) pages.push('ellipsis');
    pages.push(totalSchedulePages);
    return pages;
  })();

  // Handle PO Change in modal
  const handlePoChange = (newPoId: string) => {
    setSelectedPoId(newPoId);
    setAiAdvice(null);
    setAiAdviceError(null);
    setManualFeedback(null);
    const count = schedules.filter((s) => s.poId === newPoId).length;
    const remaining = Math.max(0, MAX_SCHEDULES_PER_PO - count);

    setManualConfig((prev) => ({
      ...prev,
      startRitNumber: String(count + 1),
      rowCount:
        remaining > 0 && Number(prev.rowCount) > remaining
          ? String(remaining)
          : prev.rowCount,
    }));

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

  // Timezone-safe YYYY-MM-DD day offset helper
  const addDaysToDateStr = (baseDateStr: string, offsetDays: number): string => {
    const clean = (baseDateStr || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const parts = clean.split('-').map(Number);
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
      return new Date().toISOString().slice(0, 10);
    }
    const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + offsetDays));
    return dt.toISOString().slice(0, 10);
  };

  const computeManualDate = (startDate: string, ritsPerDay: number, index: number): string => {
    const cleanStart = (startDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
    if (!ritsPerDay || ritsPerDay <= 0) return cleanStart;
    return addDaysToDateStr(cleanStart, Math.floor(index / ritsPerDay));
  };

  const formatManualRemark = (prefix: string, ritNum: number): string => {
    const trimmed = prefix.trim().toUpperCase();
    if (!trimmed) return `PENGIRIMAN BATUBARA RIT KE-${ritNum}`;
    return /[-#\s]$/.test(trimmed) ? `${trimmed}${ritNum}` : `${trimmed} ${ritNum}`;
  };

  // Manual Generate / Replace entire draft schedule list with custom settings
  const handleManualGenerateList = () => {
    if (remainingQuota <= 0 || isQuotaFull) {
      setCreateError(`Kuota maksimal ${MAX_SCHEDULES_PER_PO} jadwal untuk PO ini sudah penuh.`);
      return;
    }
    const requestedCount = Math.floor(Number(manualConfig.rowCount) || 0);
    if (requestedCount < 1) {
      setCreateError('Jumlah jadwal manual minimal 1 baris.');
      return;
    }
    const tonnageNum = Number(manualConfig.tonnageKg);
    if (!tonnageNum || tonnageNum <= 0) {
      setCreateError('Estimasi berat muatan manual harus lebih dari 0 Kg.');
      return;
    }

    const finalCount = Math.min(requestedCount, remainingQuota);
    const truckNum = Math.max(1, Math.floor(Number(manualConfig.truckCount) || 1));
    const startRit = Math.max(1, Math.floor(Number(manualConfig.startRitNumber) || poScheduleCount + 1));
    const startDate = manualConfig.startDate || new Date().toISOString().slice(0, 10);

    setCreateError(null);
    const nowTs = Date.now();
    const generated: MultiRowItem[] = Array.from({ length: finalCount }, (_, i) => ({
      id: `row-manual-${nowTs}-${i}`,
      etaDateTime: computeManualDate(startDate, manualConfig.ritsPerDay, i),
      estimatedTonnage: tonnageNum,
      estimatedTruckCount: truckNum,
      remarks: formatManualRemark(manualConfig.remarksPrefix, startRit + i),
    }));

    setMultiRows(generated);
    const cappedNote =
      requestedCount > remainingQuota
        ? ` (disesuaikan dengan sisa slot ${remainingQuota})`
        : '';
    setManualFeedback(
      `Daftar manual dibuat: ${finalCount} jadwal${cappedNote} · total ${(finalCount * tonnageNum).toLocaleString('id-ID')} Kg.`
    );
  };

  // Manual Append N rows to current draft schedule list
  const handleManualAppendRows = () => {
    const availableToAdd = Math.max(0, remainingQuota - multiRows.length);
    if (availableToAdd <= 0 || isQuotaFull) {
      setCreateError(
        `Tidak dapat menambah baris lagi. Sisa slot PO ini (${remainingQuota}) sudah terpakai semua di daftar.`
      );
      return;
    }
    const requestedCount = Math.floor(Number(manualConfig.rowCount) || 0);
    if (requestedCount < 1) {
      setCreateError('Jumlah baris manual minimal 1.');
      return;
    }
    const tonnageNum = Number(manualConfig.tonnageKg);
    if (!tonnageNum || tonnageNum <= 0) {
      setCreateError('Estimasi berat muatan manual harus lebih dari 0 Kg.');
      return;
    }

    const addCount = Math.min(requestedCount, availableToAdd);
    const truckNum = Math.max(1, Math.floor(Number(manualConfig.truckCount) || 1));
    const baseStartRit = Math.max(1, Math.floor(Number(manualConfig.startRitNumber) || poScheduleCount + 1));
    const startDate = manualConfig.startDate || new Date().toISOString().slice(0, 10);
    const existingLen = multiRows.length;

    setCreateError(null);
    const nowTs = Date.now();
    const appended: MultiRowItem[] = Array.from({ length: addCount }, (_, i) => {
      const globalIdx = existingLen + i;
      return {
        id: `row-manual-add-${nowTs}-${i}`,
        etaDateTime: computeManualDate(startDate, manualConfig.ritsPerDay, globalIdx),
        estimatedTonnage: tonnageNum,
        estimatedTruckCount: truckNum,
        remarks: formatManualRemark(manualConfig.remarksPrefix, baseStartRit + globalIdx),
      };
    });

    setMultiRows([...multiRows, ...appended]);
    setManualFeedback(
      `Berhasil menambah ${addCount} baris manual ke daftar (total ${existingLen + addCount} jadwal).`
    );
  };

  // Manual Bulk Update all existing rows in multiRows (only selected fields)
  const handleManualBulkUpdateRows = () => {
    if (multiRows.length === 0) {
      setCreateError('Belum ada baris jadwal di daftar untuk di-update.');
      return;
    }
    if (
      !manualConfig.applyDate &&
      !manualConfig.applyTonnage &&
      !manualConfig.applyTruckCount &&
      !manualConfig.applyRemarks
    ) {
      setCreateError('Centang minimal satu kolom yang ingin di-update secara manual.');
      return;
    }

    const tonnageNum = Number(manualConfig.tonnageKg);
    if (manualConfig.applyTonnage && (!tonnageNum || tonnageNum <= 0)) {
      setCreateError('Estimasi berat muatan manual harus lebih dari 0 Kg.');
      return;
    }

    const truckNum = Math.max(1, Math.floor(Number(manualConfig.truckCount) || 1));
    const startRit = Math.max(1, Math.floor(Number(manualConfig.startRitNumber) || poScheduleCount + 1));
    const startDate = manualConfig.startDate || new Date().toISOString().slice(0, 10);

    setCreateError(null);
    setMultiRows(
      multiRows.map((row, idx) => ({
        ...row,
        etaDateTime: manualConfig.applyDate
          ? computeManualDate(startDate, manualConfig.ritsPerDay, idx)
          : row.etaDateTime,
        estimatedTonnage: manualConfig.applyTonnage ? tonnageNum : row.estimatedTonnage,
        estimatedTruckCount: manualConfig.applyTruckCount ? truckNum : row.estimatedTruckCount,
        remarks: manualConfig.applyRemarks
          ? formatManualRemark(manualConfig.remarksPrefix, startRit + idx)
          : row.remarks,
      }))
    );

    const updatedParts = [
      manualConfig.applyDate ? 'Tanggal ETA' : null,
      manualConfig.applyTonnage ? `Berat ${tonnageNum.toLocaleString('id-ID')} Kg` : null,
      manualConfig.applyTruckCount ? `${truckNum} Armada` : null,
      manualConfig.applyRemarks ? 'Keterangan RIT' : null,
    ].filter(Boolean);

    setManualFeedback(
      `Update manual diterapkan ke ${multiRows.length} baris (${updatedParts.join(', ')}).`
    );
  };

  // Duplicate a single row right below it
  const handleDuplicateMultiRow = (rowId: string) => {
    if (multiRows.length >= remainingQuota) {
      setCreateError(
        `Maksimal ${MAX_SCHEDULES_PER_PO} data per PO. Sisa slot yang tersedia untuk PO ini adalah ${remainingQuota} data.`
      );
      return;
    }
    const idx = multiRows.findIndex((r) => r.id === rowId);
    if (idx === -1) return;
    setCreateError(null);
    const source = multiRows[idx];
    const cloned: MultiRowItem = {
      ...source,
      id: `row-dup-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      remarks: `PENGIRIMAN BATUBARA RIT KE-${poScheduleCount + multiRows.length + 1}`,
    };
    const next = [...multiRows];
    next.splice(idx + 1, 0, cloned);
    setMultiRows(next);
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
      setCreateError(`Kuota ${MAX_SCHEDULES_PER_PO} data untuk PO ini sudah penuh.`);
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

  // Preset: 2 Rit Terpisah dalam 1 Hari (Sesi Pagi & Sesi Siang — Check-in Security terpisah per rit)
  const handleApplyTwoRitSplit = () => {
    if (remainingQuota < 2) {
      setCreateError(
        `Sisa slot jadwal PO ini tinggal ${remainingQuota}. Minimal dibutuhkan 2 slot untuk membuat 2 rit terpisah.`
      );
      return;
    }
    setCreateError(null);
    const targetDate =
      (multiRows[0]?.etaDateTime || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
    const targetDailyKg =
      poUnscheduledKg > 0 && poUnscheduledKg < 60000 ? poUnscheduledKg : 60000;
    const rit1Kg = Math.round(targetDailyKg / 2);
    const rit2Kg = Math.max(1, targetDailyKg - rit1Kg);
    const baseIdx = poScheduleCount;

    setMultiRows([
      {
        id: `row-2rit-1-${Date.now()}`,
        etaDateTime: targetDate,
        estimatedTonnage: rit1Kg,
        estimatedTruckCount: 1,
        remarks: `PENGIRIMAN BATUBARA RIT KE-${baseIdx + 1} (ARMADA 1 - SESI PAGI 08:00)`,
      },
      {
        id: `row-2rit-2-${Date.now()}`,
        etaDateTime: targetDate,
        estimatedTonnage: rit2Kg,
        estimatedTruckCount: 1,
        remarks: `PENGIRIMAN BATUBARA RIT KE-${baseIdx + 2} (ARMADA 2 - SESI SIANG 13:00)`,
      },
    ]);
  };

  // Request AI Dispatch Advisor from backend Gemini endpoint
  const handleRequestAiAdvice = async () => {
    if (!currentPo) {
      setAiAdviceError('Pilih Purchase Order aktif terlebih dahulu.');
      return;
    }
    setIsLoadingAiAdvice(true);
    setAiAdviceError(null);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 15000);

    try {
      const res = await fetch('/api/gemini/schedule-advice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          po: {
            poNumber: currentPo.poNumber,
            supplierName: currentPo.supplierName,
            targetTonnage: currentPo.targetTonnage,
            receivedTonnage: currentPo.receivedTonnage,
            remainingTonnage: poRemainingKg,
            destinationStockpile: currentPo.destinationStockpile,
            tolerancePercentage: currentPo.tolerancePercentage,
            calorieMin: currentPo.specs?.calorieMin,
            existingScheduleCount: poScheduleCount,
            remainingSlotCount: remainingQuota,
          },
          draftRows: multiRows.map((r) => ({
            etaDateTime: r.etaDateTime,
            estimatedTonnage: Number(r.estimatedTonnage || 0),
            estimatedTruckCount: Math.max(1, Number(r.estimatedTruckCount || 1)),
            remarks: r.remarks,
          })),
          sameDaySummary: sameDayOverview,
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error(
          'Endpoint Saran AI (/api/gemini/schedule-advice) tidak tersedia pada hosting statis. Fitur Saran AI aktif otomatis saat dijalankan melalui server full-stack (AI Studio / Node.js).'
        );
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `Permintaan Saran AI gagal (HTTP ${res.status}).`);
      }

      setAiAdvice(data.advice);
    } catch (err: unknown) {
      const isTimeout = err instanceof DOMException && err.name === 'AbortError';
      const msg = isTimeout
        ? 'Waktu analisis AI habis (>15 detik). Silakan klik "Minta Saran AI" untuk mencoba lagi.'
        : err instanceof Error
          ? err.message
          : 'Gagal mengambil Saran AI. Periksa koneksi atau konfigurasi server.';
      setAiAdviceError(msg);
    } finally {
      window.clearTimeout(timeoutId);
      setIsLoadingAiAdvice(false);
    }
  };

  const handleApplyAiSuggestedRows = () => {
    const suggested = aiAdvice?.usulPembagianBaris || [];
    if (suggested.length === 0) return;
    if (remainingQuota <= 0) {
      setCreateError(`Kuota ${MAX_SCHEDULES_PER_PO} jadwal untuk PO ini sudah penuh.`);
      return;
    }
    setCreateError(null);
    const usable = suggested.slice(0, remainingQuota);
    setMultiRows(
      usable.map((item, idx) => ({
        id: `row-ai-${Date.now()}-${idx}`,
        etaDateTime:
          item.tanggalEta && /^\d{4}-\d{2}-\d{2}/.test(item.tanggalEta)
            ? item.tanggalEta.slice(0, 10)
            : new Date().toISOString().slice(0, 10),
        estimatedTonnage: Math.max(1, Math.round(Number(item.beratKg) || 30000)),
        estimatedTruckCount: Math.max(1, Math.round(Number(item.jumlahArmada) || 1)),
        remarks: (item.keterangan || `PENGIRIMAN BATUBARA RIT KE-${poScheduleCount + idx + 1}`).toUpperCase(),
      }))
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
      id: `SCH-${Date.now()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
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

    const timestamp = `${Date.now()}`;
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
              Maks. {MAX_SCHEDULES_PER_PO} Data / PO
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-1">
            Monitoring perkiraan waktu tiba (ETA) pengiriman batubara per PO dari tambang/pelabuhan. Setiap PO dapat menampung maksimal {MAX_SCHEDULES_PER_PO} data pengiriman.
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
                const targetCount = schedules.filter((s) => s.poId === targetPoId).length;
                setCreateError(null);
                setAiAdvice(null);
                setAiAdviceError(null);
                setManualFeedback(null);
                setManualConfig((prev) => ({
                  ...prev,
                  startRitNumber: String(targetCount + 1),
                }));
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

        {/* Marking Otomatis Jadwal Kedatangan Hari Ini */}
        {todaySchedules.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-amber-100/95 via-amber-50 to-amber-100/80 border border-amber-300 text-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-400/80 flex items-center justify-center shrink-0">
                <Calendar className="w-4 h-4 text-amber-800" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="font-extrabold text-amber-950 uppercase tracking-wide text-[11px]">
                    Marking Otomatis Kedatangan Hari Ini ({todayFormattedLabel})
                  </span>
                  <span className="font-mono-num font-black text-amber-900">
                    {todaySchedules.length} Jadwal / Rit
                  </span>
                  <span aria-hidden="true" className="text-amber-500">·</span>
                  <span className="font-mono-num font-bold text-emerald-800">
                    {todayTotalKg.toLocaleString('id-ID')} Kg ({(todayTotalKg / 1000).toFixed(2)} Ton)
                  </span>
                </div>
                <p className="text-[11px] text-amber-900/85">
                  Seluruh baris dengan Tgl ETA <strong>{todayFormattedLabel}</strong> (Rit 1, Rit 2, dst.) otomatis ditandai dengan blocking warna kuning-amber pada tabel.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                setColSearchEta(isFilteringTodayEta ? '' : todayFormattedLabel)
              }
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                isFilteringTodayEta
                  ? 'bg-slate-700 text-white border-slate-700 hover:bg-slate-800'
                  : 'bg-amber-500 hover:bg-amber-600 text-slate-950 border-amber-600/30 shadow-2xs'
              }`}
            >
              {isFilteringTodayEta
                ? 'Tampilkan Semua Tanggal'
                : `Fokus Hari Ini (${todaySchedules.length})`}
            </button>
          </div>
        )}

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
          paginatedSchedules.map((sch) => {
            const poAllSchedules = schedules.filter((s) => s.poId === sch.poId);
            const poIndex = poAllSchedules.findIndex((s) => s.id === sch.id);
            const poTotal = poAllSchedules.length;
            const badge = getScheduleStatusBadge(sch);
            const linkedTx = getLinkedTransaction(sch);
            const isTodayEta = isScheduleEtaToday(sch);

            return (
              <div
                key={sch.id}
                className={`rounded-xl p-4 space-y-3 shadow-xs border ${
                  isTodayEta
                    ? 'bg-gradient-to-br from-amber-50 via-amber-100/75 to-amber-50 border-amber-400 ring-1 ring-amber-300/70'
                    : 'bg-white border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono-num font-bold text-amber-800 text-sm">{sch.poNumber}</span>
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-300">
                        #{poIndex >= 0 ? poIndex + 1 : 1}/{poTotal}
                      </span>
                      {isTodayEta && (
                        <span className="px-1.5 py-0.5 rounded text-[9.5px] font-black uppercase tracking-wider bg-amber-500 text-slate-950">
                          Kedatangan Hari Ini
                        </span>
                      )}
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
                    <span className={`flex items-center gap-1 font-sans ${isTodayEta ? 'text-amber-950 font-black' : 'text-slate-400'}`}>
                      <Calendar className="w-3.5 h-3.5 text-amber-600" />
                      ETA: {formatDateOnly(sch.etaDateTime)}
                      {isTodayEta ? ' (Hari Ini)' : ''}
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
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-700 border-b border-slate-300 font-bold uppercase text-[10px] tracking-wide">
              <tr>
                <th className="py-2.5 px-2 whitespace-nowrap w-[108px]">ID Jadwal</th>
                <th className="py-2.5 px-2 whitespace-nowrap w-[112px]">No. PO & Kuota</th>
                <th className="py-2.5 px-2 whitespace-nowrap w-[108px]">
                  <button
                    type="button"
                    onClick={() => setEtaSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
                    className="inline-flex items-center gap-1 font-bold uppercase tracking-wide text-slate-700 hover:text-amber-700 transition-colors cursor-pointer"
                    title={
                      etaSortDir === 'desc'
                        ? 'Urut Tanggal ETA terbaru/terakhir di atas (klik untuk balik ke terlama di atas)'
                        : 'Urut Tanggal ETA terlama di atas (klik untuk balik ke terbaru/terakhir di atas)'
                    }
                  >
                    <span>Tgl ETA</span>
                    {etaSortDir === 'desc' ? (
                      <ArrowDown className="w-3 h-3 text-amber-700 shrink-0" />
                    ) : (
                      <ArrowUp className="w-3 h-3 text-amber-700 shrink-0" />
                    )}
                  </button>
                </th>
                <th className="py-2.5 px-2 whitespace-nowrap text-right w-[96px]">Est. Berat</th>
                <th className="py-2.5 px-2 whitespace-nowrap text-center w-[72px]">Ritase</th>
                <th className="py-2.5 px-2 whitespace-nowrap w-[155px]">Nama Supplier</th>
                <th className="py-2.5 px-2 whitespace-nowrap w-[142px]">Status</th>
                <th className="py-2.5 px-2.5 min-w-[185px]">Keterangan</th>
                <th className="py-2.5 px-2 text-center whitespace-nowrap w-[106px]">Aksi</th>
              </tr>
              {/* BARIS KOLOM PENCARIAN DI BAWAH MASING-MASING HEADER */}
              <tr className="bg-slate-50 border-t border-slate-200 font-normal lowercase tracking-normal">
                {/* 1. ID Jadwal */}
                <th className="px-1.5 py-2">
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
                <th className="px-1.5 py-2">
                  <div className="relative flex items-center">
                    <Search className="w-3 h-3 text-slate-400 absolute left-1.5 pointer-events-none" />
                    <input
                      type="text"
                      value={colSearchPo}
                      onChange={(e) => setColSearchPo(e.target.value)}
                      placeholder="No PO..."
                      className="w-full pl-6 pr-5 py-1 text-[11px] font-normal normal-case rounded border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 shadow-2xs"
                    />
                    {colSearchPo && (
                      <button
                        type="button"
                        onClick={() => setColSearchPo('')}
                        className="absolute right-1 text-slate-400 hover:text-slate-600 text-xs px-0.5 cursor-pointer"
                        title="Hapus pencarian PO"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </th>

                {/* 3. Tanggal Estimasi Tiba (ETA) */}
                <th className="px-1.5 py-2">
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      value={colSearchEta}
                      onChange={(e) => setColSearchEta(e.target.value)}
                      placeholder="Tgl ETA..."
                      className="w-full px-1.5 pr-5 py-1 text-[11px] font-normal normal-case rounded border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 shadow-2xs"
                    />
                    {colSearchEta && (
                      <button
                        type="button"
                        onClick={() => setColSearchEta('')}
                        className="absolute right-1 text-slate-400 hover:text-slate-600 text-xs px-0.5 cursor-pointer"
                        title="Hapus filter ETA"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </th>

                {/* 4. Estimasi Berat Muatan (Kg) */}
                <th className="px-1.5 py-2">
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      value={colSearchTonnage}
                      onChange={(e) => setColSearchTonnage(e.target.value)}
                      placeholder="Berat..."
                      className="w-full px-1.5 pr-5 py-1 text-[11px] text-right font-normal normal-case rounded border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 shadow-2xs"
                    />
                    {colSearchTonnage && (
                      <button
                        type="button"
                        onClick={() => setColSearchTonnage('')}
                        className="absolute right-1 text-slate-400 hover:text-slate-600 text-xs px-0.5 cursor-pointer"
                        title="Hapus filter berat"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </th>

                {/* 5. Estimasi Ritase */}
                <th className="px-1.5 py-2">
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      value={colSearchTruck}
                      onChange={(e) => setColSearchTruck(e.target.value)}
                      placeholder="Rit..."
                      className="w-full px-1.5 pr-4 py-1 text-[11px] text-center font-normal normal-case rounded border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 shadow-2xs"
                    />
                    {colSearchTruck && (
                      <button
                        type="button"
                        onClick={() => setColSearchTruck('')}
                        className="absolute right-0.5 text-slate-400 hover:text-slate-600 text-xs px-0.5 cursor-pointer"
                        title="Hapus filter ritase"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </th>

                {/* 6. Nama Supplier (Dropdown Supplier Terdaftar) */}
                <th className="px-1.5 py-2">
                  <select
                    value={colSearchSupplier}
                    onChange={(e) => setColSearchSupplier(e.target.value)}
                    title="Filter berdasarkan Nama Supplier terdaftar"
                    className={`w-full px-1.5 py-1 text-[11px] normal-case rounded border focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 shadow-2xs cursor-pointer ${
                      colSearchSupplier
                        ? 'border-amber-500 bg-amber-50/50 text-slate-900 font-semibold'
                        : 'border-slate-300 bg-white text-slate-800 font-normal'
                    }`}
                  >
                    <option value="">Semua Supplier ({registeredSupplierOptions.length})</option>
                    {registeredSupplierOptions.map((sup) => (
                      <option key={sup.name} value={sup.name}>
                        {sup.name} ({sup.count})
                      </option>
                    ))}
                  </select>
                </th>

                {/* 7. Status Kedatangan */}
                <th className="px-1.5 py-2">
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
                <th className="px-1.5 py-2">
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      value={colSearchRemarks}
                      onChange={(e) => setColSearchRemarks(e.target.value)}
                      placeholder="Cari Keterangan..."
                      className="w-full px-2 pr-6 py-1 text-[11px] font-normal normal-case rounded border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 shadow-2xs"
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
                <th className="px-1.5 py-2 text-center">
                  {isAnyColFilterActive ? (
                    <button
                      type="button"
                      onClick={handleResetColFilters}
                      className="inline-flex items-center justify-center gap-1 w-full px-2 py-1 text-[11px] font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-300 rounded shadow-2xs transition-colors cursor-pointer"
                      title="Reset semua filter kolom"
                    >
                      <FilterX className="w-3 h-3" />
                      <span>Reset ({activeColFilterCount})</span>
                    </button>
                  ) : (
                    <div className="flex items-center justify-center gap-1 text-[10px] text-slate-600 font-medium py-1">
                      <Search className="w-3 h-3 text-slate-400" />
                      <span>Filter</span>
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
                paginatedSchedules.map((sch) => {
                  const badge = getScheduleStatusBadge(sch);
                  const linkedTx = getLinkedTransaction(sch);
                  const isTodayEta = isScheduleEtaToday(sch);

                  // Calculate this schedule's index within its PO
                  const poAllSchedules = schedules.filter((s) => s.poId === sch.poId);
                  const poIndex = poAllSchedules.findIndex((s) => s.id === sch.id);
                  const poTotal = poAllSchedules.length;

                  return (
                    <tr
                      key={sch.id}
                      className={`transition-colors ${
                        isTodayEta ? 'row-eta-today' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-2.5 px-2 max-w-[108px]">
                        <span
                          className={`inline-block max-w-full truncate font-mono-num font-bold px-1.5 py-0.5 rounded border text-[11px] ${
                            isTodayEta
                              ? 'text-amber-950 bg-white/90 border-amber-400'
                              : 'text-slate-900 bg-slate-100 border-slate-300'
                          }`}
                          title={sch.id}
                        >
                          {sch.id}
                        </span>
                      </td>

                      <td className="py-2.5 px-2 whitespace-nowrap">
                        <div className="font-mono-num font-bold text-amber-800 flex items-center gap-1">
                          <span>{sch.poNumber}</span>
                          <span 
                            className={`px-1 py-0.2 rounded text-[10px] font-semibold border ${
                              isTodayEta
                                ? 'bg-white/90 text-amber-950 border-amber-400/90'
                                : 'bg-slate-100 text-slate-700 border-slate-300'
                            }`}
                            title={`Data ke-${poIndex >= 0 ? poIndex + 1 : 1} dari total ${poTotal} data di PO ini (maksimal ${MAX_SCHEDULES_PER_PO})`}
                          >
                            #{poIndex >= 0 ? poIndex + 1 : 1}/{poTotal}
                          </span>
                        </div>
                      </td>

                      <td className="py-2.5 px-2 font-mono-num whitespace-nowrap">
                        {isTodayEta ? (
                          <div className="inline-flex flex-col items-start gap-0.5 px-2 py-1 rounded-md bg-amber-200/85 border border-amber-400/90">
                            <div className="text-amber-950 font-black flex items-center gap-1 leading-tight">
                              <Calendar className="w-3.5 h-3.5 text-amber-800 shrink-0" />
                              <span>{formatDateOnly(sch.etaDateTime)}</span>
                            </div>
                            <span className="text-[9px] font-sans font-extrabold uppercase tracking-wider text-amber-900 leading-none">
                              Hari Ini
                            </span>
                          </div>
                        ) : (
                          <div className="text-slate-800 font-semibold flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>{formatDateOnly(sch.etaDateTime)}</span>
                          </div>
                        )}
                      </td>

                      <td className="py-2.5 px-2 font-mono-num text-right whitespace-nowrap">
                        <span className="font-bold text-emerald-800 text-xs block">
                          {Number(sch.estimatedTonnage).toLocaleString('id-ID')} Kg
                        </span>
                        <span className="text-[10px] text-slate-500 block">
                          ({(Number(sch.estimatedTonnage) / 1000).toFixed(2)} Ton)
                        </span>
                      </td>

                      <td className="py-2.5 px-2 font-mono-num text-center whitespace-nowrap">
                        <span className="text-slate-800 font-medium">{sch.estimatedTruckCount || 1} Armada</span>
                      </td>

                      <td className="py-2.5 px-2 font-sans max-w-[165px]">
                        <div className="text-slate-900 font-bold flex items-start gap-1.5 text-[11px] leading-snug" title={sch.supplierName}>
                          <Building2 className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                          <span className="break-words">{sch.supplierName}</span>
                        </div>
                      </td>

                      <td className="py-2.5 px-2 font-sans">
                        <div className="space-y-0.5">
                          <span className={`inline-block px-2 py-0.5 text-[10px] rounded border whitespace-nowrap ${badge.badgeStyle}`}>
                            {badge.label}
                          </span>
                          {linkedTx && (
                            <div className="text-[10px] font-mono text-slate-600 font-semibold flex items-center gap-1 whitespace-nowrap">
                              <span>{linkedTx.vehiclePlate}</span>
                              {linkedTx.nettoTons > 0 && (
                                <span className="text-emerald-700">· {linkedTx.nettoTons.toFixed(2)} T</span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="py-2.5 px-2.5 text-slate-800 text-[11px] min-w-[185px] whitespace-normal break-words leading-snug font-sans font-medium">
                        {sch.remarks || '-'}
                      </td>

                      <td className="py-2.5 px-2 text-center font-sans whitespace-nowrap">
                        {isAdmin ? (
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleOpenEditSchedule(sch)}
                              className="inline-flex items-center gap-1 px-2 py-1 bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-300 font-semibold text-[11px] rounded-lg transition-colors shadow-2xs cursor-pointer"
                              title="Revisi Estimasi Berat Muatan atau Rincian Jadwal Ini"
                            >
                              <Pencil className="w-3 h-3" />
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

      {/* Pagination Bar Riwayat Jadwal Pengiriman (Maksimal 15 data per halaman) */}
      {filteredSchedules.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 bg-white border border-slate-300 rounded-xl shadow-xs text-xs">
          <div className="text-slate-600 font-mono-num">
            Menampilkan{' '}
            <strong className="text-slate-900 font-bold">
              {scheduleStartIdx + 1}–{scheduleEndIdx}
            </strong>{' '}
            dari{' '}
            <strong className="text-slate-900 font-bold">{filteredSchedules.length}</strong> Data Jadwal
            <span className="text-slate-400 mx-1.5">·</span>
            <span>
              Halaman <strong className="text-slate-900 font-bold">{safeSchedulePage}</strong> / {totalSchedulePages}
            </span>
          </div>

          {totalSchedulePages > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                disabled={safeSchedulePage <= 1}
                onClick={() => setSchedulePage((p) => Math.max(1, p - 1))}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  safeSchedulePage <= 1
                    ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                    : 'bg-white hover:bg-slate-100 text-slate-800 border-slate-300 cursor-pointer shadow-2xs'
                }`}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Sebelumnya</span>
              </button>

              <div className="flex items-center gap-1">
                {schedulePageNumbers.map((pageItem, idx) =>
                  pageItem === 'ellipsis' ? (
                    <span key={`sch-ellipsis-${idx}`} className="px-1.5 text-xs text-slate-500 select-none">
                      …
                    </span>
                  ) : (
                    <button
                      key={pageItem}
                      type="button"
                      onClick={() => setSchedulePage(pageItem)}
                      className={`min-w-[32px] h-8 px-2 rounded-lg text-xs font-mono-num font-bold border transition-colors cursor-pointer ${
                        pageItem === safeSchedulePage
                          ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-2xs'
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
                disabled={safeSchedulePage >= totalSchedulePages}
                onClick={() => setSchedulePage((p) => Math.min(totalSchedulePages, p + 1))}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  safeSchedulePage >= totalSchedulePages
                    ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                    : 'bg-white hover:bg-slate-100 text-slate-800 border-slate-300 cursor-pointer shadow-2xs'
                }`}
              >
                <span>Berikutnya</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Full-Screen Modal Add Schedule (Supports Single & Multi/Batch up to 100 data per PO) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col w-screen h-screen overflow-hidden text-slate-900">
          {/* Full-Width Sticky Header */}
          <div className="shrink-0 flex justify-between items-center px-4 sm:px-6 lg:px-8 py-3.5 border-b border-slate-200 bg-white">
            <div className="flex items-center gap-2.5">
              <Calendar className="w-5 h-5 text-amber-600 shrink-0" />
              <div>
                <h3 className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                  Input Jadwal Pengiriman
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Maksimal {MAX_SCHEDULES_PER_PO} data jadwal pengiriman dalam 1 Purchase Order (PO)
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-900 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 border border-slate-200 transition-colors text-xs font-semibold cursor-pointer"
              title="Tutup halaman input jadwal"
            >
              <X className="w-4 h-4" />
              <span className="hidden sm:inline">Tutup</span>
            </button>
          </div>

          {/* Schedule Entry Full-Screen Form */}
          <form onSubmit={handleMultiSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Scrollable Full-Width Workspace */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 space-y-4">
              {/* PO Selector Field */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700">
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
                        : remainingQuota <= 10
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    }`}>
                      {poScheduleCount} / {MAX_SCHEDULES_PER_PO} Terdaftar ({isQuotaFull ? 'KUOTA PENUH' : `Sisa ${remainingQuota} slot`})
                    </span>
                  </div>

                  {/* Visual Progress Bar */}
                  <div className="w-full bg-slate-900 h-2.5 rounded-full overflow-hidden flex border border-slate-800 p-0.5">
                    <div 
                      className={`h-full rounded-full transition-all duration-300 ${
                        isQuotaFull ? 'bg-rose-500' : poScheduleCount > MAX_SCHEDULES_PER_PO * 0.8 ? 'bg-amber-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(100, (poScheduleCount / MAX_SCHEDULES_PER_PO) * 100)}%` }}
                    />
                  </div>

                  {isQuotaFull && (
                    <p className="text-[11px] text-rose-400 font-medium flex items-center gap-1 mt-1">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      Batas maksimal {MAX_SCHEDULES_PER_PO} data jadwal kedatangan untuk PO ini sudah tercapai ({MAX_SCHEDULES_PER_PO}/{MAX_SCHEDULES_PER_PO}). Anda tidak dapat menambah jadwal lagi pada PO ini.
                    </p>
                  )}
                </div>
              </div>
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
                      onClick={() => setIsManualPanelOpen((prev) => !prev)}
                      className={`px-2.5 py-1 text-xs font-bold rounded border transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer ${
                        isManualPanelOpen
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700'
                          : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-emerald-300'
                      }`}
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                      <span>Update Manual</span>
                    </button>

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

                {/* Panel Pengisian & Update Manual Daftar Jadwal */}
                {isManualPanelOpen && (
                  <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5 space-y-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <SlidersHorizontal className="w-4 h-4 text-emerald-700 shrink-0" />
                        <div>
                          <div className="font-bold text-slate-900">
                            Pengisian &amp; Update Manual Daftar Jadwal
                          </div>
                          <div className="text-[11px] text-slate-600">
                            Atur jumlah jadwal, tanggal mulai, rit per hari, estimasi berat, dan penomoran RIT secara manual lalu terapkan ke daftar.
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsManualPanelOpen(false)}
                        className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 px-2 py-1 rounded hover:bg-white/70 cursor-pointer"
                      >
                        Sembunyikan
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Jumlah Jadwal (Maks {remainingQuota})
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={Math.max(1, remainingQuota)}
                          value={manualConfig.rowCount}
                          onChange={(e) =>
                            setManualConfig((prev) => ({ ...prev, rowCount: e.target.value }))
                          }
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-mono-num focus:outline-none focus:border-emerald-600"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Tanggal Mulai (ETA)
                        </label>
                        <input
                          type="date"
                          value={manualConfig.startDate}
                          onClick={(e) => {
                            try {
                              (e.currentTarget as HTMLInputElement).showPicker?.();
                            } catch {
                              /* fallback */
                            }
                          }}
                          onChange={(e) =>
                            setManualConfig((prev) => ({ ...prev, startDate: e.target.value }))
                          }
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-mono-num focus:outline-none focus:border-emerald-600 cursor-pointer"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Pola Tanggal (Rit/Hari)
                        </label>
                        <select
                          value={manualConfig.ritsPerDay}
                          onChange={(e) =>
                            setManualConfig((prev) => ({
                              ...prev,
                              ritsPerDay: Number(e.target.value),
                            }))
                          }
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-emerald-600"
                        >
                          <option value={0}>Semua Tanggal Sama</option>
                          <option value={1}>1 Rit / Hari (+1 Hari)</option>
                          <option value={2}>2 Rit / Hari</option>
                          <option value={3}>3 Rit / Hari</option>
                          <option value={4}>4 Rit / Hari</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1 whitespace-nowrap truncate">
                          Berat / Jadwal (Kg)
                          {Number(manualConfig.tonnageKg) > 0 && (
                            <span className="ml-1 text-emerald-700 font-mono-num">
                              ({(Number(manualConfig.tonnageKg) / 1000).toLocaleString('id-ID', {
                                minimumFractionDigits: 1,
                                maximumFractionDigits: 2,
                              })} T)
                            </span>
                          )}
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={manualConfig.tonnageKg}
                          onChange={(e) =>
                            setManualConfig((prev) => ({ ...prev, tonnageKg: e.target.value }))
                          }
                          placeholder="30000"
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-mono-num focus:outline-none focus:border-emerald-600"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Armada / Baris
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={manualConfig.truckCount}
                          onChange={(e) =>
                            setManualConfig((prev) => ({ ...prev, truckCount: e.target.value }))
                          }
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-mono-num focus:outline-none focus:border-emerald-600"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Mulai RIT Ke-
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={manualConfig.startRitNumber}
                          onChange={(e) =>
                            setManualConfig((prev) => ({
                              ...prev,
                              startRitNumber: e.target.value,
                            }))
                          }
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-mono-num focus:outline-none focus:border-emerald-600"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 items-end">
                      <div className="lg:col-span-5">
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Awalan Keterangan Pengiriman
                        </label>
                        <input
                          type="text"
                          value={manualConfig.remarksPrefix}
                          onChange={(e) =>
                            setManualConfig((prev) => ({
                              ...prev,
                              remarksPrefix: e.target.value.toUpperCase(),
                            }))
                          }
                          placeholder="PENGIRIMAN BATUBARA RIT KE-"
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 uppercase focus:outline-none focus:border-emerald-600"
                        />
                      </div>

                      <div className="lg:col-span-7 flex flex-wrap items-center gap-x-3 gap-y-1.5 bg-white/80 border border-emerald-200 rounded-lg px-3 py-2">
                        <span className="text-[11px] font-bold text-slate-700">
                          Kolom di-update:
                        </span>
                        <label className="inline-flex items-center gap-1 text-[11px] text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={manualConfig.applyDate}
                            onChange={(e) =>
                              setManualConfig((prev) => ({
                                ...prev,
                                applyDate: e.target.checked,
                              }))
                            }
                            className="rounded border-slate-300 text-emerald-600"
                          />
                          <span>Tanggal ETA</span>
                        </label>
                        <label className="inline-flex items-center gap-1 text-[11px] text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={manualConfig.applyTonnage}
                            onChange={(e) =>
                              setManualConfig((prev) => ({
                                ...prev,
                                applyTonnage: e.target.checked,
                              }))
                            }
                            className="rounded border-slate-300 text-emerald-600"
                          />
                          <span>Berat (Kg)</span>
                        </label>
                        <label className="inline-flex items-center gap-1 text-[11px] text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={manualConfig.applyTruckCount}
                            onChange={(e) =>
                              setManualConfig((prev) => ({
                                ...prev,
                                applyTruckCount: e.target.checked,
                              }))
                            }
                            className="rounded border-slate-300 text-emerald-600"
                          />
                          <span>Armada</span>
                        </label>
                        <label className="inline-flex items-center gap-1 text-[11px] text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={manualConfig.applyRemarks}
                            onChange={(e) =>
                              setManualConfig((prev) => ({
                                ...prev,
                                applyRemarks: e.target.checked,
                              }))
                            }
                            className="rounded border-slate-300 text-emerald-600"
                          />
                          <span>Keterangan RIT</span>
                        </label>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      <button
                        type="button"
                        onClick={handleManualBulkUpdateRows}
                        disabled={multiRows.length === 0 || isQuotaFull}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors shadow-xs cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Terapkan Update Manual ({multiRows.length} Baris)</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleManualGenerateList}
                        disabled={remainingQuota <= 0 || isQuotaFull}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-emerald-100 disabled:opacity-50 text-emerald-900 border border-emerald-300 text-xs font-bold rounded-lg transition-colors shadow-xs cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-emerald-700" />
                        <span>
                          Buat / Ganti Daftar ({Math.min(Math.max(1, Math.floor(Number(manualConfig.rowCount) || 1)), Math.max(1, remainingQuota))} Jadwal)
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={handleManualAppendRows}
                        disabled={multiRows.length >= remainingQuota || isQuotaFull}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 disabled:opacity-50 text-slate-800 border border-slate-300 text-xs font-semibold rounded-lg transition-colors shadow-xs cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5 text-amber-600" />
                        <span>
                          Tambah {Math.max(1, Math.floor(Number(manualConfig.rowCount) || 1))} Baris Manual
                        </span>
                      </button>
                    </div>

                    {manualFeedback && (
                      <div className="p-2 rounded-lg bg-white border border-emerald-300 text-emerald-900 text-[11px] font-semibold flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>{manualFeedback}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Rekomendasi Harian (2 Rit / 2 Armada) & Saran AI */}
                {currentPo && (
                  <div className="bg-sky-50/70 border border-sky-200 rounded-xl p-3.5 space-y-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Truck className="w-4 h-4 text-sky-700 shrink-0" />
                        <div>
                          <div className="font-bold text-slate-900">
                            Rekomendasi Pengiriman 2 Rit / 2 Armada per Hari &amp; Saran AI
                          </div>
                          <div className="text-[11px] text-slate-600">
                            Sisa belum terjadwal:{' '}
                            <strong className="font-mono-num text-slate-900">
                              {poUnscheduledKg.toLocaleString('id-ID')} Kg
                            </strong>{' '}
                            (estimasi{' '}
                            <strong className="font-mono-num text-amber-800">
                              ~{Math.max(1, Math.ceil(poUnscheduledKg / 30000))} rit
                            </strong>{' '}
                            @ 30 Ton)
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleRequestAiAdvice}
                        disabled={isLoadingAiAdvice}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-bold transition-colors shadow-xs cursor-pointer"
                      >
                        {isLoadingAiAdvice ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        )}
                        <span>{isLoadingAiAdvice ? 'Menganalisis AI...' : 'Minta Saran AI'}</span>
                      </button>
                    </div>

                    {/* Quick Preset untuk 2 Rit / 2 Armada dalam 1 Hari */}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleApplyTwoRitSplit}
                        disabled={remainingQuota < 2 || isQuotaFull}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white hover:bg-sky-100 disabled:opacity-50 text-sky-900 border border-sky-300 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer"
                        title="Buat 2 baris terpisah di hari yang sama (Pagi & Siang) agar bisa Check-In Security per truk"
                      >
                        <Plus className="w-3.5 h-3.5 text-sky-700" />
                        <span>Rekomendasi: 2 Rit Terpisah (1 Hari)</span>
                      </button>
                    </div>

                    {/* Error dari Endpoint Saran AI */}
                    {aiAdviceError && (
                      <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-300 text-rose-900 text-[11px] flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                        <span>{aiAdviceError}</span>
                      </div>
                    )}

                    {/* Hasil Saran AI Gemini */}
                    {aiAdvice && (
                      <div className="p-3 rounded-xl bg-white border border-sky-300 space-y-2.5 shadow-2xs">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                          <span className="font-bold text-slate-900 flex items-center gap-1.5 text-xs">
                            <Sparkles className="w-4 h-4 text-amber-500" />
                            <span>Hasil Analisis &amp; Saran AI</span>
                          </span>
                          {aiAdvice.usulPembagianBaris && aiAdvice.usulPembagianBaris.length > 0 && (
                            <button
                              type="button"
                              onClick={handleApplyAiSuggestedRows}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold transition-colors cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Terapkan Usulan Baris AI ({Math.min(aiAdvice.usulPembagianBaris.length, remainingQuota)} data)</span>
                            </button>
                          )}
                        </div>

                        <div className="space-y-1.5 text-[11px] text-slate-700 leading-relaxed">
                          <div>
                            <strong className="text-slate-900">Strategi Kuota PO:</strong>{' '}
                            {aiAdvice.ringkasanStrategi}
                          </div>
                          <div>
                            <strong className="text-slate-900">Saran 2 Rit / 2 Armada per Hari:</strong>{' '}
                            {aiAdvice.rekomendasiDuaRitHarian}
                          </div>
                          <div>
                            <strong className="text-slate-900">Antrean &amp; Stockpile:</strong>{' '}
                            {aiAdvice.analisisAntreanDanStockpile}
                          </div>
                          {aiAdvice.saranAksiCepat && aiAdvice.saranAksiCepat.length > 0 && (
                            <div>
                              <strong className="text-slate-900 block mb-0.5">Langkah Disarankan:</strong>
                              <ul className="list-disc list-inside space-y-0.5 text-slate-700">
                                {aiAdvice.saranAksiCepat.map((item, i) => (
                                  <li key={i}>{item}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Rows List */}
                <div className="space-y-3">
                  {multiRows.map((row, idx) => {
                    const rowSlotNumber = poScheduleCount + idx + 1;
                    return (
                      <div
                        key={row.id}
                        className="bg-slate-50/80 border border-slate-200 rounded-xl p-3.5 sm:p-4 space-y-2.5 relative group shadow-xs"
                      >
                        <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
                          <span className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-2 font-mono-num">
                            <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-900 border border-amber-300 flex items-center justify-center text-[11px] font-bold">
                              {idx + 1}
                            </span>
                            Data Jadwal #{idx + 1} (Jadwal ke-{rowSlotNumber} dari {MAX_SCHEDULES_PER_PO})
                          </span>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleDuplicateMultiRow(row.id)}
                              disabled={multiRows.length >= remainingQuota || isQuotaFull}
                              className="p-1.5 text-slate-500 hover:text-sky-700 hover:bg-sky-50 rounded disabled:opacity-30 transition-colors cursor-pointer"
                              title="Duplikat baris jadwal ini"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveMultiRow(row.id)}
                              disabled={multiRows.length <= 1}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded disabled:opacity-30 transition-colors cursor-pointer"
                              title="Hapus baris jadwal ini"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 text-xs">
                          <div className="md:col-span-3">
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
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
                                <Calendar className="w-4 h-4" />
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
                                className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-2.5 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-amber-500 font-mono-num cursor-pointer"
                              />
                            </div>
                          </div>

                          <div className="md:col-span-3">
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              Estimasi Berat Muatan (Kg) *
                            </label>
                            <input
                              type="number"
                              min={1}
                              required
                              value={row.estimatedTonnage}
                              onChange={(e) => handleUpdateMultiRow(row.id, 'estimatedTonnage', e.target.value)}
                              placeholder="Contoh: 28201"
                              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-amber-500 font-mono-num"
                            />
                          </div>

                          <div className="md:col-span-2">
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              Estimasi Rit / Truk
                            </label>
                            <input
                              type="number"
                              min={1}
                              value={row.estimatedTruckCount}
                              onChange={(e) => handleUpdateMultiRow(row.id, 'estimatedTruckCount', Number(e.target.value))}
                              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-amber-500 font-mono-num"
                            />
                          </div>

                          <div className="md:col-span-4">
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              Keterangan Pengiriman
                            </label>
                            <input
                              type="text"
                              placeholder="Catatan / keterangan pengiriman (opsional)"
                              value={row.remarks}
                              onChange={(e) => handleUpdateMultiRow(row.id, 'remarks', e.target.value.toUpperCase())}
                              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-amber-500 uppercase"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
            </div>

            {/* Sticky Full-Width Footer Summary & Actions */}
            <div className="shrink-0 bg-slate-50 border-t border-slate-200 px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
                <div>
                  <span className="text-slate-600">Total Jadwal Baru: </span>
                  <strong className="text-slate-900 font-mono-num font-bold">{multiRows.length} Data</strong>
                  <span className="text-slate-500 text-[11px] ml-2">
                    (Total setelah simpan: <strong className="text-amber-800 font-mono-num font-bold">{poScheduleCount + multiRows.length}/{MAX_SCHEDULES_PER_PO}</strong>)
                  </span>
                </div>

                <div>
                  <span className="text-slate-600">Total Muatan: </span>
                  <strong className="text-emerald-800 font-mono-num font-bold">
                    {multiRows.reduce((sum, r) => sum + Number(r.estimatedTonnage || 0), 0).toLocaleString('id-ID')} Kg
                  </strong>
                </div>
              </div>

              <div className="flex items-center gap-2.5 ml-auto">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg transition-colors border border-slate-300 cursor-pointer"
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
            </div>
          </form>
        </div>
      )}

      {/* ===================== MODAL REVISI JADWAL PENGIRIMAN ===================== */}
      {editingSchedule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full p-5 sm:p-7 shadow-2xl my-4 flex flex-col max-h-[94vh] overflow-y-auto">
            {/* Header */}
            <div className="flex justify-between items-center pb-3.5 border-b border-slate-800 mb-5 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  <Pencil className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white tracking-tight">
                    Revisi Jadwal Pengiriman
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-400">
                    Revisi estimasi berat muatan atau jadwal ID <strong className="text-amber-400 font-mono-num">{editingSchedule.id}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingSchedule(null)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveEditSchedule} className="space-y-5">
              {editError && (
                <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs sm:text-sm font-semibold text-rose-900 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{editError}</span>
                </div>
              )}
              {/* Sync Notice Badge */}
              <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs sm:text-sm">
                <FileSpreadsheet className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>
                  Perubahan data jadwal otomatis tersimpan dan disinkronkan ke <strong>Google Sheets</strong> (tab <em>JADWAL_KEDATANGAN</em>).
                </span>
              </div>

              {/* Readonly Info */}
              <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 text-xs sm:text-sm grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <span className="text-slate-400 block text-xs">Nomor PO:</span>
                  <span className="font-bold text-amber-400 font-mono-num text-sm sm:text-base">{editingSchedule.poNumber}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-xs">Supplier:</span>
                  <span className="font-semibold text-white truncate block text-sm sm:text-base">{editingSchedule.supplierName}</span>
                </div>
              </div>

              {/* Editable Fields */}
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
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
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3.5 py-2.5 text-sm text-amber-400 font-bold focus:outline-none focus:border-amber-500 font-mono-num"
                    />
                    <span className="text-[11px] text-slate-500 mt-1 block">
                      {editScheduleData.estimatedTonnage && Number(editScheduleData.estimatedTonnage) > 0
                        ? `Setara dengan ${(Number(editScheduleData.estimatedTonnage) / 1000).toFixed(2)} Ton`
                        : 'Masukkan berat muatan batubara dalam satuan Kilogram'}
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Estimasi Ritase / Armada
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={editScheduleData.estimatedTruckCount}
                      onChange={(e) => setEditScheduleData({ ...editScheduleData, estimatedTruckCount: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 font-mono-num"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
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
                        className="w-full bg-white border border-slate-300 rounded-lg pl-10 pr-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-amber-500 font-mono-num cursor-pointer"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Status Kedatangan
                    </label>
                    <select
                      value={editScheduleData.status}
                      onChange={(e) => setEditScheduleData({ ...editScheduleData, status: e.target.value as ArrivalSchedule['status'] })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 font-semibold"
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
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Keterangan / Catatan Tambahan
                  </label>
                  <input
                    type="text"
                    value={editScheduleData.remarks}
                    onChange={(e) => setEditScheduleData({ ...editScheduleData, remarks: e.target.value })}
                    placeholder="Contoh: Pengiriman rit ke-1 atau instruksi khusus..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="flex flex-wrap items-center justify-end gap-2.5 pt-4 border-t border-slate-800">
                {onDeleteSchedule && (
                  <button
                    type="button"
                    onClick={() => setDeletingSchedule(editingSchedule)}
                    className="mr-auto px-4 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 border border-rose-500/30 rounded-lg text-xs sm:text-sm font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Hapus Jadwal (Kembalikan Kuota)</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setEditingSchedule(null)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-sky-500 hover:bg-sky-600 text-slate-950 font-bold text-xs sm:text-sm rounded-lg transition-colors shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  <Pencil className="w-4 h-4" />
                  <span>Simpan Revisi &amp; Sinkronkan</span>
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
