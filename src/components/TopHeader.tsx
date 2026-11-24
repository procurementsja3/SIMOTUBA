import React, { useState, useEffect } from 'react';
import { 
  Menu, 
  Clock, 
  FileSpreadsheet, 
  RefreshCw, 
  Download, 
  Upload, 
  RotateCcw,
  ChevronRight
} from 'lucide-react';
import { ActiveTab, GoogleSheetConfig } from '../types/coal';

interface TopHeaderProps {
  activeTab: ActiveTab;
  onToggleSidebarMobile: () => void;
  onToggleSidebarCollapse: () => void;
  isSidebarCollapsed: boolean;
  sheetConfig: GoogleSheetConfig;
  onTriggerSync: () => void;
  isSyncing: boolean;
  onResetData: () => void;
  onExportBackup: () => void;
  onImportBackup: (json: string) => void;
  pendingSheetSync?: boolean;
  onOpenSheetsHub?: () => void;
  isAdminUser?: boolean;
}

const TAB_TITLES: Record<ActiveTab, { section: string; title: string }> = {
  dashboard: { section: 'Dashboard & Perencanaan', title: 'DASHBOARD' },
  po: { section: 'Perencanaan', title: 'Purchase Order (PO)' },
  schedules: { section: 'Perencanaan', title: 'Jadwal Pengiriman Batubara' },
  security: { section: 'Alur Operasional Penerimaan', title: 'Pos Security (Gate In & Gate Out)' },
  'weigh-in': { section: 'Alur Operasional Penerimaan', title: 'Timbang Masuk (Gross & SJ)' },
  unloading: { section: 'Alur Operasional Penerimaan', title: 'Bongkar Muatan' },
  'weigh-out': { section: 'Alur Operasional Penerimaan', title: 'Timbang Keluar (Tare & Netto)' },
  qc: { section: 'Uji Lab Independen', title: 'QC-PA (Update Lab ≥24 Jam · Diluar Alur)' },
  transactions: { section: 'Laporan', title: 'Riwayat Operasional Penerimaan Batubara' },
  googlesheet: { section: 'Database & Integrasi', title: 'Database Google Sheets (PO s/d PA)' },
  'coal-outgoing': { section: 'Daily Pengeluaran Operational Batubara', title: 'Operasional Pengeluaran Batubara' },
};

export const TopHeader: React.FC<TopHeaderProps> = ({
  activeTab,
  onToggleSidebarMobile,
  onToggleSidebarCollapse,
  isSidebarCollapsed,
  sheetConfig,
  onTriggerSync,
  isSyncing,
  onResetData,
  onExportBackup,
  onImportBackup,
  pendingSheetSync = false,
  onOpenSheetsHub,
  isAdminUser = true,
}) => {
  const [currentTime, setCurrentTime] = useState<string>('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        onImportBackup(content);
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const breadcrumb = TAB_TITLES[activeTab] || { section: 'Menu', title: activeTab };

  return (
    <header className="sticky top-0 z-30 h-16 bg-slate-900 border-b border-slate-800 px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-4 select-none">
      {/* Left: Mobile Hamburger & Desktop Toggle + Context Breadcrumb */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {/* Mobile Toggle */}
        <button
          type="button"
          onClick={onToggleSidebarMobile}
          className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg lg:hidden shrink-0"
          title="Buka Navigasi Menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Desktop Toggle Button */}
        <button
          type="button"
          onClick={onToggleSidebarCollapse}
          className="hidden lg:flex p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors border border-transparent hover:border-slate-700 shrink-0"
          title={isSidebarCollapsed ? 'Perluas Sidebar Menu' : 'Ciutkan Sidebar Menu'}
        >
          <Menu className="w-4 h-4 text-amber-400" />
        </button>

        {/* Breadcrumb Trail */}
        <div className="flex items-center gap-2 text-xs min-w-0">
          <span className="text-slate-400 font-medium hidden sm:inline">{breadcrumb.section}</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-500 hidden sm:inline shrink-0" />
          <h1 className="text-xs sm:text-sm font-bold text-white tracking-tight truncate max-w-[140px] sm:max-w-none">
            {breadcrumb.title}
          </h1>
        </div>
      </div>

      {/* Right: Clock, Google Sheets Sync Trigger, Data Backup Tools */}
      <div className="flex items-center gap-2 sm:gap-2.5">

        {/* Live Digital Clock */}
        <div className="hidden xl:flex items-center gap-2 px-3 py-1.5 bg-slate-950 rounded-lg border border-slate-800 text-xs text-slate-200 font-mono-num shadow-xs">
          <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span className="font-bold">{currentTime} WIB</span>
        </div>

        {/* Google Sheet Sync / Hub Button */}
        {(() => {
          const isSheetReady = Boolean(
            (sheetConfig.spreadsheetId && sheetConfig.databaseEnabled) || sheetConfig.webhookUrl
          );
          return (
            <button
              type="button"
              onClick={isSheetReady ? onTriggerSync : onOpenSheetsHub || onTriggerSync}
              disabled={isSyncing}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all whitespace-nowrap cursor-pointer ${
                pendingSheetSync
                  ? 'bg-amber-50 text-amber-900 border-amber-400 hover:bg-amber-100'
                  : isSheetReady
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-400 hover:bg-emerald-100'
                    : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-750'
              }`}
              title={
                sheetConfig.spreadsheetId
                  ? `Database Google Sheets: ${sheetConfig.spreadsheetTitle || sheetConfig.spreadsheetId}`
                  : 'Atur Database Google Sheets'
              }
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
              <span className="hidden sm:inline">
                {isSyncing
                  ? 'Menyinkronkan...'
                  : pendingSheetSync
                    ? 'Simpan ke Google Sheet'
                    : isSheetReady
                      ? 'Google Sheets DB'
                      : 'Setup Google Sheet'}
              </span>
              <RefreshCw
                className={`w-3 h-3 ${isSyncing ? 'animate-spin text-emerald-700' : 'text-slate-500'}`}
              />
            </button>
          );
        })()}

        {/* Backup / Export / Reset Controls */}
        <div className="flex items-center gap-1 border-l border-slate-800 pl-2">
          <button
            type="button"
            onClick={onExportBackup}
            title="Download Cadangan Data (JSON)"
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
          </button>
          {isAdminUser && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Pulihkan Cadangan Data (JSON)"
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors cursor-pointer"
            >
              <Upload className="w-4 h-4" />
            </button>
          )}
          {isAdminUser && (
            <button
              type="button"
              onClick={onResetData}
              title="Reset & Kosongkan Semua Data (PO, Jadwal, Transaksi)"
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".json"
            className="hidden"
          />
        </div>
      </div>
    </header>
  );
};
