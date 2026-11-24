import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  FileText, 
  Calendar, 
  ShieldCheck, 
  Scale, 
  FlaskConical, 
  Warehouse, 
  CheckCircle2, 
  FileSpreadsheet, 
  ChevronDown, 
  ChevronRight, 
  ChevronLeft,
  Menu,
  X,
  History
} from 'lucide-react';
import { ActiveTab } from '../types/coal';

interface SidebarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  queueCounts: {
    security: number;
    weighIn: number;
    qc: number;
    unloading: number;
    weighOut: number;
  };
}

interface NavSection {
  id: string;
  title: string;
  badgeTotal?: number;
  items: {
    id: ActiveTab;
    label: string;
    sublabel?: string;
    icon: React.ComponentType<{ className?: string }>;
    count?: number;
    countColor?: string;
  }[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  isCollapsed,
  onToggleCollapse,
  isMobileOpen,
  onCloseMobile,
  queueCounts,
}) => {
  // Toggle state per section accordion
  const [openSections, setOpenSections] = useState<{ [key: string]: boolean }>({
    overview: true,
    operations: true,
    qc_independent: true,
    reports: true,
  });

  const toggleSection = (sectionId: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };

  const navSections: NavSection[] = [
    {
      id: 'overview',
      title: 'Dashboard & Perencanaan',
      items: [
        {
          id: 'dashboard',
          label: 'DASHBOARD',
          icon: LayoutDashboard,
        },
        {
          id: 'po',
          label: 'Purchase Order (PO)',
          sublabel: 'Kontrak & target tonase',
          icon: FileText,
        },
        {
          id: 'schedules',
          label: 'Jadwal Pengiriman',
          sublabel: 'Estimasi waktu tiba (ETA)',
          icon: Calendar,
        },
      ],
    },
    {
      id: 'operations',
      title: 'Alur Operasional Penerimaan',
      badgeTotal: queueCounts.security + queueCounts.weighIn + queueCounts.unloading + queueCounts.weighOut,
      items: [
        {
          id: 'security',
          label: 'Pos Security (Gate In & Gate Out)',
          sublabel: 'Pemeriksaan segel & antrean',
          icon: ShieldCheck,
          count: queueCounts.security,
          countColor: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
        },
        {
          id: 'weigh-in',
          label: 'Timbang Masuk (Gross)',
          sublabel: 'Timbang muatan penuh & SJ',
          icon: Scale,
          count: queueCounts.weighIn,
          countColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
        },
        {
          id: 'unloading',
          label: 'Bongkar Muatan',
          sublabel: 'Dumping & cek bak bersih',
          icon: Warehouse,
          count: queueCounts.unloading,
          countColor: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
        },
        {
          id: 'weigh-out',
          label: 'Timbang Keluar (Tare)',
          sublabel: 'Timbang kosong & netto final',
          icon: CheckCircle2,
          count: queueCounts.weighOut,
          countColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
        },
      ],
    },
    {
      id: 'qc_independent',
      title: 'Uji Lab Internal (QC-PA)',
      badgeTotal: queueCounts.qc,
      items: [
        {
          id: 'qc',
          label: 'QC-PA',
          sublabel: 'Update lab ≥24 jam · Diluar hitung jam',
          icon: FlaskConical,
          count: queueCounts.qc,
          countColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
        },
      ],
    },
    {
      id: 'reports',
      title: 'Laporan & Integrasi Data',
      items: [
        {
          id: 'transactions',
          label: 'Riwayat Operasional Batubara',
          sublabel: 'Log cetak slip & ekspor CSV',
          icon: History,
        },
        {
          id: 'googlesheet',
          label: 'Database Google Sheets',
          sublabel: 'Database PO s/d QC-PA',
          icon: FileSpreadsheet,
        },
      ],
    },
  ];

  const handleItemClick = (tabId: ActiveTab) => {
    onSelectTab(tabId);
    if (isMobileOpen) {
      onCloseMobile();
    }
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-xs lg:hidden"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 flex flex-col bg-slate-900 border-r border-slate-800 transition-all duration-300 ease-in-out shrink-0 select-none ${
          isCollapsed ? 'w-20' : 'w-72'
        } ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        {/* Brand Lockup Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800 bg-slate-900 shrink-0">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-11 h-11 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0 shadow-xs overflow-hidden p-0.5">
              <img
                src={`${import.meta.env.BASE_URL}assets/aistudio/pt_santos_jaya_abadi__kapal_api_group__1777964733_80ec37da.jpg`}
                alt="Logo"
                className="w-full h-full object-contain"
              />
            </div>

            {!isCollapsed && (
              <div className="min-w-0">
                <span className="text-[22px] font-extrabold tracking-tight text-white block truncate leading-tight">
                  SIMOTUBA
                </span>
                <span
                  className="text-[10px] text-slate-400 font-medium tracking-tight block truncate"
                  title="Sistem Monitoring & Operasional Batubara"
                >
                  Sistem Monitoring & Operasional Batubara
                </span>
              </div>
            )}
          </div>

          {/* Close button on mobile */}
          <button
            type="button"
            onClick={onCloseMobile}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg lg:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Nav Item Sections with Accordion Toggles */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-4 scrollbar-thin scrollbar-thumb-slate-800">
          {navSections.map((section) => {
            const isOpen = openSections[section.id] !== false;

            return (
              <div key={section.id} className="space-y-1">
                {/* Section Header with Independent Toggle Click */}
                {!isCollapsed ? (
                  <button
                    type="button"
                    onClick={() => toggleSection(section.id)}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-200 transition-colors rounded hover:bg-slate-900/60 group"
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <span>{section.title}</span>
                      {section.badgeTotal && section.badgeTotal > 0 ? (
                        <span className="px-1.5 py-0.2 text-[10px] bg-amber-500/20 text-amber-300 rounded-full font-bold border border-amber-500/30">
                          {section.badgeTotal}
                        </span>
                      ) : null}
                    </span>

                    <span className="text-slate-500 group-hover:text-slate-300">
                      {isOpen ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </span>
                  </button>
                ) : (
                  /* Divider line when sidebar is collapsed */
                  <div className="w-full h-px bg-slate-800/80 my-2" />
                )}

                {/* Section Items (Toggled by Section State or Always visible if collapsed) */}
                {(isOpen || isCollapsed) && (
                  <div className="space-y-1">
                    {section.items.map((item) => {
                      const isActive = activeTab === item.id;
                      const IconComponent = item.icon;

                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleItemClick(item.id)}
                          title={isCollapsed ? `${item.label} ${item.count ? `(${item.count})` : ''}` : undefined}
                          className={`w-full group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs font-medium transition-all ${
                            isActive
                              ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/10'
                              : 'text-slate-400 hover:text-white hover:bg-slate-900/80'
                          } ${isCollapsed ? 'justify-center px-0' : ''}`}
                        >
                          {/* Active Indicator Bar on left */}
                          {isActive && (
                            <span className="absolute left-0 top-2 bottom-2 w-1 bg-slate-950 rounded-r-full" />
                          )}

                          <IconComponent
                            className={`w-4 h-4 shrink-0 transition-transform ${
                              isActive
                                ? 'text-slate-950'
                                : 'text-slate-400 group-hover:text-amber-400'
                            }`}
                          />

                          {!isCollapsed && (
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-1">
                                <span className="truncate leading-tight">{item.label}</span>
                                {item.count !== undefined && item.count > 0 && (
                                  <span
                                    className={`px-1.5 py-0.5 text-[10px] font-mono-num font-bold rounded-full border shrink-0 ${
                                      isActive
                                        ? 'bg-slate-950 text-amber-300 border-slate-900'
                                        : item.countColor || 'bg-slate-800 text-slate-200 border-slate-700'
                                    }`}
                                  >
                                    {item.count}
                                  </span>
                                )}
                              </div>
                              {item.sublabel && (
                                <div
                                  className={`text-[10px] truncate leading-tight mt-0.5 ${
                                    isActive ? 'text-slate-900/80 font-normal' : 'text-slate-500'
                                  }`}
                                >
                                  {item.sublabel}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Collapsed view badge indicator */}
                          {isCollapsed && item.count !== undefined && item.count > 0 && (
                            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-slate-950" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Sidebar Footer: Quick Info & Collapse/Expand Toggle */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-950/70 shrink-0 space-y-2">

          {/* Toggle Expand / Collapse Button (Desktop) */}
          <button
            type="button"
            onClick={onToggleCollapse}
            className="w-full hidden lg:flex items-center justify-center gap-2 p-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-900 transition-colors border border-transparent hover:border-slate-800"
            title={isCollapsed ? 'Perluas Sidebar' : 'Ciutkan Sidebar'}
          >
            {isCollapsed ? (
              <ChevronRight className="w-4 h-4 text-amber-400" />
            ) : (
              <>
                <ChevronLeft className="w-4 h-4 text-amber-400" />
                <span>Perkecil Sidebar</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
};
