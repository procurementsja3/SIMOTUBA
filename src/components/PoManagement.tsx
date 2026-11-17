import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Plus, 
  Search, 
  Building2, 
  Calendar, 
  Layers, 
  CheckCircle2, 
  AlertCircle,
  Truck,
  Table,
  LayoutGrid,
  Trash2,
  Users,
  Pencil,
  X,
  AlertTriangle,
  FileSpreadsheet,
  RotateCcw,
  FilterX,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { PurchaseOrder, ArrivalSchedule, CoalTransaction } from '../types/coal';

export interface SupplierPoInputItem {
  id: string;
  poNumber: string;
  contractDate: string;
  supplierName: string;
  supplierCode: string;
  targetTonnage: string | number;
  tolerancePercentage: string | number;
  destinationStockpile: string;
  pricePerTon: string | number;
  notes: string;
}

const createDefaultSupplierItem = (index: number): SupplierPoInputItem => ({
  id: `sp-${Date.now()}-${index}-${Math.floor(Math.random() * 1000)}`,
  poNumber: '',
  contractDate: new Date().toISOString().split('T')[0],
  supplierName: '',
  supplierCode: '',
  targetTonnage: '',
  tolerancePercentage: 5,
  destinationStockpile: 'Stockpile Utama - A1 (Medium Calorie)',
  pricePerTon: 850000,
  notes: '',
});

interface PoManagementProps {
  purchaseOrders: PurchaseOrder[];
  schedules?: ArrivalSchedule[];
  transactions?: CoalTransaction[];
  isAdmin?: boolean;
  onSavePo: (po: PurchaseOrder | PurchaseOrder[]) => void;
  onCreateScheduleForPo: (po: PurchaseOrder) => void;
  onUpdatePo?: (po: PurchaseOrder) => void;
  onDeletePo?: (poId: string) => void;
}

export const PoManagement: React.FC<PoManagementProps> = ({
  purchaseOrders,
  schedules = [],
  transactions = [],
  isAdmin = true,
  onSavePo,
  onCreateScheduleForPo,
  onUpdatePo,
  onDeletePo,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

  // Column search filters under each table header
  const [colSearchPo, setColSearchPo] = useState('');
  const [colSearchSupplier, setColSearchSupplier] = useState('');
  const [colSearchQty, setColSearchQty] = useState('');
  const [colSearchReceived, setColSearchReceived] = useState('');
  const [colSearchRemaining, setColSearchRemaining] = useState('');
  const [colSearchProgress, setColSearchProgress] = useState('');
  const [colSearchRitase, setColSearchRitase] = useState('');
  const [colSearchStatus, setColSearchStatus] = useState('');

  const isAnyColFilterActive = Boolean(
    colSearchPo ||
    colSearchSupplier ||
    colSearchQty ||
    colSearchReceived ||
    colSearchRemaining ||
    colSearchProgress ||
    colSearchRitase ||
    colSearchStatus
  );

  const activeColFilterCount = [
    colSearchPo,
    colSearchSupplier,
    colSearchQty,
    colSearchReceived,
    colSearchRemaining,
    colSearchProgress,
    colSearchRitase,
    colSearchStatus
  ].filter(Boolean).length;

  const handleResetColFilters = () => {
    setColSearchPo('');
    setColSearchSupplier('');
    setColSearchQty('');
    setColSearchReceived('');
    setColSearchRemaining('');
    setColSearchProgress('');
    setColSearchRitase('');
    setColSearchStatus('');
  };

  // Edit PO State
  const [editingPo, setEditingPo] = useState<PurchaseOrder | null>(null);
  const [editFormData, setEditFormData] = useState<{
    poNumber: string;
    supplierName: string;
    supplierCode: string;
    contractDate: string;
    targetTonnage: string | number;
    tolerancePercentage: string | number;
    destinationStockpile: string;
    pricePerTon: string | number;
    status: 'ACTIVE' | 'CLOSED' | 'HOLD';
    notes: string;
    calorieMin: string | number;
    moistureMax: string | number;
    ashMax: string | number;
    sulfurMax: string | number;
    hgiMin: string | number;
  }>({
    poNumber: '',
    supplierName: '',
    supplierCode: '',
    contractDate: '',
    targetTonnage: '',
    tolerancePercentage: 5,
    destinationStockpile: 'Stockpile Utama - A1 (Medium Calorie)',
    pricePerTon: 850000,
    status: 'ACTIVE',
    notes: '',
    calorieMin: 4200,
    moistureMax: 34.0,
    ashMax: 8.0,
    sulfurMax: 0.8,
    hgiMin: 45,
  });

  // Delete PO State
  const [deletingPo, setDeletingPo] = useState<PurchaseOrder | null>(null);

  // Multi-Supplier Batch Input State (1 up to 5 suppliers)
  const [supplierItems, setSupplierItems] = useState<SupplierPoInputItem[]>([
    createDefaultSupplierItem(1),
  ]);

  const handleOpenModal = () => {
    setCreateError(null);
    setSupplierItems([createDefaultSupplierItem(1)]);
    setIsModalOpen(true);
  };

  const handleAddSupplier = () => {
    if (supplierItems.length >= 5) {
      setCreateError('Maksimal 5 supplier per sesi input PO.');
      return;
    }
    setCreateError(null);
    setSupplierItems((prev) => [...prev, createDefaultSupplierItem(prev.length + 1)]);
  };

  const handleRemoveSupplier = (id: string) => {
    if (supplierItems.length <= 1) return;
    setSupplierItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleItemChange = (
    id: string,
    field: keyof SupplierPoInputItem,
    rawVal: string
  ) => {
    setSupplierItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        if (field === 'targetTonnage' || field === 'tolerancePercentage') {
          if (rawVal === '') {
            return { ...item, [field]: '' };
          }
          let cleanVal = rawVal;
          if (cleanVal.length > 1 && cleanVal.startsWith('0') && !cleanVal.startsWith('0.')) {
            cleanVal = cleanVal.replace(/^0+/, '');
          }
          return { ...item, [field]: cleanVal };
        }
        return { ...item, [field]: rawVal };
      })
    );
  };

  const filteredPos = purchaseOrders.filter((po) => {
    // 1. Col Search: No PO & Tanggal
    if (colSearchPo) {
      const q = colSearchPo.toLowerCase().trim();
      const matchPoNum = po.poNumber.toLowerCase().includes(q);
      const matchDate = (po.contractDate || '').toLowerCase().includes(q);
      if (!matchPoNum && !matchDate) return false;
    }

    // 3. Col Search: Supplier Batubara & Tambang
    if (colSearchSupplier) {
      const q = colSearchSupplier.toLowerCase().trim();
      const matchSup = po.supplierName.toLowerCase().includes(q);
      const matchCode = (po.supplierCode || '').toLowerCase().includes(q);
      const matchDest = (po.destinationStockpile || '').toLowerCase().includes(q);
      if (!matchSup && !matchCode && !matchDest) return false;
    }

    // 4. Col Search: Qty PO (Kg)
    if (colSearchQty) {
      const q = colSearchQty.toLowerCase().trim().replace(/[,.]/g, '');
      const rawQty = String(po.targetTonnage);
      const formattedQty = po.targetTonnage.toLocaleString('id-ID');
      if (!rawQty.includes(q) && !formattedQty.includes(colSearchQty.trim())) return false;
    }

    // 5. Col Search: Diterima (Kg)
    if (colSearchReceived) {
      const q = colSearchReceived.toLowerCase().trim().replace(/[,.]/g, '');
      const rawRec = String(po.receivedTonnage);
      const formattedRec = po.receivedTonnage.toLocaleString('id-ID');
      if (!rawRec.includes(q) && !formattedRec.includes(colSearchReceived.trim())) return false;
    }

    // 6. Col Search: Sisa Kuota (Kg)
    if (colSearchRemaining) {
      const remaining = Math.max(0, po.targetTonnage - po.receivedTonnage);
      const q = colSearchRemaining.toLowerCase().trim().replace(/[,.]/g, '');
      const rawRem = String(remaining);
      const formattedRem = remaining.toLocaleString('id-ID');
      if (!rawRem.includes(q) && !formattedRem.includes(colSearchRemaining.trim())) return false;
    }

    // 7. Col Search: Progress Realisasi (%)
    if (colSearchProgress) {
      const pct = po.targetTonnage > 0 ? (po.receivedTonnage / po.targetTonnage) * 100 : 0;
      const q = colSearchProgress.toLowerCase().trim().replace('%', '');
      const pctStr = pct.toFixed(1);
      const pctFloor = Math.floor(pct).toString();
      if (!pctStr.includes(q) && !pctFloor.includes(q)) return false;
    }

    // 8. Col Search: Jadwal Ritase
    if (colSearchRitase) {
      const poSchedules = schedules.filter((s) => s.poId === po.id);
      const countStr = String(poSchedules.length);
      const q = colSearchRitase.trim();
      if (!countStr.includes(q)) return false;
    }

    // 9. Col Search: Status
    if (colSearchStatus) {
      if (po.status !== colSearchStatus) return false;
    }

    return true;
  });

  // Sort PO records: input terbaru ditampilkan paling atas (newest first)
  const sortedPos = [...filteredPos].sort((a, b) => {
    const timeA = new Date(a.createdAt || a.contractDate || 0).getTime();
    const timeB = new Date(b.createdAt || b.contractDate || 0).getTime();
    if (timeA !== timeB) return timeB - timeA;
    return (b.id || '').localeCompare(a.id || '');
  });

  // Pagination PO (Maksimal 10 data per halaman)
  const PO_PAGE_SIZE = 10;
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    colSearchPo,
    colSearchSupplier,
    colSearchQty,
    colSearchReceived,
    colSearchRemaining,
    colSearchProgress,
    colSearchRitase,
    colSearchStatus,
  ]);

  const totalPages = Math.max(1, Math.ceil(sortedPos.length / PO_PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * PO_PAGE_SIZE;
  const endIndex = Math.min(startIndex + PO_PAGE_SIZE, sortedPos.length);
  const paginatedPos = sortedPos.slice(startIndex, endIndex);

  // Aggregated KPIs
  const totalQtyTon = filteredPos.reduce((acc, p) => acc + (p.targetTonnage || 0), 0);
  const totalReceivedTon = filteredPos.reduce((acc, p) => acc + (p.receivedTonnage || 0), 0);
  const totalRemainingTon = Math.max(0, totalQtyTon - totalReceivedTon);
  const avgPct = totalQtyTon > 0 ? (totalReceivedTon / totalQtyTon) * 100 : 0;

  // Batch tonage in modal preview
  const totalBatchTonnage = supplierItems.reduce(
    (acc, sp) => acc + (Number(sp.targetTonnage) || 0),
    0
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    // Validate all supplier items
    for (let i = 0; i < supplierItems.length; i++) {
      const sp = supplierItems[i];
      const supplierLabel = `Supplier #${i + 1}`;
      if (!sp.poNumber.trim()) {
        setCreateError(`Mohon lengkapi Nomor PO pada ${supplierLabel}.`);
        return;
      }
      if (!sp.supplierName.trim()) {
        setCreateError(`Mohon lengkapi Nama Supplier pada ${supplierLabel}.`);
        return;
      }
      if (!sp.targetTonnage || Number(sp.targetTonnage) <= 0) {
        setCreateError(`Mohon isi Qty PO (Kg) yang valid pada ${supplierLabel}.`);
        return;
      }
    }

    const newPos: PurchaseOrder[] = supplierItems.map((item, idx) => ({
      id: `PO-${Date.now()}-${idx}-${Math.floor(100 + Math.random() * 900)}`,
      poNumber: item.poNumber.trim(),
      supplierName: item.supplierName.trim(),
      supplierCode: item.supplierCode.trim() || item.supplierName.trim().substring(0, 3).toUpperCase(),
      contractDate: item.contractDate,
      targetTonnage: Number(item.targetTonnage),
      receivedTonnage: 0,
      pricePerTon: Number(item.pricePerTon) || 850000,
      destinationStockpile: item.destinationStockpile || 'Stockpile Utama - A1 (Medium Calorie)',
      tolerancePercentage: Number(item.tolerancePercentage) || 5,
      notes: item.notes.trim(),
      createdAt: new Date().toISOString(),
      status: 'ACTIVE',
      specs: {
        calorieMin: 4200,
        moistureMax: 34.0,
        ashMax: 8.0,
        sulfurMax: 0.8,
        hgiMin: 45,
      },
    }));

    onSavePo(newPos);
    setIsModalOpen(false);
    setSupplierItems([createDefaultSupplierItem(1)]);
  };

  const handleOpenEditModal = (po: PurchaseOrder) => {
    setEditError(null);
    setEditingPo(po);
    setEditFormData({
      poNumber: po.poNumber,
      supplierName: po.supplierName,
      supplierCode: po.supplierCode || '',
      contractDate: po.contractDate || new Date().toISOString().split('T')[0],
      targetTonnage: po.targetTonnage,
      tolerancePercentage: po.tolerancePercentage ?? 5,
      destinationStockpile: po.destinationStockpile || 'Stockpile Utama - A1 (Medium Calorie)',
      pricePerTon: po.pricePerTon || 850000,
      status: po.status || 'ACTIVE',
      notes: po.notes || '',
      calorieMin: po.specs?.calorieMin ?? 4200,
      moistureMax: po.specs?.moistureMax ?? 34.0,
      ashMax: po.specs?.ashMax ?? 8.0,
      sulfurMax: po.specs?.sulfurMax ?? 0.8,
      hgiMin: po.specs?.hgiMin ?? 45,
    });
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPo) return;
    setEditError(null);

    if (!editFormData.poNumber.trim()) {
      setEditError('Mohon isi Nomor PO.');
      return;
    }
    if (!editFormData.supplierName.trim()) {
      setEditError('Mohon isi Nama Supplier.');
      return;
    }
    if (!editFormData.targetTonnage || Number(editFormData.targetTonnage) <= 0) {
      setEditError('Mohon isi Qty PO (Kg) yang valid.');
      return;
    }

    const updated: PurchaseOrder = {
      ...editingPo,
      poNumber: editFormData.poNumber.trim(),
      supplierName: editFormData.supplierName.trim(),
      supplierCode: editFormData.supplierCode.trim() || editFormData.supplierName.trim().substring(0, 3).toUpperCase(),
      contractDate: editFormData.contractDate,
      targetTonnage: Number(editFormData.targetTonnage),
      tolerancePercentage: Number(editFormData.tolerancePercentage) || 5,
      destinationStockpile:
        editFormData.destinationStockpile.trim() ||
        editingPo.destinationStockpile ||
        'Stockpile Utama - A1 (Medium Calorie)',
      pricePerTon: Number(editFormData.pricePerTon) || 850000,
      status: editFormData.status,
      notes: editFormData.notes.trim(),
      specs: {
        calorieMin: Number(editFormData.calorieMin) || 4200,
        moistureMax: Number(editFormData.moistureMax) || 34.0,
        ashMax: Number(editFormData.ashMax) || 8.0,
        sulfurMax: Number(editFormData.sulfurMax) || 0.8,
        hgiMin: Number(editFormData.hgiMin) || 45,
      },
    };

    if (onUpdatePo) {
      onUpdatePo(updated);
    }
    setEditingPo(null);
    setEditError(null);
  };

  const handleOpenDeleteModal = (po: PurchaseOrder) => {
    setDeletingPo(po);
  };

  const handleConfirmDelete = () => {
    if (!deletingPo) return;
    if (onDeletePo) {
      onDeletePo(deletingPo.id);
    }
    setDeletingPo(null);
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-slate-300 rounded-xl p-5 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <FileText className="w-5 h-5 text-amber-600 shrink-0" />
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
              Purchase Order (PO)
            </h2>
          </div>
          <p className="text-xs text-slate-600">
            Daftar kontrak pengadaan batubara, batas toleransi susut, target kuota, dan spesifikasi standar QC
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isAdmin ? (
            <button
              type="button"
              onClick={handleOpenModal}
              className="flex items-center justify-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-lg transition-colors whitespace-nowrap shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Buat PO Baru (Hingga 5 Supplier)</span>
            </button>
          ) : (
            <span className="px-3 py-1.5 bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg">
              Mode Lihat (Admin Only untuk Ubah PO)
            </span>
          )}
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white border border-slate-300 rounded-xl p-4 shadow-xs">
          <span className="text-[11px] text-slate-600 block mb-1 font-medium">Total PO</span>
          <div className="flex items-baseline justify-between">
            <span className="text-xl sm:text-2xl font-bold text-slate-900 font-mono-num">
              {filteredPos.length}
            </span>
            <span className="text-[11px] text-amber-700 font-semibold">Dokumen Aktif</span>
          </div>
        </div>

        <div className="bg-white border border-slate-300 rounded-xl p-4 shadow-xs">
          <span className="text-[11px] text-slate-600 block mb-1 font-medium">Total Qty PO</span>
          <div className="flex items-baseline justify-between">
            <span className="text-xl sm:text-2xl font-bold text-amber-800 font-mono-num">
              {totalQtyTon.toLocaleString('id-ID')}
            </span>
            <span className="text-[11px] text-slate-600 font-medium">Kg</span>
          </div>
        </div>

        <div className="bg-white border border-slate-300 rounded-xl p-4 shadow-xs">
          <span className="text-[11px] text-slate-600 block mb-1 font-medium">Realisasi Diterima</span>
          <div className="flex items-baseline justify-between">
            <span className="text-xl sm:text-2xl font-bold text-emerald-800 font-mono-num">
              {totalReceivedTon.toLocaleString('id-ID')}
            </span>
            <span className="text-[11px] text-emerald-800 font-semibold font-mono-num">
              {avgPct.toFixed(1)}%
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-300 rounded-xl p-4 shadow-xs">
          <span className="text-[11px] text-slate-600 block mb-1 font-medium">Sisa Kuota Pengiriman</span>
          <div className="flex items-baseline justify-between">
            <span className="text-xl sm:text-2xl font-bold text-sky-800 font-mono-num">
              {totalRemainingTon.toLocaleString('id-ID')}
            </span>
            <span className="text-[11px] text-slate-600 font-medium">Kg Sisa</span>
          </div>
        </div>
      </div>

      {/* Section Header: Riwayat Data PO + View Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2.5">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-4 h-4 text-amber-600" />
            Riwayat Data PO (Purchase Order)
          </h3>
          <span className="px-2 py-0.5 text-[11px] font-semibold bg-amber-500/20 text-amber-800 rounded-full border border-amber-500/30 font-mono-num">
            {filteredPos.length} Data
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-300">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                viewMode === 'table' ? 'bg-amber-500 text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Table className="w-3.5 h-3.5" />
              <span>Tabel Riwayat</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                viewMode === 'grid' ? 'bg-amber-500 text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Grid Kartu</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content: Table or Grid or Empty State */}
      {purchaseOrders.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-8 sm:p-12 text-center space-y-3 shadow-xs">
          <FileText className="w-12 h-12 mx-auto text-slate-400" />
          <h4 className="text-sm font-bold text-slate-900">Riwayat Data PO Masih Kosong</h4>
          <p className="text-xs text-slate-600 max-w-md mx-auto">
            Belum ada data Purchase Order (PO) yang tersimpan. Klik tombol di bawah untuk membuat PO baru.
          </p>
          <div className="flex items-center justify-center pt-2">
            {isAdmin && (
              <button
                type="button"
                onClick={handleOpenModal}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-lg transition-colors shadow-xs"
              >
                + Buat PO Baru (Hingga 5 Supplier)
              </button>
            )}
          </div>
        </div>
      ) : viewMode === 'table' ? (
        /* ======================== TABEL RIWAYAT DATA PO ======================== */
        <div className="bg-white border border-slate-300 rounded-xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-3 py-2.5 whitespace-nowrap">No PO & Tanggal</th>
                  <th className="px-3 py-2.5 min-w-[155px]">Supplier Batubara</th>
                  <th className="px-2.5 py-2.5 text-right whitespace-nowrap">Qty PO (Kg)</th>
                  <th className="px-2.5 py-2.5 text-right whitespace-nowrap">Diterima (Kg)</th>
                  <th className="px-2.5 py-2.5 text-right whitespace-nowrap">Sisa Kuota (Kg)</th>
                  <th className="px-2.5 py-2.5 min-w-[120px]">Progress Realisasi</th>
                  <th className="px-2.5 py-2.5 text-center whitespace-nowrap">Jadwal Ritase</th>
                  <th className="px-2.5 py-2.5 text-center whitespace-nowrap">Status</th>
                  <th className="px-3 py-2.5 text-center whitespace-nowrap w-[156px] min-w-[152px]">Aksi</th>
                </tr>
                {/* BARIS KOLOM PENCARIAN DI BAWAH HEADER */}
                <tr className="bg-slate-50 border-t border-slate-200 font-normal lowercase tracking-normal">
                  {/* 1. No PO & Tanggal */}
                  <th className="px-2 py-2">
                    <div className="relative flex items-center">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 pointer-events-none" />
                      <input
                        type="text"
                        value={colSearchPo}
                        onChange={(e) => setColSearchPo(e.target.value)}
                        placeholder="Cari PO / Tgl..."
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

                  {/* 2. Supplier Batubara */}
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
                          title="Hapus pencarian supplier"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </th>

                  {/* 3. Qty PO (Kg) */}
                  <th className="px-2 py-2">
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        value={colSearchQty}
                        onChange={(e) => setColSearchQty(e.target.value)}
                        placeholder="Cari Qty..."
                        className="w-full pl-2 pr-5 py-1 text-[11px] text-right font-normal normal-case rounded border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 shadow-2xs"
                      />
                      {colSearchQty && (
                        <button
                          type="button"
                          onClick={() => setColSearchQty('')}
                          className="absolute right-1 text-slate-400 hover:text-slate-600 text-xs px-1 cursor-pointer"
                          title="Hapus filter Qty"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </th>

                  {/* 4. Diterima (Kg) */}
                  <th className="px-2 py-2">
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        value={colSearchReceived}
                        onChange={(e) => setColSearchReceived(e.target.value)}
                        placeholder="Cari Diterima..."
                        className="w-full pl-2 pr-5 py-1 text-[11px] text-right font-normal normal-case rounded border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 shadow-2xs"
                      />
                      {colSearchReceived && (
                        <button
                          type="button"
                          onClick={() => setColSearchReceived('')}
                          className="absolute right-1 text-slate-400 hover:text-slate-600 text-xs px-1 cursor-pointer"
                          title="Hapus filter diterima"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </th>

                  {/* 5. Sisa Kuota (Kg) */}
                  <th className="px-2 py-2">
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        value={colSearchRemaining}
                        onChange={(e) => setColSearchRemaining(e.target.value)}
                        placeholder="Cari Sisa..."
                        className="w-full pl-2 pr-5 py-1 text-[11px] text-right font-normal normal-case rounded border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 shadow-2xs"
                      />
                      {colSearchRemaining && (
                        <button
                          type="button"
                          onClick={() => setColSearchRemaining('')}
                          className="absolute right-1 text-slate-400 hover:text-slate-600 text-xs px-1 cursor-pointer"
                          title="Hapus filter sisa"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </th>

                  {/* 6. Progress Realisasi */}
                  <th className="px-2 py-2">
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        value={colSearchProgress}
                        onChange={(e) => setColSearchProgress(e.target.value)}
                        placeholder="Cari %..."
                        className="w-full pl-2 pr-5 py-1 text-[11px] font-normal normal-case rounded border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 shadow-2xs"
                      />
                      {colSearchProgress && (
                        <button
                          type="button"
                          onClick={() => setColSearchProgress('')}
                          className="absolute right-1 text-slate-400 hover:text-slate-600 text-xs px-1 cursor-pointer"
                          title="Hapus filter progress"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </th>

                  {/* 7. Jadwal Ritase */}
                  <th className="px-2 py-2">
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        value={colSearchRitase}
                        onChange={(e) => setColSearchRitase(e.target.value)}
                        placeholder="Jml ritase..."
                        className="w-full pl-2 pr-5 py-1 text-[11px] text-center font-normal normal-case rounded border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 shadow-2xs"
                      />
                      {colSearchRitase && (
                        <button
                          type="button"
                          onClick={() => setColSearchRitase('')}
                          className="absolute right-1 text-slate-400 hover:text-slate-600 text-xs px-1 cursor-pointer"
                          title="Hapus filter ritase"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </th>

                  {/* 8. Status */}
                  <th className="px-2 py-2">
                    <select
                      value={colSearchStatus}
                      onChange={(e) => setColSearchStatus(e.target.value)}
                      className="w-full px-1.5 py-1 text-[11px] font-normal normal-case rounded border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 shadow-2xs cursor-pointer"
                    >
                      <option value="">Semua Status</option>
                      <option value="ACTIVE">Aktif</option>
                      <option value="CLOSED">Selesai</option>
                      <option value="HOLD">Ditunda</option>
                    </select>
                  </th>

                  {/* 9. Aksi / Reset */}
                  <th className="px-2.5 py-2 text-center whitespace-nowrap">
                    {isAnyColFilterActive ? (
                      <button
                        type="button"
                        onClick={handleResetColFilters}
                        className="inline-flex items-center justify-center gap-1 w-full px-2 py-1 text-[11px] font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-300 rounded shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
                        title="Reset semua filter kolom"
                      >
                        <FilterX className="w-3.5 h-3.5 shrink-0" />
                        <span>Reset ({activeColFilterCount})</span>
                      </button>
                    ) : (
                      <div className="flex items-center justify-center gap-1 text-[10px] text-slate-600 font-medium py-1 whitespace-nowrap">
                        <Search className="w-3 h-3 text-slate-400 shrink-0" />
                        <span>Filter Kolom</span>
                      </div>
                    )}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono-num">
                {filteredPos.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center bg-slate-50/50">
                      <div className="flex flex-col items-center justify-center gap-2 max-w-md mx-auto">
                        <Search className="w-8 h-8 text-slate-400" />
                        <p className="text-sm font-bold text-slate-800">Tidak Ada Data PO Yang Cocok</p>
                        <p className="text-xs text-slate-500">
                          Tidak ditemukan Purchase Order yang sesuai dengan kriteria pencarian kolom atau kata kunci global.
                        </p>
                        {isAnyColFilterActive && (
                          <button
                            type="button"
                            onClick={handleResetColFilters}
                            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-lg shadow-2xs transition-colors cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Reset Semua Filter Kolom
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedPos.map((po) => {
                    const pct = po.targetTonnage > 0 ? (po.receivedTonnage / po.targetTonnage) * 100 : 0;
                    const remaining = Math.max(0, po.targetTonnage - po.receivedTonnage);
                    const poSchedules = schedules.filter((s) => s.poId === po.id);
                    const count = poSchedules.length;
                    const isFull = count >= 20;

                    return (
                      <tr key={po.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="font-bold text-amber-800 block text-xs tracking-wide">
                          {po.poNumber}
                        </span>
                        <span className="text-[11px] text-slate-600 font-sans block mt-0.5">
                          {po.contractDate}
                        </span>
                      </td>

                      <td className="px-3 py-2.5 font-sans max-w-[200px]">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-slate-900 text-xs leading-snug">{po.supplierName}</span>
                          <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-100 text-slate-700 font-mono-num border border-slate-300 shrink-0">
                            {po.supplierCode}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-600 block truncate mt-0.5" title={po.destinationStockpile}>
                          {po.destinationStockpile}
                        </span>
                      </td>

                      <td className="px-2.5 py-2.5 text-right whitespace-nowrap font-bold text-slate-900">
                        {po.targetTonnage.toLocaleString('id-ID')} Kg
                      </td>

                      <td className="px-2.5 py-2.5 text-right whitespace-nowrap font-bold text-emerald-800">
                        {po.receivedTonnage.toLocaleString('id-ID')} Kg
                      </td>

                      <td className="px-2.5 py-2.5 text-right whitespace-nowrap font-bold text-amber-800">
                        {remaining.toLocaleString('id-ID')} Kg
                      </td>

                      <td className="px-2.5 py-2.5 font-sans">
                        <div className="flex justify-between gap-2 text-[11px] font-mono-num mb-1">
                          <span className="text-slate-900 font-semibold">{pct.toFixed(1)}%</span>
                          <span className="text-[10px] text-slate-600 whitespace-nowrap">Tol. ±{po.tolerancePercentage}%</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-300">
                          <div
                            className="bg-amber-500 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>
                      </td>

                      <td className="px-2.5 py-2.5 text-center whitespace-nowrap font-sans">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold ${
                          isFull 
                            ? 'bg-rose-50 text-rose-800 border border-rose-300' 
                            : 'bg-slate-100 text-slate-700 border border-slate-300'
                        }`}>
                          <Calendar className="w-3 h-3 text-amber-600" />
                          <span className="font-mono-num">{count}/20 Rit</span>
                        </span>
                      </td>

                      <td className="px-2.5 py-2.5 text-center whitespace-nowrap font-sans">
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded border ${
                          po.status === 'ACTIVE'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                            : 'bg-slate-100 text-slate-600 border-slate-300'
                        }`}>
                          {po.status}
                        </span>
                      </td>

                      <td className="px-3 py-2.5 whitespace-nowrap font-sans">
                        <div className="flex flex-col gap-1.5 w-full min-w-[132px]">
                          <button
                            type="button"
                            onClick={() => onCreateScheduleForPo(po)}
                            disabled={isFull || !isAdmin}
                            className={`w-full inline-flex items-center justify-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-colors ${
                              isFull || !isAdmin
                                ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                                : 'bg-amber-500/10 hover:bg-amber-500 hover:text-slate-950 text-amber-800 border-amber-500/30 shadow-xs cursor-pointer'
                            }`}
                            title={
                              !isAdmin
                                ? 'Hanya Admin yang dapat membuat jadwal'
                                : isFull
                                  ? 'Maksimal 20 data jadwal tercapai'
                                  : 'Buat jadwal kedatangan untuk PO ini'
                            }
                          >
                            <Plus className="w-3 h-3 shrink-0" />
                            <span>Buat Jadwal</span>
                          </button>

                          {isAdmin && (
                            <div className="grid grid-cols-2 gap-1.5 w-full">
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(po)}
                                className="inline-flex items-center justify-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-lg border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500 hover:text-slate-950 text-sky-700 transition-colors shadow-xs cursor-pointer"
                                title="Edit data Purchase Order ini"
                              >
                                <Pencil className="w-3 h-3 shrink-0" />
                                <span>Edit</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleOpenDeleteModal(po)}
                                className="inline-flex items-center justify-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-200 text-rose-800 transition-colors shadow-xs cursor-pointer"
                                title="Hapus data Purchase Order ini"
                              >
                                <Trash2 className="w-3 h-3 shrink-0" />
                                <span>Hapus</span>
                              </button>
                            </div>
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

          {/* Pagination Bar Tabel PO (Maks 10 per halaman) */}
          {sortedPos.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-white border-t border-slate-300 text-xs">
              <div className="text-slate-600 font-medium">
                Menampilkan <span className="font-bold text-slate-900 font-mono-num">{startIndex + 1}</span> - <span className="font-bold text-slate-900 font-mono-num">{endIndex}</span> dari <span className="font-bold text-slate-900 font-mono-num">{sortedPos.length}</span> data PO
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={safeCurrentPage <= 1}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                    safeCurrentPage <= 1
                      ? 'opacity-40 cursor-not-allowed bg-slate-50 text-slate-400 border-slate-200'
                      : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300 cursor-pointer shadow-2xs'
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
                        return <span key={pageNum} className="px-1 text-slate-400 font-mono-num">...</span>;
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
                            : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-300'
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
                      ? 'opacity-40 cursor-not-allowed bg-slate-50 text-slate-400 border-slate-200'
                      : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300 cursor-pointer shadow-2xs'
                  }`}
                >
                  <span>Selanjutnya</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ======================== GRID KARTU PO ======================== */
        filteredPos.length === 0 ? (
          <div className="bg-white border border-slate-300 rounded-xl p-10 text-center space-y-3 shadow-xs">
            <Search className="w-8 h-8 mx-auto text-slate-400" />
            <h4 className="text-sm font-bold text-slate-800">Tidak Ada Data PO Yang Cocok</h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Tidak ditemukan Purchase Order yang sesuai dengan kriteria pencarian kolom atau kata kunci global.
            </p>
            {isAnyColFilterActive && (
              <button
                type="button"
                onClick={handleResetColFilters}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-lg shadow-2xs transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Semua Filter Kolom
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {paginatedPos.map((po) => {
            const pct = po.targetTonnage > 0 ? (po.receivedTonnage / po.targetTonnage) * 100 : 0;
            const remaining = Math.max(0, po.targetTonnage - po.receivedTonnage);

            return (
              <div
                key={po.id}
                className="bg-white border border-slate-300 rounded-xl p-5 shadow-xs hover:border-slate-400 transition-all flex flex-col justify-between"
              >
                <div>
                  {/* PO Header */}
                  <div className="flex justify-between items-start mb-3 pb-3 border-b border-slate-200">
                    <div>
                      <span className="font-mono-num text-sm font-bold text-amber-800 tracking-wide">
                        {po.poNumber}
                      </span>
                      <h3 className="text-sm font-bold text-slate-900 mt-0.5">
                        {po.supplierName}
                      </h3>
                    </div>
                    <span className="px-2 py-0.5 text-[11px] font-semibold bg-emerald-50 text-emerald-800 rounded border border-emerald-300">
                      {po.status}
                    </span>
                  </div>

                  {/* Tonnage Progress */}
                  <div className="space-y-1.5 mb-4">
                    <div className="flex justify-between text-xs font-mono-num">
                      <span className="text-slate-600">Progress Realisasi:</span>
                      <span className="font-bold text-slate-900">{pct.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden border border-slate-300">
                      <div
                        className="bg-amber-500 h-2.5 rounded-full transition-all"
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-1 pt-1 text-[11px] font-mono-num text-slate-700">
                      <div>
                        <span className="text-slate-500 block text-[10px]">Qty PO</span>
                        <strong className="text-slate-900">{po.targetTonnage.toLocaleString('id-ID')} Kg</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">Diterima</span>
                        <strong className="text-emerald-800">{po.receivedTonnage.toLocaleString('id-ID')} Kg</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px]">Sisa</span>
                        <strong className="text-amber-800">{remaining.toLocaleString('id-ID')} Kg</strong>
                      </div>
                    </div>
                  </div>

                  {/* Stockpile & Contract Strip */}
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 mb-4 text-xs">
                    <div className="text-[11px] font-semibold text-slate-600 mb-1 flex items-center justify-between">
                      <span>Tujuan Stockpile:</span>
                      <span className="text-amber-800 font-mono-num font-bold">Toleransi: ±{po.tolerancePercentage}%</span>
                    </div>
                    <p className="text-slate-900 font-semibold truncate">{po.destinationStockpile}</p>
                  </div>

                  <div className="text-xs text-slate-600 space-y-1 mb-4">
                    <div>Tanggal PO: <span className="text-slate-900 font-semibold font-mono-num">{po.contractDate}</span></div>
                    {po.notes && <div className="text-[11px] text-slate-500 italic">Keterangan: "{po.notes}"</div>}
                  </div>
                </div>

                {/* Schedule count and Bottom Action */}
                <div className="pt-3 border-t border-slate-200 space-y-2">
                  {(() => {
                    const poSchedules = schedules.filter((s) => s.poId === po.id);
                    const count = poSchedules.length;
                    const isFull = count >= 20;

                    return (
                      <>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-400 flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-amber-400" />
                            Jadwal Pengiriman:
                          </span>
                          <span className={`font-mono-num font-semibold ${isFull ? 'text-rose-400' : 'text-amber-400'}`}>
                            {count} / 20 data {isFull && '(Maks Penuh)'}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => onCreateScheduleForPo(po)}
                          disabled={isFull || !isAdmin}
                          className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors ${
                            isFull || !isAdmin
                              ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                              : 'bg-amber-500/10 hover:bg-amber-500 hover:text-slate-950 text-amber-800 border-amber-500/30 cursor-pointer'
                          }`}
                          title={isFull ? 'Maksimal 20 data jadwal telah tercapai untuk PO ini' : 'Buat jadwal pengiriman untuk PO ini'}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>{isFull ? 'Kuota Jadwal Penuh (20/20)' : 'Buat Jadwal Pengiriman'}</span>
                        </button>

                        {isAdmin && (
                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(po)}
                              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500 hover:text-slate-950 text-sky-700 transition-colors shadow-xs cursor-pointer"
                              title="Edit data PO ini"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              <span>Edit PO</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenDeleteModal(po)}
                              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-200 text-rose-800 transition-colors shadow-xs cursor-pointer"
                              title="Hapus data PO ini"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Hapus PO</span>
                            </button>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            );
          })}
        </div>

            {/* Pagination Bar Grid PO (Maks 10 per halaman) */}
            {sortedPos.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-white border border-slate-300 rounded-xl text-xs shadow-xs">
                <div className="text-slate-600 font-medium">
                  Menampilkan <span className="font-bold text-slate-900 font-mono-num">{startIndex + 1}</span> - <span className="font-bold text-slate-900 font-mono-num">{endIndex}</span> dari <span className="font-bold text-slate-900 font-mono-num">{sortedPos.length}</span> data PO
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={safeCurrentPage <= 1}
                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                      safeCurrentPage <= 1
                        ? 'opacity-40 cursor-not-allowed bg-slate-50 text-slate-400 border-slate-200'
                        : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300 cursor-pointer shadow-2xs'
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
                          return <span key={pageNum} className="px-1 text-slate-400 font-mono-num">...</span>;
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
                              : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-300'
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
                        ? 'opacity-40 cursor-not-allowed bg-slate-50 text-slate-400 border-slate-200'
                        : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300 cursor-pointer shadow-2xs'
                    }`}
                  >
                    <span>Selanjutnya</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      )}

      {/* Modal Multi-Supplier Create PO (Maksimal 5 Supplier) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
          <div className="bg-white border border-slate-300 rounded-2xl max-w-3xl w-full p-4 sm:p-6 shadow-2xl my-4 sm:my-8 max-h-[92vh] flex flex-col text-slate-900">
            {/* Modal Header */}
            <div className="flex justify-between items-center pb-3 border-b border-slate-200 mb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <FileText className="w-5 h-5 text-amber-600" />
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-wide flex items-center gap-2">
                    Input PO
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Input hingga maksimal 5 supplier batubara secara bersamaan dalam 1 form.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-300">
                  <Users className="w-3.5 h-3.5 text-amber-700" />
                  <span>{supplierItems.length} dari Maks 5 Supplier</span>
                </span>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="text-slate-500 hover:text-slate-900 text-xl font-bold px-2 py-1 cursor-pointer transition-colors"
                >
                  &times;
                </button>
              </div>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto pr-1 space-y-4">
              {createError && (
                <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs font-semibold text-rose-900 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{createError}</span>
                </div>
              )}
              {/* Supplier items list */}
              <div className="space-y-4">
                {supplierItems.map((item, index) => (
                  <div
                    key={item.id}
                    className="p-4 sm:p-5 bg-slate-950/80 border border-slate-800/90 rounded-xl space-y-3 relative shadow-inner"
                  >
                    {/* Item Card Header */}
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800/70">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 font-bold text-xs flex items-center justify-center font-mono-num border border-amber-500/30">
                          {index + 1}
                        </span>
                        <h4 className="text-xs font-bold text-white tracking-wide">
                          {index === 0 ? 'Supplier Utama' : `Supplier Tambahan #${index + 1}`}
                        </h4>
                        {item.supplierName && (
                          <span className="text-[11px] text-slate-400 font-medium truncate max-w-[200px]">
                            • {item.supplierName}
                          </span>
                        )}
                      </div>

                      {supplierItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveSupplier(item.id)}
                          className="flex items-center gap-1 px-2 py-1 text-[11px] text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 rounded transition-colors"
                          title="Hapus baris supplier ini"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Hapus</span>
                        </button>
                      )}
                    </div>

                    {/* Inputs Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">
                          Nomor PO *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="Contoh: PO/BAP/2026/03-001"
                          value={item.poNumber}
                          onChange={(e) => handleItemChange(item.id, 'poNumber', e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono-num"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">
                          Tanggal PO *
                        </label>
                        <input
                          type="date"
                          required
                          value={item.contractDate}
                          onChange={(e) => handleItemChange(item.id, 'contractDate', e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono-num"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">
                          Nama Supplier *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="Contoh: PT Bukit Asam Prima Mandiri"
                          value={item.supplierName}
                          onChange={(e) => handleItemChange(item.id, 'supplierName', e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">
                          Kode Supplier
                        </label>
                        <input
                          type="text"
                          placeholder="Contoh: BAP"
                          value={item.supplierCode}
                          onChange={(e) => handleItemChange(item.id, 'supplierCode', e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 uppercase font-mono-num"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">
                          Qty PO (Kg) *
                        </label>
                        <input
                          type="number"
                          required
                          min={1}
                          placeholder="Contoh: 300000"
                          value={item.targetTonnage}
                          onChange={(e) => handleItemChange(item.id, 'targetTonnage', e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono-num"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">
                          Toleransi Susut Bobot (%) *
                        </label>
                        <input
                          type="number"
                          step="0.05"
                          required
                          value={item.tolerancePercentage}
                          onChange={(e) => handleItemChange(item.id, 'tolerancePercentage', e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono-num"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Keterangan
                      </label>
                      <input
                        type="text"
                        placeholder="Contoh: Pengiriman via armada tronton dump"
                        value={item.notes}
                        onChange={(e) => handleItemChange(item.id, 'notes', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Action Button: Add Supplier Manually */}
              {supplierItems.length < 5 ? (
                <button
                  type="button"
                  onClick={handleAddSupplier}
                  className="w-full py-3 px-4 bg-slate-950 hover:bg-slate-800 border-2 border-dashed border-amber-500/40 hover:border-amber-400 text-amber-400 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-xs group"
                >
                  <Plus className="w-4 h-4 group-hover:scale-125 transition-transform" />
                  <span>
                    + Tambahkan Data Input PO Secara Manual ({supplierItems.length + 1}/5 Supplier)
                  </span>
                </button>
              ) : (
                <div className="text-center py-2.5 px-4 bg-slate-950/70 border border-slate-800 rounded-xl text-xs text-slate-400 flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Maksimal 5 supplier per proses input telah tercapai.</span>
                </div>
              )}

              {/* Modal Footer Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200 shrink-0">
                <div className="text-xs text-slate-700 font-mono-num">
                  Total Supplier: <strong className="text-slate-900 font-bold">{supplierItems.length}</strong> | 
                  Total Qty: <strong className="text-amber-700 font-bold ml-1">{totalBatchTonnage > 0 ? `${totalBatchTonnage.toLocaleString('id-ID')} Kg` : '-'}</strong>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-lg transition-colors shadow-sm flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>
                      {supplierItems.length > 1
                        ? `Simpan & Terbitkan ${supplierItems.length} PO Sekaligus`
                        : 'Simpan & Terbitkan PO'}
                    </span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== MODAL EDIT PURCHASE ORDER ===================== */}
      {editingPo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl my-4 max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="flex justify-between items-center pb-3 border-b border-slate-200 mb-4 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-sky-50 text-sky-600 border border-sky-200">
                  <Pencil className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 tracking-tight">
                    Edit Purchase Order (PO)
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Perbarui rincian kontrak, kuota tonase, dan status PO <strong className="text-amber-800 font-mono-num">{editingPo.poNumber}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingPo(null)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveEdit} className="space-y-4 overflow-y-auto pr-1 flex-1">
              {editError && (
                <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs font-semibold text-rose-900 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{editError}</span>
                </div>
              )}
              {/* Sync Notice Badge */}
              <div className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs">
                <FileSpreadsheet className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>
                  Perubahan data PO ini akan otomatis disinkronkan ke <strong>Google Sheets</strong> (tab <em>DATA_PURCHASE_ORDER</em>).
                </span>
              </div>

              {/* Main Fields Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                    Nomor PO <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editFormData.poNumber}
                    onChange={(e) => setEditFormData({ ...editFormData, poNumber: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-amber-700 font-bold focus:outline-none focus:border-amber-500 font-mono-num"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                    Tanggal Kontrak PO <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={editFormData.contractDate}
                    onChange={(e) => setEditFormData({ ...editFormData, contractDate: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-amber-500 font-mono-num"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                    Nama Supplier Batubara <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editFormData.supplierName}
                    onChange={(e) => setEditFormData({ ...editFormData, supplierName: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                    Kode Supplier (Singkatan)
                  </label>
                  <input
                    type="text"
                    value={editFormData.supplierCode}
                    onChange={(e) => setEditFormData({ ...editFormData, supplierCode: e.target.value.toUpperCase() })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 font-mono-num uppercase focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                    Target Qty PO (Kg) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={editFormData.targetTonnage}
                    onChange={(e) => setEditFormData({ ...editFormData, targetTonnage: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-amber-700 font-bold focus:outline-none focus:border-amber-500 font-mono-num"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                    Toleransi Susut Bobot (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={editFormData.tolerancePercentage}
                    onChange={(e) => setEditFormData({ ...editFormData, tolerancePercentage: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-amber-500 font-mono-num"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                    Stockpile Tujuan
                  </label>
                  <input
                    type="text"
                    value={editFormData.destinationStockpile}
                    onChange={(e) => setEditFormData({ ...editFormData, destinationStockpile: e.target.value })}
                    placeholder="Contoh: Stockpile Utama - A1"
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                    Status PO
                  </label>
                  <select
                    value={editFormData.status}
                    onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value as any })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-amber-500 font-semibold"
                  >
                    <option value="ACTIVE">ACTIVE (Aktif Menerima Pengiriman)</option>
                    <option value="CLOSED">CLOSED (Selesai/Tutup)</option>
                    <option value="HOLD">HOLD (Ditangguhkan)</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                    Catatan / Instruksi Pengadaan
                  </label>
                  <input
                    type="text"
                    value={editFormData.notes}
                    onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                    placeholder="Instruksi khusus pengiriman atau keterangan kontrak..."
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 shrink-0">
                <button
                  type="button"
                  onClick={() => setEditingPo(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-lg transition-colors shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Simpan Perubahan & Sinkronkan</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== MODAL KONFIRMASI HAPUS PO ===================== */}
      {deletingPo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3">
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white border border-rose-200 rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-4 text-slate-900"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-200 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 tracking-tight">
                  Hapus Purchase Order?
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Tindakan ini akan menghapus data PO dan memperbarui data sistem.
                </p>
              </div>
            </div>

            {/* Detail Box */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-600">Nomor PO:</span>
                <span className="font-bold text-amber-700 font-mono-num">{deletingPo.poNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Nama Supplier:</span>
                <span className="font-semibold text-slate-900">{deletingPo.supplierName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Target Kuota:</span>
                <span className="font-mono-num text-slate-900">{deletingPo.targetTonnage.toLocaleString('id-ID')} Kg</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Realisasi Diterima:</span>
                <span className="font-mono-num text-emerald-700">{deletingPo.receivedTonnage.toLocaleString('id-ID')} Kg</span>
              </div>
            </div>

            {/* Check related schedules & transactions */}
            {(() => {
              const connectedCount = schedules.filter((s) => s.poId === deletingPo.id).length;
              const linkedTxCount = transactions.filter((t) => t.poId === deletingPo.id).length;
              return (
                <>
                  {linkedTxCount > 0 && (
                    <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs text-rose-900 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <div>
                        <strong>Penghapusan Diblokir:</strong> Terdapat <strong>{linkedTxCount} riwayat transaksi operasional</strong> yang terhubung ke PO ini. Demi integritas jejak audit, tutup kontrak menjadi <strong>CLOSED</strong> daripada menghapus PO.
                      </div>
                    </div>
                  )}
                  {connectedCount > 0 && linkedTxCount === 0 && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <span>
                        <strong>Perhatian:</strong> Terdapat <strong>{connectedCount} jadwal kedatangan</strong> terkait PO ini yang juga akan dihapus.
                      </span>
                    </div>
                  )}

                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      Perubahan pada Purchase Order ini akan otomatis tersinkron ke sistem &amp; Google Sheets.
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setDeletingPo(null)}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Batal
                    </button>
                    {linkedTxCount > 0 && onUpdatePo ? (
                      <button
                        type="button"
                        onClick={() => {
                          onUpdatePo({ ...deletingPo, status: 'CLOSED' });
                          setDeletingPo(null);
                        }}
                        className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Tutup Kontrak (CLOSED)</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleConfirmDelete}
                        disabled={linkedTxCount > 0}
                        className="px-4 py-2 bg-rose-100 hover:bg-rose-200 text-rose-900 border border-rose-300 font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Ya, Hapus PO & Sinkronkan</span>
                      </button>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};
