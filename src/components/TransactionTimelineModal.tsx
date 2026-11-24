import React from 'react';
import { 
  Clock, 
  CheckCircle2, 
  ShieldCheck, 
  Scale, 
  FlaskConical, 
  Warehouse, 
  Truck, 
  FileText,
  X
} from 'lucide-react';
import { CoalTransaction } from '../types/coal';
import { getOperationalTimeline, calculateFromFormattedTimes } from '../utils/timeUtils';

interface TransactionTimelineModalProps {
  transaction: CoalTransaction;
  onClose: () => void;
}

export const TransactionTimelineModal: React.FC<TransactionTimelineModalProps> = ({
  transaction,
  onClose,
}) => {
  const { checkpoints, totalDuration } = getOperationalTimeline(transaction);

  // Direct calculation guarantee from gate in and gate out clock times
  const gateInClock = checkpoints[0]?.formattedTime;
  const gateOutClock = checkpoints[checkpoints.length - 1]?.formattedTime;
  const isFinished = transaction.status === 'COMPLETED' || checkpoints[checkpoints.length - 1]?.status === 'COMPLETED';

  let displayedDurationText = totalDuration.text;
  if (
    (displayedDurationText === '0 Menit' || displayedDurationText === '0 Menit (0 Jam)' || displayedDurationText === '-') &&
    isFinished &&
    gateInClock &&
    gateOutClock &&
    gateInClock !== '-' &&
    gateOutClock !== '-'
  ) {
    const directCalc = calculateFromFormattedTimes(gateInClock, gateOutClock);
    if (directCalc && directCalc.text) {
      displayedDurationText = directCalc.text;
    }
  }

  const getStageIcon = (id: string) => {
    switch (id) {
      case 'gate-in':
        return <ShieldCheck className="w-4 h-4 text-amber-400" />;
      case 'weigh-in':
        return <Scale className="w-4 h-4 text-blue-400" />;
      case 'qc-check':
        return <FlaskConical className="w-4 h-4 text-purple-400" />;
      case 'unloading':
        return <Warehouse className="w-4 h-4 text-amber-500" />;
      case 'weigh-out':
        return <Scale className="w-4 h-4 text-emerald-400" />;
      case 'gate-out':
        return <Truck className="w-4 h-4 text-emerald-500" />;
      default:
        return <Clock className="w-4 h-4 text-slate-400" />;
    }
  };

  const getStageInputNote = (id: string): string | undefined => {
    switch (id) {
      case 'gate-in':
        return transaction.securityNotes?.trim() || undefined;
      case 'weigh-in':
        return transaction.weighInNotes?.trim() || undefined;
      case 'unloading':
        return transaction.unloadingNotes?.trim() || undefined;
      case 'weigh-out':
        return transaction.weighOutNotes?.trim() || undefined;
      case 'gate-out':
        return transaction.gateOutNotes?.trim() || undefined;
      default:
        return undefined;
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="relative bg-white border border-slate-300 rounded-2xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl my-auto overflow-hidden text-slate-900 transition-all duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="timeline-modal-header"
      >
        {/* Sticky Header - Guaranteed Never Clipped Off */}
        <div 
          id="timeline-modal-header"
          className="shrink-0 p-4 sm:p-5 border-b border-slate-200 bg-white flex items-start justify-between gap-3 z-10"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="font-mono text-base sm:text-lg font-black text-amber-900 tracking-wider bg-amber-100 px-3 py-1 rounded-lg border border-amber-300 shadow-xs">
                {transaction.vehiclePlate}
              </span>
              <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-800 border border-slate-300 font-mono shadow-xs">
                Antrean #{transaction.queueNumber}
              </span>
              <span className={`px-2.5 py-1 rounded-lg text-xs font-bold tracking-wide border shadow-xs ${
                isFinished
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : 'bg-amber-50 text-amber-800 border-amber-300'
              }`}>
                {isFinished ? 'SELESAI (SUDAH KELUAR)' : 'SEDANG PROSES DI DALAM'}
              </span>
            </div>

            <p className="text-xs text-slate-600 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>Driver: <strong className="text-slate-900 font-bold">{transaction.driverName}</strong></span>
              <span className="text-slate-400">·</span>
              <span>PO: <strong className="text-amber-800 font-mono font-bold">{transaction.poNumber}</strong></span>
              <span className="text-slate-400">·</span>
              <span className="truncate">Supplier: <strong className="text-slate-800 font-medium">{transaction.supplierName}</strong></span>
              <span className="text-slate-400">·</span>
              <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-800 px-2 py-0.5 rounded border border-slate-300 font-semibold text-[11px]">
                Tgl Kedatangan: <strong className="text-slate-950 font-mono-num font-bold">{transaction.gateInTime ? new Date(transaction.gateInTime).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'}</strong>
              </span>
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-200 transition-colors shrink-0"
            title="Tutup Timeline (Esc)"
            aria-label="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Total Turnaround Duration Card (Solid Official Enterprise Panel) */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-300 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-lg bg-amber-500/15 border border-amber-500/40 flex items-center justify-center shrink-0">
                  <Clock className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <span className="text-[10px] sm:text-[11px] uppercase tracking-wider text-slate-500 font-bold block">
                    TOTAL WAKTU OPERASIONAL (GATE IN S.D GATE OUT)
                  </span>
                  <span className="text-xl sm:text-2xl font-black text-amber-800 font-mono-num">
                    {displayedDurationText}
                  </span>
                </div>
              </div>

              <div className="text-left sm:text-right text-xs font-mono-num text-slate-600 pt-2 sm:pt-0 border-t border-slate-200 sm:border-t-0 space-y-0.5">
                <div>Tgl Kedatangan: <strong className="text-slate-950 font-bold">{transaction.gateInTime ? new Date(transaction.gateInTime).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'}</strong></div>
                <div>Masuk Gerbang: <strong className="text-slate-900 font-bold">{checkpoints[0]?.formattedTime} WIB</strong></div>
                <div>
                  Keluar Gerbang: <strong className="text-slate-900 font-bold">
                    {checkpoints[checkpoints.length - 1]?.formattedTime && checkpoints[checkpoints.length - 1]?.formattedTime !== '-'
                      ? `${checkpoints[checkpoints.length - 1].formattedTime} WIB`
                      : 'Masih di dalam terminal'}
                  </strong>
                </div>
              </div>
            </div>
          </div>

          {/* Timeline Checkpoints (5 Tahap Operasional Utama) */}
          <div className="space-y-3.5 pr-0.5">
            {checkpoints.map((step, idx) => {
              const isLast = idx === checkpoints.length - 1;
              const isDone = step.status === 'COMPLETED';
              const isCurrent = step.status === 'IN_PROGRESS';

              return (
                <div key={step.id} className="relative flex items-start gap-3.5 group">
                  {/* Connecting Line */}
                  {!isLast && (
                    <div className={`absolute left-4 top-8 bottom-0 w-0.5 -ml-px ${
                      isDone ? 'bg-amber-400' : 'bg-slate-300'
                    }`} />
                  )}

                  {/* Node Icon */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-10 border transition-all ${
                    isDone 
                      ? 'bg-amber-50 border-amber-500 text-amber-700 shadow-xs'
                      : isCurrent
                      ? 'bg-amber-100 border-amber-500 text-amber-800 animate-pulse'
                      : 'bg-slate-100 border-slate-300 text-slate-400'
                  }`}>
                    {getStageIcon(step.id)}
                  </div>

                  {/* Content Box */}
                  <div className={`flex-1 p-3.5 rounded-xl border transition-colors ${
                    isDone
                      ? 'bg-white border-slate-300 shadow-xs hover:border-slate-400'
                      : isCurrent
                      ? 'bg-amber-50/60 border-amber-300 shadow-xs'
                      : 'bg-slate-50 border-slate-200 opacity-60'
                  }`}>
                    <div className="flex flex-wrap items-center justify-between gap-1 mb-1.5">
                      <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <span className="text-slate-900 font-bold">{idx + 1}. {step.stageName}</span>
                        {isDone && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                      </span>

                      <div className="flex items-center gap-2">
                        {step.durationFromPrevious && (
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
                            {step.durationFromPrevious}
                          </span>
                        )}
                        <span className="text-xs font-mono font-bold text-slate-800">
                          {idx === 0 && transaction.gateInTime && (
                            <span className="text-slate-600 font-semibold mr-1.5 font-sans">
                              {new Date(transaction.gateInTime).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })} ·
                            </span>
                          )}
                          {step.formattedTime} {step.formattedTime !== '-' ? 'WIB' : ''}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
                      <div>
                        {step.actor && <span>Petugas: <strong className="text-slate-900 font-bold">{step.actor}</strong></span>}
                        {step.note && <span className="ml-2 italic text-slate-600 font-medium">({step.note})</span>}
                      </div>

                      {step.metric && (
                        <span className="font-mono font-bold text-amber-950 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                          {step.metric}
                        </span>
                      )}
                    </div>

                    {getStageInputNote(step.id) && (
                      <div className="mt-2 pt-2 border-t border-slate-200">
                        <div className="px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-slate-800 leading-snug break-words">
                          <span className="font-bold text-amber-900 inline-flex items-center gap-1 mr-1">
                            <FileText className="w-3 h-3 text-amber-600 shrink-0" />
                            Catatan:
                          </span>
                          <span>{getStageInputNote(step.id)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Independent QC-PA Lab Card (Excluded from Turnaround Hours) */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-300 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-purple-100 border border-purple-300 flex items-center justify-center shrink-0">
                  <FlaskConical className="w-4 h-4 text-purple-700" />
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-900 block">
                    Uji Lab QC-PA (Pasca Proses · ≥24 Jam)
                  </span>
                  <span className="text-[10px] text-slate-600">
                    Diupdate terpisah oleh PIC QC setelah proses operasional selesai
                  </span>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-800 border border-slate-300">
                Tidak Masuk Hitungan Jam Proses
              </span>
            </div>

            {transaction.qcTime || transaction.labResults?.calorieGAR ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-200 text-[11px]">
                <div>
                  <span className="text-slate-500 block text-[10px]">Sample ID</span>
                  <strong className="font-mono text-slate-900">{transaction.sampleId || '-'}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Hasil Uji Lab</span>
                  <strong className="font-mono text-slate-900">
                    {transaction.labResults?.calorieGAR ? `${transaction.labResults.calorieGAR} kcal · TM ${Number(transaction.labResults.totalMoisture).toFixed(1)}%` : '-'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Status Mutu QC</span>
                  <strong className={`font-bold ${
                    transaction.qcStatus === 'REJECTED' ? 'text-rose-700' : 'text-emerald-700'
                  }`}>
                    {transaction.qcStatus || 'UPDATED'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">PIC QC & Waktu Update</span>
                  <strong className="text-slate-900 block truncate">
                    {transaction.qcInspector || 'PIC QC'} {transaction.qcTime ? `· ${new Date(transaction.qcTime).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit' })} ${new Date(transaction.qcTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}` : ''}
                  </strong>
                </div>
              </div>
            ) : (
              <div className="pt-2 border-t border-slate-200 text-[11px] text-slate-600 flex items-center justify-between">
                <span>Status: <strong className="text-amber-800">Menunggu Update PIC QC (Estimasi Lab ≥24 Jam)</strong></span>
                <span className="font-mono text-slate-500">Independen</span>
              </div>
            )}
            {transaction.qcDecisionNotes?.trim() && (
              <div className="pt-2 border-t border-slate-200">
                <div className="px-2.5 py-1.5 rounded-lg bg-purple-50 border border-purple-200 text-[11px] text-slate-800 leading-snug break-words">
                  <span className="font-bold text-purple-900 inline-flex items-center gap-1 mr-1">
                    <FileText className="w-3 h-3 text-purple-600 shrink-0" />
                    Catatan QC:
                  </span>
                  <span>{transaction.qcDecisionNotes.trim()}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sticky Footer */}
        <div className="shrink-0 p-3.5 sm:p-4 border-t border-slate-800 bg-slate-900/98 backdrop-blur-md flex items-center justify-between text-xs z-10">
          <span className="text-slate-600 font-mono text-[11px] truncate max-w-[240px] sm:max-w-none">
            ID: {transaction.id} · Tiket: {transaction.ticketNumber} · Tgl Kedatangan: {transaction.gateInTime ? new Date(transaction.gateInTime).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg transition-colors shadow-sm"
          >
            Tutup Timeline
          </button>
        </div>
      </div>
    </div>
  );
};
