import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Code2,
  Send,
  HelpCircle,
  Database,
  PlusCircle,
  Link2,
  DownloadCloud,
  UploadCloud,
  Unlink,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  GoogleSheetConfig,
  PurchaseOrder,
  ArrivalSchedule,
  CoalTransaction,
  CoalOutgoingRecord,
} from '../types/coal';
import {
  GOOGLE_APPS_SCRIPT_TEMPLATE,
  googleSheetService,
  PO_HEADERS,
  SCHEDULE_HEADERS,
  TRANSACTION_HEADERS,
  AUDIT_HEADERS,
  OUTGOING_HEADERS,
  OUTGOING_RECAP_HEADERS,
  SHEET_TABS,
} from '../services/googleSheetService';
import { GoogleSignInButton } from './GoogleSignInButton';

interface GoogleSheetSyncModalProps {
  config: GoogleSheetConfig;
  onSaveConfig: (config: GoogleSheetConfig) => void;
  transactions: CoalTransaction[];
  purchaseOrders: PurchaseOrder[];
  schedules: ArrivalSchedule[];
  coalOutgoing?: CoalOutgoingRecord[];
  onTriggerSync: () => Promise<void>;
  isSyncing: boolean;
  // Google Sheets API Direct Database props
  hasSheetsToken: boolean;
  googleUserEmail?: string | null;
  isBusySheets?: boolean;
  pendingLocalChanges?: boolean;
  onSignInForSheets: () => Promise<void>;
  onCreateNewSpreadsheet: (title: string) => Promise<void>;
  onConnectExistingSpreadsheet: (idOrUrl: string) => Promise<void>;
  onLoadFromSheet: () => Promise<void>;
  onWriteFullToSheet: () => void;
  onDisconnectSheet: () => void;
  sheetsFeedback?: { type: 'success' | 'error' | 'info'; message: string } | null;
  onClearSheetsFeedback?: () => void;
}

export const GoogleSheetSyncModal: React.FC<GoogleSheetSyncModalProps> = ({
  config,
  onSaveConfig,
  transactions,
  purchaseOrders,
  schedules,
  coalOutgoing = [],
  onTriggerSync,
  isSyncing,
  hasSheetsToken,
  googleUserEmail,
  isBusySheets = false,
  pendingLocalChanges = false,
  onSignInForSheets,
  onCreateNewSpreadsheet,
  onConnectExistingSpreadsheet,
  onLoadFromSheet,
  onWriteFullToSheet,
  onDisconnectSheet,
  sheetsFeedback,
  onClearSheetsFeedback,
}) => {
  const [webhookUrl, setWebhookUrl] = useState(config.webhookUrl || '');
  const [autoSync, setAutoSync] = useState(config.autoSyncEnabled || false);
  const [sheetName, setSheetName] = useState(config.sheetName || 'SIMOTUBA_Database_Batubara');
  const [newSheetTitle, setNewSheetTitle] = useState(
    config.sheetName || `SIMOTUBA_Database_Batubara_${new Date().toISOString().slice(0, 10)}`
  );
  const [existingSheetInput, setExistingSheetInput] = useState(config.spreadsheetId || '');
  const [isCopied, setIsCopied] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [activeTab, setActiveTab] = useState<'database' | 'webhook' | 'code' | 'schema'>('database');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    setWebhookUrl(config.webhookUrl || '');
    setAutoSync(config.autoSyncEnabled || false);
    setSheetName(config.sheetName || 'SIMOTUBA_Database_Batubara');
    if (config.spreadsheetId) {
      setExistingSheetInput(config.spreadsheetId);
    }
  }, [config]);

  const qcCompletedCount = transactions.filter((t) => Boolean(t.qcTime || t.labResults)).length;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_TEMPLATE);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
  };

  const handleSaveWebhook = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveConfig({
      ...config,
      mode: 'APPS_SCRIPT',
      webhookUrl: webhookUrl.trim(),
      sheetName,
      autoSyncEnabled: autoSync,
    });
    setSaveMessage('Konfigurasi Webhook Apps Script berhasil disimpan!');
    setTimeout(() => setSaveMessage(null), 4000);
  };

  const handleTestConnection = async () => {
    if (!webhookUrl.trim()) {
      setTestResult({
        success: false,
        message: 'Masukkan URL Webhook Google Apps Script terlebih dahulu.',
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    const res = await googleSheetService.testConnection(webhookUrl.trim());
    setTestResult(res);
    setIsTesting(false);
  };

  const handleToggleDatabaseEnabled = (enabled: boolean) => {
    onSaveConfig({
      ...config,
      mode: 'SHEETS_API',
      databaseEnabled: enabled,
    });
  };

  const resolvedSheetUrl = (() => {
    if (config.spreadsheetUrl && config.spreadsheetUrl.trim()) {
      return config.spreadsheetUrl.trim();
    }
    if (config.spreadsheetId && config.spreadsheetId.trim()) {
      return `https://docs.google.com/spreadsheets/d/${config.spreadsheetId.trim()}/edit`;
    }
    const raw = existingSheetInput.trim();
    if (/^https?:\/\/docs\.google\.com\/spreadsheets\//i.test(raw)) {
      return raw;
    }
    const match = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (match?.[1]) {
      return `https://docs.google.com/spreadsheets/d/${match[1]}/edit`;
    }
    if (/^[a-zA-Z0-9-_]{20,}$/.test(raw)) {
      return `https://docs.google.com/spreadsheets/d/${raw}/edit`;
    }
    return 'https://docs.google.com/spreadsheets/';
  })();
  const hasLinkedSpreadsheet = Boolean(config.spreadsheetUrl?.trim() || config.spreadsheetId?.trim());

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white border border-slate-300 rounded-xl p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-700 shrink-0" />
              <span>Database Google Sheets (Alur PO s/d QC-PA)</span>
              {config.spreadsheetId && config.databaseEnabled && (
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300">
                  TERHUBUNG
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Gunakan Google Spreadsheet Anda langsung sebagai database operasional dari pembuatan PO, Jadwal, Pos Security, Timbang Masuk/Keluar, Bongkar, Uji Lab QC-PA, hingga Pengeluaran &amp; Rekap Boiler FBC 1/2.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {config.spreadsheetId && hasSheetsToken ? (
              <button
                type="button"
                onClick={onWriteFullToSheet}
                disabled={isSyncing || isBusySheets}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-600 text-white font-bold text-xs rounded-lg transition-colors shadow-xs whitespace-nowrap cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing || isBusySheets ? 'animate-spin' : ''}`} />
                <span>
                  {isSyncing || isBusySheets
                    ? 'Memproses...'
                    : 'Sinkronkan Semua ke Google Sheet'}
                </span>
              </button>
            ) : !hasSheetsToken ? (
              <GoogleSignInButton
                onClick={onSignInForSheets}
                disabled={isBusySheets}
                label="Sign in with Google"
              />
            ) : null}

            <a
              href={resolvedSheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 text-xs font-bold rounded-lg transition-colors shadow-2xs whitespace-nowrap"
              title={
                hasLinkedSpreadsheet
                  ? `Buka data Google Sheet: ${config.spreadsheetTitle || config.spreadsheetId}`
                  : 'Buka Google Sheets (G-Sheet)'
              }
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>{hasLinkedSpreadsheet ? 'Buka Data G-Sheet' : 'Buka G-Sheet'}</span>
              <ExternalLink className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
            </a>
          </div>
        </div>
      </div>

      {/* Navigation tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-300 pb-2 text-xs font-semibold">
        <button
          type="button"
          onClick={() => setActiveTab('database')}
          className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'database'
              ? 'bg-emerald-100 text-emerald-900 border border-emerald-400 font-bold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          <span>Database Google Sheets (Langsung)</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('schema')}
          className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'schema'
              ? 'bg-emerald-100 text-emerald-900 border border-emerald-400 font-bold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>Struktur 6 Tab &amp; Kolom</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('webhook')}
          className={`px-4 py-2 rounded-lg transition-colors cursor-pointer ${
            activeTab === 'webhook'
              ? 'bg-emerald-100 text-emerald-900 border border-emerald-400 font-bold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          Webhook Apps Script (Opsional)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('code')}
          className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'code'
              ? 'bg-emerald-100 text-emerald-900 border border-emerald-400 font-bold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <Code2 className="w-3.5 h-3.5" />
          <span>Kode Apps Script (.js)</span>
        </button>
      </div>

      {/* TAB 1: GOOGLE SHEETS DIRECT DATABASE */}
      {activeTab === 'database' && (
        <div className="space-y-6">
          {/* Step 1: Google OAuth Status */}
          <div className="bg-white border border-slate-300 rounded-xl p-5 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 text-xs font-bold flex items-center justify-center">
                    1
                  </span>
                  <h3 className="text-sm font-bold text-slate-900">
                    Otorisasi Akun Google Sheets
                  </h3>
                </div>
                <p className="text-xs text-slate-600 pl-8">
                  {hasSheetsToken
                    ? `Sesi aktif untuk akun ${googleUserEmail || 'Google'}. Aplikasi memiliki akses baca & tulis Google Sheets pada sesi ini.`
                    : 'Masuk dengan akun Google Anda agar aplikasi dapat membuat, membaca, dan memperbarui database Google Spreadsheet.'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {hasSheetsToken ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-bold">
                    <ShieldCheck className="w-4 h-4 text-emerald-700" />
                    <span>Akses Google Sheets Aktif</span>
                  </span>
                ) : (
                  <GoogleSignInButton
                    onClick={onSignInForSheets}
                    disabled={isBusySheets}
                    label="Sign in with Google"
                  />
                )}
              </div>
            </div>

            {!hasSheetsToken && config.spreadsheetId && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-xs text-amber-900 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <span>
                  Spreadsheet <strong>{config.spreadsheetTitle || config.spreadsheetId}</strong> sudah terdaftar, namun sesi otorisasi Google Sheets perlu dihubungkan ulang setelah halaman dimuat ulang. Klik tombol <strong>Sign in with Google</strong> di atas untuk melanjutkan pembacaan &amp; penyimpanan ke Google Sheets.
                </span>
              </div>
            )}
          </div>

          {/* Inline Status / Error Feedback */}
          {sheetsFeedback && (
            <div
              role="status"
              className={`p-3.5 rounded-xl border text-xs flex items-start justify-between gap-3 ${
                sheetsFeedback.type === 'success'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                  : sheetsFeedback.type === 'error'
                  ? 'bg-rose-50 border-rose-300 text-rose-950'
                  : 'bg-sky-50 border-sky-300 text-sky-950'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {sheetsFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                ) : sheetsFeedback.type === 'error' ? (
                  <AlertCircle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
                ) : (
                  <RefreshCw className="w-4 h-4 text-sky-700 shrink-0 mt-0.5 animate-spin" />
                )}
                <span className="leading-relaxed font-medium">{sheetsFeedback.message}</span>
              </div>
              {onClearSheetsFeedback && (
                <button
                  type="button"
                  onClick={onClearSheetsFeedback}
                  aria-label="Tutup pesan status"
                  className="p-1 rounded-md hover:bg-black/5 text-slate-500 hover:text-slate-800 shrink-0 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Step 2: Active Spreadsheet Card OR Setup Create/Connect */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Create Brand New Database Spreadsheet */}
            <div className="bg-white border border-slate-300 rounded-xl p-5 shadow-xs space-y-4">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 text-xs font-bold flex items-center justify-center">
                  2A
                </span>
                <h3 className="text-sm font-bold text-slate-900">
                  Buat Database Google Sheet Baru Otomatis
                </h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Membuat file Google Spreadsheet baru di Google Drive Anda lengkap dengan 6 tab terstruktur (<strong>DATA_PURCHASE_ORDER</strong>, <strong>JADWAL_KEDATANGAN</strong>, <strong>DATA_TRANSAKSI_TIMBANGAN</strong> termasuk QC-PA, <strong>DATA_PENGELUARAN_BATUBARA</strong>, <strong>REKAP_PENGELUARAN_BOILER</strong>, dan <strong>AUDIT_LOGS</strong>).
              </p>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nama File Spreadsheet Baru
                  </label>
                  <input
                    type="text"
                    value={newSheetTitle}
                    onChange={(e) => setNewSheetTitle(e.target.value)}
                    placeholder="SIMOTUBA_Database_Batubara"
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-amber-600"
                  />
                </div>
                <button
                  type="button"
                  disabled={isBusySheets || !newSheetTitle.trim()}
                  onClick={() => onCreateNewSpreadsheet(newSheetTitle.trim())}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-500 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>
                    {isBusySheets ? 'Membuat Spreadsheet...' : 'Buat Database Google Sheet Baru Sekarang'}
                  </span>
                </button>
                {!hasSheetsToken && (
                  <p className="text-[11px] text-slate-500">
                    Belum login Google — mengklik tombol ini akan otomatis meminta izin Sign in with Google terlebih dahulu.
                  </p>
                )}
              </div>
            </div>

            {/* Connect Existing Spreadsheet */}
            <div className="bg-white border border-slate-300 rounded-xl p-5 shadow-xs space-y-4">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-sky-100 text-sky-900 border border-sky-300 text-xs font-bold flex items-center justify-center">
                  2B
                </span>
                <h3 className="text-sm font-bold text-slate-900">
                  Hubungkan Spreadsheet yang Sudah Ada
                </h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Tempelkan URL Google Spreadsheet atau ID Spreadsheet yang sudah ada. Sistem akan memeriksa tab yang tersedia dan menambahkan tab yang belum ada secara otomatis.
              </p>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    URL atau Spreadsheet ID
                  </label>
                  <input
                    type="text"
                    value={existingSheetInput}
                    onChange={(e) => setExistingSheetInput(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/1BxiM.../edit"
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 font-mono-num focus:outline-none focus:border-amber-600"
                  />
                </div>
                <button
                  type="button"
                  disabled={isBusySheets || !existingSheetInput.trim()}
                  onClick={() => onConnectExistingSpreadsheet(existingSheetInput.trim())}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-200 disabled:text-slate-500 text-slate-950 font-bold text-xs rounded-lg transition-colors cursor-pointer"
                >
                  <Link2 className="w-4 h-4" />
                  <span>
                    {isBusySheets ? 'Memeriksa & Menghubungkan...' : 'Hubungkan & Muat Data dari Spreadsheet'}
                  </span>
                </button>
                {!hasSheetsToken && (
                  <p className="text-[11px] text-slate-500">
                    Belum login Google — mengklik tombol ini akan otomatis meminta izin Sign in with Google lalu menghubungkan Spreadsheet Anda.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Step 3: Connected Database Status & Operations */}
          <div className="bg-white border border-slate-300 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-700" />
                  <span>Status Koneksi &amp; Kontrol Database Google Sheets</span>
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  {config.spreadsheetId
                    ? `Spreadsheet aktif: ${config.spreadsheetTitle || config.spreadsheetId}`
                    : 'Belum ada Google Spreadsheet yang dihubungkan.'}
                </p>
              </div>

              {config.spreadsheetId && (
                <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 text-xs font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(config.databaseEnabled)}
                    onChange={(e) => handleToggleDatabaseEnabled(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-400 text-emerald-600"
                  />
                  <span>Aktifkan Penyimpanan Alur PO s/d PA ke Google Sheet</span>
                </label>
              )}
            </div>

            {pendingLocalChanges && config.spreadsheetId && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-2">
                <span>
                  Ada perubahan data lokal yang belum dikirim ke Google Sheet. Klik tombol sinkronisasi untuk menyimpan ke Google Sheets.
                </span>
                <button
                  type="button"
                  disabled={!hasSheetsToken || isBusySheets}
                  onClick={onWriteFullToSheet}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg text-xs cursor-pointer disabled:opacity-50"
                >
                  Simpan Perubahan ke Google Sheet
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-slate-600 text-[11px] block">Purchase Order (PO)</span>
                <strong className="text-lg font-bold text-slate-900 font-mono-num">
                  {purchaseOrders.length}
                </strong>
                <span className="text-[10px] text-slate-500 block">Baris PO</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-slate-600 text-[11px] block">Jadwal Pengiriman</span>
                <strong className="text-lg font-bold text-slate-900 font-mono-num">
                  {schedules.length}
                </strong>
                <span className="text-[10px] text-slate-500 block">Baris Jadwal</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-slate-600 text-[11px] block">Transaksi Timbangan</span>
                <strong className="text-lg font-bold text-slate-900 font-mono-num">
                  {transactions.length}
                </strong>
                <span className="text-[10px] text-slate-500 block">Ritase Armada</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-slate-600 text-[11px] block">Data Uji Lab (QC-PA)</span>
                <strong className="text-lg font-bold text-emerald-800 font-mono-num">
                  {qcCompletedCount}
                </strong>
                <span className="text-[10px] text-slate-500 block">Selesai Analisa PA</span>
              </div>
              <div className="p-3 bg-amber-50/70 rounded-lg border border-amber-200 col-span-2 sm:col-span-1">
                <span className="text-amber-900 text-[11px] font-semibold block">Pengeluaran (Output)</span>
                <strong className="text-lg font-bold text-amber-900 font-mono-num">
                  {coalOutgoing.length}
                </strong>
                <span className="text-[10px] text-amber-800 block">Baris Output &amp; Rekap FBC</span>
              </div>
            </div>

            {config.spreadsheetId ? (
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200">
                <div className="text-[11px] text-slate-600 font-mono-num space-y-0.5">
                  <div>
                    ID: <strong className="text-slate-900">{config.spreadsheetId}</strong>
                  </div>
                  {config.lastSyncTime && (
                    <div>
                      Terakhir sinkron:{' '}
                      <strong className="text-slate-900">
                        {new Date(config.lastSyncTime).toLocaleString('id-ID')}
                      </strong>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={isBusySheets}
                    onClick={onLoadFromSheet}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <DownloadCloud className="w-3.5 h-3.5 text-sky-700" />
                    <span>Muat Data dari Google Sheet</span>
                  </button>
                  <button
                    type="button"
                    disabled={!hasSheetsToken || isBusySheets}
                    onClick={onWriteFullToSheet}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <UploadCloud className="w-3.5 h-3.5" />
                    <span>Simpan Semua ke Google Sheet</span>
                  </button>
                  <button
                    type="button"
                    disabled={isBusySheets}
                    onClick={onDisconnectSheet}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Unlink className="w-3.5 h-3.5" />
                    <span>Putuskan</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
                Klik <strong>Sign in with Google</strong> pada Langkah 1, lalu buat Spreadsheet Baru (Langkah 2A) atau hubungkan Spreadsheet yang sudah ada (Langkah 2B) untuk mengaktifkan database Google Sheets.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: APPS SCRIPT WEBHOOK (OPTIONAL LEGACY) */}
      {activeTab === 'webhook' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-5">
            <form
              onSubmit={handleSaveWebhook}
              className="bg-white border border-slate-300 rounded-xl p-5 shadow-xs space-y-4"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  Pengaturan Endpoint Webhook Google Apps Script (Opsional)
                </h3>
                {webhookUrl && (
                  <button
                    type="button"
                    onClick={onTriggerSync}
                    disabled={isSyncing}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>Kirim Webhook</span>
                  </button>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  URL Webhook Aplikasi Web Google Apps Script (doPost) *
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://script.google.com/macros/s/AKfycbx.../exec"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-600 font-mono-num"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Didapatkan dari menu Deploy (Terapkan) &gt; New deployment &gt; Web app di Google Spreadsheet Anda.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nama Database Spreadsheet
                  </label>
                  <input
                    type="text"
                    value={sheetName}
                    onChange={(e) => setSheetName(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoSync}
                      onChange={(e) => setAutoSync(e.target.checked)}
                      className="w-4 h-4 text-emerald-600 rounded border-slate-400 focus:ring-0"
                    />
                    <span>Kirim Webhook Otomatis saat Transaksi Selesai</span>
                  </label>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isTesting || !webhookUrl}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 text-xs font-semibold rounded-lg border border-slate-300 transition-colors cursor-pointer"
                >
                  <Send className={`w-3.5 h-3.5 ${isTesting ? 'animate-pulse text-amber-600' : 'text-emerald-700'}`} />
                  <span>{isTesting ? 'Menguji Koneksi...' : 'Tes Koneksi Webhook'}</span>
                </button>

                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition-colors shadow-xs cursor-pointer"
                >
                  Simpan Konfigurasi Webhook
                </button>
              </div>

              {saveMessage && (
                <div className="p-3 rounded-lg border bg-emerald-50 border-emerald-300 text-emerald-900 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>{saveMessage}</span>
                </div>
              )}

              {testResult && (
                <div
                  className={`p-3.5 rounded-lg border text-xs flex items-start gap-2 ${
                    testResult.success
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                      : 'bg-rose-50 border-rose-300 text-rose-900'
                  }`}
                >
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
                  )}
                  <span>{testResult.message}</span>
                </div>
              )}
            </form>
          </div>

          <div className="bg-white border border-slate-300 rounded-xl p-5 shadow-xs space-y-4 text-xs text-slate-700">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4 text-amber-600" />
              <span>Panduan Webhook Apps Script</span>
            </h3>
            <p className="text-slate-600 leading-relaxed">
              Mode recommended adalah tab <strong>Database Google Sheets (Langsung)</strong> karena mendukung baca-tulis dua arah lengkap tanpa copy-paste script. Gunakan Webhook Apps Script hanya jika Anda membutuhkan endpoint eksternal tanpa login Google.
            </p>
            <ol className="space-y-2 list-decimal list-inside text-slate-600">
              <li>Buat spreadsheet baru dan buka Ekstensi &gt; Apps Script.</li>
              <li>Salin kode dari tab <strong>Kode Apps Script (.js)</strong>.</li>
              <li>Deploy sebagai Web App dengan akses <strong>Anyone</strong>.</li>
              <li>Tempel URL Web App pada formulir di samping.</li>
            </ol>
          </div>
        </div>
      )}

      {/* TAB 3: APPS SCRIPT CODE */}
      {activeTab === 'code' && (
        <div className="bg-white border border-slate-300 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Code2 className="w-4 h-4 text-emerald-700" />
                <span>Kode Sumber Google Apps Script (Cadangan Webhook)</span>
              </h3>
              <p className="text-xs text-slate-600">
                Opsional jika menggunakan metode Webhook URL alih-alih Google Sheets API langsung.
              </p>
            </div>

            <button
              type="button"
              onClick={handleCopyCode}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition-colors shadow-xs whitespace-nowrap cursor-pointer"
            >
              {isCopied ? <Check className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4" />}
              <span>{isCopied ? 'Kode Berhasil Disalin!' : 'Salin Seluruh Kode Apps Script'}</span>
            </button>
          </div>

          <pre className="p-4 bg-slate-50 rounded-lg border border-slate-300 text-[11px] font-mono-num text-slate-800 max-h-[500px] overflow-auto select-all leading-relaxed whitespace-pre">
            {GOOGLE_APPS_SCRIPT_TEMPLATE}
          </pre>
        </div>
      )}

      {/* TAB 4: DATABASE SCHEMA */}
      {activeTab === 'schema' && (
        <div className="bg-white border border-slate-300 rounded-xl p-5 shadow-xs space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-700" />
              <span>Skema 6 Tab Database Google Sheets (PO, QC-PA, &amp; Pengeluaran Boiler)</span>
            </h3>
            <p className="text-xs text-slate-600">
              Seluruh kolom disimpan terstruktur agar data PO, Jadwal, Security, Timbangan, Bongkar, Proximate Analysis (PA), serta Pengeluaran &amp; Rekap Boiler FBC 1/2 dapat dibaca &amp; ditulis kembali 100% akurat.
            </p>
          </div>

          <div className="space-y-4">
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div className="text-xs font-bold text-emerald-800 mb-2">
                Tab 1: {SHEET_TABS.PO} ({PO_HEADERS.length} Kolom)
              </div>
              <div className="flex flex-wrap gap-1.5 text-[10px] font-mono-num text-slate-800">
                {PO_HEADERS.map((col) => (
                  <span key={col} className="bg-white border border-slate-300 px-2 py-0.5 rounded">
                    {col}
                  </span>
                ))}
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div className="text-xs font-bold text-blue-800 mb-2">
                Tab 2: {SHEET_TABS.SCHEDULES} ({SCHEDULE_HEADERS.length} Kolom)
              </div>
              <div className="flex flex-wrap gap-1.5 text-[10px] font-mono-num text-slate-800">
                {SCHEDULE_HEADERS.map((col) => (
                  <span key={col} className="bg-white border border-slate-300 px-2 py-0.5 rounded">
                    {col}
                  </span>
                ))}
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div className="text-xs font-bold text-slate-900 mb-2">
                Tab 3: {SHEET_TABS.TRANSACTIONS} ({TRANSACTION_HEADERS.length} Kolom · Gate In s/d QC-PA)
              </div>
              <div className="flex flex-wrap gap-1.5 text-[10px] font-mono-num text-slate-800">
                {TRANSACTION_HEADERS.map((col) => (
                  <span key={col} className="bg-white border border-slate-300 px-2 py-0.5 rounded">
                    {col}
                  </span>
                ))}
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div className="text-xs font-bold text-amber-800 mb-2">
                Tab 4: {SHEET_TABS.AUDIT} ({AUDIT_HEADERS.length} Kolom)
              </div>
              <div className="flex flex-wrap gap-1.5 text-[10px] font-mono-num text-slate-800">
                {AUDIT_HEADERS.map((col) => (
                  <span key={col} className="bg-white border border-slate-300 px-2 py-0.5 rounded">
                    {col}
                  </span>
                ))}
              </div>
            </div>

            <div className="p-4 bg-amber-50/50 rounded-lg border border-amber-200">
              <div className="text-xs font-bold text-amber-900 mb-2">
                Tab 5: {SHEET_TABS.OUTGOING} ({OUTGOING_HEADERS.length} Kolom · Riwayat Pengeluaran Output)
              </div>
              <div className="flex flex-wrap gap-1.5 text-[10px] font-mono-num text-slate-800">
                {OUTGOING_HEADERS.map((col) => (
                  <span key={col} className="bg-white border border-amber-300 px-2 py-0.5 rounded">
                    {col}
                  </span>
                ))}
              </div>
            </div>

            <div className="p-4 bg-sky-50/50 rounded-lg border border-sky-200">
              <div className="text-xs font-bold text-sky-900 mb-2">
                Tab 6: {SHEET_TABS.OUTGOING_RECAP} ({OUTGOING_RECAP_HEADERS.length} Kolom · Rekap Mingguan/Bulanan/Tahunan Boiler FBC 1 &amp; 2)
              </div>
              <div className="flex flex-wrap gap-1.5 text-[10px] font-mono-num text-slate-800">
                {OUTGOING_RECAP_HEADERS.map((col) => (
                  <span key={col} className="bg-white border border-sky-300 px-2 py-0.5 rounded">
                    {col}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
