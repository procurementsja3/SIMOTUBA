import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Truck, 
  Scale, 
  Plus, 
  Search, 
  Building2, 
  ArrowRight, 
  CheckCircle2, 
  AlertTriangle, 
  Layers, 
  FileText, 
  Printer, 
  Clock, 
  Calendar,
  X
} from 'lucide-react';
import { CoalTransaction, PurchaseOrder, ArrivalSchedule } from '../types/coal';
import { calculateDuration } from '../utils/timeUtils';
import { getScheduleRitDetails } from '../utils/ritUtils';
import { TransactionTimelineModal } from './TransactionTimelineModal';

interface PosSecurityProps {
  transactions: CoalTransaction[];
  purchaseOrders: PurchaseOrder[];
  schedules: ArrivalSchedule[];
  onCheckInTruck: (newTx: CoalTransaction) => void;
  onAdvanceToWeighIn: (txId: string) => void;
  preselectedSchedule?: ArrivalSchedule | null;
  onCompleteGateOut?: (txId: string, officerName: string, gateOutTimeIso?: string) => void;
  onOpenTicket?: (tx: CoalTransaction) => void;
  initialSubTab?: 'GATE_IN' | 'GATE_OUT';
}

const getLocalDateStr = (d = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getLocalTimeStr = (d = new Date()) => {
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

const isSameLocalDate = (isoString?: string, refDate = new Date()) => {
  if (!isoString) return false;
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) return false;
  return (
    parsed.getFullYear() === refDate.getFullYear() &&
    parsed.getMonth() === refDate.getMonth() &&
    parsed.getDate() === refDate.getDate()
  );
};

const getScheduleRitLabel = (sch: ArrivalSchedule, allSchedules: ArrivalSchedule[]) => {
  const poSchedules = allSchedules.filter((s) => s.poId === sch.poId);
  const ritIndex = poSchedules.findIndex((s) => s.id === sch.id) + 1;
  const fallbackRit = `Pengiriman Rit Ke-${ritIndex > 0 ? ritIndex : 1}`;
  if (sch.remarks && /\bRIT\b/i.test(sch.remarks)) {
    return sch.remarks.trim();
  }
  return sch.remarks && sch.remarks.trim()
    ? `${fallbackRit} · ${sch.remarks.trim()}`
    : fallbackRit;
};

export const PosSecurity: React.FC<PosSecurityProps> = ({
  transactions,
  purchaseOrders,
  schedules,
  onCheckInTruck,
  onAdvanceToWeighIn,
  preselectedSchedule,
  onCompleteGateOut,
  onOpenTicket,
  initialSubTab = 'GATE_IN',
}) => {
  const [subTab, setSubTab] = useState<'GATE_IN' | 'GATE_OUT'>(initialSubTab);
  const [searchTerm, setSearchTerm] = useState('');
  const [isCheckInOpen, setIsCheckInOpen] = useState(false);
  const [checkInError, setCheckInError] = useState<string | null>(null);
  const [historyScope, setHistoryScope] = useState<'TODAY' | 'ALL'>('TODAY');
  const [timelineModalTx, setTimelineModalTx] = useState<CoalTransaction | null>(null);
  const [gateOutOperators, setGateOutOperators] = useState<Record<string, string>>({});
  const [gateOutOperatorErrors, setGateOutOperatorErrors] = useState<Record<string, boolean>>({});
  const [gateOutDates, setGateOutDates] = useState<Record<string, string>>({});
  const [gateOutTimes, setGateOutTimes] = useState<Record<string, string>>({});

  // Form State
  const [formData, setFormData] = useState<{
    poId: string;
    scheduleId: string;
    gateInDate: string; // Tanggal Masuk Gerbang (Check-In)
    gateInTime: string; // Jam Masuk Gerbang (Check-In)
    vehiclePlate: string;
    driverName: string;
    driverPhone: string;
    driverIdNumber: string;
    transporterName: string;
    tarpCondition: 'BAIK_RAPAT' | 'RUSAK_ROBEK' | 'TANPA_TERPAL';
    securityOfficer: string;
    securityNotes: string;
    suratJalanNumber: string;
    scheduledDeliveryDate: string; // Tanggal Jadwal Pengiriman Sistem (dari sistem jadwal kirim)
    suratJalanWeightKg: string | number;
  }>({
    poId: purchaseOrders[0]?.id || '',
    scheduleId: '',
    gateInDate: getLocalDateStr(),
    gateInTime: getLocalTimeStr(),
    vehiclePlate: '',
    driverName: '',
    driverPhone: '',
    driverIdNumber: '',
    transporterName: '',
    tarpCondition: 'BAIK_RAPAT',
    securityOfficer: '', // Kosong untuk penulisan manual
    securityNotes: '',
    suratJalanNumber: '',
    scheduledDeliveryDate: getLocalDateStr(),
    suratJalanWeightKg: '', // Kosong untuk penulisan manual
  });

  const activePos = purchaseOrders.filter((p) => p.status === 'ACTIVE');

  // Sync subTab if initialSubTab prop changes
  useEffect(() => {
    if (initialSubTab) {
      setSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  // Handle preselected schedule passed from Jadwal Kedatangan
  useEffect(() => {
    if (preselectedSchedule) {
      const schDate = preselectedSchedule.etaDateTime
        ? (preselectedSchedule.etaDateTime.includes('T') ? preselectedSchedule.etaDateTime.split('T')[0] : preselectedSchedule.etaDateTime)
        : new Date().toISOString().slice(0, 10);

      setFormData((prev) => ({
        ...prev,
        poId: preselectedSchedule.poId,
        scheduleId: preselectedSchedule.id,
        gateInDate: getLocalDateStr(),
        gateInTime: getLocalTimeStr(),
        scheduledDeliveryDate: schDate,
        // Dikosongkan agar diisikan secara manual
        suratJalanWeightKg: '',
        securityOfficer: '',
      }));
      setSubTab('GATE_IN');
      setIsCheckInOpen(true);
    }
  }, [preselectedSchedule]);

  // Trucks currently at TIMBANG_MASUK
  const inboundTrucks = transactions.filter((t) => t.status === 'TIMBANG_MASUK');

  // Trucks ready for Gate Out (have completed tare weigh-out)
  const gateOutWaitingTrucks = transactions.filter((t) => t.status === 'GATE_OUT');

  // Completed trucks that exited
  const completedTrucks = transactions.filter((t) => t.status === 'COMPLETED');
  const completedTodayTrucks = completedTrucks.filter((t) =>
    isSameLocalDate(t.gateOutTime || t.gateInTime)
  );
  const displayedCompletedTrucks =
    historyScope === 'TODAY' ? completedTodayTrucks : completedTrucks;

  // Schedules ready for Gate In
  const pendingSchedules = schedules.filter(
    (s) => s.status === 'ON_WAY' || s.status === 'SCHEDULED' || s.status === 'OVERDUE'
  );

  const selectedSchedule = schedules.find((s) => s.id === formData.scheduleId) || null;
  const selectedScheduleRitLabel = selectedSchedule
    ? getScheduleRitLabel(selectedSchedule, schedules)
    : null;

  const handleSelectSchedule = (schId: string) => {
    const found = schedules.find((s) => s.id === schId);
    if (!found) {
      setFormData((prev) => ({
        ...prev,
        scheduleId: '',
      }));
      return;
    }
    const schDate = found.etaDateTime
      ? (found.etaDateTime.includes('T') ? found.etaDateTime.split('T')[0] : found.etaDateTime)
      : new Date().toISOString().slice(0, 10);

    setFormData((prev) => ({
      ...prev,
      scheduleId: found.id,
      poId: found.poId,
      scheduledDeliveryDate: schDate,
      // Dikosongkan agar diisikan secara manual
      suratJalanWeightKg: '',
      securityOfficer: '',
    }));
  };

  const handleOpenCheckInForSchedule = (sch: ArrivalSchedule) => {
    const schDate = sch.etaDateTime
      ? (sch.etaDateTime.includes('T') ? sch.etaDateTime.split('T')[0] : sch.etaDateTime)
      : new Date().toISOString().slice(0, 10);

    setFormData((prev) => ({
      ...prev,
      scheduleId: sch.id,
      poId: sch.poId,
      gateInDate: getLocalDateStr(),
      gateInTime: getLocalTimeStr(),
      scheduledDeliveryDate: schDate,
      // Dikosongkan agar diisikan secara manual
      suratJalanWeightKg: '',
      securityOfficer: '',
    }));
    setCheckInError(null);
    setIsCheckInOpen(true);
  };

  const handleCheckInSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCheckInError(null);
    const selectedPo = purchaseOrders.find((p) => p.id === formData.poId);
    if (!selectedPo) {
      setCheckInError('Pilih Purchase Order yang valid sebelum melakukan Check-In.');
      return;
    }
    if (!formData.vehiclePlate.trim() || !formData.driverName.trim()) {
      setCheckInError('Nomor Polisi (Plat Truk) dan Nama Driver wajib diisi.');
      return;
    }

    const now = new Date();
    const dateCode = getLocalDateStr(now).slice(2).replace(/-/g, '');
    const ticketPrefix = `WB-${dateCode}-`;
    const maxTicketSeq = transactions.reduce((max, tx) => {
      if (tx.ticketNumber?.startsWith(ticketPrefix)) {
        const seq = parseInt(tx.ticketNumber.slice(ticketPrefix.length), 10);
        if (!Number.isNaN(seq) && seq > max) return seq;
      }
      return max;
    }, 0);
    const maxQueueSeq = transactions.reduce((max, tx) => {
      const m = tx.queueNumber?.match(/^Q-(\d+)$/i);
      if (m) {
        const seq = parseInt(m[1], 10);
        if (!Number.isNaN(seq) && seq > max) return seq;
      }
      return max;
    }, 0);
    const ticketNumber = `${ticketPrefix}${String(maxTicketSeq + 1).padStart(3, '0')}`;
    const queueNumber = `Q-${String(maxQueueSeq + 1).padStart(3, '0')}`;

    const matchedSchedule = schedules.find((s) => s.id === formData.scheduleId);
    const matchedRit = matchedSchedule ? getScheduleRitDetails(matchedSchedule, schedules) : null;

    const newTransaction: CoalTransaction = {
      id: `TRX-${Date.now()}`,
      ticketNumber,
      queueNumber,
      scheduleId: formData.scheduleId || undefined,
      poId: selectedPo.id,
      poNumber: selectedPo.poNumber,
      supplierName: selectedPo.supplierName,
      transporterName: formData.transporterName,
      vehiclePlate: formData.vehiclePlate.toUpperCase().trim(),
      driverName: formData.driverName,
      driverPhone: formData.driverPhone,
      driverIdNumber: formData.driverIdNumber || `ID-${Math.floor(100000 + Math.random() * 900000)}`,
      
      // Pos Security (Gate In)
      gateInTime: (() => {
        const dateObj = new Date();
        if (formData.gateInDate) {
          const [y, m, d] = formData.gateInDate.split('-').map(Number);
          if (y && m && d) {
            dateObj.setFullYear(y, m - 1, d);
          }
        }
        if (formData.gateInTime) {
          const [hh, mm] = formData.gateInTime.split(':').map(Number);
          if (!Number.isNaN(hh) && !Number.isNaN(mm)) {
            dateObj.setHours(hh, mm, 0, 0);
          }
        }
        return dateObj.toISOString();
      })(),
      securityOfficer: formData.securityOfficer,
      tarpCondition: formData.tarpCondition,
      securityNotes: formData.securityNotes,

      // Initial Surat Jalan info & Jadwal Kirim
      suratJalanNumber: formData.suratJalanNumber,
      suratJalanDate: formData.scheduledDeliveryDate || formData.gateInDate || getLocalDateStr(),
      scheduledDeliveryDate: formData.scheduledDeliveryDate || formData.gateInDate || getLocalDateStr(),
      suratJalanWeight: Number(formData.suratJalanWeightKg) || 0,
      suratJalanVerified: false,
      ritCategory: matchedRit?.ritCategory,
      ritRemarks: matchedRit?.ritRemarks,

      grossWeight: 0,
      tareWeight: 0,
      nettoWeight: 0,
      nettoTons: 0,
      weightDifference: 0,
      shrinkagePercentage: 0,

      // Langsung masuk status TIMBANG_MASUK sesuai alur otomasi sistem
      status: 'TIMBANG_MASUK',
      syncedToGoogleSheet: false,
    };

    onCheckInTruck(newTransaction);
    setIsCheckInOpen(false);

    // Reset plate and driver (biarkan berat & petugas kosong untuk penulisan manual berikutnya)
    setFormData((prev) => ({
      ...prev,
      gateInDate: getLocalDateStr(),
      gateInTime: getLocalTimeStr(),
      vehiclePlate: '',
      driverName: '',
      driverPhone: '',
      scheduleId: '',
      suratJalanNumber: `SJ-${Math.floor(1000 + Math.random() * 9000)}`,
      suratJalanWeightKg: '',
      securityOfficer: '',
    }));
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-amber-500" />
            {subTab === 'GATE_IN' ? 'REGISTRASI IN - GATE IN' : 'REGISTRASI OUT - GATE OUT'}
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Gerbang masuk & keluar: Pendataan kedatangan armada sesuai PO, penerbitan nomor antrean, dan penyelesaian checkout keluar beserta durasi operasional pabrik.
          </p>
        </div>

        {subTab === 'GATE_IN' && (
          <button
            type="button"
            onClick={() => {
              setFormData((prev) => ({
                ...prev,
                scheduleId: '',
                gateInDate: getLocalDateStr(),
                gateInTime: getLocalTimeStr(),
              }));
              setCheckInError(null);
              setIsCheckInOpen(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-lg transition-colors shadow-sm whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Check-In Armada Tiba di Gerbang</span>
          </button>
        )}
      </div>

      {/* Sub-Tabs: Gate In vs Gate Out */}
      <div className="w-full overflow-x-auto scrollbar-none pb-1">
        <div className="inline-flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 min-w-max text-xs">
          <button
            type="button"
            onClick={() => setSubTab('GATE_IN')}
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
              subTab === 'GATE_IN'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>1. Gate In<span className="hidden sm:inline"> (Kedatangan Armada Baru)</span></span>
            <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-950/40 text-current font-mono-num">
              {pendingSchedules.length} Jadwal Siap
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('GATE_OUT')}
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
              subTab === 'GATE_OUT'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Truck className="w-4 h-4" />
            <span>2. Gate Out<span className="hidden sm:inline"> (Pengeluaran & Penyelesaian Akhir)</span></span>
            {gateOutWaitingTrucks.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-500 text-white animate-pulse font-mono-num">
                {gateOutWaitingTrucks.length} Siap Keluar
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* VIEW 1: GATE IN (MASUK GERBANG)                          */}
      {/* ======================================================== */}
      {subTab === 'GATE_IN' && (
        <div className="space-y-6">
          {/* Scheduled Trucks Ready for Gate-In */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-900 tracking-wide uppercase flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-amber-500" />
                  INPUT REGISTRASI
                </h3>
                <p className="text-xs text-slate-600">
                  Data jadwal yang dibuat di sistem langsung masuk ke sini untuk diproses masuk gerbang oleh Security
                </p>
              </div>
              <span className="text-xs font-mono-num font-bold text-amber-400 bg-slate-950 px-2.5 py-1 rounded border border-slate-800">
                {pendingSchedules.length} Jadwal Menunggu
              </span>
            </div>

            {pendingSchedules.length === 0 ? (
              <div className="text-center py-6 text-slate-500 text-xs">
                Tidak ada jadwal kedatangan aktif yang menunggu masuk gerbang.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {pendingSchedules.map((sch) => {
                  const ritDisplay = getScheduleRitLabel(sch, schedules);

                  return (
                    <div
                      key={sch.id}
                      className="p-3.5 bg-slate-950/80 rounded-lg border border-slate-800 hover:border-slate-700 transition-colors flex flex-col justify-between"
                    >
                      <div className="space-y-1 mb-3">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-bold text-amber-400">{sch.poNumber}</span>
                          <span className="text-[10px] font-mono bg-slate-900 px-1.5 py-0.5 rounded text-slate-400 border border-slate-800">{sch.id}</span>
                        </div>
                        <div className="text-xs font-semibold text-slate-900 truncate">{sch.supplierName}</div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1 font-mono-num">
                          <Calendar className="w-3 h-3 text-amber-500" />
                          <span>ETA: {sch.etaDateTime.includes('T') ? sch.etaDateTime.split('T')[0] : sch.etaDateTime}</span>
                        </div>
                        <div className="text-[11px] text-emerald-400 font-semibold font-mono-num">
                          Estimasi: {Number(sch.estimatedTonnage).toLocaleString('id-ID')} Kg ({sch.estimatedTruckCount || 1} Armada)
                        </div>
                        <div className="pt-0.5">
                          <span className="inline-block text-[11px] font-bold text-amber-900 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded">
                            {ritDisplay}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleOpenCheckInForSchedule(sch)}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-lg transition-colors shadow-sm cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Check-In Armada Ini (Isi Nopol)</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recently Checked-In Trucks -> Already forwarded to Inbound Weighbridge */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-900 tracking-wide uppercase flex items-center gap-2">
                  <Scale className="w-4 h-4 text-blue-600" />
                  RIWAYAT REGISTRASI
                </h3>
                <p className="text-xs text-slate-600">
                  Data Nopol yang disubmit otomatis diteruskan langsung ke sistem Jembatan Timbang Masuk
                </p>
              </div>
              <span className="text-xs font-mono-num font-bold text-blue-400 bg-slate-950 px-2.5 py-1 rounded border border-slate-800">
                {inboundTrucks.length} Truk di Timbangan Masuk
              </span>
            </div>

            {inboundTrucks.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <ShieldCheck className="w-10 h-10 mx-auto mb-2 text-slate-600" />
                <p className="text-sm">Tidak ada antrean truk di Timbang Masuk saat ini.</p>
                <p className="text-xs text-slate-500 mt-1">Gunakan tombol "Check-In Armada" di atas untuk mendata truk baru.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {inboundTrucks.map((tx) => {
                  const duration = calculateDuration(tx.gateInTime);
                  return (
                    <div
                      key={tx.id}
                      className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between hover:border-slate-700 transition-colors"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-mono text-base font-black text-amber-400">{tx.vehiclePlate}</span>
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-500/10 text-blue-300 border border-blue-500/30">
                            {tx.queueNumber}
                          </span>
                        </div>

                        <div className="text-xs text-slate-300 space-y-1 mb-3">
                          <div>Driver: <strong className="text-slate-900">{tx.driverName}</strong></div>
                          <div>PO: <span className="font-mono text-amber-300">{tx.poNumber}</span></div>
                          <div>Surat Jalan: <span className="font-mono text-slate-300">{tx.suratJalanNumber}</span> ({(tx.suratJalanWeight / 1000).toFixed(2)} Ton)</div>
                          <div className="text-[11px] text-slate-400 flex items-center gap-1 font-mono-num pt-1 border-t border-slate-900">
                            <Calendar className="w-3 h-3 text-amber-500" />
                            <span>{new Date(tx.gateInTime).toLocaleDateString('id-ID')}</span>
                            <span className="text-slate-600">·</span>
                            <Clock className="w-3 h-3 text-slate-500" />
                            <span>{new Date(tx.gateInTime).toLocaleTimeString('id-ID')} WIB</span>
                            <span className="text-slate-600">·</span>
                            <span className="text-amber-400 font-semibold">{duration.text}</span>
                          </div>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setTimelineModalTx(tx)}
                          className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1"
                        >
                          <Clock className="w-3.5 h-3.5 text-amber-400" />
                          <span>Timeline</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => onAdvanceToWeighIn(tx.id)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-lg transition-colors"
                        >
                          <span>Buka Timbang Masuk</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* VIEW 2: GATE OUT (PENGELUARAN & PENYELESAIAN AKHIR)      */}
      {/* ======================================================== */}
      {subTab === 'GATE_OUT' && (
        <div className="space-y-6">
          {/* Waiting for Gate Out Exit */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-900 tracking-wide uppercase flex items-center gap-2">
                  <Truck className="w-4 h-4 text-emerald-600" />
                  Tahap Akhir: Armada Selesai Timbang Keluar (Menunggu Pengeluaran Gerbang)
                </h3>
                <p className="text-xs text-slate-600">
                  Data berat netto telah selesai dihitung. Lakukan verifikasi checkout untuk pengeluaran data nopol kendaraan bahwa proses operasional telah selesai.
                </p>
              </div>
              <span className="text-xs font-mono-num font-bold text-emerald-400 bg-slate-950 px-2.5 py-1 rounded border border-slate-800">
                {gateOutWaitingTrucks.length} Truk Siap Checkout
              </span>
            </div>

            {gateOutWaitingTrucks.length === 0 ? (
              <div className="text-center py-10 text-slate-500">
                <Truck className="w-10 h-10 mx-auto mb-2 text-slate-600" />
                <p className="text-sm font-semibold text-slate-300">Tidak ada armada yang menunggu checkout keluar saat ini.</p>
                <p className="text-xs text-slate-500 mt-1">Armada yang telah menimbang tare (kosong) di Jembatan Timbang Keluar akan otomatis muncul di sini.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {gateOutWaitingTrucks.map((tx) => {
                  const duration = calculateDuration(tx.gateInTime, tx.weighOutTime);
                  return (
                    <div
                      key={tx.id}
                      className="bg-slate-950/90 border border-emerald-500/30 rounded-xl p-5 flex flex-col justify-between hover:border-emerald-500/60 transition-all shadow-sm"
                    >
                      <div>
                        {/* Header card */}
                        <div className="flex items-start justify-between pb-3 border-b border-slate-800 mb-3">
                          <div>
                            <span className="font-mono text-xl font-black text-amber-400 block tracking-wider">
                              {tx.vehiclePlate}
                            </span>
                            <span className="text-xs text-slate-600">
                              Driver: <strong className="text-slate-900">{tx.driverName}</strong> · {tx.transporterName}
                            </span>
                          </div>
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                            NETTO: {(tx.nettoTons || 0).toFixed(2)} Ton
                          </span>
                        </div>

                        {/* Weight Summary */}
                        <div className="grid grid-cols-3 gap-2 bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 font-mono-num text-xs mb-3">
                          <div>
                            <span className="text-slate-500 block text-[10px]">Gross (Isi):</span>
                            <strong className="text-slate-200">{(tx.grossWeight / 1000).toFixed(2)} T</strong>
                          </div>
                          <div>
                            <span className="text-slate-500 block text-[10px]">Tare (Kosong):</span>
                            <strong className="text-slate-200">{(tx.tareWeight / 1000).toFixed(2)} T</strong>
                          </div>
                          <div>
                            <span className="text-slate-500 block text-[10px]">Netto Bersih:</span>
                            <strong className="text-emerald-400 font-bold">{(tx.nettoTons || 0).toFixed(2)} T</strong>
                          </div>
                        </div>

                        {/* Duration Banner */}
                        <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/20 text-xs mb-3 space-y-1">
                          <div className="flex items-center justify-between text-amber-300 font-semibold">
                            <span className="flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5" />
                              Durasi Waktu di Pabrik (Gate In s.d Sekarang):
                            </span>
                            <span className="font-mono-num font-bold text-sm text-slate-900">
                              {duration.text}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono-num flex justify-between">
                            <span>Masuk Gerbang: {new Date(tx.gateInTime).toLocaleTimeString('id-ID')} WIB</span>
                            <span>Timbang Keluar: {tx.weighOutTime ? new Date(tx.weighOutTime).toLocaleTimeString('id-ID') : '-'} WIB</span>
                          </div>
                        </div>
                      </div>

                      {/* Tanggal & Jam Keluar Gerbang (Gate Out) */}
                      {(() => {
                        const refTimeIso = tx.weighOutTime || tx.gateInTime;
                        const refDateObj = refTimeIso ? new Date(refTimeIso) : new Date();
                        const defaultGateOutDate = !Number.isNaN(refDateObj.getTime())
                          ? getLocalDateStr(refDateObj)
                          : getLocalDateStr();
                        const currentGateOutDate = gateOutDates[tx.id] ?? defaultGateOutDate;
                        const currentGateOutTime = gateOutTimes[tx.id] ?? getLocalTimeStr();
                        return (
                          <div className="mb-3 pt-2 border-t border-slate-800 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-bold text-amber-400 uppercase flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5" />
                                Waktu Keluar Gerbang (Gate Out)
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  const now = new Date();
                                  setGateOutDates((prev) => ({ ...prev, [tx.id]: getLocalDateStr(now) }));
                                  setGateOutTimes((prev) => ({ ...prev, [tx.id]: getLocalTimeStr(now) }));
                                }}
                                className="text-[10px] font-semibold text-amber-600 hover:text-amber-700 hover:underline cursor-pointer"
                              >
                                Gunakan Waktu Saat Ini
                              </button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              <div>
                                <label className="text-[10px] font-bold text-slate-600 mb-1 flex items-center gap-1">
                                  <Calendar className="w-3 h-3 text-amber-500" />
                                  Tanggal Keluar *
                                </label>
                                <input
                                  type="date"
                                  value={currentGateOutDate}
                                  onChange={(e) =>
                                    setGateOutDates((prev) => ({ ...prev, [tx.id]: e.target.value }))
                                  }
                                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-mono-num font-semibold focus:outline-none focus:border-amber-500"
                                  style={{ colorScheme: 'light' }}
                                />
                              </div>
                              <div>
                                <label className="text-[10px] font-bold text-slate-600 mb-1 flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-amber-500" />
                                  Jam Keluar (WIB) *
                                </label>
                                <input
                                  type="time"
                                  value={currentGateOutTime}
                                  onChange={(e) =>
                                    setGateOutTimes((prev) => ({ ...prev, [tx.id]: e.target.value }))
                                  }
                                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-mono-num font-semibold focus:outline-none focus:border-amber-500"
                                  style={{ colorScheme: 'light' }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Required Operator Input before Gate Out */}
                      <div className="mb-3 pt-2 border-t border-slate-800">
                        <label className="text-[11px] font-bold text-slate-800 mb-1 flex items-center justify-between">
                          <span>NAMA OPERATOR (POSKO GATE OUT) <span className="text-rose-600">*</span></span>
                          {!(gateOutOperators[tx.id] || '').trim() && (
                            <span className="text-[10px] font-medium text-amber-700">Wajib diisi</span>
                          )}
                        </label>
                        <input
                          type="text"
                          data-gateout-operator={tx.id}
                          placeholder="Ketik nama operator / petugas posko (wajib diisi)..."
                          value={gateOutOperators[tx.id] ?? ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setGateOutOperators((prev) => ({ ...prev, [tx.id]: val }));
                            if (gateOutOperatorErrors[tx.id] && val.trim()) {
                              setGateOutOperatorErrors((prev) => ({ ...prev, [tx.id]: false }));
                            }
                          }}
                          className={`w-full bg-white border rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none transition-colors ${
                            gateOutOperatorErrors[tx.id]
                              ? 'border-rose-500 ring-2 ring-rose-500/30 bg-rose-50'
                              : !(gateOutOperators[tx.id] || '').trim()
                                ? 'border-amber-500/80 focus:border-amber-500'
                                : 'border-slate-300 focus:border-emerald-500'
                          }`}
                        />
                        {gateOutOperatorErrors[tx.id] && (
                          <p className="text-[11px] text-rose-700 font-medium mt-1 flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <span>Nama operator posko wajib diisi sebelum Checkout Gerbang.</span>
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setTimelineModalTx(tx)}
                          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5"
                        >
                          <Clock className="w-3.5 h-3.5 text-amber-400" />
                          <span>Lihat Timeline Durasi</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const operatorName = (gateOutOperators[tx.id] || '').trim();
                            if (!operatorName) {
                              setGateOutOperatorErrors((prev) => ({ ...prev, [tx.id]: true }));
                              const inputEl = document.querySelector<HTMLInputElement>(
                                `input[data-gateout-operator="${tx.id}"]`
                              );
                              inputEl?.focus();
                              return;
                            }
                            const refTimeIso = tx.weighOutTime || tx.gateInTime;
                            const refDateObj = refTimeIso ? new Date(refTimeIso) : new Date();
                            const fallbackDate = !Number.isNaN(refDateObj.getTime())
                              ? getLocalDateStr(refDateObj)
                              : getLocalDateStr();
                            const chosenDate = gateOutDates[tx.id] ?? fallbackDate;
                            const chosenTime = gateOutTimes[tx.id] ?? getLocalTimeStr();
                            const dateObj = new Date();
                            const [y, m, d] = chosenDate.split('-').map(Number);
                            const [hh, mm] = chosenTime.split(':').map(Number);
                            if (y && m && d) {
                              dateObj.setFullYear(y, m - 1, d);
                            }
                            if (!Number.isNaN(hh) && !Number.isNaN(mm)) {
                              dateObj.setHours(hh, mm, dateObj.getSeconds(), 0);
                            }

                            if (onCompleteGateOut) {
                              onCompleteGateOut(tx.id, operatorName, dateObj.toISOString());
                            }
                            setGateOutOperators((prev) => {
                              const next = { ...prev };
                              delete next[tx.id];
                              return next;
                            });
                            setGateOutOperatorErrors((prev) => {
                              const next = { ...prev };
                              delete next[tx.id];
                              return next;
                            });
                            setGateOutDates((prev) => {
                              const next = { ...prev };
                              delete next[tx.id];
                              return next;
                            });
                            setGateOutTimes((prev) => {
                              const next = { ...prev };
                              delete next[tx.id];
                              return next;
                            });
                          }}
                          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs rounded-lg transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Checkout Gerbang (Proses Selesai)</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* History of Completed Trucks with Today/All toggle */}
          {completedTrucks.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800">
                <span className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  {historyScope === 'TODAY'
                    ? 'Riwayat Armada Selesai & Keluar Gerbang (Hari Ini)'
                    : 'Riwayat Armada Selesai & Keluar Gerbang (Semua Data)'}
                </span>
                <div className="flex items-center gap-2">
                  <div className="inline-flex items-center bg-slate-100 border border-slate-300 rounded-lg p-0.5 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setHistoryScope('TODAY')}
                      className={`px-2.5 py-1 rounded font-bold transition-colors cursor-pointer ${
                        historyScope === 'TODAY'
                          ? 'bg-amber-500 text-slate-950 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Hari Ini ({completedTodayTrucks.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistoryScope('ALL')}
                      className={`px-2.5 py-1 rounded font-bold transition-colors cursor-pointer ${
                        historyScope === 'ALL'
                          ? 'bg-amber-500 text-slate-950 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Semua ({completedTrucks.length})
                    </button>
                  </div>
                </div>
              </div>

              {displayedCompletedTrucks.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-600">
                  Belum ada armada selesai keluar gerbang pada hari ini. Pilih <strong>Semua ({completedTrucks.length})</strong> untuk melihat riwayat sebelumnya.
                </div>
              ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 font-semibold uppercase text-[11px] border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Tanggal</th>
                      <th className="py-2.5 px-3">Nopol</th>
                      <th className="py-2.5 px-3">Driver</th>
                      <th className="py-2.5 px-3">PO & Supplier</th>
                      <th className="py-2.5 px-3">Netto Final</th>
                      <th className="py-2.5 px-3">Masuk Gerbang</th>
                      <th className="py-2.5 px-3">Keluar Gerbang</th>
                      <th className="py-2.5 px-3">Total Durasi</th>
                      <th className="py-2.5 px-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300 font-mono-num">
                    {displayedCompletedTrucks.map((tx) => {
                      const dur = calculateDuration(tx.gateInTime, tx.gateOutTime);
                      return (
                        <tr key={tx.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-2.5 px-3 text-slate-300 font-mono whitespace-nowrap">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-amber-500" />
                              {new Date(tx.gateInTime).toLocaleDateString('id-ID')}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-bold text-amber-400">{tx.vehiclePlate}</td>
                          <td className="py-2.5 px-3 font-sans text-slate-200">{tx.driverName}</td>
                          <td className="py-2.5 px-3 font-sans text-slate-400 truncate max-w-[150px]">{tx.supplierName}</td>
                          <td className="py-2.5 px-3 text-emerald-400 font-bold">{(tx.nettoTons || 0).toFixed(2)} Ton</td>
                          <td className="py-2.5 px-3 text-slate-400">{new Date(tx.gateInTime).toLocaleTimeString('id-ID')}</td>
                          <td className="py-2.5 px-3 text-slate-300">{tx.gateOutTime ? new Date(tx.gateOutTime).toLocaleTimeString('id-ID') : '-'}</td>
                          <td className="py-2.5 px-3 font-bold text-slate-900">
                            <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[11px]">
                              {dur.text}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right space-x-1 font-sans">
                            <button
                              type="button"
                              onClick={() => setTimelineModalTx(tx)}
                              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold rounded border border-slate-700"
                              title="Lihat Timeline Durasi Lengkap"
                            >
                              Timeline
                            </button>
                            {onOpenTicket && (
                              <button
                                type="button"
                                onClick={() => onOpenTicket(tx)}
                                className="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 text-[11px] font-bold rounded"
                                title="Cetak Tiket Timbang BAPB"
                              >
                                Tiket
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Check-In Modal Form */}
      {isCheckInOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
          <div
            role="dialog"
            aria-modal="true"
            className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl my-4 sm:my-8 max-h-[90vh] overflow-y-auto text-slate-900"
          >
            <div className="flex justify-between items-center pb-3 border-b border-slate-800 mb-4 gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex flex-wrap items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-amber-500 shrink-0" />
                  {selectedSchedule && selectedScheduleRitLabel ? (
                    <>
                      <span>{selectedScheduleRitLabel}</span>
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                        {selectedSchedule.poNumber} · {selectedSchedule.id}
                      </span>
                    </>
                  ) : (
                    <span>Formulir Gate In Pos Security (Pencatatan Nopol & Kedatangan)</span>
                  )}
                </h3>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  {selectedSchedule
                    ? `Formulir Gate In Pos Security (${selectedSchedule.supplierName}) — Setelah disubmit, Nopol langsung otomatis masuk ke Jembatan Timbang Masuk.`
                    : 'Setelah data disubmit, Nopol armada langsung otomatis masuk ke sistem Jembatan Timbang Masuk.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCheckInOpen(false)}
                className="text-slate-500 hover:text-slate-900 p-1 rounded-lg hover:bg-slate-100 transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCheckInSubmit} className="space-y-4">
              {checkInError && (
                <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs font-semibold text-rose-900 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{checkInError}</span>
                </div>
              )}
              {/* Optional Schedule Picker */}
              {pendingSchedules.length > 0 && (
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5">
                  <label className="block text-xs font-semibold text-amber-400">
                    Pilih Dari Jadwal Pengiriman Terdaftar (Sesuai PO):
                  </label>
                  <select
                    value={formData.scheduleId}
                    onChange={(e) => handleSelectSchedule(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="">-- Check-In Mandiri / Tanpa Jadwal Terdaftar --</option>
                    {pendingSchedules.map((sch) => (
                      <option key={sch.id} value={sch.id}>
                        [{sch.id}] {getScheduleRitLabel(sch, schedules)} · PO: {sch.poNumber} — {sch.supplierName} (ETA: {sch.etaDateTime.includes('T') ? sch.etaDateTime.split('T')[0] : sch.etaDateTime} · {Number(sch.estimatedTonnage).toLocaleString('id-ID')} Kg)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* PO Selection */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Purchase Order (PO) Terkait *
                </label>
                <select
                  required
                  value={formData.poId}
                  onChange={(e) => {
                    const nextPoId = e.target.value;
                    const currentSch = schedules.find((s) => s.id === formData.scheduleId);
                    setFormData({
                      ...formData,
                      poId: nextPoId,
                      scheduleId: currentSch && currentSch.poId === nextPoId ? formData.scheduleId : '',
                    });
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  {activePos.length === 0 ? (
                    <option value="">(Belum ada PO aktif — Silakan buat PO baru terlebih dahulu)</option>
                  ) : (
                    <>
                      <option value="">-- Pilih Purchase Order --</option>
                      {activePos.map((po) => (
                        <option key={po.id} value={po.id}>
                          {po.poNumber} — {po.supplierName} (Sisa Kuota: {(po.targetTonnage - po.receivedTonnage).toLocaleString('id-ID')} Kg)
                        </option>
                      ))}
                    </>
                  )}
                </select>
              </div>

              {/* Tanggal & Jam Kedatangan serta Jadwal Pengiriman */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
                <div>
                  <label className="text-xs font-bold text-amber-400 mb-1 flex items-center gap-1.5 sm:min-h-[32px]">
                    <Calendar className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>Tanggal Masuk Gerbang (Check-In) *</span>
                  </label>
                  <div className="relative flex items-center">
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
                      className="absolute left-2.5 text-amber-600 hover:text-amber-700 p-0.5 hover:bg-amber-50 rounded transition-transform hover:scale-110 active:scale-95 cursor-pointer z-10"
                      title="Klik untuk membuka kalender sistem"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="date"
                      required
                      value={formData.gateInDate}
                      onChange={(e) => setFormData({ ...formData, gateInDate: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-2.5 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono-num font-semibold"
                      style={{ colorScheme: 'light' }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-500 mt-0.5 block">Tanggal fisik armada tiba di Pos Security</span>
                </div>

                <div>
                  <label className="text-xs font-bold text-amber-400 mb-1 flex items-center gap-1.5 sm:min-h-[32px]">
                    <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>Jam Masuk Gerbang (WIB) *</span>
                  </label>
                  <div className="relative flex items-center">
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
                      className="absolute left-2.5 text-amber-600 hover:text-amber-700 p-0.5 hover:bg-amber-50 rounded transition-transform hover:scale-110 active:scale-95 cursor-pointer z-10"
                      title="Klik untuk memilih jam dari sistem"
                    >
                      <Clock className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="time"
                      required
                      value={formData.gateInTime}
                      onChange={(e) => setFormData({ ...formData, gateInTime: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-2.5 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono-num font-semibold"
                      style={{ colorScheme: 'light' }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-500 mt-0.5 block">Ketik jam manual atau klik ikon jam sistem</span>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1 flex items-center gap-1.5 sm:min-h-[32px]">
                    <Calendar className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <span>Tanggal Jadwal Pengiriman Sistem *</span>
                  </label>
                  <div className="relative flex items-center">
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
                      className="absolute left-2.5 text-sky-600 hover:text-sky-700 p-0.5 hover:bg-sky-50 rounded transition-transform hover:scale-110 active:scale-95 cursor-pointer z-10"
                      title="Klik untuk membuka kalender sistem"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="date"
                      required
                      value={formData.scheduledDeliveryDate}
                      onChange={(e) => setFormData({ ...formData, scheduledDeliveryDate: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-2.5 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono-num"
                      style={{ colorScheme: 'light' }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-500 mt-0.5 block">Diambil dari sistem jadwal kirim (ETA estimasi tiba)</span>
                </div>
              </div>

              {/* Truck & Driver Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-amber-400 mb-1">
                    Nomor Polisi (Nopol) / Plat Truk *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: B 9281 UIX / BG 8821 BA"
                    value={formData.vehiclePlate}
                    onChange={(e) => setFormData({ ...formData, vehiclePlate: e.target.value })}
                    className="w-full bg-slate-950 border-2 border-amber-500/60 rounded-lg px-3 py-2 text-sm text-white font-mono font-bold uppercase focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Nama Driver / Pengemudi *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Joko Susanto"
                    value={formData.driverName}
                    onChange={(e) => setFormData({ ...formData, driverName: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Perusahaan Angkutan / Transporter
                  </label>
                  <input
                    type="text"
                    value={formData.transporterName}
                    onChange={(e) => setFormData({ ...formData, transporterName: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    No Telepon Driver (WhatsApp)
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: 08123456789"
                    value={formData.driverPhone}
                    onChange={(e) => setFormData({ ...formData, driverPhone: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono-num"
                  />
                </div>
              </div>

              {/* Physical & SJ Checks */}
              <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
                <h4 className="text-xs font-bold text-amber-400 uppercase">
                  Pemeriksaan Fisik Keamanan & Surat Jalan Gerbang
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-900 mb-1">
                      Kondisi Terpal Penutup Bak
                    </label>
                    <select
                      value={formData.tarpCondition}
                      onChange={(e) => setFormData({ ...formData, tarpCondition: e.target.value as any })}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs text-white"
                    >
                      <option value="BAIK_RAPAT">Baik, Rapat, Tidak Ada Bocor</option>
                      <option value="RUSAK_ROBEK">Ada Robekan / Kurang Rapat</option>
                      <option value="TANPA_TERPAL">Tanpa Terpal (Peringatan Khusus)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-900 mb-1">
                      Nomor Surat Jalan Fisik (SJ Asal) *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.suratJalanNumber}
                      onChange={(e) => setFormData({ ...formData, suratJalanNumber: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs text-white font-mono-num"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-900 mb-1">
                      Berat Muatan di Surat Jalan (kg) *
                    </label>
                    <input
                      type="number"
                      min={1}
                      required
                      placeholder="Masukkan berat muatan (Kg)..."
                      value={formData.suratJalanWeightKg}
                      onChange={(e) => {
                        let val = e.target.value;
                        if (val.length > 1 && val.startsWith('0') && !val.startsWith('0.')) {
                          val = val.replace(/^0+/, '');
                        }
                        setFormData({ ...formData, suratJalanWeightKg: val });
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs text-white font-mono-num placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-900 mb-1">
                      Nama Petugas Pos Security *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ketik nama petugas security..."
                      value={formData.securityOfficer}
                      onChange={(e) => setFormData({ ...formData, securityOfficer: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-900 mb-1">
                    Catatan Pos Security
                  </label>
                  <input
                    type="text"
                    value={formData.securityNotes}
                    onChange={(e) => setFormData({ ...formData, securityNotes: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs text-white"
                  />
                </div>
              </div>

              {/* Submit Action */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Nopol akan langsung otomatis aktif di Jembatan Timbang Masuk
                </span>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCheckInOpen(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-lg transition-colors shadow-sm flex items-center gap-1.5"
                  >
                    <span>SUBMIT</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transaction Timeline Modal */}
      {timelineModalTx && (
        <TransactionTimelineModal
          transaction={timelineModalTx}
          onClose={() => setTimelineModalTx(null)}
        />
      )}
    </div>
  );
};
