import React, { useMemo } from 'react';
import { TrendingUp, CheckCircle2, Building2 } from 'lucide-react';
import { CoalTransaction, PurchaseOrder } from '../types/coal';

interface SupplierPerformanceChartProps {
  transactions: CoalTransaction[];
  purchaseOrders: PurchaseOrder[];
}

interface SupplierPerformanceItem {
  key: string;
  supplierName: string;
  nettoTons: number;
  targetTons: number;
  achievementPct: number;
  truckCount: number;
  poCount: number;
  avgShrinkagePct: number | null;
  isTopPerformer: boolean;
}

const getTransactionNettoTon = (tx: CoalTransaction): number => {
  if (typeof tx.nettoTons === 'number' && tx.nettoTons > 0) return tx.nettoTons;
  if (typeof tx.nettoWeight === 'number' && tx.nettoWeight > 0) return tx.nettoWeight / 1000;
  if (typeof tx.grossWeight === 'number' && typeof tx.tareWeight === 'number' && tx.grossWeight > tx.tareWeight) {
    return (tx.grossWeight - tx.tareWeight) / 1000;
  }
  if (typeof tx.suratJalanWeight === 'number' && tx.suratJalanWeight > 0) {
    return tx.suratJalanWeight / 1000;
  }
  return 0;
};

export const SupplierPerformanceChart: React.FC<SupplierPerformanceChartProps> = ({
  transactions,
  purchaseOrders,
}) => {
  const supplierData: SupplierPerformanceItem[] = useMemo(() => {
    const map = new Map<
      string,
      {
        supplierName: string;
        nettoTons: number;
        targetTons: number;
        truckCount: number;
        poCount: number;
        shrinkageSum: number;
        shrinkageCount: number;
      }
    >();

    const ensureEntry = (rawName: string) => {
      const cleanName = rawName.trim();
      const key = cleanName.toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          supplierName: cleanName,
          nettoTons: 0,
          targetTons: 0,
          truckCount: 0,
          poCount: 0,
          shrinkageSum: 0,
          shrinkageCount: 0,
        });
      }
      return map.get(key)!;
    };

    // Akumulasi Target Kuota PO per Supplier
    purchaseOrders.forEach((po) => {
      const name = (po.supplierName || '').trim();
      if (!name) return;
      const entry = ensureEntry(name);
      entry.poCount += 1;
      entry.targetTons += Number(po.targetTonnage || 0) / 1000;
    });

    // Akumulasi Realisasi Tonase Netto dari transaksi riil (di luar REJECTED)
    transactions.forEach((tx) => {
      if (tx.status === 'REJECTED') return;
      const name = (tx.supplierName || '').trim();
      if (!name) return;
      const netto = getTransactionNettoTon(tx);
      if (tx.status !== 'COMPLETED' && netto <= 0) return;

      const entry = ensureEntry(name);
      entry.nettoTons += netto;
      entry.truckCount += 1;
      if (typeof tx.shrinkagePercentage === 'number' && !Number.isNaN(tx.shrinkagePercentage)) {
        entry.shrinkageSum += tx.shrinkagePercentage;
        entry.shrinkageCount += 1;
      }
    });

    const list = Array.from(map.entries())
      .map(([key, item]) => {
        const achievementPct = item.targetTons > 0 ? (item.nettoTons / item.targetTons) * 100 : 0;
        const avgShrinkagePct =
          item.shrinkageCount > 0 ? item.shrinkageSum / item.shrinkageCount : null;
        return {
          key,
          supplierName: item.supplierName,
          nettoTons: item.nettoTons,
          targetTons: item.targetTons,
          achievementPct,
          truckCount: item.truckCount,
          poCount: item.poCount,
          avgShrinkagePct,
          isTopPerformer: false,
        };
      })
      .sort((a, b) => {
        if (b.nettoTons !== a.nettoTons) return b.nettoTons - a.nettoTons;
        return b.targetTons - a.targetTons;
      });

    if (list.length > 0 && list[0].nettoTons > 0) {
      list[0].isTopPerformer = true;
    }

    return list;
  }, [transactions, purchaseOrders]);

  const maxTon = useMemo(() => {
    const peak = supplierData.reduce(
      (max, item) => Math.max(max, item.nettoTons, item.targetTons),
      0
    );
    return peak > 0 ? peak : 100;
  }, [supplierData]);

  return (
    <div className="bg-white border border-slate-300 rounded-xl p-5 shadow-xs space-y-3">
      {/* Header & Legend */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <TrendingUp className="w-4 h-4 text-amber-600 shrink-0" />
          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
            Grafik Performa Supplier Batubara
          </h4>
          {supplierData.length > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 border border-slate-300 text-[10px] font-bold text-slate-700 font-mono-num">
              <Building2 className="w-3 h-3 text-amber-600" />
              {supplierData.length} Supplier
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs font-medium">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-amber-500 inline-block shadow-xs" />
            <span className="text-slate-700">Realisasi Tonase Netto</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-slate-200 border border-slate-400 inline-block" />
            <span className="text-slate-700">Target Kuota PO</span>
          </div>
        </div>
      </div>

      {/* Dynamic Bar Chart Visualization */}
      {supplierData.length === 0 ? (
        <div className="py-10 text-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-slate-500 text-xs">
          Belum ada data performa supplier yang tercatat pada Purchase Order maupun transaksi bongkar.
        </div>
      ) : (
        <div className="pt-24 pb-2 overflow-x-auto">
          <div className="min-w-[420px] flex items-end gap-4 sm:gap-6 px-6 pb-3 border-b border-slate-300">
            {supplierData.map((item, idx) => {
              const actualHeightPct = item.nettoTons > 0 ? Math.round((item.nettoTons / maxTon) * 100) : 0;
              const targetHeightPct = item.targetTons > 0 ? Math.round((item.targetTons / maxTon) * 100) : 0;
              const isAchieved = item.targetTons > 0 ? item.nettoTons >= item.targetTons * 0.95 : true;
              const tooltipHorizontalAlign =
                supplierData.length > 1 && idx === 0
                  ? 'left-0'
                  : supplierData.length > 1 && idx === supplierData.length - 1
                    ? 'right-0'
                    : 'left-1/2 -translate-x-1/2';

              return (
                <div
                  key={item.key}
                  className="flex-1 min-w-[140px] flex flex-col items-center justify-end group relative"
                >
                  {/* Hover Tooltip */}
                  <div
                    className={`absolute bottom-full mb-2 ${tooltipHorizontalAlign} z-30 hidden group-hover:flex flex-col items-center pointer-events-none whitespace-nowrap bg-white border border-slate-300 text-slate-900 text-[11px] px-3 py-2 rounded-lg shadow-lg ring-1 ring-slate-900/5 space-y-0.5`}
                  >
                    <span className="font-bold text-amber-800 leading-tight">
                      {item.supplierName}
                    </span>
                    <span className="font-mono-num font-bold text-slate-900 leading-tight">
                      {item.nettoTons.toLocaleString('id-ID', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{' '}
                      Ton ({item.truckCount} rit)
                    </span>
                    <span className="text-[10px] font-medium text-slate-600 leading-tight font-mono-num">
                      Target: {item.targetTons.toLocaleString('id-ID', { maximumFractionDigits: 2 })} Ton · Capaian:{' '}
                      <strong className="text-amber-800">{item.achievementPct.toFixed(1)}%</strong>
                    </span>
                    <span className="text-[10px] text-slate-500 leading-tight font-mono-num">
                      {item.poCount} PO
                      {item.avgShrinkagePct !== null
                        ? ` · Rata-rata Susut: ${item.avgShrinkagePct > 0 ? '+' : ''}${item.avgShrinkagePct.toFixed(2)}%`
                        : ''}
                    </span>
                  </div>

                  {/* Dual Bar Container: Fixed height so all bars align on the same baseline */}
                  <div className="w-full max-w-[54px] flex items-end justify-center relative h-44">
                    {/* Target Bar Background Guide */}
                    {item.targetTons > 0 && (
                      <div
                        className="absolute bottom-0 w-full rounded-t bg-slate-100 border-t-2 border-slate-300 transition-all duration-300"
                        style={{ height: `${Math.min(100, Math.max(10, targetHeightPct))}%` }}
                        title={`Target Kuota PO: ${item.targetTons.toLocaleString('id-ID', { maximumFractionDigits: 2 })} Ton`}
                      />
                    )}

                    {/* Actual Netto Bar */}
                    {item.nettoTons > 0 && (
                      <div
                        className={`relative z-10 w-4/5 rounded-t transition-all duration-500 group-hover:brightness-105 shadow-xs ${
                          item.isTopPerformer
                            ? 'bg-gradient-to-t from-amber-600 to-amber-500 border-t-2 border-amber-300'
                            : isAchieved
                              ? 'bg-gradient-to-t from-amber-600 to-amber-500'
                              : 'bg-gradient-to-t from-amber-700 to-amber-600'
                        }`}
                        style={{ height: `${Math.min(100, Math.max(8, actualHeightPct))}%` }}
                      >
                        {item.isTopPerformer && (
                          <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-300 animate-ping" />
                        )}
                      </div>
                    )}
                  </div>

                  {/* Value & Achievement Below Bar */}
                  <div className="mt-2 flex items-center gap-1 text-[10px] font-mono-num font-bold text-slate-800 group-hover:text-amber-800 transition-colors whitespace-nowrap">
                    <span>
                      {item.nettoTons >= 1000
                        ? `${(item.nettoTons / 1000).toFixed(1)}k T`
                        : `${item.nettoTons.toFixed(1)} T`}
                    </span>
                    {item.targetTons > 0 && (
                      <span className="text-amber-700">({item.achievementPct.toFixed(1)}%)</span>
                    )}
                  </div>

                  {/* Supplier Name Below Axis (Unclipped multi-line support) */}
                  <div
                    className="mt-1 min-h-[32px] flex items-start justify-center text-[11px] font-bold text-slate-800 group-hover:text-slate-950 transition-colors text-center max-w-[175px] leading-snug break-words"
                    title={item.supplierName}
                  >
                    {item.supplierName}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer Note */}
      <div className="text-[11px] text-slate-600 flex flex-wrap items-center justify-between gap-2 pt-1">
        <span>
          * Data dihitung 100% dari realisasi transaksi riil dan target kuota PO masing-masing supplier tanpa data dummy.
        </span>
        <span className="text-emerald-700 font-bold flex items-center gap-1">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Sinkron Real-time
        </span>
      </div>
    </div>
  );
};
