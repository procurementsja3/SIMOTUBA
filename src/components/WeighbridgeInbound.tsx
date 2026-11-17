import React, { useState } from 'react';
import { 
  Scale, 
  FileCheck2, 
  CheckCircle2, 
  ArrowRight, 
  Clock, 
  Truck, 
  AlertCircle,
  ShieldCheck,
  User,
  Phone,
  CreditCard,
  FileText,
  FileSpreadsheet
} from 'lucide-react';
import { CoalTransaction } from '../types/coal';
import { WeighbridgeIndicator } from './WeighbridgeIndicator';

interface WeighbridgeInboundProps {
  transactions: CoalTransaction[];
  onCompleteWeighIn: (txId: string, grossWeight: number, operatorName: string, scaleId: string) => void;
  selectedTxId?: string;
}

export const WeighbridgeInbound: React.FC<WeighbridgeInboundProps> = ({
  transactions,
  onCompleteWeighIn,
  selectedTxId,
}) => {
  // Eligible trucks: status GATE_IN or TIMBANG_MASUK
  const eligibleTrucks = React.useMemo(
    () => transactions.filter((t) => t.status === 'GATE_IN' || t.status === 'TIMBANG_MASUK'),
    [transactions]
  );

  const [activeTxId, setActiveTxId] = useState<string>(
    selectedTxId && eligibleTrucks.some((t) => t.id === selectedTxId)
      ? selectedTxId
      : eligibleTrucks[0]?.id || ''
  );

  const [operatorName, setOperatorName] = useState('');
  const [scaleId, setScaleId] = useState('JT-01 (Inbound 80 Ton)');
  const [capturedGross, setCapturedGross] = useState<number | null>(null);
  const [operatorError, setOperatorError] = useState(false);

  const lastAppliedSelectedTxIdRef = React.useRef<string | undefined>(undefined);
  const confirmationBoxRef = React.useRef<HTMLDivElement>(null);
  const operatorInputRef = React.useRef<HTMLInputElement>(null);

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
        setCapturedGross(tx.grossWeight > 0 ? tx.grossWeight : null);
      }
      return;
    }

    if (!eligibleTrucks.some((t) => t.id === activeTxId)) {
      const nextId = eligibleTrucks[0]?.id || '';
      setActiveTxId(nextId);
      const nextTx = eligibleTrucks.find((t) => t.id === nextId);
      setCapturedGross(nextTx && nextTx.grossWeight > 0 ? nextTx.grossWeight : null);
    }
  }, [selectedTxId, eligibleTrucks, activeTxId]);

  React.useEffect(() => {
    setOperatorName('');
    setOperatorError(false);
  }, [activeTxId]);

  const activeTx = transactions.find((t) => t.id === activeTxId);

  const handleCapture = (weightKg: number) => {
    setCapturedGross(weightKg);
    setOperatorError(false);
    setTimeout(() => {
      confirmationBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  };

  const handleProcessWeighIn = () => {
    if (!activeTx || !capturedGross || capturedGross <= 0) {
      return;
    }
    if (!operatorName.trim()) {
      setOperatorError(true);
      operatorInputRef.current?.focus();
      return;
    }
    onCompleteWeighIn(activeTx.id, capturedGross, operatorName.trim(), scaleId);
    setCapturedGross(null);
    setOperatorName('');
    setOperatorError(false);
  };

  const formatTimeWithDots = (isoString?: string) => {
    if (!isoString) return '-';
    const d = new Date(isoString);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    return `${h}.${m}.${s}`;
  };

  const renderTarpBadge = (condition?: string) => {
    if (condition === 'BAIK_RAPAT') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Baik & Rapat
        </span>
      );
    }
    if (condition === 'RUSAK_ROBEK') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
          <AlertCircle className="w-3.5 h-3.5" />
          Rusak / Robek
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
        <AlertCircle className="w-3.5 h-3.5" />
        Tanpa Terpal
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <Scale className="w-5 h-5 text-amber-500" />
          <span>INPUT TIMBANG MASUK</span>
        </h2>
        <p className="text-xs text-slate-600 mt-0.5">
          Verifikasi fisik surat jalan asal tambang, timbang muatan penuh armada secara real-time, dan teruskan langsung ke lokasi Bongkar Muatan
        </p>
      </div>

      {eligibleTrucks.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-10 text-center text-slate-500">
          <Scale className="w-12 h-12 mx-auto mb-3 text-slate-600" />
          <p className="text-base text-slate-300 font-semibold">Tidak ada antrean truk di Jembatan Timbang Masuk.</p>
          <p className="text-xs text-slate-500 mt-1">
            Armada baru akan muncul di sini setelah didata di Pos Security (Gate In).
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Left Column: Truck Queue Selection (Matching Foto) */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                PILIH TRUK DI PLATFORM MASUK
              </span>
              <span className="text-xs text-amber-400 font-mono-num font-bold">
                {eligibleTrucks.length} Truk
              </span>
            </div>

            <div className="flex lg:block overflow-x-auto lg:overflow-x-hidden lg:overflow-y-auto space-x-3 lg:space-x-0 lg:space-y-2.5 pb-2 lg:pb-0 pr-1 max-h-[220px] lg:max-h-[560px] scrollbar-thin scrollbar-thumb-slate-800">
              {eligibleTrucks.map((tx) => {
                const isSelected = tx.id === activeTxId;
                return (
                  <button
                    key={tx.id}
                    type="button"
                    onClick={() => {
                      setActiveTxId(tx.id);
                      setCapturedGross(tx.grossWeight > 0 ? tx.grossWeight : null);
                      setOperatorName('');
                      setOperatorError(false);
                    }}
                    className={`w-[260px] sm:w-[280px] lg:w-full shrink-0 lg:shrink text-left p-3.5 rounded-xl border transition-all cursor-pointer block ${
                      isSelected
                        ? 'bg-slate-900/90 border-2 border-amber-500 shadow-md shadow-amber-500/10 ring-1 ring-amber-500/30'
                        : 'bg-slate-950/70 border border-slate-800 hover:border-slate-700 hover:bg-slate-900/50'
                    }`}
                  >
                    {/* Baris 1: Plat Nomor & Nomor Antrean */}
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="font-mono-num text-sm font-bold text-slate-900 bg-slate-950 px-2.5 py-1 rounded-md border border-slate-700 tracking-wider shadow-inner">
                        {tx.vehiclePlate}
                      </span>
                      <span className="text-sm font-mono-num font-bold text-amber-400 tracking-wide">
                        {tx.queueNumber}
                      </span>
                    </div>

                    {/* Baris 2: Nama Supir */}
                    <div className="text-sm font-semibold text-slate-900 truncate">
                      {tx.driverName}
                    </div>

                    {/* Baris 3: Nama Supplier / Tambang */}
                    <div className="text-xs text-slate-600 truncate mt-0.5">
                      {tx.supplierName}
                    </div>

                    {/* Baris 4: Berat SJ & Waktu Masuk */}
                    <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-600 font-mono-num">
                      <span className="text-slate-700 font-medium">
                        SJ: {(tx.suratJalanWeight / 1000).toFixed(2)} T
                      </span>
                      <span className="text-slate-500">
                        {formatTimeWithDots(tx.gateInTime)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right 2 Columns: Detailed Nopol Data from Pos Security & Weighbridge Station */}
          {activeTx ? (
            <div className="lg:col-span-2 space-y-5">
              {/* Pos Security Gate In Data Detail Card */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
                {/* Header: Nopol & Gate In Verification Status */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-3">
                    <span className="font-mono-num text-xl font-bold text-slate-900 bg-slate-950 px-3.5 py-1.5 rounded-lg border border-slate-700 tracking-wider shadow-inner">
                      {activeTx.vehiclePlate}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">{activeTx.driverName}</span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          <ShieldCheck className="w-3 h-3" />
                          Terverifikasi Pos Security (Gate In)
                        </span>
                      </div>
                      <div className="text-xs text-slate-400">{activeTx.transporterName}</div>
                    </div>
                  </div>

                  <div className="text-right text-xs">
                    <div className="text-slate-400">
                      No. Tiket: <strong className="text-white font-mono-num">{activeTx.ticketNumber}</strong>
                    </div>
                    <div className="text-amber-400 font-mono-num font-bold">
                      No. Antrean: {activeTx.queueNumber}
                    </div>
                  </div>
                </div>

                {/* 3 Detail Cards: Data yang Diambil dari Input Pos Security */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Card 1: Data Pengemudi & Transporter */}
                  <div className="bg-slate-950/70 p-3.5 rounded-lg border border-slate-800 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400 uppercase tracking-wide">
                      <User className="w-3.5 h-3.5" />
                      <span>Data Pengemudi</span>
                    </div>
                    <div className="space-y-1.5 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-500 block uppercase">Nama Supir</span>
                        <span className="font-semibold text-slate-200">{activeTx.driverName}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block uppercase">No. Kontak / HP</span>
                        <span className="font-mono-num text-slate-300">{activeTx.driverPhone || '-'}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block uppercase">No. Identitas KTP/SIM</span>
                        <span className="font-mono-num text-slate-300">{activeTx.driverIdNumber || '-'}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block uppercase">Vendor Transporter</span>
                        <span className="text-slate-300 truncate block">{activeTx.transporterName}</span>
                      </div>
                    </div>
                  </div>

                  {/* Card 2: Dokumen & Surat Jalan */}
                  <div className="bg-slate-950/70 p-3.5 rounded-lg border border-slate-800 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-cyan-400 uppercase tracking-wide">
                      <FileText className="w-3.5 h-3.5" />
                      <span>Dokumen & Surat Jalan</span>
                    </div>
                    <div className="space-y-1.5 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-500 block uppercase">No. Surat Jalan</span>
                        <span className="font-mono-num font-bold text-slate-200">{activeTx.suratJalanNumber}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block uppercase">Berat Muatan di SJ</span>
                        <span className="font-mono-num font-bold text-amber-400">
                          {activeTx.suratJalanWeight.toLocaleString('id-ID')} kg
                        </span>
                        <span className="text-[11px] text-slate-400 font-mono-num ml-1">
                          ({(activeTx.suratJalanWeight / 1000).toFixed(2)} Ton)
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block uppercase">PO Batubara</span>
                        <span className="font-mono-num text-slate-300">{activeTx.poNumber}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block uppercase">Supplier / Tambang</span>
                        <span className="text-slate-300 truncate block">{activeTx.supplierName}</span>
                      </div>
                    </div>
                  </div>

                  {/* Card 3: Pemeriksaan Pos Security */}
                  <div className="bg-slate-950/70 p-3.5 rounded-lg border border-slate-800 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 uppercase tracking-wide">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Pemeriksaan Pos Security</span>
                    </div>
                    <div className="space-y-1.5 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-500 block uppercase">Jam Masuk Gerbang</span>
                        <span className="font-mono-num font-semibold text-slate-200">
                          {new Date(activeTx.gateInTime).toLocaleTimeString('id-ID')} WIB
                        </span>
                        <span className="text-[10px] text-slate-500 block">
                          {new Date(activeTx.gateInTime).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block uppercase">Petugas Security</span>
                        <span className="text-slate-300">{activeTx.securityOfficer || 'Supriyanto (Pos Security Utama)'}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block uppercase mb-1">Kondisi Terpal</span>
                        {renderTarpBadge(activeTx.tarpCondition)}
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block uppercase">Catatan Pos Security</span>
                        <p className="text-[11px] text-slate-400 italic bg-slate-900/60 p-1.5 rounded border border-slate-800/80">
                          "{activeTx.securityNotes || 'Pemeriksaan standar di Pos Security selesai.'}"
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Live Weighbridge Scale Component */}
                <div className="pt-2">
                  <WeighbridgeIndicator
                    label="Indikator Timbangan Masuk (Gross Weight / Timbang Isi)"
                    subLabel="Jembatan Timbang Inbound 1 — Kapasitas 80.000 kg"
                    scaleId={scaleId}
                    isOutbound={false}
                    defaultWeightKg={activeTx.grossWeight || 0}
                    onCaptureWeight={handleCapture}
                  />
                </div>

                {/* Captured Weighing Result and Confirmation Box */}
                {capturedGross !== null && (
                  <div
                    ref={confirmationBoxRef}
                    className="mt-4 p-4 bg-emerald-50 border-2 border-emerald-400 rounded-xl space-y-3 shadow-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                        <div>
                          <div className="text-sm font-bold text-slate-900">
                            Gross Weight Berhasil Dikunci: <span className="font-mono-num text-emerald-700">{capturedGross.toLocaleString('id-ID')} kg</span>
                          </div>
                          <div className="text-xs text-slate-600 font-mono-num">
                            Setara {(capturedGross / 1000).toFixed(2)} Ton
                          </div>
                        </div>
                      </div>

                      <div className="text-xs text-slate-700 font-mono-num text-right">
                        <span>Berat di Surat Jalan: </span>
                        <strong className="text-amber-700">
                          {activeTx.suratJalanWeight.toLocaleString('id-ID')} kg
                        </strong>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-emerald-200 text-xs">
                      <div className="max-w-md">
                        <label className="block text-[11px] text-slate-800 font-semibold mb-1">
                          Operator Timbang Masuk <span className="text-rose-600">*</span>
                        </label>
                        <input
                          ref={operatorInputRef}
                          type="text"
                          placeholder="Ketik nama operator timbang masuk (wajib diisi)..."
                          value={operatorName}
                          onChange={(e) => {
                            setOperatorName(e.target.value);
                            if (operatorError && e.target.value.trim()) {
                              setOperatorError(false);
                            }
                          }}
                          className={`w-full bg-white border rounded px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none transition-colors ${
                            operatorError
                              ? 'border-rose-500 ring-2 ring-rose-500/30 bg-rose-50'
                              : 'border-slate-300 focus:border-amber-500'
                          }`}
                        />
                        {operatorError && (
                          <p className="text-[11px] text-rose-700 font-medium mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>Nama operator timbang masuk wajib diisikan sebelum menyimpan.</span>
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="text-[11px] text-slate-600">
                        {!operatorName.trim() && (
                          <span className="text-amber-800 font-medium flex items-center gap-1">
                            * Wajib mengisi nama operator timbang masuk sebelum submit
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={handleProcessWeighIn}
                        disabled={!capturedGross || capturedGross <= 0}
                        className="flex items-center justify-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-lg transition-colors shadow-md cursor-pointer disabled:cursor-not-allowed"
                      >
                        <FileCheck2 className="w-4 h-4" />
                        <span>SUBMIT & Lanjut ke Bongkar Muatan</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-500">
              Pilih salah satu armada dari antrean di sebelah kiri untuk melihat detail data nopol dari Pos Security.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
