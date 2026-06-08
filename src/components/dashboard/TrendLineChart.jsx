'use client';
// components/dashboard/TrendLineChart.jsx
// =========================================================================
// TREND LINE CHART — Sprint 17 (slave del lifted state)
// -------------------------------------------------------------------------
// Esclavo de ComplianceChart. NO tiene selector propio: recibe `period`
// del padre <FaroDashboardClient /> y se re-renderiza automáticamente
// cuando el usuario cambia el mes en el Maestro (ComplianceChart).
//
// VISUALIZACIÓN
//   Barra apilada horizontal — la altura total = 100% de las POS del período
//     Rojo (brand-fail) → VENCIDO
//     Verde (brand-pass) → VIGENTE + PROXIMO_7 + NUNCA_CALIBRADO
//
// FILTRO POR PERÍODO
//   - 'all'  → todas las posiciones recibidas (sin filtrar por fecha)
//   - otros  → POS cuyo next_sap_date cae dentro del período seleccionado
//
// Props:
//   positions : array filtrado por la tabla maestra (search + área + estado)
//   period    : string ('previous' | 'current' | 'next' | 'all')
// =========================================================================

import { useMemo } from 'react';
import { periodRange, inRange, periodLabel } from '@/lib/periodRange';

export default function TrendLineChart({ positions, period }) {
  const data = useMemo(() => {
    const [start, end] = periodRange(period);

    // 1) Filtrar al subset que corresponde al período seleccionado.
    //    'all' deja pasar todo (inRange devuelve true cuando start/end son null).
    const subset = positions.filter((p) => {
      if (period === 'all') return true;
      return p.next_sap_date && inRange(p.next_sap_date, start, end);
    });

    // 2) Conteo binario: rojo (VENCIDO) vs verde (todo lo demás considerado "OK").
    let vencidas = 0;
    let vigentes = 0;
    for (const p of subset) {
      if (p.status === 'VENCIDO') vencidas++;
      else if (
        p.status === 'VIGENTE' ||
        p.status === 'PROXIMO_7' ||
        p.status === 'NUNCA_CALIBRADO'
      ) {
        vigentes++;
      }
    }

    const total    = vencidas + vigentes;
    const pctRojo  = total ? (vencidas / total) * 100 : 0;
    const pctVerde = total ? (vigentes / total) * 100 : 0;
    const ratio    = total ? Math.round(pctVerde) : null; // % "sano"

    return { vencidas, vigentes, total, pctRojo, pctVerde, ratio };
  }, [positions, period]);

  return (
    <div className="bg-white rounded-xl border border-neutral-200 shadow-card h-full flex flex-col">
      {/* Header */}
      <div className="px-5 py-3 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between gap-2">
        <div>
          <div className="text-[12px] uppercase tracking-wider text-neutral-600 font-bold">
            Tendencia (Rojo vs Verde)
          </div>
          <div className="text-[10.5px] text-neutral-500 mt-0.5">
            {periodLabel(period)} · sincronizado con Cumplimiento SAP
          </div>
        </div>

        {/* Badge "sano %" — sólo si hay datos */}
        {data.ratio != null && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-brand-passSoft/60 border border-brand-pass/30 shrink-0">
            <span className="text-[10px] uppercase tracking-wider font-bold text-brand-pass">Sano</span>
            <span className="text-[13px] font-extrabold text-brand-pass">{data.ratio}%</span>
          </div>
        )}
      </div>

      {/* Cuerpo */}
      <div className="p-5 flex-1 flex flex-col justify-center">
        {data.total === 0 ? (
          <div className="text-center text-[12px] italic text-neutral-400 py-6">
            Sin POS con fecha planificada en este período
          </div>
        ) : (
          <>
            {/* Barra apilada */}
            <div className="flex h-7 rounded-lg overflow-hidden border border-neutral-200 bg-neutral-100">
              {data.pctRojo > 0 && (
                <div
                  className="bg-brand-fail h-full transition-all duration-300 flex items-center justify-center text-[10px] font-bold text-white"
                  style={{ width: `${data.pctRojo}%` }}
                  title={`VENCIDO: ${data.vencidas} (${data.pctRojo.toFixed(0)}%)`}
                >
                  {data.pctRojo >= 10 && `${data.pctRojo.toFixed(0)}%`}
                </div>
              )}
              {data.pctVerde > 0 && (
                <div
                  className="bg-brand-pass h-full transition-all duration-300 flex items-center justify-center text-[10px] font-bold text-white"
                  style={{ width: `${data.pctVerde}%` }}
                  title={`Sano: ${data.vigentes} (${data.pctVerde.toFixed(0)}%)`}
                >
                  {data.pctVerde >= 10 && `${data.pctVerde.toFixed(0)}%`}
                </div>
              )}
            </div>

            {/* Leyenda + conteos */}
            <div className="mt-4 flex items-center justify-between gap-4 text-[12px]">
              <LegendCell label="Vencidas" count={data.vencidas} dot="bg-brand-fail" text="text-brand-fail" />
              <LegendCell label="Sanas (Vigente + Próximo + Sin OT)" count={data.vigentes} dot="bg-brand-pass" text="text-brand-pass" />
            </div>

            <div className="mt-3 pt-3 border-t border-neutral-100 text-[11px] text-neutral-500 flex items-center justify-between">
              <span>Total POS en el período: <strong className="text-neutral-800">{data.total}</strong></span>
              <span className="text-[10.5px] text-neutral-400">Reactivo al selector de Cumplimiento</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Celda de leyenda ───────────────────────────────────────────────────
function LegendCell({ label, count, dot, text }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dot}`}></span>
      <span className="text-[11.5px] font-semibold text-neutral-700 truncate">{label}</span>
      <span className={`font-mono font-bold ${text}`}>{count}</span>
    </div>
  );
}