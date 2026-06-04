'use client';
// components/dashboard/ComplianceChart.jsx
// =========================================================================
// COMPLIANCE CHART — Sprint 16 (Cumplimiento del Plan Mensual)
// -------------------------------------------------------------------------
// Evalúa el cumplimiento delimitando estrictamente por "Fe. Planif":
//   • Cerradas: OTs cerradas cuya Fe. Planif cae en el mes seleccionado.
//   • Abiertas: OTs abiertas cuya Fe. Planif cae en el mes seleccionado.
// Incluye selector para: Mes Anterior, Mes Actual, Próximo Mes y Todos.
// =========================================================================

import { useMemo, useState } from 'react';

const PERIODS = [
  { value: 'previous', label: 'Mes Anterior' },
  { value: 'current',  label: 'Mes Actual' },
  { value: 'next',     label: 'Próximo Mes' },
  { value: 'all',      label: 'Todos los meses' },
];

// ─── Helpers de Fechas ──────────────────────────────────────────────────
function parseLocalDate(iso) {
  if (!iso) return null;
  let d;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, day] = iso.split('-').map(Number);
    d = new Date(y, m - 1, day);
  } else {
    d = new Date(iso);
  }
  return isNaN(d.getTime()) ? null : d;
}

function periodRange(period) {
  const now = new Date();
  const som = (offset = 0) => new Date(now.getFullYear(), now.getMonth() + offset, 1);
  if (period === 'previous') return [som(-1), som(0)];
  if (period === 'current')  return [som(0), som(1)];
  if (period === 'next')     return [som(1), som(2)];
  return [null, null]; // 'all'
}

function inRange(iso, start, end) {
  if (!start || !end) return true;
  const d = parseLocalDate(iso);
  if (!d) return false;
  return d >= start && d < end;
}

function periodLabel(period) {
  const now = new Date();
  const monthName = (offset) => {
    const dt = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    return dt.toLocaleDateString('es-SV', { month: 'long', year: 'numeric' });
  };
  if (period === 'previous') return monthName(-1);
  if (period === 'current')  return monthName(0);
  if (period === 'next')     return monthName(1);
  return 'Todo el horizonte histórico';
}

// =========================================================================
export default function ComplianceChart({ positions }) {
  const [period, setPeriod] = useState('current');

  const stats = useMemo(() => {
    const [start, end] = periodRange(period);
    let cerradas = 0;
    let abiertas = 0;

    for (const p of positions) {
      if (period === 'all') {
        if (p.last_closed_wo) cerradas++;
        if (p.sap_open_wo) abiertas++;
      } else {
        // Evaluamos si la Fe. Planif (extrema) de la última cerrada cae en el mes
        const closedInMonth = p.last_sap_date_extrema && inRange(p.last_sap_date_extrema, start, end);
        // Evaluamos si la Fe. Planif de la próxima abierta cae en el mes
        const openInMonth = p.next_sap_date && inRange(p.next_sap_date, start, end);

        if (closedInMonth) cerradas++;
        if (openInMonth) abiertas++;
      }
    }

    const total = cerradas + abiertas;
    const pctCerradas = total ? (cerradas / total) * 100 : 0;
    const pctAbiertas = total ? (abiertas / total) * 100 : 0;
    const compliance = total ? Math.round(pctCerradas) : null;

    return { cerradas, abiertas, total, pctCerradas, pctAbiertas, compliance };
  }, [positions, period]);

  return (
    <div className="bg-white rounded-xl border border-neutral-200 shadow-card mb-6">
      {/* Header del card */}
      <div className="px-5 py-3 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-[12px] uppercase tracking-wider text-neutral-600 font-bold">
            Cumplimiento del Plan SAP
          </div>
          <div className="text-[10.5px] text-neutral-500 mt-0.5 capitalize">
            Delimitado por Fe. Planif — {periodLabel(period)}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Tasa de cumplimiento global */}
          {stats.compliance != null && (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${
              stats.compliance >= 90 ? 'bg-brand-passSoft/60 border-brand-pass/30' : 'bg-brand-warnSoft/60 border-brand-warn/30'
            }`}>
              <span className={`text-[10px] uppercase tracking-wider font-bold ${stats.compliance >= 90 ? 'text-brand-pass' : 'text-amber-700'}`}>
                Avance Mes
              </span>
              <span className={`text-[15px] font-extrabold ${stats.compliance >= 90 ? 'text-brand-pass' : 'text-amber-700'}`}>
                {stats.compliance}%
              </span>
            </div>
          )}

          {/* Selector de período */}
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
          label="Cerradas (Cumplidas)"
          count={stats.cerradas}
          pct={stats.pctCerradas}
          barClass="bg-brand-pass"
          textClass="text-brand-pass"
          dotClass="bg-brand-pass"
        />
        <Bar
          label="Abiertas (Pendientes)"
          count={stats.abiertas}
          pct={stats.pctAbiertas}
          barClass="bg-brand-warn"
          textClass="text-amber-700"
          dotClass="bg-brand-warn"
        />

        {/* Pie del card */}
        <div className="pt-3 border-t border-neutral-100 flex items-center justify-between text-[11.5px] text-neutral-500 flex-wrap gap-2">
          <span>
            OTs programadas para el mes:{' '}
            <strong className="text-neutral-800">{stats.total}</strong>
          </span>
          {stats.total === 0 && (
            <span className="italic text-neutral-400">Sin OTs planificadas para este período</span>
          )}
          <span className="text-[10.5px] text-neutral-400">
            Filtro reactivo a la tabla
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
      <div className="flex items-center gap-2 w-48 shrink-0">
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