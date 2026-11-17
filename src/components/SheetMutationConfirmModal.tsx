import React from 'react';
import { FileSpreadsheet, AlertTriangle, CheckCircle2, X, Loader2 } from 'lucide-react';

export interface SheetMutationConfirmRequest {
  title: string;
  description: string;
  spreadsheetTitle: string;
  affectedTabs: string[];
  affectedCounts: {
    pos: number;
    schedules: number;
    transactions: number;
  };
  isDestructive?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => Promise<void> | void;
  onCancel?: () => void;
}

interface SheetMutationConfirmModalProps {
  request: SheetMutationConfirmRequest | null;
  isBusy: boolean;
  onClose: () => void;
}

export const SheetMutationConfirmModal: React.FC<SheetMutationConfirmModalProps> = ({
  request,
  isBusy,
  onClose,
}) => {
  if (!request) return null;

  const isDestructive = Boolean(request.isDestructive);

  const handleCancel = () => {
    if (isBusy) return;
    request.onCancel?.();
    onClose();
  };

  const handleConfirm = async () => {
    if (isBusy) return;
    await request.onConfirm();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4"
      onClick={handleCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-confirm-title"
        className="w-full max-w-lg rounded-xl bg-white border border-slate-300 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`flex items-center justify-between px-5 py-4 border-b border-slate-200 ${
            isDestructive ? 'bg-rose-50/80' : 'bg-emerald-50/80'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${
                isDestructive
                  ? 'bg-rose-100 border-rose-200 text-rose-700'
                  : 'bg-emerald-100 border-emerald-200 text-emerald-700'
              }`}
            >
              {isDestructive ? (
                <AlertTriangle className="w-5 h-5" />
              ) : (
                <FileSpreadsheet className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 id="sheet-confirm-title" className="text-sm font-bold text-slate-900">
                {request.title}
              </h3>
              <p className="text-xs text-slate-600 truncate max-w-[320px]">
                Spreadsheet: <strong>{request.spreadsheetTitle || 'Google Sheets'}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isBusy}
            onClick={handleCancel}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200/70 transition-colors cursor-pointer disabled:opacity-40"
            title="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs text-slate-700">
          <div
            className={`rounded-lg border p-3.5 leading-relaxed ${
              isDestructive
                ? 'bg-rose-50 border-rose-200 text-rose-900'
                : 'bg-slate-50 border-slate-200 text-slate-800'
            }`}
          >
            {request.description}
          </div>

          <div className="space-y-1.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Tab Google Sheet yang Akan Diperbarui
            </div>
            <div className="flex flex-wrap gap-1.5">
              {request.affectedTabs.map((tab) => (
                <span
                  key={tab}
                  className="px-2 py-0.5 rounded bg-slate-100 border border-slate-300 font-mono-num text-[11px] font-semibold text-slate-800"
                >
                  {tab}
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2.5 text-center">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
              <div className="text-base font-bold font-mono-num text-slate-900">
                {request.affectedCounts.pos}
              </div>
              <div className="text-[11px] font-medium text-slate-600">Baris PO</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
              <div className="text-base font-bold font-mono-num text-slate-900">
                {request.affectedCounts.schedules}
              </div>
              <div className="text-[11px] font-medium text-slate-600">Baris Jadwal</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
              <div className="text-base font-bold font-mono-num text-slate-900">
                {request.affectedCounts.transactions}
              </div>
              <div className="text-[11px] font-medium text-slate-600">Baris Timbang &amp; PA</div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-200 bg-slate-50">
          <button
            type="button"
            disabled={isBusy}
            onClick={handleCancel}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
          >
            {request.cancelLabel || 'Batal'}
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={handleConfirm}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold border transition-colors cursor-pointer disabled:opacity-50 ${
              isDestructive
                ? 'bg-rose-600 hover:bg-rose-700 text-white border-rose-700'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700'
            }`}
          >
            {isBusy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5" />
            )}
            <span>
              {isBusy
                ? 'Menyimpan ke Google Sheet...'
                : request.confirmLabel || 'Konfirmasi & Simpan ke Google Sheet'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
