'use client';
// components/dashboard/StatusDonutChart.jsx
// =========================================================================
// STATUS DONUT CHART — Sprint 17 (slave del lifted state)
// -------------------------------------------------------------------------
// Esclavo de ComplianceChart. NO tiene selector propio: recibe `period`
// del padre <FaroDashboardClient /> y se re-renderiza automáticamente
// cuando el usuario cambia el mes en el Maestro (ComplianceChart).
//
// VISUALIZACIÓN
//   Donut SVG puro de 3 segmentos:
//     Rojo  → VENCIDO
//     Ámbar → PROXIMO_7
//     Verde → VIGENTE + NUNCA_CALIBRADO
//
// FILTRO POR PERÍODO
//   - 'all'  → todas las posiciones recibidas (sin filtrar por fecha)
//   - otros  → POS cuyo next_sap_date cae dentro del período seleccionado
//
// Props:
//   positions      : array filtrado por la tabla maestra
//   period         : string ('previous' | 'current' | 'next' | 'all')
//   onSectionClick : (status) => void  — opcional, para cross-filtering futuro
// =========================================================================

import { useMemo } from 'react';
import { periodRange, inRange, periodLabel } from '@/lib/periodRange';

export default function StatusDonutChart({ positions, period, onSectionClick }) {
  const stats = useMemo(() => {
    const [start, end] = periodRange(period);

    // Filtrar por período (igual criterio que TrendLineChart para que
    // las dos visualizaciones cuenten exactamente el mismo subset).
    const subset = positions.filter((p) => {
      if (period === 'all') return true;
      return p.next_sap_date && inRange(p.next_sap_date, start, end);
    });

    let rojo = 0;     // VENCIDO
    let amarillo = 0; // PROXIMO_7
    let verde = 0;    // VIGENTE + NUNCA_CALIBRADO

    for (const p of subset) {
      if (p.status === 'VENCIDO') rojo++;
      else if (p.status === 'PROXIMO_7') amarillo++;
      else if (p.status === 'VIGENTE' || p.status === 'NUNCA_CALIBRADO') verde++;
    }

    const total = rojo + amarillo + verde;
    return { rojo, amarillo, verde, total };
  }, [positions, period]);

  // Matemáticas para el SVG Donut
  const radius        = 50;
  const circumference = 2 * Math.PI * radius;

  const pctRojo     = stats.total ? (stats.rojo     / stats.total) * 100 : 0;
  const pctAmarillo = stats.total ? (stats.amarillo / stats.total) * 100 : 0;
  const pctVerde    = stats.total ? (stats.verde    / stats.total) * 100 : 0;

  const dashRojo     = (pctRojo     / 100) * circumference;
  const offsetRojo   = 0;
  const dashAmarillo = (pctAmarillo / 100) * circumference;
  const offsetAmarillo = -dashRojo;
  const dashVerde    = (pctVerde    / 100) * circumference;
  const offsetVerde  = offsetAmarillo - dashAmarillo;

  return (
    <div className="bg-white rounded-xl border border-neutral-200 shadow-card p-5 h-full flex flex-col justify-between">
      <div className="flex items-start justify-between gap-2 mb-4">
        <div>
          <div className="text-[12px] uppercase tracking-wider text-neutral-600 font-bold">
            Distribución por Status
          </div>
          <div className="text-[10.5px] text-neutral-500 mt-0.5">
            {periodLabel(period)} · sincronizado con Cumplimiento SAP
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-6">
        {/* SVG Donut */}
        <div className="relative w-36 h-36 shrink-0">
          <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
            {/* Fondo */}
            <circle cx="60" cy="60" r={radius} fill="none" stroke="#f5f5f5" strokeWidth="15" />

            {stats.verde > 0 && (
              <circle cx="60" cy="60" r={radius} fill="none" stroke="#059669" strokeWidth="15"
                strokeDasharray={`${dashVerde} ${circumference}`} strokeDashoffset={offsetVerde}
                className="cursor-pointer hover:stroke-[#047857] transition-all"
                onClick={() => onSectionClick && onSectionClick('VIGENTE')}
              />
            )}
            {stats.amarillo > 0 && (
              <circle cx="60" cy="60" r={radius} fill="none" stroke="#F59E0B" strokeWidth="15"
                strokeDasharray={`${dashAmarillo} ${circumference}`} strokeDashoffset={offsetAmarillo}
                className="cursor-pointer hover:stroke-[#D97706] transition-all"
                onClick={() => onSectionClick && onSectionClick('PROXIMO_7')}
              />
            )}
            {stats.rojo > 0 && (
              <circle cx="60" cy="60" r={radius} fill="none" stroke="#DC2626" strokeWidth="15"
                strokeDasharray={`${dashRojo} ${circumference}`} strokeDashoffset={offsetRojo}
                className="cursor-pointer hover:stroke-[#B91C1C] transition-all"
                onClick={() => onSectionClick && onSectionClick('VENCIDO')}
              />
            )}
          </svg>

          {/* Total al centro */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-2xl font-extrabold text-neutral-800">{stats.total}</span>
            <span className="text-[9px] uppercase tracking-wider font-bold text-neutral-400">Total POS</span>
          </div>
        </div>

        {/* Leyenda interactiva */}
        <div className="flex flex-col gap-3 flex-1">
          <LegendRow label="Vigentes / Sin OT" count={stats.verde}    color="bg-brand-pass" onClick={() => onSectionClick && onSectionClick('VIGENTE')} />
          <LegendRow label="Próximas (7 días)" count={stats.amarillo} color="bg-brand-warn" onClick={() => onSectionClick && onSectionClick('PROXIMO_7')} />
          <LegendRow label="Vencidas"          count={stats.rojo}     color="bg-brand-fail" onClick={() => onSectionClick && onSectionClick('VENCIDO')} />
        </div>
      </div>

      {stats.total === 0 && (
        <div className="text-center text-[12px] italic text-neutral-400 mt-4">
          Sin POS con fecha planificada en este período
        </div>
      )}
    </div>
  );
}

// ─── Sub-componente: fila de leyenda ────────────────────────────────────
function LegendRow({ label, count, color, onClick }) {
  return (
    <div
      onClick={onClick}
      className="flex items-center justify-between cursor-pointer group hover:bg-neutral-50 p-1 rounded-md transition-colors"
    >
      <div className="flex items-center gap-2">
        <span className={`w-3 h-3 rounded-full ${color} shadow-sm group-hover:scale-110 transition-transform`} />
        <span className="text-[11.5px] font-bold text-neutral-600 group-hover:text-neutral-900">{label}</span>
      </div>
      <span className="text-[12.5px] font-mono font-bold text-neutral-800">{count}</span>
    </div>
  );
}