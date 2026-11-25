import React, { useState } from 'react';
import { 
  FlaskConical, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  ArrowRight, 
  Thermometer, 
  Layers,
  Sparkles,
  Truck,
  FileText,
  ShieldCheck,
  Scale
} from 'lucide-react';
import { CoalTransaction, PurchaseOrder, LabQCResults, VisualQC } from '../types/coal';
import { formatDisplayTicketNumber } from '../utils/ticketUtils';

interface QCLabCheckProps {
  transactions: CoalTransaction[];
  purchaseOrders: PurchaseOrder[];
  onCompleteQC: (
    txId: string,
    sampleId: string,
    samplingMethod: 'KADAR_AIR' | 'AUGUR_SAMPLER' | 'MANUAL_CORING' | 'CROSS_BELT' | 'GRAB' | 'RAPID_MOISTURE' | string,
    visual: VisualQC,
    lab: LabQCResults,
    decision: 'APPROVED' | 'CONDITIONAL_PENALTY' | 'REJECTED',
    stockpile: string,
    inspector: string,
    notes: string
  ) => void;
  selectedTxId?: string;
}

export const QCLabCheck: React.FC<QCLabCheckProps> = ({
  transactions,
  purchaseOrders,
  onCompleteQC,
  selectedTxId,
}) => {
  const [qcFilter, setQcFilter] = useState<'PENDING' | 'DONE' | 'ALL'>('PENDING');

  // Semua armada yang sudah melewati Timbang Keluar (independen pasca proses operasional)
  const postWeighOutTrucks = React.useMemo(() => {
    return transactions
      .filter((t) => Boolean(t.weighOutTime) || t.status === 'GATE_OUT' || t.status === 'COMPLETED')
      .sort((a, b) => {
        const tA = new Date(a.weighOutTime || a.gateOutTime || a.gateInTime || 0).getTime();
        const tB = new Date(b.weighOutTime || b.gateOutTime || b.gateInTime || 0).getTime();
        return tB - tA;
      });
  }, [transactions]);

  const pendingQcCount = postWeighOutTrucks.filter((t) => !t.qcTime).length;
  const doneQcCount = postWeighOutTrucks.filter((t) => Boolean(t.qcTime)).length;

  const eligibleTrucks = React.useMemo(() => {
    if (qcFilter === 'PENDING') return postWeighOutTrucks.filter((t) => !t.qcTime);
    if (qcFilter === 'DONE') return postWeighOutTrucks.filter((t) => Boolean(t.qcTime));
    return postWeighOutTrucks;
  }, [postWeighOutTrucks, qcFilter]);

  const [activeTxId, setActiveTxId] = useState<string>(
    selectedTxId && postWeighOutTrucks.some((t) => t.id === selectedTxId)
      ? selectedTxId
      : eligibleTrucks[0]?.id || ''
  );

  React.useEffect(() => {
    if (selectedTxId && postWeighOutTrucks.some((t) => t.id === selectedTxId)) {
      const target = postWeighOutTrucks.find((t) => t.id === selectedTxId);
      if (target) {
        if (target.qcTime && qcFilter === 'PENDING') {
          setQcFilter('DONE');
        } else if (!target.qcTime && qcFilter === 'DONE') {
          setQcFilter('PENDING');
        }
      }
      setActiveTxId(selectedTxId);
    } else if (!eligibleTrucks.some((t) => t.id === activeTxId)) {
      setActiveTxId(eligibleTrucks[0]?.id || '');
    }
  }, [selectedTxId, eligibleTrucks, postWeighOutTrucks]);

  const activeTx = transactions.find((t) => t.id === activeTxId);
  const activePo = purchaseOrders.find((p) => p.id === activeTx?.poId);

  // Helper to generate Sampling ID according to system date format: PA-YYMMNN (e.g. PA-261101)
  const generateAutoSampleId = (
    allTx: CoalTransaction[],
    targetTx?: CoalTransaction,
    date: Date = new Date()
  ): string => {
    if (targetTx?.sampleId && targetTx.sampleId.startsWith('PA-')) {
      return targetTx.sampleId;
    }
    const yy = String(date.getFullYear()).slice(-2);
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const prefix = `PA-${yy}${mm}`;

    const used = allTx
      .filter((t) => t.sampleId && t.sampleId.startsWith(prefix) && t.id !== targetTx?.id)
      .map((t) => {
        const numPart = t.sampleId!.slice(prefix.length).replace(/^-/, '');
        const parsed = parseInt(numPart, 10);
        return isNaN(parsed) ? 0 : parsed;
      });

    const nextSeq = used.length > 0 ? Math.max(...used) + 1 : 1;
    return `${prefix}${String(nextSeq).padStart(2, '0')}`;
  };

  // Form State
  const [sampleId, setSampleId] = useState<string>(() =>
    generateAutoSampleId(transactions, activeTx)
  );
  const [samplingMethod, setSamplingMethod] = useState<string>('KADAR_AIR');
  const [inspectorName, setInspectorName] = useState('');
  const [inspectorError, setInspectorError] = useState(false);
  const [decisionNotes, setDecisionNotes] = useState('');
  const [assignedStockpile, setAssignedStockpile] = useState(
    activePo?.destinationStockpile || 'Stockpile Utama'
  );

  React.useEffect(() => {
    if (activeTx) {
      if (activeTx.sampleId && activeTx.sampleId.startsWith('PA-')) {
        setSampleId(activeTx.sampleId);
      } else {
        setSampleId(generateAutoSampleId(transactions, activeTx));
      }
      setSamplingMethod(activeTx.samplingMethod || 'KADAR_AIR');
      setInspectorName(activeTx.qcInspector || '');
      setInspectorError(false);
      setDecision(activeTx.qcStatus || 'APPROVED');
      setDecisionNotes(activeTx.qcDecisionNotes || '');
      setAssignedStockpile(
        activeTx.assignedStockpile || activeTx.unloadingStockpile || activePo?.destinationStockpile || 'Stockpile Utama'
      );

      if (activeTx.labResults?.calorieGAR) {
        setCalorieGAR(activeTx.labResults.calorieGAR);
        setTotalMoisture(activeTx.labResults.totalMoisture);
        setAshContent(activeTx.labResults.ashContent);
        setTotalSulfur(activeTx.labResults.totalSulfur);
        setHgi(activeTx.labResults.hgi || 48);
      } else {
        setCalorieGAR(activePo?.specs.calorieMin ? activePo.specs.calorieMin + 30 : 4250);
        setTotalMoisture(activePo?.specs.moistureMax ? Number((activePo.specs.moistureMax - 1).toFixed(1)) : 33.0);
        setAshContent(activePo?.specs.ashMax ? Number((activePo.specs.ashMax - 0.5).toFixed(1)) : 7.2);
        setTotalSulfur(activePo?.specs.sulfurMax ? Number((activePo.specs.sulfurMax - 0.1).toFixed(2)) : 0.65);
        setHgi(48);
      }

      if (activeTx.visualAssessment?.contaminantsFound) {
        const found = activeTx.visualAssessment.contaminantsFound;
        setContaminants({
          'Lempung': found.some((c) => c.toLowerCase().includes('lempung')),
          'Batu': found.some((c) => c.toLowerCase().includes('batu')),
          'Pasir': found.some((c) => c.toLowerCase().includes('pasir')),
        });
      } else {
        setContaminants({
          'Lempung': false,
          'Batu': false,
          'Pasir': false,
        });
      }
      if (activeTx.visualAssessment) {
        setMoistureVisual(activeTx.visualAssessment.moistureVisual || 'LEMBAB');
        setTemperatureCelsius(activeTx.visualAssessment.temperatureCelsius ?? 33.5);
        setOdorStatus(activeTx.visualAssessment.odorStatus || 'NORMAL');
        if (activeTx.visualAssessment.coalColor) setCoalColor(activeTx.visualAssessment.coalColor);
        if (activeTx.visualAssessment.rankLevel) setRankLevel(activeTx.visualAssessment.rankLevel);
        if (activeTx.visualAssessment.luster) setLuster(activeTx.visualAssessment.luster);
        if (activeTx.visualAssessment.impurityStatus) setImpurityStatus(activeTx.visualAssessment.impurityStatus);
      } else {
        setMoistureVisual('LEMBAB');
        setTemperatureCelsius(33.5);
        setOdorStatus('NORMAL');
        setCoalColor('Hitam');
        setRankLevel('High Rank Coal');
        setLuster('Hitam Mengkilap');
        setImpurityStatus('Tidak ada Kontaminasi');
      }
    }
  }, [activeTxId]);

  // Visual QC
  const [moistureVisual, setMoistureVisual] = useState<'KERING' | 'LEMBAB' | 'BASAH_BECEK'>('LEMBAB');
  const [temperatureCelsius, setTemperatureCelsius] = useState<number>(33.5);
  const [odorStatus, setOdorStatus] = useState<'NORMAL' | 'BAU_BELERANG_TINGGI' | 'BERASAP_PANAS'>('NORMAL');
  const [coalColor, setCoalColor] = useState<string>('Hitam');
  const [rankLevel, setRankLevel] = useState<string>('High Rank Coal');
  const [luster, setLuster] = useState<string>('Hitam Mengkilap');
  const [impurityStatus, setImpurityStatus] = useState<string>('Tidak ada Kontaminasi');
  const [contaminants, setContaminants] = useState<{ [key: string]: boolean }>({
    'Lempung': false,
    'Batu': false,
    'Pasir': false,
  });

  // Lab Results
  const [calorieGAR, setCalorieGAR] = useState<number>(activePo?.specs.calorieMin ? activePo.specs.calorieMin + 30 : 4250);
  const [totalMoisture, setTotalMoisture] = useState<number>(activePo?.specs.moistureMax ? Number((activePo.specs.moistureMax - 1).toFixed(1)) : 33.0);
  const [ashContent, setAshContent] = useState<number>(activePo?.specs.ashMax ? Number((activePo.specs.ashMax - 0.5).toFixed(1)) : 7.2);
  const [totalSulfur, setTotalSulfur] = useState<number>(activePo?.specs.sulfurMax ? Number((activePo.specs.sulfurMax - 0.1).toFixed(2)) : 0.65);
  const [hgi, setHgi] = useState<number>(48);

  // Decision State
  const [decision, setDecision] = useState<'APPROVED' | 'CONDITIONAL_PENALTY' | 'REJECTED'>('APPROVED');

  // Evaluate deviations
  const calorieMin = activePo?.specs.calorieMin || 4200;
  const moistureMax = activePo?.specs.moistureMax || 34.0;
  const ashMax = activePo?.specs.ashMax || 8.0;
  const sulfurMax = activePo?.specs.sulfurMax || 0.8;

  const isCalorieLow = calorieGAR < calorieMin;
  const isMoistureHigh = totalMoisture > moistureMax;
  const isAshHigh = ashContent > ashMax;
  const isSulfurHigh = totalSulfur > sulfurMax;
  const isHot = temperatureCelsius > 55; // Warning hot coal

  const handleSimulateFastTest = () => {
    // Generate realistic testing values around PO specs
    const targetCal = activePo?.specs.calorieMin || 4200;
    const randomizedCal = targetCal + Math.floor(Math.random() * 80) - 20;
    setCalorieGAR(randomizedCal);
    setTotalMoisture(Number((moistureMax - 0.8 + Math.random() * 1.5).toFixed(1)));
    setAshContent(Number((ashMax - 0.8 + Math.random() * 1.2).toFixed(1)));
    setTotalSulfur(Number((sulfurMax - 0.15 + Math.random() * 0.25).toFixed(2)));
    setTemperatureCelsius(Number((32 + Math.random() * 6).toFixed(1)));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTx) return;

    if (!inspectorName.trim()) {
      setInspectorError(true);
      return;
    }
    setInspectorError(false);

    const selectedContaminants = Object.entries(contaminants)
      .filter(([_, checked]) => checked)
      .map(([name]) => name);

    const visualData: VisualQC = {
      moistureVisual,
      temperatureCelsius,
      odorStatus,
      contaminantsFound: selectedContaminants,
      coalColor,
      rankLevel,
      luster,
      impurityStatus,
    };

    const labData: LabQCResults = {
      calorieGAR: Math.round(calorieGAR),
      totalMoisture: Number(Number(totalMoisture).toFixed(1)),
      ashContent: Number(Number(ashContent).toFixed(1)),
      totalSulfur: Number(Number(totalSulfur).toFixed(2)),
      hgi: Math.round(hgi),
    };

    onCompleteQC(
      activeTx.id,
      sampleId,
      samplingMethod,
      visualData,
      labData,
      decision,
      assignedStockpile,
      inspectorName,
      decisionNotes
    );
  };

  const renderTarpBadge = (condition?: string) => {
    if (condition === 'BAIK_RAPAT') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          <CheckCircle2 className="w-3 h-3" />
          Baik & Rapat
        </span>
      );
    }
    if (condition === 'RUSAK_ROBEK') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
          <AlertTriangle className="w-3 h-3" />
          Rusak / Robek
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
        <AlertTriangle className="w-3 h-3" />
        Tanpa Terpal
      </span>
    );
  };

  const formatDateTime = (isoString?: string) => {
    if (!isoString) return '-';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      const day = String(d.getDate()).padStart(2, '0');
      const mon = String(d.getMonth() + 1).padStart(2, '0');
      const yr = d.getFullYear();
      const hr = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      return `${day}/${mon}/${yr} ${hr}:${min}`;
    } catch {
      return isoString;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <FlaskConical className="w-5 h-5 text-indigo-400" />
              Pos Laboratorium & QC-PA Independen (Sampling & Uji Mutu)
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-300">
              Diluar Alur Jam · Proses Lab ≥ 24 Jam
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Pembaruan hasil sampling & analisis laboratorium oleh PIC QC setelah armada selesai Timbang Keluar. Tahapan ini bersifat independen dan tidak dihitung dalam durasi operasional.
          </p>
        </div>

        {/* Filter Tabs (Belum Update QC / Sudah Update QC / Semua) */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs shrink-0 self-start md:self-center">
          <button
            type="button"
            onClick={() => setQcFilter('PENDING')}
            className={`px-3 py-1.5 rounded-md font-semibold transition-colors cursor-pointer ${
              qcFilter === 'PENDING' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            Belum Uji QC ({pendingQcCount})
          </button>
          <button
            type="button"
            onClick={() => setQcFilter('DONE')}
            className={`px-3 py-1.5 rounded-md font-semibold transition-colors cursor-pointer ${
              qcFilter === 'DONE' ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            Sudah Uji QC ({doneQcCount})
          </button>
          <button
            type="button"
            onClick={() => setQcFilter('ALL')}
            className={`px-3 py-1.5 rounded-md font-semibold transition-colors cursor-pointer ${
              qcFilter === 'ALL' ? 'bg-indigo-500 text-white font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            Semua ({postWeighOutTrucks.length})
          </button>
        </div>
      </div>

      {eligibleTrucks.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-10 text-center text-slate-500">
          <FlaskConical className="w-12 h-12 mx-auto mb-3 text-slate-600" />
          <p className="text-base text-slate-300 font-semibold">
            {qcFilter === 'PENDING'
              ? 'Semua armada pasca Timbang Keluar sudah diperbarui data QC-PA-nya.'
              : 'Belum ada data armada pasca Timbang Keluar untuk uji lab QC-PA.'}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Armada akan otomatis muncul di daftar QC-PA setelah selesai melakukan Timbang Keluar (Tare) untuk kemudian diupdate oleh PIC QC (estimasi ±24 jam).
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Truck Queue Selection */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                Daftar Armada Pasca Timbang Keluar
              </span>
              <span className="text-xs text-indigo-400 font-mono-num font-bold">
                {eligibleTrucks.length} Truk
              </span>
            </div>

            <div className="flex lg:block overflow-x-auto lg:overflow-y-auto space-x-3 lg:space-x-0 lg:space-y-2 pb-2 lg:pb-0 max-h-none lg:max-h-[540px] scrollbar-thin">
              {eligibleTrucks.map((tx) => {
                const isSelected = tx.id === activeTxId;
                return (
                  <button
                    key={tx.id}
                    type="button"
                    onClick={() => setActiveTxId(tx.id)}
                    className={`shrink-0 w-64 lg:w-full text-left p-3 rounded-lg border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-500/10 border-indigo-500/60 shadow-sm'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-mono-num text-sm font-bold text-white bg-slate-900 px-2 py-0.5 rounded border border-slate-700">
                        {tx.vehiclePlate}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                        tx.qcTime
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                          : 'bg-amber-50 text-amber-800 border-amber-300'
                      }`}>
                        {tx.qcTime ? 'QC Selesai' : 'Menunggu PIC QC'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-300 font-medium truncate">{tx.driverName}</div>
                    <div className="text-[11px] text-slate-400 truncate">{tx.supplierName}</div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400 font-mono-num">
                      <span>Netto: {tx.nettoTons ? `${tx.nettoTons.toFixed(2)} T` : `${(tx.grossWeight / 1000).toFixed(2)} T (G)`}</span>
                      <span className="text-indigo-400 font-semibold">{tx.poNumber}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right 2 Columns: QC Sampling & Analysis Form */}
          {activeTx ? (
            <div className="lg:col-span-2 space-y-5">
              <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-5">
                {/* Detailed Truck Info & Posko Input Data Card */}
                <div className="bg-slate-950/80 rounded-xl border border-slate-800 p-4 space-y-3.5">
                  {/* Header Top: Nopol, Driver, Queue, Ticket, and Fast Test Button */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
                    <div className="flex items-center gap-3">
                      <span className="font-mono-num text-xl font-black text-amber-400 bg-slate-900 px-3.5 py-1.5 rounded-xl border border-amber-500/40 shadow-sm tracking-wide">
                        {activeTx.vehiclePlate}
                      </span>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-bold text-slate-900 leading-tight">{activeTx.driverName}</span>
                          <span className="px-2 py-0.5 bg-indigo-50 text-indigo-900 text-[10px] font-mono-num font-bold rounded-md border border-indigo-200 shadow-xs">
                            Antrean {activeTx.queueNumber}
                          </span>
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-800 text-[10px] font-mono-num rounded-md border border-slate-300 shadow-xs">
                            {formatDisplayTicketNumber(activeTx.ticketNumber)}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                          <span>PO:</span>
                          <strong className="text-amber-400 font-mono-num">{activeTx.poNumber}</strong>
                          <span>·</span>
                          <span className="text-slate-300 font-medium">{activeTx.supplierName}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleSimulateFastTest}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all shadow-md active:scale-[0.98] cursor-pointer"
                      title="Simulasikan hasil uji cepat analyzer laboratorium"
                    >
                      <Sparkles className="w-4 h-4 text-amber-300" />
                      <span>Auto-Simulasi Uji Lab Cepat</span>
                    </button>
                  </div>

                  {/* Section Title */}
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Rincian Data Input Pos Security & Timbang Masuk:</span>
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono-num">
                      Sinkronisasi Posko Lapangan
                    </span>
                  </div>

                  {/* Detail Grid: 3 Clean Thematic Columns */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                    {/* 1. Pengemudi & Transporter */}
                    <div className="bg-slate-900/90 rounded-lg p-3 border border-slate-800/80 space-y-1.5">
                      <div className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1 pb-1 border-b border-slate-800">
                        <Truck className="w-3 h-3" />
                        <span>Pengemudi & Armada</span>
                      </div>
                      <div className="flex justify-between items-start gap-1">
                        <span className="text-slate-400 text-[11px]">Nama Driver:</span>
                        <span className="font-semibold text-slate-200 text-right">{activeTx.driverName || '-'}</span>
                      </div>
                      <div className="flex justify-between items-start gap-1">
                        <span className="text-slate-400 text-[11px]">No. HP / WA:</span>
                        <span className="font-mono-num text-slate-300 text-right">{activeTx.driverPhone || '-'}</span>
                      </div>
                      <div className="flex justify-between items-start gap-1">
                        <span className="text-slate-400 text-[11px]">Transporter:</span>
                        <span className="font-medium text-amber-300 text-right truncate max-w-[140px]" title={activeTx.transporterName}>
                          {activeTx.transporterName || '-'}
                        </span>
                      </div>
                      <div className="flex justify-between items-start gap-1 pt-1 border-t border-slate-800/60">
                        <span className="text-slate-400 text-[11px]">Petugas Posko:</span>
                        <span className="font-medium text-slate-300 text-right">{activeTx.securityOfficer || '-'}</span>
                      </div>
                    </div>

                    {/* 2. Surat Jalan & Jadwal Pengiriman */}
                    <div className="bg-slate-900/90 rounded-lg p-3 border border-slate-800/80 space-y-1.5">
                      <div className="text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1 pb-1 border-b border-slate-800">
                        <FileText className="w-3 h-3" />
                        <span>Dokumen & Surat Jalan</span>
                      </div>
                      <div className="flex justify-between items-start gap-1">
                        <span className="text-slate-400 text-[11px]">No. Surat Jalan:</span>
                        <span className="font-mono-num font-bold text-amber-300 text-right">{activeTx.suratJalanNumber || '-'}</span>
                      </div>
                      <div className="flex justify-between items-start gap-1">
                        <span className="text-slate-400 text-[11px]">Tgl Jadwal Sistem:</span>
                        <span className="font-mono-num text-slate-300 text-right">{activeTx.scheduledDeliveryDate || activeTx.suratJalanDate || '-'}</span>
                      </div>
                      <div className="flex justify-between items-start gap-1">
                        <span className="text-slate-400 text-[11px]">Waktu Check-In:</span>
                        <span className="font-mono-num text-slate-300 text-right">{formatDateTime(activeTx.gateInTime)}</span>
                      </div>
                      <div className="flex justify-between items-start gap-1 pt-1 border-t border-slate-800/60">
                        <span className="text-slate-400 text-[11px]">Berat di Surat Jalan:</span>
                        <span className="font-mono-num font-bold text-emerald-400 text-right">
                          {activeTx.suratJalanWeight ? `${activeTx.suratJalanWeight.toLocaleString('id-ID')} kg` : '-'}
                        </span>
                      </div>
                    </div>

                    {/* 3. Fisik Muatan & Timbang Masuk */}
                    <div className="bg-slate-900/90 rounded-lg p-3 border border-slate-800/80 space-y-1.5">
                      <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1 pb-1 border-b border-slate-800">
                        <Scale className="w-3 h-3" />
                        <span>Fisik Bak & Timbangan</span>
                      </div>
                      <div className="flex justify-between items-center gap-1">
                        <span className="text-slate-400 text-[11px]">Kondisi Terpal:</span>
                        <div>{renderTarpBadge(activeTx.tarpCondition)}</div>
                      </div>
                      <div className="flex justify-between items-start gap-1">
                        <span className="text-slate-400 text-[11px]">No. Segel Bak:</span>
                        <span className="font-mono-num text-slate-300 text-right">{activeTx.sealNumber || 'Tanpa Segel'}</span>
                      </div>
                      <div className="flex justify-between items-start gap-1">
                        <span className="text-slate-400 text-[11px]">Timbang Gross Masuk:</span>
                        <span className="font-mono-num font-bold text-cyan-400 text-right">
                          {activeTx.grossWeight ? `${activeTx.grossWeight.toLocaleString('id-ID')} kg` : 'Belum Timbang'}
                        </span>
                      </div>
                      <div className="flex justify-between items-start gap-1 pt-1 border-t border-slate-800/60">
                        <span className="text-slate-400 text-[11px]">Operator Timbang:</span>
                        <span className="font-medium text-slate-300 text-right">{activeTx.weighInOperator || '-'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 1. Visual Inspection Section */}
                <div className="p-3.5 bg-slate-950/70 rounded-lg border border-slate-800 space-y-3.5">
                  <h4 className="text-xs font-bold text-amber-400 uppercase flex items-center justify-between">
                    <span>1. Pemeriksaan Visual & Fisik Muatan</span>
                    <span className="text-slate-400 font-normal text-[11px]">Karakteristik Fisik, Suhu & Pengotor</span>
                  </h4>

                  {/* Grid 1: Dropdown Karakteristik Batubara (Warna, Rank, Kilap, Pengotor) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div>
                      <label className="block text-[11px] text-slate-300 font-semibold mb-1">
                        Warna Batu Bara
                      </label>
                      <select
                        value={coalColor}
                        onChange={(e) => setCoalColor(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 focus:border-amber-400 rounded px-2.5 py-1.5 text-xs text-white"
                      >
                        <option value="Hitam">Hitam</option>
                        <option value="Hitam Kecoklatan">Hitam Kecoklatan</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-300 font-semibold mb-1">
                        Level Rank
                      </label>
                      <select
                        value={rankLevel}
                        onChange={(e) => setRankLevel(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 focus:border-amber-400 rounded px-2.5 py-1.5 text-xs text-white"
                      >
                        <option value="High Rank Coal">High Rank Coal</option>
                        <option value="Medium Rank">Medium Rank</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-300 font-semibold mb-1">
                        Kilap Batubara
                      </label>
                      <select
                        value={luster}
                        onChange={(e) => setLuster(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 focus:border-amber-400 rounded px-2.5 py-1.5 text-xs text-white"
                      >
                        <option value="Hitam Mengkilap">Hitam Mengkilap</option>
                        <option value="Hitam">Hitam</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-300 font-semibold mb-1">
                        Bahan Pengotor
                      </label>
                      <select
                        value={impurityStatus}
                        onChange={(e) => {
                          const val = e.target.value;
                          setImpurityStatus(val);
                          if (val === 'Tidak ada Kontaminasi') {
                            setContaminants({
                              'Lempung': false,
                              'Batu': false,
                              'Pasir': false,
                            });
                          }
                        }}
                        className={`w-full bg-slate-900 border rounded px-2.5 py-1.5 text-xs font-semibold ${
                          impurityStatus === 'Ada Kontaminasi'
                            ? 'border-rose-500 text-rose-300'
                            : 'border-slate-700 text-emerald-300 focus:border-amber-400'
                        }`}
                      >
                        <option value="Tidak ada Kontaminasi">Tidak ada Kontaminasi</option>
                        <option value="Ada Kontaminasi">Ada Kontaminasi</option>
                      </select>
                    </div>
                  </div>

                  {/* Grid 2: Kondisi Fisik Lapangan (Kebasahan, Suhu, Bau) */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1 border-t border-slate-900">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Tingkat Kebasahan Visual</label>
                      <select
                        value={moistureVisual}
                        onChange={(e) => setMoistureVisual(e.target.value as any)}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
                      >
                        <option value="KERING">Kering (Normal)</option>
                        <option value="LEMBAB">Lembab (Wajar)</option>
                        <option value="BASAH_BECEK">Basah Ekstrem / Air Menggenang</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1 flex items-center gap-1">
                        <Thermometer className="w-3 h-3 text-rose-400" />
                        <span>Suhu Muatan Batubara (°C)</span>
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={temperatureCelsius}
                        onChange={(e) => setTemperatureCelsius(Number(e.target.value))}
                        className={`w-full bg-slate-900 border rounded px-2.5 py-1.5 text-xs font-mono-num ${
                          isHot ? 'border-rose-500 text-rose-400 font-bold' : 'border-slate-700 text-white'
                        }`}
                      />
                      {isHot && (
                        <span className="text-[10px] text-rose-400 block mt-0.5">
                          ⚠️ Peringatan: Suhu tinggi &gt; 55°C (indikasi swabakar)
                        </span>
                      )}
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Status Bau & Asap</label>
                      <select
                        value={odorStatus}
                        onChange={(e) => setOdorStatus(e.target.value as any)}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white"
                      >
                        <option value="NORMAL">Normal / Tanpa Asap</option>
                        <option value="BAU_BELERANG_TINGGI">Bau Belerang Menyengat</option>
                        <option value="BERASAP_PANAS">Berasap / Titik Panas Aktif</option>
                      </select>
                    </div>
                  </div>

                  {/* Contaminants Checkboxes */}
                  <div className="pt-2 border-t border-slate-900">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] text-slate-400 font-medium">
                        Deteksi Rincian Kontaminan Pengotor:
                      </span>
                      {impurityStatus === 'Ada Kontaminasi' && (
                        <span className="text-[10px] text-rose-400 font-semibold">
                          * Tandai jenis kontaminan yang terdeteksi di bak truk
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-5 text-xs">
                      {Object.keys(contaminants).map((key) => (
                        <label key={key} className="flex items-center gap-2 text-slate-300 hover:text-white cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={contaminants[key]}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              const updated = { ...contaminants, [key]: checked };
                              setContaminants(updated);
                              if (checked && impurityStatus !== 'Ada Kontaminasi') {
                                setImpurityStatus('Ada Kontaminasi');
                              }
                            }}
                            className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-0 cursor-pointer"
                          />
                          <span className="font-medium text-slate-200">{key}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 2. Metode Moisture Analysis Section */}
                <div className="p-3.5 bg-slate-950/70 rounded-lg border border-slate-800 space-y-3">
                  <h4 className="text-xs font-bold text-amber-400 uppercase flex items-center justify-between">
                    <span>2. Metode Moisture Analysis (Kadar Air)</span>
                    <span className="text-slate-400 font-normal text-[11px]">Sampling ID & Pengujian Kadar Air</span>
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[11px] text-slate-400">Sampling ID *</label>
                        <button
                          type="button"
                          onClick={() => setSampleId(generateAutoSampleId(transactions, activeTx))}
                          className="text-[10px] text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
                          title="Generate ulang ID sampling otomatis sesuai tanggal sistem"
                        >
                          Reset Auto
                        </button>
                      </div>
                      <input
                        type="text"
                        required
                        value={sampleId}
                        onChange={(e) => setSampleId(e.target.value)}
                        placeholder="PA-261101"
                        className="w-full bg-slate-900 border border-slate-700 focus:border-indigo-500 rounded px-2.5 py-1.5 text-xs text-white font-mono-num font-bold tracking-wider"
                      />
                      <span className="text-[10px] text-slate-500 mt-0.5 block font-mono-num">
                        Format: PA-YYMMNN (Auto Sistem)
                      </span>
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-300 font-semibold mb-1">
                        Metode Moisture Analysis
                      </label>
                      <select
                        value={samplingMethod}
                        onChange={(e) => setSamplingMethod(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 focus:border-indigo-500 rounded px-2.5 py-1.5 text-xs text-white"
                      >
                        <option value="KADAR_AIR">Kadar Air (Total Moisture / TM)</option>
                        <option value="AUGUR_SAMPLER">Kadar Air - Mekanik Augur</option>
                        <option value="MANUAL_CORING">Kadar Air - Manual Coring ASTM</option>
                        <option value="CROSS_BELT">Kadar Air - Cross-Belt Cutter</option>
                        <option value="GRAB">Kadar Air - Grab Sampling Bak</option>
                        <option value="RAPID_MOISTURE">Kadar Air - Rapid Analyzer Lab</option>
                      </select>
                      <span className="text-[10px] text-slate-400 mt-0.5 block">
                        Metode Sampling Kadar Air
                      </span>
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-300 font-semibold mb-1">
                        Nama Petugas QC <span className="text-amber-400">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ketik nama petugas QC (wajib diisi)..."
                        value={inspectorName}
                        onChange={(e) => {
                          setInspectorName(e.target.value);
                          if (inspectorError && e.target.value.trim()) {
                            setInspectorError(false);
                          }
                        }}
                        className={`w-full bg-slate-900 border rounded px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none transition-colors ${
                          inspectorError 
                            ? 'border-rose-500 ring-1 ring-rose-500/50 bg-rose-950/20' 
                            : 'border-slate-700 focus:border-indigo-500'
                        }`}
                      />
                      {inspectorError ? (
                        <p className="text-[10px] text-rose-400 font-medium mt-1">
                          * Nama Petugas QC wajib diisikan sebelum submit.
                        </p>
                      ) : (
                        <span className="text-[10px] text-slate-500 mt-0.5 block">
                          Wajib diisi oleh analis bertugas
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 3. Final Decision & Notes */}
                <div className="p-4 bg-slate-950 rounded-lg border border-slate-800 space-y-4">
                  <h4 className="text-xs font-bold text-white uppercase">
                    3. Keputusan Mutu QC-PA & Catatan Analis (PIC QC)
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => setDecision('APPROVED')}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        decision === 'APPROVED'
                          ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300 ring-1 ring-emerald-500'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs mb-1">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>APPROVED (Lolos Murni)</span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Kualitas hasil uji lab ≥24 jam memenuhi spesifikasi kontrak PO.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDecision('CONDITIONAL_PENALTY')}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        decision === 'CONDITIONAL_PENALTY'
                          ? 'bg-amber-950/60 border-amber-500 text-amber-300 ring-1 ring-amber-500'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs mb-1">
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                        <span>CONDITIONAL (Penalti)</span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Ada deviasi kalori/moisture pada hasil lab. Diterima dengan penyesuaian harga/klaim.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDecision('REJECTED')}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        decision === 'REJECTED'
                          ? 'bg-rose-950/60 border-rose-500 text-rose-300 ring-1 ring-rose-500'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs mb-1">
                        <XCircle className="w-4 h-4 text-rose-400" />
                        <span>REJECTED (Tidak Sesuai Spek)</span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Mutu jauh di bawah spesifikasi kontrak (klaim berita acara QC).
                      </p>
                    </button>
                  </div>

                  <div className="text-xs">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Catatan Keputusan QC:
                      </label>
                      <input
                        type="text"
                        placeholder="Tambahkan catatan khusus pengujian / rekomendasi (opsional)..."
                        value={decisionNotes}
                        onChange={(e) => setDecisionNotes(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Submit Action */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-800">
                  <div className="text-xs text-slate-400">
                    {!inspectorName.trim() ? (
                      <span className="text-amber-400 font-medium flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        * Wajib mengisi Nama Petugas QC (PIC QC) sebelum menyimpan data
                      </span>
                    ) : (
                      <span>* Data QC-PA diperbarui secara independen dan tidak masuk hitungan jam operasional armada.</span>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={!inspectorName.trim()}
                    className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-bold text-xs rounded-lg transition-colors shadow-lg cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    <span>{activeTx.qcTime ? 'Perbarui Data QC-PA' : 'Simpan & Update Data QC-PA'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-500">
              Pilih armada dari daftar di sebelah kiri untuk memulai pemeriksaan sampel.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
