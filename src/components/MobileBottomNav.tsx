import React from 'react';
import { 
  LayoutDashboard, 
  ShieldCheck, 
  Scale, 
  FlaskConical, 
  Menu
} from 'lucide-react';
import { ActiveTab } from '../types/coal';

interface MobileBottomNavProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onOpenSidebar: () => void;
  queueCounts: {
    security: number;
    weighIn: number;
    qc: number;
    unloading: number;
    weighOut: number;
  };
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  onSelectTab,
  onOpenSidebar,
  queueCounts,
}) => {
  return (
    <nav 
      aria-label="Mobile Navigation"
      className="fixed bottom-0 inset-x-0 z-40 lg:hidden bg-[#090d14]/95 backdrop-blur-md border-t border-slate-800/90 shadow-2xl safe-area-bottom"
    >
      <div className="grid grid-cols-5 h-16 items-center px-1 max-w-lg mx-auto">
        {/* 1. Dashboard */}
        <button
          type="button"
          onClick={() => onSelectTab('dashboard')}
          className={`flex flex-col items-center justify-center h-full py-1 transition-colors select-none ${
            activeTab === 'dashboard' ? 'text-amber-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <div className="relative">
            <LayoutDashboard className="w-5 h-5" />
            {activeTab === 'dashboard' && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-amber-400 rounded-full" />
            )}
          </div>
          <span className="text-[10px] mt-1 tracking-tight truncate max-w-[60px]">
            Dashboard
          </span>
        </button>

        {/* 2. Pos Security */}
        <button
          type="button"
          onClick={() => onSelectTab('security')}
          className={`flex flex-col items-center justify-center h-full py-1 transition-colors relative select-none ${
            activeTab === 'security' ? 'text-amber-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <div className="relative">
            <ShieldCheck className="w-5 h-5" />
            {queueCounts.security > 0 && (
              <span className="absolute -top-1 -right-2 px-1 min-w-[15px] h-[15px] flex items-center justify-center bg-amber-500 text-slate-950 text-[9px] font-extrabold rounded-full font-mono-num shadow-sm">
                {queueCounts.security}
              </span>
            )}
            {activeTab === 'security' && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-amber-400 rounded-full" />
            )}
          </div>
          <span className="text-[10px] mt-1 tracking-tight truncate max-w-[60px]">
            Security
          </span>
        </button>

        {/* 3. Timbang Masuk */}
        <button
          type="button"
          onClick={() => onSelectTab('weigh-in')}
          className={`flex flex-col items-center justify-center h-full py-1 transition-colors relative select-none ${
            activeTab === 'weigh-in' ? 'text-amber-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <div className="relative">
            <Scale className="w-5 h-5" />
            {queueCounts.weighIn > 0 && (
              <span className="absolute -top-1 -right-2 px-1 min-w-[15px] h-[15px] flex items-center justify-center bg-amber-500 text-slate-950 text-[9px] font-extrabold rounded-full font-mono-num shadow-sm">
                {queueCounts.weighIn}
              </span>
            )}
            {activeTab === 'weigh-in' && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-amber-400 rounded-full" />
            )}
          </div>
          <span className="text-[10px] mt-1 tracking-tight truncate max-w-[60px]">
            Timbang
          </span>
        </button>

        {/* 4. QC-PA */}
        <button
          type="button"
          onClick={() => onSelectTab('qc')}
          className={`flex flex-col items-center justify-center h-full py-1 transition-colors relative select-none ${
            activeTab === 'qc' ? 'text-amber-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <div className="relative">
            <FlaskConical className="w-5 h-5" />
            {queueCounts.qc > 0 && (
              <span className="absolute -top-1 -right-2 px-1 min-w-[15px] h-[15px] flex items-center justify-center bg-indigo-500 text-white text-[9px] font-extrabold rounded-full font-mono-num shadow-sm">
                {queueCounts.qc}
              </span>
            )}
            {activeTab === 'qc' && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-amber-400 rounded-full" />
            )}
          </div>
          <span className="text-[10px] mt-1 tracking-tight truncate max-w-[60px]">
            QC-PA
          </span>
        </button>

        {/* 5. Menu Lengkap (Sidebar Drawer Trigger) */}
        <button
          type="button"
          onClick={onOpenSidebar}
          className="flex flex-col items-center justify-center h-full py-1 text-slate-400 hover:text-white transition-colors select-none"
        >
          <div className="relative p-0.5 rounded-lg border border-slate-700/80 bg-slate-900/60">
            <Menu className="w-4 h-4 text-amber-400" />
          </div>
          <span className="text-[10px] mt-1 tracking-tight text-slate-300 font-semibold truncate max-w-[60px]">
            Menu
          </span>
        </button>
      </div>
    </nav>
  );
};
