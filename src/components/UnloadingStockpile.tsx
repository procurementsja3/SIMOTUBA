import React, { useState } from 'react';
import { 
  Warehouse, 
  CheckCircle2, 
  Clock, 
  ArrowRight, 
  Truck, 
  AlertCircle,
  HardHat
} from 'lucide-react';
import { CoalTransaction } from '../types/coal';

interface UnloadingStockpileProps {
  transactions: CoalTransaction[];
  onCompleteUnloading: (
    txId: string,
    checkerName: string,
    cleanDumpVerified: boolean,
    notes: string
  ) => void;
  selectedTxId?: string;
}

export const UnloadingStockpile: React.FC<UnloadingStockpileProps> = ({
  transactions,
  onCompleteUnloading,
  selectedTxId,
}) => {
  const eligibleTrucks = React.useMemo(
    () => transactions.filter((t) => t.status === 'BONGKAR' || t.status === 'QC_CHECK'),
    [transactions]
  );

  const [activeTxId, setActiveTxId] = useState<string>(
    selectedTxId && eligibleTrucks.some((t) => t.id === selectedTxId)
      ? selectedTxId
      : eligibleTrucks[0]?.id || ''
  );

  const lastAppliedSelectedTxIdRef = React.useRef<string | undefined>(undefined);

  React.useEffect(() => {
    if (
      selectedTxId &&
      selectedTxId !== lastAppliedSelectedTxIdRef.current &&
      eligibleTrucks.some((t) => t.id === selectedTxId)
    ) {
      lastAppliedSelectedTxIdRef.current = selectedTxId;
      setActiveTxId(selectedTxId);
      return;
    }

    if (!eligibleTrucks.some((t) => t.id === activeTxId)) {
      setActiveTxId(eligibleTrucks[0]?.id || '');
    }
  }, [selectedTxId, eligibleTrucks, activeTxId]);

  const activeTx = transactions.find((t) => t.id === activeTxId);

  const [checkerName, setCheckerName] = useState('');
  const [cleanDumpVerified, setCleanDumpVerified] = useState(true);
  const [unloadingNotes, setUnloadingNotes] = useState('');

  React.useEffect(() => {
    setCheckerName('');
    setCleanDumpVerified(true);
    setUnloadingNotes('');
  }, [activeTxId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTx || !checkerName.trim()) return;
    onCompleteUnloading(activeTx.id, checkerName.trim(), cleanDumpVerified, unloadingNotes.trim());
    setCheckerName('');
    setCleanDumpVerified(true);
    setUnloadingNotes('');
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <Warehouse className="w-5 h-5 text-sky-600" />
          <span>PROSES BONGKAR</span>
        </h2>
        <p className="text-xs text-slate-600 mt-0.5">
          Verifikasi pembongkaran muatan batubara di dome/stockpile, pengecekan bak bersih, dan pengarahan ke timbang keluar
        </p>
      </div>

      {eligibleTrucks.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-10 text-center text-slate-500">
          <Warehouse className="w-12 h-12 mx-auto mb-3 text-slate-600" />
          <p className="text-base text-slate-300 font-semibold">Tidak ada armada yang sedang membongkar muatan di stockpile saat ini.</p>
          <p className="text-xs text-slate-500 mt-1">
            Armada akan langsung masuk ke stasiun ini setelah selesai melakukan Timbang Masuk (Gross).
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Truck Queue */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Armada di Lokasi Bongkar
              </span>
              <span className="text-xs text-sky-400 font-mono-num font-bold">
                {eligibleTrucks.length} Truk
              </span>
            </div>

            <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
              {eligibleTrucks.map((tx) => {
                const isSelected = tx.id === activeTxId;
                return (
                  <button
                    key={tx.id}
                    type="button"
                    onClick={() => setActiveTxId(tx.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-all ${
                      isSelected
                        ? 'bg-sky-500/10 border-sky-500/60 shadow-sm'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
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
                    <div className="text-xs text-slate-300 font-medium truncate">{tx.driverName}</div>
                    <div className="text-[11px] text-sky-400 truncate mt-0.5 font-medium">
                      📍 {tx.assignedStockpile || 'Stockpile Utama'}
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400 font-mono-num">
                      <span>Muatan: {(tx.grossWeight / 1000).toFixed(2)} T</span>
                      <span className="text-emerald-400">{tx.qcTime ? 'QC Selesai' : 'Siap Bongkar'}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right 2 Columns: Unloading Management Form */}
          {activeTx ? (
            <div className="lg:col-span-2 space-y-5">
              <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="font-mono-num text-lg font-bold text-slate-900 bg-slate-950 px-3 py-1 rounded-lg border border-slate-700">
                      {activeTx.vehiclePlate}
                    </span>
                    <div>
                      <div className="text-sm font-bold text-slate-900">{activeTx.driverName} ({activeTx.transporterName})</div>
                      <div className="text-xs text-slate-600">PO: <strong className="text-amber-700 font-mono-num">{activeTx.poNumber}</strong></div>
                    </div>
                  </div>

                  <div className="text-right text-xs">
                    <span className="px-2.5 py-1 text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200 rounded">
                      Lokasi: {activeTx.assignedStockpile || activeTx.unloadingStockpile || 'Stockpile Utama'}
                    </span>
                  </div>
                </div>

                {/* Stockpile Summary Badge */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-950/70 p-3.5 rounded-lg border border-slate-800 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase">Alokasi Stockpile</span>
                    <strong className="text-xs font-semibold text-sky-700">{activeTx.assignedStockpile || activeTx.unloadingStockpile || 'Stockpile Utama'}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase">Gross Masuk</span>
                    <strong className="text-xs font-mono-num text-emerald-700">
                      {activeTx.grossWeight.toLocaleString('id-ID')} kg
                    </strong>
                  </div>
                </div>

                {/* Unloading Checklists */}
                <div className="p-4 bg-slate-950/80 rounded-lg border border-slate-800 space-y-3 text-xs">
                  <h4 className="text-xs font-bold text-amber-400 uppercase flex items-center gap-2">
                    <HardHat className="w-4 h-4 text-amber-400" />
                    Pengecekan Tally Checker Lapangan Stockpile
                  </h4>

                  <div className="space-y-2">
                    <label className="flex items-center gap-2.5 p-3 bg-slate-900 rounded border border-slate-700/80 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cleanDumpVerified}
                        onChange={(e) => setCleanDumpVerified(e.target.checked)}
                        className="w-4 h-4 text-amber-500 rounded border-slate-700 focus:ring-0"
                      />
                      <div>
                        <span className="font-semibold text-slate-200 block">
                          Bak Truk Bersih Tuntas Tanpa Sisa Batubara Menempel (Clean Dump)
                        </span>
                        <span className="text-[11px] text-slate-400">
                          Pastikan seluruh batubara sudah tertuang 100% dan bak hidrolik telah diturunkan rapat sebelum bergerak ke timbang keluar.
                        </span>
                      </div>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <div>
                      <label className="text-[11px] text-slate-700 font-semibold mb-1 flex items-center justify-between">
                        <span>NAMA OPERATOR <span className="text-amber-600">*</span></span>
                        {!checkerName.trim() && (
                          <span className="text-[10px] text-amber-700 font-normal">Wajib diisi</span>
                        )}
                      </label>
                      <input
                        type="text"
                        value={checkerName}
                        onChange={(e) => setCheckerName(e.target.value)}
                        placeholder="Ketik nama operator (wajib diisi)..."
                        className={`w-full bg-slate-900 border rounded px-2.5 py-1.5 text-xs text-white focus:outline-none transition-colors ${
                          !checkerName.trim()
                            ? 'border-amber-500/80 focus:border-amber-400 ring-1 ring-amber-500/30'
                            : 'border-slate-700 focus:border-amber-500'
                        }`}
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] text-slate-600 mb-1">
                        Catatan Kondisi Pembongkaran
                      </label>
                      <input
                        type="text"
                        value={unloadingNotes}
                        onChange={(e) => setUnloadingNotes(e.target.value)}
                        placeholder="Catatan kebersihan bak / kondisi dumping (opsional)..."
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Submit to Weigh Out Tare */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-800">
                  <div className="text-xs text-slate-600">
                    {!checkerName.trim() ? (
                      <span className="text-amber-700 font-medium flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        * Wajib mengisi NAMA OPERATOR sebelum menyelesaikan pembongkaran
                      </span>
                    ) : (
                      <span>* Verifikasi pembongkaran muatan selesai & armada diarahkan ke timbang keluar.</span>
                    )}
                  </div>
                  <button
                    type="submit"
                    disabled={!checkerName.trim()}
                    className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-lg transition-colors shadow-lg cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    <span>Selesai Bongkar & Arahkan ke Jembatan Timbang Keluar</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-500">
              Pilih armada yang sedang membongkar muatan dari daftar di sebelah kiri.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
