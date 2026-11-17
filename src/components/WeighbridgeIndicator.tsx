import React, { useState, useEffect, useRef } from 'react';
import { 
  Scale, 
  RefreshCw, 
  CheckCircle2, 
  Plus, 
  X, 
  PenLine, 
  Unplug, 
  Settings, 
  HelpCircle, 
  AlertTriangle,
  Cable,
  Check,
  ExternalLink,
  Laptop,
  Activity,
  Play,
  Square
} from 'lucide-react';

interface WeighbridgeIndicatorProps {
  label: string;
  subLabel?: string;
  defaultWeightKg?: number;
  onCaptureWeight: (weightKg: number) => void;
  scaleId?: string;
  isOutbound?: boolean;
}

export const WeighbridgeIndicator: React.FC<WeighbridgeIndicatorProps> = ({
  label,
  subLabel = 'Jembatan Timbang Kapasitas 80 Ton - Akurasi ±10 kg',
  defaultWeightKg = 0,
  onCaptureWeight,
  scaleId = 'JT-01',
  isOutbound = false,
}) => {
  const [currentWeight, setCurrentWeight] = useState<number>(defaultWeightKg || 0);
  const [isStable, setIsStable] = useState<boolean>(true);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [manualInput, setManualInput] = useState<string>('');
  const [isManualMode, setIsManualMode] = useState<boolean>(false);

  // Serial Connection States (Mettler Toledo / RS-232)
  const [isConnectedSerial, setIsConnectedSerial] = useState<boolean>(false);
  const [connectionType, setConnectionType] = useState<'physical' | 'simulator' | null>(null);
  const [baudRate, setBaudRate] = useState<number>(9600);
  const [serialStatusText, setSerialStatusText] = useState<string>('Serial Terputus');
  const [lastRawSerialData, setLastRawSerialData] = useState<string>('');
  const [serialErrorMessage, setSerialErrorMessage] = useState<string | null>(null);

  // Modals
  const [showConnectModal, setShowConnectModal] = useState<boolean>(false);
  const [showGuideModal, setShowGuideModal] = useState<boolean>(false);

  // References for Web Serial port, reader, and simulated timer
  const serialPortRef = useRef<any>(null);
  const serialReaderRef = useRef<any>(null);
  const keepReadingRef = useRef<boolean>(false);
  const simTimerRef = useRef<any>(null);

  // Check if Web Serial API is supported in the browser
  const isSerialSupported = typeof navigator !== 'undefined' && 'serial' in navigator;
  
  // Check if running inside iframe (which may block Web Serial permissions by default)
  const isInsideIframe = typeof window !== 'undefined' && window.self !== window.top;

  // Sync with defaultWeightKg when active transaction changes
  useEffect(() => {
    if (!isConnectedSerial) {
      setCurrentWeight(defaultWeightKg || 0);
    }
  }, [defaultWeightKg, isConnectedSerial]);

  // Micro-fluctuation simulation when active (manual simulate button)
  useEffect(() => {
    if (!isSimulating) return;

    setIsStable(false);
    const interval = setInterval(() => {
      const delta = (Math.floor(Math.random() * 5) - 2) * 10; // ±20 kg step
      setCurrentWeight((prev) => Math.max(0, prev + delta));
    }, 400);

    const timeout = setTimeout(() => {
      setIsSimulating(false);
      setIsStable(true);
    }, 2800);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [isSimulating]);

  // Parser for Mettler Toledo string (Continuous Output / SICS)
  // Format examples:
  // "ST,GS,+  43050 kg" (Stable, Gross)
  // "US,GS,+  43040 kg" (Unstable, Gross)
  // "S S     43050 kg" (SICS stable)
  // "  43050.0 kg"
  const parseMettlerToledoString = (rawChunk: string) => {
    if (!rawChunk) return;
    setLastRawSerialData(rawChunk.trim());

    // Check stability indicators (US = Unstable, ? = Motion / error, S D = Dynamic SICS)
    const isUnstable = rawChunk.includes('US') || rawChunk.includes('S D') || rawChunk.includes('?');
    setIsStable(!isUnstable);

    // Extract numbers with optional sign and decimals
    const match = rawChunk.match(/([+-]?\s*\d{1,6}(?:\.\d+)?)\s*(?:kg|KG)?/);
    if (match && match[1]) {
      const cleaned = match[1].replace(/\s+/g, '');
      const num = Math.round(parseFloat(cleaned));
      if (!isNaN(num) && num >= 0 && num <= 120000) {
        setCurrentWeight(num);
      }
    }
  };

  // 1. PHYSICAL CONNECTION: Connect to physical Mettler Toledo via Web Serial API
  const handleConnectPhysicalSerial = async () => {
    setSerialErrorMessage(null);

    if (!isSerialSupported) {
      setSerialErrorMessage('Browser Anda tidak mendukung Web Serial API. Gunakan browser Google Chrome atau Microsoft Edge di PC timbangan.');
      return;
    }

    try {
      setSerialStatusText('Menunggu pemilihan port COM...');
      const port = await (navigator as any).serial.requestPort();
      
      await port.open({
        baudRate: Number(baudRate),
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        flowControl: 'none',
      });

      serialPortRef.current = port;
      setIsConnectedSerial(true);
      setConnectionType('physical');
      setSerialStatusText(`Terhubung: Port Serial Fisik (${baudRate} bps)`);
      keepReadingRef.current = true;
      setShowConnectModal(false);

      // Start read loop
      readSerialLoop(port);
    } catch (err: any) {
      console.warn('Gagal koneksi Serial port:', err);
      let errorMsg = err.message || 'Gagal membuka port serial.';
      if (err.name === 'SecurityError') {
        errorMsg = 'Akses Port Serial dibatasi oleh browser di dalam jendela pratinjau (iFrame). Untuk menghubungkan kabel fisik Mettler Toledo secara langsung, buka aplikasi di Tab Browser Baru atau gunakan Mode Simulasi di bawah.';
      } else if (err.name === 'NotFoundError') {
        errorMsg = 'Pemilihan port dibatalkan oleh pengguna.';
      }
      setSerialErrorMessage(errorMsg);
      setSerialStatusText('Koneksi dibatalkan');
      setIsConnectedSerial(false);
      setConnectionType(null);
    }
  };

  const readSerialLoop = async (port: any) => {
    let buffer = '';
    while (port.readable && keepReadingRef.current) {
      try {
        const textDecoder = new TextDecoderStream();
        const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
        const reader = textDecoder.readable.getReader();
        serialReaderRef.current = reader;

        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) {
              buffer += value;
              const lines = buffer.split(/[\r\n]+/);
              buffer = lines.pop() || ''; // keep remaining incomplete chunk

              for (const line of lines) {
                if (line.trim().length > 0) {
                  parseMettlerToledoString(line);
                }
              }
            }
          }
        } catch (readErr) {
          console.warn('Read stream error:', readErr);
        } finally {
          reader.releaseLock();
          await readableStreamClosed.catch(() => {});
        }
      } catch (err) {
        console.warn('Pipeline error:', err);
        break;
      }
    }
  };

  // 2. SIMULATOR CONNECTION: Simulate live Mettler Toledo continuous data stream
  const handleStartSimulatedStream = () => {
    handleDisconnectSerial(); // clean up any existing

    setSerialErrorMessage(null);
    setIsConnectedSerial(true);
    setConnectionType('simulator');
    setSerialStatusText('Terhubung: Live Simulator Mettler Toledo');
    setShowConnectModal(false);

    // Base weight around 43,050 kg for Gross or 14,200 kg for Tare
    let baseWeight = isOutbound ? 14200 : 43050;
    if (defaultWeightKg && defaultWeightKg > 0) {
      baseWeight = defaultWeightKg;
    }

    let tick = 0;
    simTimerRef.current = setInterval(() => {
      tick++;
      // Jitter simulation
      const jitter = (Math.floor(Math.sin(tick * 0.7) * 2)) * 10; // ±20 kg
      const dynamicWeight = Math.max(0, baseWeight + jitter);
      const isCurrentlyStable = tick % 8 !== 0; // occasional dynamic motion

      const prefix = isCurrentlyStable ? 'ST' : 'US';
      const rawString = `${prefix},GS,+  ${dynamicWeight} kg`;

      parseMettlerToledoString(rawString);
    }, 500);
  };

  // Disconnect serial port or stop simulator cleanly
  const handleDisconnectSerial = async () => {
    if (simTimerRef.current) {
      clearInterval(simTimerRef.current);
      simTimerRef.current = null;
    }

    keepReadingRef.current = false;
    try {
      if (serialReaderRef.current) {
        await serialReaderRef.current.cancel();
      }
      if (serialPortRef.current) {
        await serialPortRef.current.close();
      }
    } catch (e) {
      console.warn('Error saat menutup port:', e);
    } finally {
      serialPortRef.current = null;
      serialReaderRef.current = null;
      setIsConnectedSerial(false);
      setConnectionType(null);
      setSerialStatusText('Serial Terputus');
    }
  };

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      if (simTimerRef.current) {
        clearInterval(simTimerRef.current);
      }
      if (serialPortRef.current) {
        keepReadingRef.current = false;
        try {
          serialPortRef.current.close();
        } catch {}
      }
    };
  }, []);

  const handleSimulateLoad = () => {
    if (currentWeight > 0) {
      setIsSimulating(true);
    } else {
      setIsManualMode(true);
    }
  };

  const handleZeroScale = () => {
    setCurrentWeight(0);
    setIsStable(true);
  };

  const handleApplyManual = () => {
    const val = parseInt(manualInput, 10);
    if (!isNaN(val) && val >= 0) {
      setCurrentWeight(val);
      setIsManualMode(false);
      setManualInput('');
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-700/80 rounded-xl p-5 shadow-xl">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Scale className="w-5 h-5 text-amber-400 shrink-0" />
          <div>
            <h4 className="text-sm font-bold text-slate-100 tracking-wide">{label}</h4>
            <p className="text-xs text-slate-400">
              {subLabel} · <span className="text-amber-400 font-mono-num font-semibold">{scaleId}</span>
            </p>
          </div>
        </div>

        {/* Action Controls Top */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Mettler Toledo Serial Connect Button */}
          {isConnectedSerial ? (
            <div className="flex items-center gap-2 bg-emerald-950/80 border border-emerald-500/50 rounded-xl px-3 py-1.5 text-xs text-emerald-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <div className="flex flex-col text-left">
                <span className="font-bold text-[11px] leading-tight">
                  {connectionType === 'simulator' ? 'METTLER TOLEDO (SIMULASI)' : 'METTLER TOLEDO (FISIK)'}
                </span>
                <span className="text-[10px] text-emerald-400/80 font-mono-num leading-tight">
                  {baudRate} bps · Live Stream
                </span>
              </div>
              <button
                type="button"
                onClick={handleDisconnectSerial}
                className="ml-1 p-1 hover:bg-emerald-800/50 rounded text-emerald-300 hover:text-white"
                title="Putuskan koneksi Mettler Toledo"
              >
                <Unplug className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowConnectModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 font-semibold text-xs rounded-xl transition-all shadow-sm active:scale-[0.98] whitespace-nowrap"
                title="Hubungkan ke jembatan timbang Mettler Toledo (Kabel RS-232 / USB / Simulator)"
              >
                <Cable className="w-3.5 h-3.5 text-cyan-400" />
                <span>Hubungkan Mettler Toledo</span>
              </button>
            </div>
          )}

          {/* Guide Modal Trigger */}
          <button
            type="button"
            onClick={() => setShowGuideModal(true)}
            className="p-2 bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-amber-400 rounded-xl border border-slate-700 transition-colors"
            title="Panduan Skema Koneksi Jembatan Timbang (Mettler Toledo / Avery / CAS)"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          {/* Manual Input Toggle Button */}
          <button
            type="button"
            onClick={() => setIsManualMode(!isManualMode)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm rounded-xl transition-all shadow-sm active:scale-[0.98] whitespace-nowrap"
          >
            {isManualMode ? (
              <>
                <X className="w-4 h-4 stroke-[2.5]" />
                <span>Tutup Manual</span>
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Input Manual Timbangan</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Digital LED Display Unit */}
      <div className="my-4 bg-black border-2 border-slate-800 rounded-lg p-5 relative overflow-hidden shadow-inner">
        {/* Hardware Status Lamps */}
        <div className="flex items-center justify-between text-xs font-mono-num mb-2 text-slate-400 border-b border-slate-800/80 pb-2">
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center gap-1 ${isStable ? 'text-emerald-400 font-semibold' : 'text-slate-600'}`}>
              <span className={`w-2 h-2 rounded-full ${isStable ? 'bg-emerald-400' : 'bg-slate-700'}`}></span>
              STABLE
            </span>
            <span className={`inline-flex items-center gap-1 ${currentWeight === 0 ? 'text-amber-400 font-semibold' : 'text-slate-600'}`}>
              <span className={`w-2 h-2 rounded-full ${currentWeight === 0 ? 'bg-amber-400' : 'bg-slate-700'}`}></span>
              ZERO
            </span>
            <span className="text-cyan-400 font-semibold">
              {isOutbound ? 'TARE' : 'GROSS'}
            </span>
            {isConnectedSerial && (
              <span className="text-emerald-400 font-semibold hidden sm:inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                {connectionType === 'simulator' ? 'METTLER TOLEDO LIVE (DEMO)' : 'METTLER TOLEDO LIVE'}
              </span>
            )}
          </div>
          <div className="text-slate-500 text-[11px]">
            MAX: 80,000 kg · e=10kg · CLASS III
          </div>
        </div>

        {/* Large Digits Display */}
        <div className="flex items-baseline justify-end gap-2 sm:gap-3 py-2">
          <div className="font-mono-num text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight text-emerald-400 select-all truncate">
            {currentWeight.toLocaleString('id-ID')}
          </div>
          <div className="text-xl sm:text-2xl font-bold text-slate-400 font-mono-num shrink-0">
            KG
          </div>
        </div>

        {/* Equivalent in Ton & Serial Raw String */}
        <div className="flex flex-wrap justify-between items-center text-xs text-slate-400 pt-2 border-t border-slate-900 font-mono-num gap-2">
          <div className="flex items-center gap-2">
            <span>Konversi Tonase:</span>
            <span className="text-slate-200 font-semibold text-sm">
              {(currentWeight / 1000).toFixed(2)} Ton
            </span>
          </div>

          {isConnectedSerial && lastRawSerialData && (
            <div className="text-[11px] text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
              <span className="text-slate-500 mr-1">Raw Mettler Toledo:</span>
              <span className="text-cyan-300 font-mono">{lastRawSerialData}</span>
            </div>
          )}
        </div>
      </div>

      {/* Manual Input form if opened */}
      {isManualMode && (
        <div className="mb-4 p-4 bg-slate-950/90 rounded-xl border border-amber-500/40 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
              <PenLine className="w-4 h-4" />
              <span>Input Manual Timbangan ({isOutbound ? 'Tare / Kosong' : 'Gross / Isi'})</span>
            </div>
            <span className="text-[11px] text-slate-400 hidden sm:inline">Tekan Enter atau klik Terapkan untuk memperbarui display</span>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative flex-1">
              <input
                type="number"
                placeholder="Masukkan nilai timbangan dalam kg (contoh: 42500)..."
                value={manualInput}
                autoFocus
                onChange={(e) => setManualInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleApplyManual();
                }}
                className="w-full bg-slate-900 border border-slate-700 focus:border-amber-400 rounded-lg pl-3 pr-12 py-2 text-sm text-white focus:outline-none font-mono-num"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 font-mono-num">
                KG
              </span>
            </div>

            {manualInput && !isNaN(Number(manualInput)) && Number(manualInput) > 0 && (
              <div className="px-3 py-2 bg-slate-900/90 rounded-lg border border-slate-800 text-xs text-slate-300 font-mono-num whitespace-nowrap">
                = <strong className="text-amber-400">{(Number(manualInput) / 1000).toFixed(2)}</strong> Ton
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleApplyManual}
                disabled={!manualInput || isNaN(Number(manualInput)) || Number(manualInput) < 0}
                className="flex-1 sm:flex-none px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-bold text-xs rounded-lg transition-colors whitespace-nowrap shadow-sm"
              >
                Terapkan Nilai
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsManualMode(false);
                  setManualInput('');
                }}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Control Buttons Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSimulateLoad}
            disabled={isSimulating}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 transition-colors"
            title="Simulasikan truk naik ke timbangan dengan getaran sensor"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSimulating ? 'animate-spin text-amber-400' : ''}`} />
            {isSimulating ? 'Menstabilkan...' : 'Deteksi Sensor Truk'}
          </button>

          <button
            type="button"
            onClick={handleZeroScale}
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg border border-slate-700 transition-colors"
            title="Nol-kan timbangan jembatan"
          >
            Zero (Nol)
          </button>
        </div>

        <button
          type="button"
          onClick={() => onCaptureWeight(currentWeight)}
          disabled={!isStable || currentWeight <= 0}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs rounded-lg shadow-md transition-colors whitespace-nowrap cursor-pointer disabled:cursor-not-allowed"
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>
            {currentWeight > 0
              ? `Kunci & Ambil Nilai Timbang (${currentWeight.toLocaleString('id-ID')} kg)`
              : 'Menunggu Input Timbangan (0 kg)'}
          </span>
        </button>
      </div>

      {/* Interactive Mettler Toledo Connection Modal */}
      {showConnectModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Cable className="w-5 h-5 text-cyan-400" />
                <div>
                  <h3 className="text-base font-bold text-white">Hubungkan Jembatan Timbang Mettler Toledo</h3>
                  <p className="text-xs text-slate-400">Sinkronisasi data berat otomatis via port Serial RS-232 / USB</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => {
                  setShowConnectModal(false);
                  setSerialErrorMessage(null);
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error Notification Banner if any */}
            {serialErrorMessage && (
              <div className="p-3.5 bg-rose-500/15 border border-rose-500/40 rounded-xl text-rose-300 text-xs flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-bold text-rose-200">Perhatian:</div>
                  <div className="mt-0.5 leading-relaxed">{serialErrorMessage}</div>
                </div>
              </div>
            )}

            {/* Explanation of Why clicking might feel inactive in preview */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 text-xs">
              <div className="font-semibold text-amber-400 flex items-center gap-1.5">
                <HelpCircle className="w-4 h-4" />
                Bagaimana Cara Kerjanya?
              </div>
              <p className="text-slate-300 leading-relaxed">
                Di lapangan, komputer pos timbangan dihubungkan ke indikator <strong>Mettler Toledo</strong> menggunakan kabel serial <strong>RS-232 ke USB</strong>. Browser di komputer pos timbangan akan membaca aliran data berat (*continuous output stream*) secara otomatis.
              </p>
              {isInsideIframe && (
                <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-300 text-[11px] leading-relaxed">
                  <strong>Catatan Pratinjau:</strong> Karena Anda saat ini sedang membuka aplikasi di dalam <em>jendela frame AI Studio</em>, browser membatasi akses port serial hardware demi keamanan. Anda dapat menguji fungsi dengan <strong>Mode Simulasi Live Stream</strong> di bawah atau membuka aplikasi di Tab Penuh.
                </div>
              )}
            </div>

            {/* Connection Options Grid */}
            <div className="space-y-3">
              {/* Option 1: Live Demo Simulator */}
              <div className="p-4 rounded-xl border border-emerald-500/40 bg-emerald-950/20 hover:bg-emerald-950/30 transition-colors space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-400" />
                    <span className="font-bold text-sm text-emerald-300">
                      Uji Coba Live Simulator Mettler Toledo
                    </span>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30">
                    Bisa Langsung Diuji
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Mensimulasikan data stream Mettler Toledo asli (<code className="text-emerald-400 font-mono">ST,GS,+  43050 kg</code>) secara real-time. Anda bisa langsung melihat angka bergerak di layar LED, mendeteksi getaran beban truk, dan mencoba tombol kunci timbang.
                </p>
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={handleStartSimulatedStream}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition-all shadow-md active:scale-[0.98]"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    <span>Mulai Simulasi Stream Mettler Toledo Sekarang</span>
                  </button>
                </div>
              </div>

              {/* Option 2: Physical Hardware Web Serial */}
              <div className="p-4 rounded-xl border border-slate-700 bg-slate-950/60 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Laptop className="w-4 h-4 text-cyan-400" />
                    <span className="font-bold text-sm text-slate-200">
                      Koneksi Kabel Fisik (RS-232 / USB COM)
                    </span>
                  </div>
                  <span className="text-[10px] font-mono bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700">
                    Hardware Nyata
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-400 font-semibold mb-1">Kecepatan (Baud Rate):</label>
                    <select
                      value={baudRate}
                      onChange={(e) => setBaudRate(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono text-xs focus:border-cyan-400"
                    >
                      <option value={9600}>9600 bps (Standar Mettler Toledo)</option>
                      <option value={4800}>4800 bps</option>
                      <option value={19200}>19200 bps</option>
                      <option value={38400}>38400 bps</option>
                      <option value={115200}>115200 bps</option>
                    </select>
                  </div>
                  <div className="text-[11px] text-slate-400 bg-slate-900/90 p-2 rounded-lg border border-slate-800 flex flex-col justify-center">
                    <span>• Data: 8 Bits · Parity: None</span>
                    <span>• Stop Bit: 1 · Flow: None</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleConnectPhysicalSerial}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/40 font-semibold text-xs rounded-xl transition-all shadow-sm"
                >
                  <Cable className="w-4 h-4 text-cyan-400" />
                  <span>Buka Dialog Port COM / USB Serial</span>
                </button>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="border-t border-slate-800 pt-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setShowConnectModal(false);
                  setShowGuideModal(true);
                }}
                className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 font-semibold"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>Lihat Skema Kabel & Pinout</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowConnectModal(false);
                  setSerialErrorMessage(null);
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Guide & Architecture Modal */}
      {showGuideModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-bold text-white">Panduan Integrasi Otomatis Jembatan Timbang Mettler Toledo</h3>
              </div>
              <button 
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs text-slate-300 leading-relaxed">
              <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-xl p-3.5 space-y-1">
                <div className="font-bold text-emerald-400 flex items-center gap-1.5 text-sm">
                  <Check className="w-4 h-4" />
                  Sistem Mendukung Otomatis & Input Manual
                </div>
                <p className="text-slate-300 text-[11px]">
                  Operator memiliki fleksibilitas penuh: nilai berat dapat dibaca secara <strong>otomatis langsung dari load cell/indikator fisik Mettler Toledo</strong>, dan pada saat bersamaan tetap bisa diisi atau diedit secara <strong>manual</strong> jika ada kendala jaringan/kabel.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-amber-400 text-sm mb-2">3 Metode Koneksi ke Jembatan Timbang:</h4>
                <div className="space-y-2.5">
                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                    <strong className="text-cyan-400 text-xs block mb-1">Metode 1: Web Serial API (Direct USB / RS-232) — Paling Praktis</strong>
                    <p className="text-slate-400 text-[11px]">
                      Kabel RS-232 serial dari indikator Mettler Toledo dihubungkan ke port USB PC Timbangan memakai kabel konverter USB-to-Serial (chip FTDI / PL2303). Operator cukup klik <strong>"Hubungkan Mettler Toledo"</strong> di Google Chrome / Edge, lalu browser langsung membaca data stream secara real-time.
                    </p>
                  </div>

                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                    <strong className="text-cyan-400 text-xs block mb-1">Metode 2: Local IoT Service / Serial-to-WebSocket Bridge</strong>
                    <p className="text-slate-400 text-[11px]">
                      Aplikasi lokal ringan (Node.js/Python) berjalan sebagai background service di PC pos timbangan. Service ini membaca COM port secara terus-menerus dan meneruskan data via WebSocket lokal (<code className="text-amber-400 font-mono">ws://localhost:8080</code>). Sangat stabil untuk pemakaian 24 jam non-stop.
                    </p>
                  </div>

                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                    <strong className="text-cyan-400 text-xs block mb-1">Metode 3: TCP/IP Ethernet (Mettler Toledo Network Module)</strong>
                    <p className="text-slate-400 text-[11px]">
                      Jika Mettler Toledo dilengkapi kartu Ethernet/LAN, indikator dapat mengirim string TCP Socket langsung ke server SIMOTUBA di port lokal (contoh: port 4001).
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
                <h4 className="font-bold text-white text-xs">Model Indikator Mettler Toledo yang Didukung:</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] text-slate-400">
                  <div className="p-2 bg-slate-900 rounded border border-slate-800">• Mettler Toledo IND570</div>
                  <div className="p-2 bg-slate-900 rounded border border-slate-800">• Mettler Toledo IND780</div>
                  <div className="p-2 bg-slate-900 rounded border border-slate-800">• Mettler Toledo IND231 / IND236</div>
                  <div className="p-2 bg-slate-900 rounded border border-slate-800">• JagXtreme / Panther</div>
                  <div className="p-2 bg-slate-900 rounded border border-slate-800">• Kingbird / Hawk</div>
                  <div className="p-2 bg-slate-900 rounded border border-slate-800">• Merk lain (Avery, Rinstrum, CAS)</div>
                </div>
              </div>

              <div className="border-t border-slate-800 pt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowGuideModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-lg text-xs transition-colors"
                >
                  Tutup Panduan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
