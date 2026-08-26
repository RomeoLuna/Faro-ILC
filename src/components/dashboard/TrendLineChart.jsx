'use client';
// components/dashboard/TrendLineChart.jsx
// =========================================================================
// TREND LINE CHART — Sprint 34c (misma regla simple que Compliance)
// -------------------------------------------------------------------------
// REGLAS (acordadas con la planta):
//
//   • Filtro del universo (período específico):
//       OTs cuya fecha de planificación cae en el mes
//       (planned_date EN el mes O fe_planif EN el mes)
//
//   • Verde (sana):
//       AND adicional: NOTI en status AND fecha_cierre dentro del mes
//
//   • Rojo (vencida/incompleta):
//       todo lo demás (no cerrada en el mes — late, early, o sin cierre)
//
//   • Modo "Todos los meses":
//       lógica original positions-based (preservada). VENCIDO → rojo,
//       resto (VIGENTE/PROXIMO_7/NUNCA_CALIBRADO) → verde.
//
// La regla está alineada con ComplianceChart 1:1 — los 2 gráficos
// muestran exactamente el mismo conteo y porcentaje.
// =========================================================================

import { useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { periodRange, periodLabel, parseLocalDate } from '@/lib/periodRange';

function isNotificada(status) {
  if (!status) return false;
  return status.toUpperCase().includes('NOTI');
}

function isoDay(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dateInRange(isoStr, start, end) {
  if (!isoStr || !start || !end) return false;
  const d = parseLocalDate(isoStr);
  if (!d) return false;
  return d >= start && d < end;
}

export default function TrendLineChart({ positions, period }) {
  const isAll = period === 'all';

  const [otRows, setOtRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const posKeys = useMemo(() => {
    const set = new Set();
    for (const p of positions) if (p.pos_mtto) set.add(p.pos_mtto);
    return Array.from(set);
  }, [positions]);

  // ── Fetch SOLO en modo período específico ──────────────────────────────
  useEffect(() => {
    if (isAll) {
      setOtRows(null);
      setLoading(false);
      setErr(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setErr(null);

    (async () => {
      const supabase = createSupabaseBrowserClient();
      let query = supabase
        .from('sap_work_orders')
        .select('wo_number, pos_mtto, status, planned_date, fe_planif, fecha_cierre');

      // Sprint 34f: SOLO fe_planif en el mes (mismo criterio que Compliance).
      // OTs sin fe_planif quedan fuera hasta que IP24 sincronice.
      const [start, end] = periodRange(period);
      if (start && end) {
        const s = isoDay(start);
        const e = isoDay(end);
        query = query
          .gte('fe_planif', s)
          .lt('fe_planif', e);
      }

      if (posKeys.length > 0 && posKeys.length <= 1000) {
        query = query.in('pos_mtto', posKeys);
      }

      const { data, error } = await query;
      if (cancelled) return;
      if (error) {
        setErr(error.message);
        setOtRows([]);
      } else {
        setOtRows(data || []);
      }
      setLoading(false);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, posKeys.join('|'), isAll]);

  // ── Conteo ─────────────────────────────────────────────────────────────
  const data = useMemo(() => {
    // Modo 'all' — lógica vieja positions-based
    if (isAll) {
      let vencidas = 0;
      let vigentes = 0;
      for (const p of positions) {
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
      const ratio    = total ? Math.round(pctVerde) : null;
      return { vencidas, vigentes, total, pctRojo, pctVerde, ratio };
    }

    // Período específico — misma regla que ComplianceChart
    if (!otRows) {
      return { vencidas: 0, vigentes: 0, total: 0, pctRojo: 0, pctVerde: 0, ratio: null };
    }

    const [start, end] = periodRange(period);

    // Sprint 34j — SOLO 1 OT por POS (la más reciente = latest wo_number).
    // Misma regla que Compliance.
    const latestPerPos = new Map();
    for (const ot of otRows) {
      if (!ot.pos_mtto) continue;
      const cur = latestPerPos.get(ot.pos_mtto);
      if (!cur || Number(ot.wo_number) > Number(cur.wo_number)) {
        latestPerPos.set(ot.pos_mtto, ot);
      }
    }

    let vencidas = 0;
    let vigentes = 0;
    for (const ot of latestPerPos.values()) {
      const isPositive =
        isNotificada(ot.status) &&
        dateInRange(ot.fecha_cierre, start, end);
      if (isPositive) vigentes++;
      else            vencidas++;
    }

    const total    = vencidas + vigentes;
    const pctRojo  = total ? (vencidas / total) * 100 : 0;
    const pctVerde = total ? (vigentes / total) * 100 : 0;
    const ratio    = total ? Math.round(pctVerde) : null;
    return { vencidas, vigentes, total, pctRojo, pctVerde, ratio };
  }, [otRows, period, positions, isAll]);

  return (
    <div className="bg-white rounded-xl border border-neutral-200 shadow-card h-full flex flex-col">
      <div className="px-5 py-3 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between gap-2">
        <div>
          <div className="text-[12px] uppercase tracking-wider text-neutral-600 font-bold">
            Tendencia (Rojo vs Verde)
          </div>
          <div className="text-[10.5px] text-neutral-500 mt-0.5">
            {periodLabel(period)} · sincronizado con Cumplimiento SAP
          </div>
        </div>

        {data.ratio != null && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-brand-passSoft/60 border border-brand-pass/30 shrink-0">
            <span className="text-[10px] uppercase tracking-wider font-bold text-brand-pass">Sano</span>
            <span className="text-[13px] font-extrabold text-brand-pass">{data.ratio}%</span>
          </div>
        )}
      </div>

      <div className="p-5 flex-1 flex flex-col justify-center">
        {loading ? (
          <div className="flex items-center gap-2 text-[12px] text-brand-env py-2">
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/>
              <path d="M22 12a10 10 0 0 1-10 10"/>
            </svg>
            Cargando…
          </div>
        ) : err ? (
          <div className="text-[12px] text-brand-fail bg-brand-failSoft border border-brand-fail/30 rounded-md px-3 py-2">
            Error: {err}
          </div>
        ) : data.total === 0 ? (
          <div className="text-center text-[12px] italic text-neutral-400 py-6">
            {isAll ? 'Sin POS' : 'Sin OTs planificadas en este período'}
          </div>
        ) : (
          <>
            <div className="flex h-7 rounded-lg overflow-hidden border border-neutral-200 bg-neutral-100">
              {data.pctRojo > 0 && (
                <div
                  className="bg-brand-fail h-full transition-all duration-300 flex items-center justify-center text-[10px] font-bold text-white"
                  style={{ width: `${data.pctRojo}%` }}
                  title={`Vencidas: ${data.vencidas} (${data.pctRojo.toFixed(0)}%)`}
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

            <div className="mt-4 flex items-center justify-between gap-4 text-[12px]">
              <LegendCell
                label="POS incumplidas (no cerradas en el mes)"
                count={data.vencidas}
                dot="bg-brand-fail"
                text="text-brand-fail"
              />
              <LegendCell
                label="POS cumplidas (cerradas en el mes)"
                count={data.vigentes}
                dot="bg-brand-pass"
                text="text-brand-pass"
              />
            </div>

            <div className="mt-3 pt-3 border-t border-neutral-100 text-[11px] text-neutral-500 flex items-center justify-between">
              <span>
                Total POS con OT en el período:{' '}
                <strong className="text-neutral-800">{data.total}</strong>
              </span>
              <span className="text-[10.5px] text-neutral-400">Reactivo al selector de Cumplimiento</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function LegendCell({ label, count, dot, text }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dot}`}></span>
      <span className="text-[11.5px] font-semibold text-neutral-700 truncate">{label}</span>
      <span className={`font-mono font-bold ${text}`}>{count}</span>
    </div>
  );
}