'use client';
// components/dashboard/ComplianceChart.jsx
// =========================================================================
// COMPLIANCE CHART — Sprint 34c (regla simple según usuario)
// -------------------------------------------------------------------------
// REGLAS (acordadas con la planta):
//
//   • Filtro del universo (período específico, p.ej. Junio 2026):
//       OTs cuya fecha de planificación cae en el mes
//       (planned_date EN el mes O fe_planif EN el mes)
//
//   • Positiva (cerrada — verde):
//       AND adicional: fue cerrada/notificada en ese mismo mes
//       (status contiene NOTI Y fecha_cierre cae en el mes)
//
//   • Negativa (abierta — rojo):
//       todo el resto del universo del filtro
//       (no cerrada todavía, o cerrada pero en otro mes — late/early)
//
//   • Modo "Todos los meses":
//       lógica original positions-based del Sprint 17 (preservada).
//       Iteramos POS, cuentamos si tiene OT cerrada (last_closed_wo) o
//       abierta (sap_open_wo). Funcionaba bien — no se toca.
// =========================================================================

import { useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { PERIODS, periodRange, periodLabel, parseLocalDate } from '@/lib/periodRange';

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

// "¿está esta fecha dentro de [start, end)?" — start/end son Date locales
function dateInRange(isoStr, start, end) {
  if (!isoStr || !start || !end) return false;
  const d = parseLocalDate(isoStr);
  if (!d) return false;
  return d >= start && d < end;
}

export default function ComplianceChart({ positions, period, setPeriod }) {
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
  // En modo 'all' usamos directamente las positions (lógica vieja Sprint 17).
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

      // Filtro del universo (Sprint 34f): SOLO fe_planif en el mes.
      // fe_planif (Fe.planif., IP24) es la PRÓXIMA (SAP) que el usuario ve
      // en el faro — refleja la planificación ACTUAL de SAP, no la histórica.
      // OTs sin fe_planif (IP24 aún no cruzó) quedan fuera del análisis
      // hasta que se sincronicen.
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
  const stats = useMemo(() => {
    // Modo 'all' — lógica vieja del Sprint 17 (preservada)
    if (isAll) {
      let closed = 0;
      let open   = 0;
      for (const p of positions) {
        if (p.last_closed_wo) closed++;
        if (p.sap_open_wo)    open++;
      }
      const total      = closed + open;
      const pctClosed  = total ? (closed / total) * 100 : 0;
      const pctOpen    = total ? (open   / total) * 100 : 0;
      const compliance = total ? Math.round(pctClosed) : null;
      return { closed, open, total, pctClosed, pctOpen, compliance };
    }

    // Período específico — OT-based con regla del usuario
    if (!otRows) {
      return { closed: 0, open: 0, total: 0, pctClosed: 0, pctOpen: 0, compliance: null };
    }

    const [start, end] = periodRange(period);

    // Sprint 34j — SOLO 1 OT por POS (la actual = latest wo_number).
    //   Para cada POS, escogemos la OT con el wo_number más alto (más
    //   reciente en SAP). Ignoramos las demás OTs del mismo POS aunque
    //   también tengan fe_planif en el mes. Esa "OT actual" es la que
    //   define si el POS cuenta positivo o negativo.
    const latestPerPos = new Map(); // pos_mtto -> OT
    for (const ot of otRows) {
      if (!ot.pos_mtto) continue;
      const cur = latestPerPos.get(ot.pos_mtto);
      if (!cur || Number(ot.wo_number) > Number(cur.wo_number)) {
        latestPerPos.set(ot.pos_mtto, ot);
      }
    }

    let closed = 0;
    let open   = 0;
    for (const ot of latestPerPos.values()) {
      // Positivo: NOTI en status Y fecha_cierre en el mes.
      const isPositive =
        isNotificada(ot.status) &&
        dateInRange(ot.fecha_cierre, start, end);
      if (isPositive) closed++;
      else            open++;
    }

    const total      = closed + open;
    const pctClosed  = total ? (closed / total) * 100 : 0;
    const pctOpen    = total ? (open   / total) * 100 : 0;
    const compliance = total ? Math.round(pctClosed) : null;
    return { closed, open, total, pctClosed, pctOpen, compliance };
  }, [otRows, period, positions, isAll]);

  return (
    <div className="bg-white rounded-xl border border-neutral-200 shadow-card mb-6">
      <div className="px-5 py-3 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-[12px] uppercase tracking-wider text-neutral-600 font-bold">
            Cumplimiento SAP
          </div>
          <div className="text-[10.5px] text-neutral-500 mt-0.5">
            {isAll
              ? 'Todas las POS — proporción de OTs cerradas vs abiertas'
              : `OTs planificadas para ${periodLabel(period)} · cerradas en el mes vs no`}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {stats.compliance != null && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand-passSoft/60 border border-brand-pass/30">
              <span className="text-[10px] uppercase tracking-wider font-bold text-brand-pass">Cumplimiento</span>
              <span className="text-[15px] font-extrabold text-brand-pass">{stats.compliance}%</span>
            </div>
          )}

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

      <div className="p-5 space-y-4">
        {loading && (
          <div className="flex items-center gap-2 text-[12px] text-brand-env">
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/>
              <path d="M22 12a10 10 0 0 1-10 10"/>
            </svg>
            Cargando OTs del período…
          </div>
        )}

        {err && (
          <div className="text-[12px] text-brand-fail bg-brand-failSoft border border-brand-fail/30 rounded-md px-3 py-2">
            Error cargando OTs: {err}
          </div>
        )}

        {!loading && !err && (
          <>
            <Bar
              label={isAll ? 'POS con cierre histórico' : 'POS cumplidas'}
              count={stats.closed}
              pct={stats.pctClosed}
              barClass="bg-brand-pass"
              textClass="text-brand-pass"
              dotClass="bg-brand-pass"
            />
            <Bar
              label={isAll ? 'POS con OT abierta' : 'POS incumplidas'}
              count={stats.open}
              pct={stats.pctOpen}
              barClass="bg-brand-warn"
              textClass="text-amber-700"
              dotClass="bg-brand-warn"
            />

            <div className="pt-3 border-t border-neutral-100 flex items-center justify-between text-[11.5px] text-neutral-500 flex-wrap gap-2">
              <span>
                Total POS con OT en el período:{' '}
                <strong className="text-neutral-800">{stats.total}</strong>
              </span>
              {stats.total === 0 && (
                <span className="italic text-neutral-400">Sin movimientos</span>
              )}
              <span className="text-[10.5px] text-neutral-400">
                {isAll
                  ? 'Modo agregado — todas las POS'
                  : 'Positiva = NOTI + fecha_cierre en el mes'}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Bar({ label, count, pct, barClass, textClass, dotClass }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 w-44 shrink-0">
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