'use client';
// components/dashboard/ComplianceChart.jsx
// =========================================================================
// COMPLIANCE CHART — Sprint 17 (refactor: Master del lifted state)
// -------------------------------------------------------------------------
// CAMBIO ARQUITECTÓNICO (Sprint 17):
//   Este componente YA NO posee el estado `period`. Ahora lo recibe del
//   padre <FaroDashboardClient /> junto con `setPeriod`. Sigue siendo el
//   "Maestro" en el sentido de que es el único que renderiza el <select>
//   visible — pero el estado vive arriba para que <StatusDonutChart /> y
//   <TrendLineChart /> se re-rendericen sincronizados.
//
// Helpers de fecha viven en `@/lib/periodRange` para garantizar que los
// tres gráficos comparten una sola fuente de verdad.
//
// Props:
//   positions : array filtrado por la tabla (search + área + estado)
//   period    : string ('previous' | 'current' | 'next' | 'all')
//   setPeriod : (value) => void  — el único componente que la invoca
// =========================================================================

import { useMemo } from 'react';
import { PERIODS, periodRange, inRange, periodLabel } from '@/lib/periodRange';

export default function ComplianceChart({ positions, period, setPeriod }) {
  const stats = useMemo(() => {
    const [start, end] = periodRange(period);
    let closed = 0;
    let open   = 0;

    for (const p of positions) {
      if (period === 'all') {
        if (p.last_closed_wo) closed++;
        if (p.sap_open_wo)    open++;
      } else {
        if (p.last_sap_date && inRange(p.last_sap_date, start, end)) closed++;
        if (p.next_sap_date && inRange(p.next_sap_date, start, end)) open++;
      }
    }

    const total      = closed + open;
    const pctClosed  = total ? (closed / total) * 100 : 0;
    const pctOpen    = total ? (open   / total) * 100 : 0;
    // Tasa de cumplimiento = cerradas / (cerradas + abiertas)
    const compliance = total ? Math.round(pctClosed) : null;

    return { closed, open, total, pctClosed, pctOpen, compliance };
  }, [positions, period]);

  return (
    <div className="bg-white rounded-xl border border-neutral-200 shadow-card mb-6">
      {/* Header del card */}
      <div className="px-5 py-3 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-[12px] uppercase tracking-wider text-neutral-600 font-bold">
            Cumplimiento SAP
          </div>
          <div className="text-[10.5px] text-neutral-500 mt-0.5">
            Proporción de OTs cerradas vs abiertas — {periodLabel(period)}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Tasa de cumplimiento global del período */}
          {stats.compliance != null && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand-passSoft/60 border border-brand-pass/30">
              <span className="text-[10px] uppercase tracking-wider font-bold text-brand-pass">Cumplimiento</span>
              <span className="text-[15px] font-extrabold text-brand-pass">{stats.compliance}%</span>
            </div>
          )}

          {/* Selector de período — único <select> visible del dashboard.
              Controla el estado del padre (lifted up) y por lo tanto
              re-renderiza StatusDonutChart y TrendLineChart en sincronía. */}
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="bg-white border border-neutral-300 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold focus:outline-none focus:ring-2 focus:ring-brand-amber/40 focus:border-brand-amber"
          >
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Barras */}
      <div className="p-5 space-y-4">
        <Bar
          label="OT Cerradas"
          count={stats.closed}
          pct={stats.pctClosed}
          barClass="bg-brand-pass"
          textClass="text-brand-pass"
          dotClass="bg-brand-pass"
        />
        <Bar
          label="OT Abiertas"
          count={stats.open}
          pct={stats.pctOpen}
          barClass="bg-brand-warn"
          textClass="text-amber-700"
          dotClass="bg-brand-warn"
        />

        {/* Pie del card */}
        <div className="pt-3 border-t border-neutral-100 flex items-center justify-between text-[11.5px] text-neutral-500 flex-wrap gap-2">
          <span>
            Total OTs en el período:{' '}
            <strong className="text-neutral-800">{stats.total}</strong>
          </span>
          {stats.total === 0 && (
            <span className="italic text-neutral-400">Sin movimientos en este período</span>
          )}
          <span className="text-[10.5px] text-neutral-400">
            Filtro reactivo · respeta área, estado y búsqueda
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-componente: barra horizontal ───────────────────────────────────
function Bar({ label, count, pct, barClass, textClass, dotClass }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 w-32 shrink-0">
        <span className={`w-2 h-2 rounded-full ${dotClass}`}></span>
        <span className="text-[12px] font-bold text-neutral-700">{label}</span>
      </div>
      <div className="flex-1 bg-neutral-100 rounded-full h-3 overflow-hidden">
        <div
          className={`${barClass} h-full transition-all duration-300`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className={`text-[12.5px] font-mono font-bold w-24 text-right ${textClass}`}>
        {count} ({pct.toFixed(0)}%)
      </div>
    </div>
  );
}