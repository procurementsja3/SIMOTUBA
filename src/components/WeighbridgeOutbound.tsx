import React, { useState } from 'react';
import { 
  Scale, 
  CheckCircle2, 
  Printer, 
  AlertTriangle, 
  Clock, 
  FileCheck, 
  TrendingDown, 
  ArrowRight,
  TrendingUp,
  FileSpreadsheet,
  AlertCircle,
  Calendar
} from 'lucide-react';
import { CoalTransaction, PurchaseOrder } from '../types/coal';
import { WeighbridgeIndicator } from './WeighbridgeIndicator';
import { calculateToleranceMetrics, validateWeighOutWeights } from '../utils/toleranceUtils';

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

interface WeighbridgeOutboundProps {
  transactions: CoalTransaction[];
  purchaseOrders: PurchaseOrder[];
  onCompleteWeighOut: (
    txId: string,
    tareWeight: number,
    operatorName: string,
    scaleId: string,
    gateOutOfficer: string,
    weighOutTimeIso?: string,
    weighOutNotes?: string
  ) => void;
  onOpenPrintTicket: (tx: CoalTransaction) => void;
  selectedTxId?: string;
}

export const WeighbridgeOutbound: React.FC<WeighbridgeOutboundProps> = ({
  transactions,
  purchaseOrders,
  onCompleteWeighOut,
  onOpenPrintTicket,
  selectedTxId,
}) => {
  const eligibleTrucks = React.useMemo(
    () => transactions.filter((t) => t.status === 'TIMBANG_KELUAR'),
    [transactions]
  );

  const [activeTxId, setActiveTxId] = useState<string>(
    selectedTxId && eligibleTrucks.some((t) => t.id === selectedTxId)
      ? selectedTxId
      : eligibleTrucks[0]?.id || ''
  );

  const [operatorName, setOperatorName] = useState('');
  const [scaleId, setScaleId] = useState('JT-02 (Outbound 80 Ton)');
  const [gateOutOfficer, setGateOutOfficer] = useState('');
  const [capturedTare, setCapturedTare] = useState<number | null>(null);
  const [operatorError, setOperatorError] = useState(false);
  const [weightError, setWeightError] = useState<string | null>(null);
  const [weighOutDate, setWeighOutDate] = useState<string>(() => getLocalDateStr());
  const [weighOutTime, setWeighOutTime] = useState<string>(() => getLocalTimeStr());
  const [weighOutNotes, setWeighOutNotes] = useState('');
  const [timeError, setTimeError] = useState<string | null>(null);

  const lastAppliedSelectedTxIdRef = React.useRef<string | undefined>(undefined);
  const eligibleTrucksRef = React.useRef(eligibleTrucks);
  eligibleTrucksRef.current = eligibleTrucks;

  React.useEffect(() => {
    if (
      selectedTxId &&
      selectedTxId !== lastAppliedSelectedTxIdRef.current &&
      eligibleTrucks.some((t) => t.id === selectedTxId)
    ) {
      lastAppliedSelectedTxIdRef.current = selectedTxId;
      setActiveTxId(selectedTxId);
      const tx = eligibleTrucks.find((t) => t.id === selectedTxId);
      if (tx) {
        setCapturedTare(tx.tareWeight > 0 ? tx.tareWeight : null);
      }
      return;
    }

    if (!eligibleTrucks.some((t) => t.id === activeTxId)) {
      const nextId = eligibleTrucks[0]?.id || '';
      setActiveTxId(nextId);
      const nextTx = eligibleTrucks.find((t) => t.id === nextId);
      setCapturedTare(nextTx && nextTx.tareWeight > 0 ? nextTx.tareWeight : null);
    }
  }, [selectedTxId, eligibleTrucks, activeTxId]);

  React.useEffect(() => {
    setOperatorName('');
    setOperatorError(false);
    setWeightError(null);
    setGateOutOfficer('');
    setWeighOutNotes('');
    setTimeError(null);
    const currentTx = eligibleTrucksRef.current.find((t) => t.id === activeTxId);
    if (currentTx?.weighOutNotes) {
      setWeighOutNotes(currentTx.weighOutNotes);
    }
    if (currentTx?.weighOutTime) {
      const parsed = new Date(currentTx.weighOutTime);
      if (!Number.isNaN(parsed.getTime())) {
        setWeighOutDate(getLocalDateStr(parsed));
        setWeighOutTime(getLocalTimeStr(parsed));
        return;
      }
    }
    const now = new Date();
    setWeighOutDate(getLocalDateStr(now));
    setWeighOutTime(getLocalTimeStr(now));
  }, [activeTxId]);

  const activeTx = transactions.find((t) => t.id === activeTxId);
  const activePo = purchaseOrders.find((p) => p.id === activeTx?.poId);

  const tolerancePct = activePo?.tolerancePercentage || 5;

  // Real-time calculation if tare captured
  const gross = activeTx?.grossWeight || 0;
  const suratJalan = activeTx?.suratJalanWeight || 0;
  const tare = capturedTare || 0;
  const weightValidation = validateWeighOutWeights(gross, tare);
  const {
    nettoWeight: calculatedNetto,
    weightDifference: weightDiff,
    shrinkagePercentage: shrinkagePct,
    toleranceStatus,
    claimPenaltyKg,
  } = calculateToleranceMetrics({
    grossWeight: gross,
    tareWeight: tare,
    suratJalanWeight: suratJalan,
    tolerancePercentage: tolerancePct,
  });

  const handleCapture = (weightKg: number) => {
    setCapturedTare(weightKg);
    const check = validateWeighOutWeights(gross, weightKg);
    setWeightError(check.valid ? null : check.error || 'Berat timbangan tidak valid.');
  };

  const handleProcessWeighOut = () => {
    if (!activeTx || capturedTare === null) return;
    if (!weighOutDate || !weighOutTime) {
      setTimeError('Tanggal dan jam keluar jembatan timbang wajib diisi.');
      return;
    }
    const dateObj = new Date();
    const [y, m, d] = weighOutDate.split('-').map(Number);
    const [hh, mm] = weighOutTime.split(':').map(Number);
    if (!y || !m || !d || Number.isNaN(hh) || Number.isNaN(mm)) {
      setTimeError('Format tanggal atau jam keluar jembatan timbang tidak valid.');
      return;
    }
    dateObj.setFullYear(y, m - 1, d);
    dateObj.setHours(hh, mm, 0, 0);

    const check = validateWeighOutWeights(activeTx.grossWeight || 0, capturedTare);
    if (!check.valid) {
      setWeightError(check.error || 'Berat timbangan tidak valid.');
      return;
    }
    if (!operatorName.trim()) {
      setOperatorError(true);
      return;
    }
    onCompleteWeighOut(
      activeTx.id,
      capturedTare,
      operatorName.trim(),
      scaleId,
      gateOutOfficer.trim() || 'Petugas Pos Security',
      dateObj.toISOString(),
      weighOutNotes.trim() || undefined
    );
    setCapturedTare(null);
    setOperatorName('');
    setGateOutOfficer('');
    setWeighOutNotes('');
    setOperatorError(false);
    setWeightError(null);
    setTimeError(null);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <Scale className="w-5 h-5 text-emerald-600" />
          <span>INPUT TIMBANG KELUAR</span>
        </h2>
        <p className="text-xs text-slate-600 mt-0.5">
          Timbang tara truk kosong setelah pembongkaran, kalkulasi netto pabrik otomatis, evaluasi deviasi susut vs Surat Jalan, dan cetak tiket timbang resmi
        </p>
      </div>

      {eligibleTrucks.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-10 text-center text-slate-500">
          <Scale className="w-12 h-12 mx-auto mb-3 text-slate-600" />
          <p className="text-base text-slate-300 font-semibold">Tidak ada antrean truk di Jembatan Timbang Keluar saat ini.</p>
          <p className="text-xs text-slate-500 mt-1">
            Armada akan masuk ke sini setelah proses pembongkaran muatan di stockpile dinyatakan selesai.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Truck Queue Selection */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Pilih Truk di Platform Keluar
              </span>
              <span className="text-xs text-emerald-400 font-mono-num font-bold">
                {eligibleTrucks.length} Truk
              </span>
            </div>

            <div className="flex lg:block overflow-x-auto lg:overflow-x-hidden lg:overflow-y-auto space-x-3 lg:space-x-0 lg:space-y-2.5 pb-2 lg:pb-0 pr-1 max-h-[220px] lg:max-h-[500px] scrollbar-thin scrollbar-thumb-slate-800">
              {eligibleTrucks.map((tx) => {
                const isSelected = tx.id === activeTxId;
                return (
                  <button
                    key={tx.id}
                    type="button"
                    onClick={() => {
                      setActiveTxId(tx.id);
                      setCapturedTare(tx.tareWeight > 0 ? tx.tareWeight : null);
                      setOperatorName('');
                      setOperatorError(false);
                      setWeightError(null);
                    }}
                    className={`w-[260px] sm:w-[280px] lg:w-full shrink-0 lg:shrink text-left p-3.5 rounded-xl border transition-all cursor-pointer block ${
                      isSelected
                        ? 'bg-emerald-500/10 border-2 border-emerald-500 shadow-md shadow-emerald-500/10'
                        : 'bg-slate-950/70 border border-slate-800 hover:border-slate-700 hover:bg-slate-900/50'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-mono-num text-sm font-bold text-slate-900 bg-slate-900 px-2 py-0.5 rounded border border-slate-700">
                        {tx.vehiclePlate}
                      </span>
                      <span className="text-[11px] font-mono-num font-bold text-amber-400">
                        {tx.queueNumber}
                      </span>
                    </div>
                    <div className="text-xs text-slate-800 font-semibold truncate">{tx.driverName}</div>
                    <div className="text-[11px] text-slate-600 truncate">{tx.supplierName}</div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-slate-600 font-mono-num">
                      <span>Gross: {(tx.grossWeight / 1000).toFixed(2)} T</span>
                      <span className="text-emerald-700 font-semibold">Siap Tara</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right 2 Columns: Weighing Station & Mathematical Audit */}
          {activeTx ? (
            <div className="lg:col-span-2 space-y-5">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
                {/* Truck Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="font-mono-num text-lg font-bold text-slate-900 bg-slate-950 px-3 py-1 rounded-lg border border-slate-700">
                      {activeTx.vehiclePlate}
                    </span>
                    <div>
                      <div className="text-sm font-bold text-slate-900">{activeTx.driverName} ({activeTx.transporterName})</div>
                      <div className="text-xs text-slate-600">
                        PO: <strong className="text-amber-700 font-mono-num">{activeTx.poNumber}</strong> · Tiket: <strong className="text-slate-900 font-mono-num">{activeTx.ticketNumber}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="text-right text-xs">
                    <span className="text-slate-400 font-mono-num">
                      Toleransi Kontrak: <strong className="text-amber-400">±{tolerancePct}%</strong>
                    </span>
                  </div>
                </div>

                {/* Gross & SJ Baseline Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-950/70 p-3.5 rounded-lg border border-slate-800 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase">Berat di Surat Jalan (SJ)</span>
                    <strong className="text-sm font-mono-num text-slate-200">
                      {activeTx.suratJalanWeight.toLocaleString('id-ID')} kg
                    </strong>
                    <span className="text-[10px] text-slate-400 font-mono-num block">
                      ({(activeTx.suratJalanWeight / 1000).toFixed(2)} Ton)
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase">Gross Timbang Masuk</span>
                    <strong className="text-sm font-mono-num text-amber-400">
                      {activeTx.grossWeight.toLocaleString('id-ID')} kg
                    </strong>
                    <span className="text-[10px] text-slate-400 font-mono-num block">
                      ({(activeTx.grossWeight / 1000).toFixed(2)} Ton)
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase">Lokasi Stockpile & Status QC</span>
                    <strong className="text-xs font-semibold text-sky-400 block truncate">
                      {activeTx.assignedStockpile || activeTx.unloadingStockpile || 'Stockpile Utama'}
                    </strong>
                    <span className="text-[10px] text-indigo-300 block">
                      {activeTx.qcTime && activeTx.qcStatus
                        ? `QC: ${activeTx.qcStatus} (${activeTx.labResults?.calorieGAR || '-'} kcal)`
                        : 'QC-PA: Independen Pasca Timbang Keluar (≥24 Jam)'}
                    </span>
                  </div>
                </div>

                {/* Waktu Keluar Jembatan Timbang (Format sama seperti Timbang Masuk) */}
                <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800/80">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400 uppercase tracking-wide">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Waktu Keluar Jembatan Timbang (Timbang Keluar)</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const now = new Date();
                        setWeighOutDate(getLocalDateStr(now));
                        setWeighOutTime(getLocalTimeStr(now));
                        setTimeError(null);
                      }}
                      className="text-[11px] font-semibold text-amber-600 hover:text-amber-700 hover:underline cursor-pointer"
                    >
                      Gunakan Waktu Saat Ini
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                    <div>
                      <label className="text-xs font-bold text-amber-400 mb-1 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>Tanggal Keluar Jembatan Timbang *</span>
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
                          value={weighOutDate}
                          onChange={(e) => {
                            setWeighOutDate(e.target.value);
                            if (timeError) setTimeError(null);
                          }}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-2.5 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono-num font-semibold"
                          style={{ colorScheme: 'light' }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-500 mt-0.5 block">Tanggal fisik armada keluar dari jembatan timbang</span>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-amber-400 mb-1 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>Jam Keluar Jembatan Timbang (WIB) *</span>
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
                          value={weighOutTime}
                          onChange={(e) => {
                            setWeighOutTime(e.target.value);
                            if (timeError) setTimeError(null);
                          }}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-2.5 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono-num font-semibold"
                          style={{ colorScheme: 'light' }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-500 mt-0.5 block">Ketik jam manual atau klik ikon jam sistem</span>
                    </div>
                  </div>
                  {timeError && (
                    <p className="text-[11px] text-rose-500 font-medium flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{timeError}</span>
                    </p>
                  )}
                </div>

                {/* Digital Tare Scale Indicator */}
                <WeighbridgeIndicator
                  label="Indikator Timbangan Keluar (Tare Weight / Truk Kosong)"
                  subLabel="Jembatan Timbang Outbound 2 — Kapasitas 80.000 kg"
                  scaleId={scaleId}
                  isOutbound={true}
                  defaultWeightKg={activeTx.tareWeight || 0}
                  onCaptureWeight={handleCapture}
                />

                {/* Live Reconciliation & Deviation Analysis Box */}
                {capturedTare !== null && (
                  <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-4">
                    <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                      Hasil Rekonsiliasi Timbangan & Kalkulasi Susut Bobot
                    </h4>

                    {/* Math Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="p-3 bg-slate-900 rounded border border-slate-800">
                        <span className="text-[10px] text-slate-500 block uppercase">Tara (Tare Kosong)</span>
                        <strong className="text-base font-bold text-slate-200 font-mono-num">
                          {capturedTare.toLocaleString('id-ID')} kg
                        </strong>
                        <span className="text-[10px] text-slate-400 font-mono-num block">
                          {(capturedTare / 1000).toFixed(2)} Ton
                        </span>
                      </div>

                      <div className="p-3 bg-slate-900 rounded border border-emerald-900/60">
                        <span className="text-[10px] text-slate-500 block uppercase">Netto Pabrik (Gross - Tara)</span>
                        <strong className="text-base font-bold text-emerald-400 font-mono-num">
                          {calculatedNetto.toLocaleString('id-ID')} kg
                        </strong>
                        <span className="text-[10px] text-emerald-400/80 font-mono-num block font-semibold">
                          {(calculatedNetto / 1000).toFixed(3)} Ton
                        </span>
                      </div>

                      <div className="p-3 bg-slate-900 rounded border border-slate-800">
                        <span className="text-[10px] text-slate-500 block uppercase">Selisih Netto vs SJ</span>
                        <strong className={`text-base font-bold font-mono-num ${weightDiff < 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {weightDiff > 0 ? '+' : ''}{weightDiff.toLocaleString('id-ID')} kg
                        </strong>
                        <span className="text-[10px] text-slate-400 font-mono-num block">
                          {weightDiff > 0 ? '+' : ''}{(weightDiff / 1000).toFixed(3)} Ton
                        </span>
                      </div>

                      <div className="p-3 bg-slate-900 rounded border border-slate-800">
                        <span className="text-[10px] text-slate-500 block uppercase">Persentase Susut</span>
                        <strong className={`text-base font-bold font-mono-num ${
                          toleranceStatus === 'EXCESS_SHRINKAGE' ? 'text-rose-400' : 'text-emerald-400'
                        }`}>
                          {shrinkagePct > 0 ? '+' : ''}{shrinkagePct.toFixed(2)}%
                        </strong>
                        <span className="text-[10px] text-slate-400 block font-semibold">
                          {toleranceStatus === 'WITHIN_TOLERANCE' && '✓ Dalam Toleransi'}
                          {toleranceStatus === 'EXCESS_SHRINKAGE' && '⚠️ Susut Berlebih'}
                          {toleranceStatus === 'SURPLUS' && '✓ Surplus'}
                        </span>
                      </div>
                    </div>

                    {/* Excess shrinkage claim alert if any */}
                    {toleranceStatus === 'EXCESS_SHRINKAGE' && (
                      <div className="p-3 bg-rose-950/40 border border-rose-600/40 rounded-lg flex items-start gap-2.5 text-xs text-rose-300">
                        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                        <div>
                          <strong className="font-semibold block">Peringatan: Susut Melebihi Toleransi Kontrak (±{tolerancePct}%)</strong>
                          <span>
                            Tonase susut di luar toleransi sebesar{' '}
                            <strong className="font-mono-num">{(claimPenaltyKg / 1000).toFixed(2)} Ton ({Math.round(claimPenaltyKg).toLocaleString('id-ID')} kg)</strong>.{' '}
                            Akan diterbitkan Berita Acara Klaim Pemotongan Pembayaran kepada transporter/supplier.
                          </span>
                        </div>
                      </div>
                    )}

                    {(weightError || !weightValidation.valid) && (
                      <div className="p-3 bg-rose-50 border border-rose-300 rounded-lg flex items-start gap-2 text-xs text-rose-800">
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                        <div>
                          <strong className="font-bold block">Validasi Berat Timbang Keluar Gagal</strong>
                          <span>{weightError || weightValidation.error}</span>
                        </div>
                      </div>
                    )}

                    {/* Operator & Security Signoff Inputs */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800 text-xs">
                      <div>
                        <label className="block text-[11px] text-slate-300 font-semibold mb-1">
                          Operator Timbang Keluar <span className="text-amber-400">*</span>
                        </label>
                        <input
                          type="text"
                          placeholder="Ketik nama operator timbang keluar (wajib diisi)..."
                          value={operatorName}
                          onChange={(e) => {
                            setOperatorName(e.target.value);
                            if (operatorError && e.target.value.trim()) {
                              setOperatorError(false);
                            }
                          }}
                          className={`w-full bg-slate-900 border rounded px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none transition-colors ${
                            operatorError 
                              ? 'border-rose-500 ring-1 ring-rose-500/50 bg-rose-950/20' 
                              : 'border-slate-700 focus:border-emerald-400'
                          }`}
                        />
                        {operatorError && (
                          <p className="text-[11px] text-rose-400 font-medium mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>Nama operator timbang keluar wajib diisi.</span>
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-0.5">Petugas Pos Security (Gate Out)</label>
                        <input
                          type="text"
                          placeholder="Nama petugas posko gate out (opsional)..."
                          value={gateOutOfficer}
                          onChange={(e) => setGateOutOfficer(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] text-slate-300 font-semibold mb-1">
                          Catatan Timbang Keluar <span className="text-slate-500 font-normal">(Opsional)</span>
                        </label>
                        <input
                          type="text"
                          placeholder="Tambahkan catatan timbang keluar / kondisi susut bila ada..."
                          value={weighOutNotes}
                          onChange={(e) => setWeighOutNotes(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 focus:border-emerald-400 rounded px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Complete & Checkout Button */}
                    <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800">
                      <div className="text-xs text-slate-400">
                        {!operatorName.trim() ? (
                          <span className="text-amber-400/90 font-medium">
                            * Wajib mengisi nama operator timbang keluar sebelum menyelesaikan transaksi.
                          </span>
                        ) : (
                          <span>* Menyimpan akan mengupdate kuota PO, menutup tiket timbang, dan memproses Gate Out.</span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={handleProcessWeighOut}
                        disabled={!capturedTare || !weightValidation.valid}
                        className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition-colors shadow-lg disabled:cursor-not-allowed cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Selesaikan Transaksi & Check-Out Gate Out</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-500">
              Pilih salah satu armada dari antrean di sebelah kiri untuk menimbang tara kosong.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
