import React, { useEffect } from 'react';
import { Printer, X, CheckCircle2, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import { CoalTransaction, PurchaseOrder } from '../types/coal';
import { calculateDuration } from '../utils/timeUtils';

interface PrintableTicketModalProps {
  transaction: CoalTransaction | null;
  purchaseOrder?: PurchaseOrder | null;
  onClose: () => void;
}

export const PrintableTicketModal: React.FC<PrintableTicketModalProps> = ({
  transaction,
  purchaseOrder,
  onClose,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!transaction) return null;

  const handlePrint = () => {
    window.print();
  };

  const tolerancePct = purchaseOrder?.tolerancePercentage || 5;

  const hasQcData = Boolean(transaction.qcTime || transaction.labResults?.calorieGAR);

  // Visual QC helpers
  const visualMoistureDisplay = hasQcData ? (transaction.visualAssessment?.moistureVisual || '-') : '-';
  const visualTempDisplay = hasQcData && transaction.visualAssessment?.temperatureCelsius !== undefined
    ? `${transaction.visualAssessment.temperatureCelsius}°C`
    : '-';
  const visualColorLusterDisplay = hasQcData && (transaction.visualAssessment?.coalColor || transaction.visualAssessment?.luster)
    ? `${transaction.visualAssessment?.coalColor || 'Hitam'} (${transaction.visualAssessment?.luster || '-'})`
    : '-';
  const visualContaminantsDisplay = !hasQcData
    ? '-'
    : (transaction.visualAssessment?.contaminantsFound && transaction.visualAssessment.contaminantsFound.length > 0)
      ? transaction.visualAssessment.contaminantsFound.join(', ')
      : 'Bebas Pengotor (Nihil)';

  // Lab & Moisture QC helpers
  const calorieValue = transaction.labResults?.calorieGAR ? `${Math.round(transaction.labResults.calorieGAR)} kcal/kg` : '-';
  const moistureValue = transaction.labResults?.totalMoisture !== undefined ? `${Number(transaction.labResults.totalMoisture).toFixed(1)}%` : '-';
  const ashValue = transaction.labResults?.ashContent !== undefined ? `${Number(transaction.labResults.ashContent).toFixed(1)}%` : '-';
  const sulfurValue = transaction.labResults?.totalSulfur !== undefined ? `${Number(transaction.labResults.totalSulfur).toFixed(2)}%` : '-';
  const qcStatusValue = hasQcData ? (transaction.qcStatus || 'UPDATED') : 'MENUNGGU LAB (≥24 JAM)';

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="relative bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full max-h-[94vh] flex flex-col shadow-2xl my-auto overflow-hidden text-slate-200"
        role="dialog"
        aria-modal="true"
        aria-label="Pratinjau Tiket Timbang"
      >
        {/* Sticky Top Header Controls (Hidden in print) */}
        <div className="shrink-0 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 p-3.5 sm:p-4 border-b border-slate-800 bg-slate-900/98 backdrop-blur-md z-10 print:hidden">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-white">Pratinjau Tiket Timbang & Berita Acara (BAPB)</span>
            <span className="font-mono-num text-xs bg-slate-800 text-amber-400 px-2 py-0.5 rounded border border-slate-700">
              {transaction.ticketNumber}
            </span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={handlePrint}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition-colors shadow-sm cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak Tiket (Print / PDF)</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg text-xs font-bold border border-slate-700 transition-colors cursor-pointer shrink-0"
              title="Tutup Pratinjau Tiket (Esc)"
            >
              <X className="w-4 h-4 text-rose-400" />
              <span>Tutup Preview</span>
            </button>
          </div>
        </div>

        {/* Scrollable Printable Ticket Document Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 bg-slate-950/70 print:p-0 print:overflow-visible">
          <div
            id="printable-ticket"
            className="bg-white text-slate-900 rounded-xl p-4 sm:p-8 font-sans border border-slate-200 shadow-sm print:shadow-none print:border-none print:p-0"
          >
          {/* Header */}
          <div className="border-b-2 border-slate-900 pb-4 mb-4">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-lg font-black tracking-tight text-slate-900 uppercase">
                  PT ENERGI BATUBARA NUSANTARA
                </h1>
                <p className="text-[11px] text-slate-600 font-medium">
                  DIVISI LOGISTIK, JEMBATAN TIMBANG & PENGENDALIAN MUTU BATUBARA
                </p>
                <p className="text-[10px] text-slate-500">
                  Kawasan Industri & Stockpile Terminal Dermaga 3 · Telp: (021) 8990-2100 · Email: weighbridge@energi-coal.id
                </p>
              </div>

              <div className="text-right">
                <div className="inline-block border-2 border-slate-900 px-3 py-1 text-center bg-slate-50">
                  <div className="text-[10px] font-bold uppercase text-slate-700">TIKET TIMBANG RESMI</div>
                  <div className="text-sm font-mono font-bold text-slate-900">{transaction.ticketNumber}</div>
                </div>
                <div className="text-[10px] text-slate-500 mt-1 font-mono">
                  Antrean: {transaction.queueNumber} · Status: {transaction.status}
                </div>
              </div>
            </div>
          </div>

          {/* Subheader Document Title */}
          <div className="text-center my-3 pb-2 border-b border-slate-300">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              SLIP JEMBATAN TIMBANG & BERITA ACARA PENERIMAAN BATUBARA (BAPB)
            </h2>
          </div>

          {/* Section 1: Armada & PO Identity */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-xs mb-4 pb-4 border-b border-slate-200">
            <div>
              <table className="w-full text-left">
                <tbody>
                  <tr>
                    <td className="text-slate-500 py-0.5 w-36">Nomor Polisi (Plat):</td>
                    <td className="font-bold font-mono text-slate-900">{transaction.vehiclePlate}</td>
                  </tr>
                  <tr>
                    <td className="text-slate-500 py-0.5">Nama Pengemudi / Driver:</td>
                    <td className="font-semibold text-slate-900">{transaction.driverName}</td>
                  </tr>
                  <tr>
                    <td className="text-slate-500 py-0.5">Perusahaan Angkutan:</td>
                    <td className="text-slate-800">{transaction.transporterName}</td>
                  </tr>
                  <tr>
                    <td className="text-slate-500 py-0.5">Kondisi Terpal:</td>
                    <td className="font-mono text-slate-800">{transaction.tarpCondition}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div>
              <table className="w-full text-left">
                <tbody>
                  <tr>
                    <td className="text-slate-500 py-0.5 w-36">Nomor Purchase Order:</td>
                    <td className="font-bold font-mono text-slate-900">{transaction.poNumber}</td>
                  </tr>
                  <tr>
                    <td className="text-slate-500 py-0.5">Supplier / Tambang:</td>
                    <td className="font-semibold text-slate-900">{transaction.supplierName}</td>
                  </tr>
                  <tr>
                    <td className="text-slate-500 py-0.5">No. Surat Jalan (SJ):</td>
                    <td className="font-mono text-slate-800">{transaction.suratJalanNumber}</td>
                  </tr>
                  <tr>
                    <td className="text-slate-500 py-0.5">Stockpile Alokasi:</td>
                    <td className="font-semibold text-slate-900">{transaction.assignedStockpile || transaction.unloadingStockpile || 'Stockpile Utama'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 2: Weighbridge Tonnage Reconciliation Table */}
          <div className="mb-4">
            <h3 className="text-xs font-bold text-slate-900 uppercase mb-2">
              A. DATA PENIMBANGAN JEMBATAN TIMBANG
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[540px] sm:min-w-0 text-xs border border-slate-300">
              <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-300">
                <tr>
                  <th className="py-2 px-3 text-left">Kategori Penimbangan</th>
                  <th className="py-2 px-3 text-left">Waktu & Tanggal</th>
                  <th className="py-2 px-3 text-left">Pos / Operator</th>
                  <th className="py-2 px-3 text-right">Berat (KG)</th>
                  <th className="py-2 px-3 text-right">Tonase (TON)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                <tr>
                  <td className="py-1.5 px-3 font-medium text-slate-700">1. Berat Surat Jalan Asal (SJ)</td>
                  <td className="py-1.5 px-3 text-slate-600 font-mono">{transaction.suratJalanDate || '-'}</td>
                  <td className="py-1.5 px-3 text-slate-600">Dokumen Muat Tambang</td>
                  <td className="py-1.5 px-3 text-right font-mono font-semibold">{transaction.suratJalanWeight.toLocaleString('id-ID')} kg</td>
                  <td className="py-1.5 px-3 text-right font-mono font-semibold">{(transaction.suratJalanWeight / 1000).toFixed(3)} T</td>
                </tr>
                <tr>
                  <td className="py-1.5 px-3 font-medium text-slate-700">2. Timbang Masuk (GROSS / Isi)</td>
                  <td className="py-1.5 px-3 text-slate-600 font-mono">
                    {transaction.weighInTime ? new Date(transaction.weighInTime).toLocaleString('id-ID') : '-'}
                  </td>
                  <td className="py-1.5 px-3 text-slate-600">{transaction.weighInOperator || 'JT-01'}</td>
                  <td className="py-1.5 px-3 text-right font-mono font-semibold">{transaction.grossWeight.toLocaleString('id-ID')} kg</td>
                  <td className="py-1.5 px-3 text-right font-mono font-semibold">{(transaction.grossWeight / 1000).toFixed(3)} T</td>
                </tr>
                <tr>
                  <td className="py-1.5 px-3 font-medium text-slate-700">3. Timbang Keluar (TARE / Kosong)</td>
                  <td className="py-1.5 px-3 text-slate-600 font-mono">
                    {transaction.weighOutTime ? new Date(transaction.weighOutTime).toLocaleString('id-ID') : '-'}
                  </td>
                  <td className="py-1.5 px-3 text-slate-600">{transaction.weighOutOperator || 'JT-02'}</td>
                  <td className="py-1.5 px-3 text-right font-mono font-semibold">{transaction.tareWeight.toLocaleString('id-ID')} kg</td>
                  <td className="py-1.5 px-3 text-right font-mono font-semibold">{(transaction.tareWeight / 1000).toFixed(3)} T</td>
                </tr>
                <tr className="bg-slate-50 font-bold border-t-2 border-slate-300">
                  <td className="py-2 px-3 text-slate-900 uppercase">NETTO PABRIK (GROSS - TARE)</td>
                  <td colSpan={2} className="py-2 px-3 text-slate-500 font-normal">Hasil timbangan bersih yang diakui penerimaan</td>
                  <td className="py-2 px-3 text-right font-mono text-emerald-700 text-sm">{transaction.nettoWeight.toLocaleString('id-ID')} kg</td>
                  <td className="py-2 px-3 text-right font-mono text-emerald-700 text-sm">{transaction.nettoTons.toFixed(3)} TON</td>
                </tr>
                <tr className="bg-slate-100 font-semibold text-slate-800">
                  <td className="py-1.5 px-3">Selisih Susut (Netto vs SJ)</td>
                  <td colSpan={2} className="py-1.5 px-3 text-[11px] text-slate-600">
                    Batas toleransi kontrak: ±{tolerancePct}% · Evaluasi: {transaction.toleranceStatus || 'Dalam Toleransi'}
                  </td>
                  <td className="py-1.5 px-3 text-right font-mono">
                    {transaction.weightDifference > 0 ? '+' : ''}{transaction.weightDifference.toLocaleString('id-ID')} kg
                  </td>
                  <td className="py-1.5 px-3 text-right font-mono">
                    {transaction.shrinkagePercentage > 0 ? '+' : ''}{transaction.shrinkagePercentage?.toFixed(2)}%
                  </td>
                </tr>
              </tbody>
            </table>
            </div>
          </div>

          {/* Section B: Data Hasil Pemeriksaan Kualitas Batubara (QC - PA) */}
          <div className="mb-4">
            <div className="flex flex-wrap items-center justify-between gap-1 mb-2">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-tight">
                B. DATA HASIL PEMERIKSAAN KUALITAS BATUBARA (QC - PA · PASCA PROSES)
              </h3>
              <div className="text-[10px] font-mono font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-300">
                Sampling ID: <strong className="text-slate-900">{transaction.sampleId || 'Menunggu PIC QC'}</strong>{transaction.samplingMethod ? ` (${transaction.samplingMethod})` : ''}
              </div>
            </div>

            <div className="space-y-2.5">
              {/* 1. DATA ANALISA FISIK & VISUAL QC */}
              <div className="border border-slate-300 rounded overflow-hidden">
                <div className="bg-slate-100 px-3 py-1 border-b border-slate-300 flex items-center justify-between text-xs font-semibold">
                  <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wide">
                    1. Data Analisa Fisik & Visual QC (Petikan Analisa Visual)
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                    hasQcData
                      ? 'text-emerald-800 bg-emerald-100 border-emerald-300'
                      : 'text-amber-900 bg-amber-100 border-amber-300'
                  }`}>
                    {hasQcData ? 'STATUS: LULUS VISUAL' : 'STATUS: MENUNGGU UPDATE PIC QC'}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-2.5 bg-slate-50 text-xs text-center font-mono">
                  <div className="border-r border-slate-200 last:border-r-0 pr-1">
                    <span className="text-[10px] text-slate-500 block uppercase font-sans">Kondisi Kelembaban</span>
                    <strong className="text-slate-900 font-bold text-xs uppercase block">
                      {visualMoistureDisplay}
                    </strong>
                  </div>
                  <div className="border-r border-slate-200 last:border-r-0 pr-1">
                    <span className="text-[10px] text-slate-500 block uppercase font-sans">Suhu Batubara</span>
                    <strong className="text-slate-900 font-bold text-xs block">
                      {visualTempDisplay}
                    </strong>
                  </div>
                  <div className="border-r border-slate-200 last:border-r-0 pr-1">
                    <span className="text-[10px] text-slate-500 block uppercase font-sans">Warna & Kilap Fisik</span>
                    <strong className="text-slate-900 font-bold text-xs block">
                      {visualColorLusterDisplay}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase font-sans">Pengotor / Kontaminan</span>
                    <strong className="text-slate-900 font-bold text-xs truncate block" title={visualContaminantsDisplay}>
                      {visualContaminantsDisplay}
                    </strong>
                  </div>
                </div>
              </div>

              {/* 2. DATA ANALISA MOISTURE & PARAMETER LABORATORIUM */}
              <div className="border border-slate-300 rounded overflow-hidden">
                <div className="bg-slate-100 px-3 py-1 border-b border-slate-300 flex items-center justify-between text-xs font-semibold">
                  <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wide">
                    2. Data Analisa Moisture & Parameter Lab (Update Lab ≥24 Jam)
                  </span>
                  <span className="text-[10px] font-semibold text-slate-600 font-sans">
                    Metode: {transaction.samplingMethod || 'Uji Lab Independen'}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 p-2.5 bg-slate-50 text-xs text-center font-mono">
                  <div className="border-r border-slate-200 last:border-r-0">
                    <span className="text-[10px] text-slate-500 block font-sans">Kalori GAR</span>
                    <strong className="text-slate-900 font-bold text-sm block">
                      {calorieValue}
                    </strong>
                  </div>
                  <div className="border-r border-slate-200 last:border-r-0">
                    <span className="text-[10px] text-amber-900 font-bold block font-sans">Total Moisture (TM)</span>
                    <strong className="text-slate-900 font-bold text-sm block">
                      {moistureValue}
                    </strong>
                  </div>
                  <div className="border-r border-slate-200 last:border-r-0">
                    <span className="text-[10px] text-slate-500 block font-sans">Ash Content (Abu)</span>
                    <strong className="text-slate-900 font-bold text-sm block">
                      {ashValue}
                    </strong>
                  </div>
                  <div className="border-r border-slate-200 last:border-r-0">
                    <span className="text-[10px] text-slate-500 block font-sans">Total Sulfur (TS)</span>
                    <strong className="text-slate-900 font-bold text-sm block">
                      {sulfurValue}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block font-sans">Status Mutu QC</span>
                    <strong className={`font-bold text-xs uppercase block ${
                      !hasQcData ? 'text-amber-700' : transaction.qcStatus === 'REJECTED' ? 'text-rose-700' : 'text-emerald-700'
                    }`}>
                      {qcStatusValue}
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-2 text-[11px] text-slate-600 flex flex-wrap items-center justify-between gap-1 border-t border-slate-200 pt-1.5 font-sans">
              <div>
                <span>Alokasi Stockpile: <strong>{transaction.assignedStockpile || transaction.unloadingStockpile || 'Stockpile Utama'}</strong></span>
                <span className="mx-2">·</span>
                <span>Keterangan QC: <strong>Independen (Diluar Hitungan Jam Proses)</strong></span>
              </div>
              <div>
                <span>Analis Lab QC - PA: <strong className="text-slate-900 font-bold">{transaction.qcInspector || 'Menunggu PIC QC'}</strong></span>
              </div>
            </div>
          </div>

          {/* Section: Operational Turnaround Duration */}
          <div className="mb-4 p-2.5 bg-slate-50 border border-slate-300 rounded text-xs">
            <div className="flex flex-wrap items-center justify-between text-slate-800 font-mono">
              <div>
                <span className="text-[10px] text-slate-500 block">Waktu Masuk Gerbang (Gate In):</span>
                <strong>{new Date(transaction.gateInTime).toLocaleTimeString('id-ID')} WIB</strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">Waktu Keluar Gerbang (Gate Out):</span>
                <strong>{transaction.gateOutTime ? `${new Date(transaction.gateOutTime).toLocaleTimeString('id-ID')} WIB` : 'Masih di Dalam'}</strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">Total Durasi Operasional Pabrik:</span>
                <strong className="text-amber-900 font-bold">{calculateDuration(transaction.gateInTime, transaction.gateOutTime).text}</strong>
              </div>
            </div>
          </div>

          {/* Section 4: Signatures Table */}
          <div className="pt-4 border-t border-slate-300">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center text-xs">
              <div>
                <p className="text-[10px] text-slate-500 mb-10">Pengemudi / Driver</p>
                <div className="border-b border-slate-400 pb-1 font-semibold text-slate-900">
                  ( {transaction.driverName} )
                </div>
                <p className="text-[9px] text-slate-500 mt-0.5">Transporter</p>
              </div>

              <div>
                <p className="text-[10px] text-slate-500 mb-10">Petugas Keamanan (Pos)</p>
                <div className="border-b border-slate-400 pb-1 font-semibold text-slate-900">
                  ( {transaction.securityOfficer || 'Security'} )
                </div>
                <p className="text-[9px] text-slate-500 mt-0.5">Gate In / Out</p>
              </div>

              <div>
                <p className="text-[10px] text-slate-500 mb-10">Operator Timbangan</p>
                <div className="border-b border-slate-400 pb-1 font-semibold text-slate-900">
                  ( {transaction.weighOutOperator || transaction.weighInOperator || 'Operator JT'} )
                </div>
                <p className="text-[9px] text-slate-500 mt-0.5">Weighbridge Staf</p>
              </div>

              <div>
                <p className="text-[10px] text-slate-500 mb-10">Quality Control / Stockpile</p>
                <div className="border-b border-slate-400 pb-1 font-semibold text-slate-900">
                  ( {transaction.qcInspector || 'Petugas QC'} )
                </div>
                <p className="text-[9px] text-slate-500 mt-0.5">QC & Penerimaan</p>
              </div>
            </div>

            <div className="text-[9px] text-slate-400 text-center mt-6">
              Dicetak otomatis melalui Sistem Terintegrasi Monitoring Batubara & Jembatan Timbang · {new Date().toLocaleString('id-ID')}
            </div>
          </div>
        </div>
      </div>

      {/* Sticky Bottom Actions Bar (Always visible while scrolling, hidden during print) */}
        <div className="shrink-0 p-3 sm:p-4 border-t border-slate-800 bg-slate-900/98 backdrop-blur-md flex items-center justify-between gap-3 print:hidden z-10">
          <div className="text-xs text-slate-400 font-mono-num hidden sm:block">
            Tiket: <strong className="text-slate-200">{transaction.ticketNumber}</strong> · Plat: <strong className="text-amber-400">{transaction.vehiclePlate}</strong>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs rounded-lg border border-slate-700 transition-colors shadow-sm cursor-pointer"
            >
              <X className="w-4 h-4 text-rose-400" />
              <span>Tutup Preview</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition-colors shadow-sm cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak Tiket (Print / PDF)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
