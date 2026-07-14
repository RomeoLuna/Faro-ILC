'use client';
// components/cronograma/CronogramaDashboard.jsx
// =========================================================================
// CRONOGRAMA DASHBOARD — Sprint 23 (modo histórico vs en vivo)
// -------------------------------------------------------------------------
// Modo EN VIVO  (isHistorical=false):
//   • KPIs computados desde rows con computeKpis()
//   • Buckets: cumplidas / en progreso / vencidas (3 colores)
//
// Modo HISTÓRICO (isHistorical=true):
//   • KPIs vienen de historicalKpis (fila de ot_kpi_history del tab activo)
//   • Buckets: solo dos posibles — verdes (VERDE) y rojos (ROJO).
//     "En progreso" no existe en el snapshot porque ya cerró el mes.
// =========================================================================

import { useMemo, useState } from 'react';
import { computeKpis, partitionForDashboard, formatDate, parseLocalDate } from '@/lib/cronograma';

const MES_LARGO = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function formatMonthLabel(yearMonth) {
  if (yearMonth === 'current' || !yearMonth) {
    const t = new Date();
    return `${MES_LARGO[t.getMonth()]} ${t.getFullYear()}`;
  }
  const [y, m] = yearMonth.split('-').map(Number);
  return `${MES_LARGO[m - 1]} ${y}`;
}

export default function CronogramaDashboard({ rows, isHistorical, historicalKpis, selectedMonth }) {
  const today = new Date();
  const monthLabel = formatMonthLabel(isHistorical ? selectedMonth : 'current');

  // Sprint 44: toggle backlog on/off (solo aplica en modo live).
  //   true  → incluye OTs arrastradas de meses anteriores sin notificar
  //   false → solo OTs cuyo scheduled_date cae en el mes evaluado
  const [includeBacklog, setIncludeBacklog] = useState(true);

  // Filtrar backlog si el usuario lo desactivó
  const displayRows = useMemo(() => {
    if (isHistorical || includeBacklog) return rows;
    // Modo live sin backlog: solo OTs con scheduled_date >= inicio del mes
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    return rows.filter((r) => {
      const d = parseLocalDate(r.scheduled_date);
      return d && d >= monthStart;
    });
  }, [rows, includeBacklog, isHistorical]);

  // ── KPIs: live computados, histórico viene pre-calculado ─────────────
  const kpis = useMemo(() => {
    if (isHistorical) {
      const k = historicalKpis;
      if (!k) {
        return {
          planificadas: 0, ejecutadas: 0, vencidas: 0, compliance: null,
          cumplidas: 0, enProgreso: 0,
        };
      }
      return {
        planificadas: k.total_planificadas,
        ejecutadas:   k.total_ejecutadas,
        vencidas:     k.total_vencidas,
        compliance:   k.porcentaje_cumplimiento != null ? Math.round(Number(k.porcentaje_cumplimiento)) : null,
        cumplidas:    k.total_ejecutadas,
        enProgreso:   0,
      };
    }
    return computeKpis(displayRows, today);
  }, [isHistorical, historicalKpis, displayRows]);

  // ── Particiones para los buckets ──────────────────────────────────────
  const parts = useMemo(() => {
    if (isHistorical) {
      const cumplidas = rows.filter((r) => r.estado_al_cierre_del_mes === 'VERDE');
      const vencidas  = rows.filter((r) => r.estado_al_cierre_del_mes === 'ROJO');
      return { cumplidas, enProgreso: [], vencidas };
    }
    return partitionForDashboard(displayRows, today);
  }, [isHistorical, displayRows, rows]);

  return (
    <div className="bg-white rounded-xl border border-neutral-200 shadow-card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-[12px] uppercase tracking-wider text-neutral-600 font-bold">
            {isHistorical ? 'Cumplimiento histórico' : 'Cumplimiento del mes'}
          </div>
          <div className="text-[10.5px] text-neutral-500 mt-0.5">
            {isHistorical
              ? `Snapshot congelado de ${monthLabel} — datos auditables, no editables.`
              : includeBacklog
                ? `Evalúa OTs planificadas para ${monthLabel} + arrastradas sin notificar.`
                : `Evalúa solo OTs planificadas para ${monthLabel}.`}
          </div>

          {/* Sprint 44: Toggle backlog (solo en modo live) */}
          {!isHistorical && (
            <div className="mt-2 inline-flex items-center rounded-lg border border-neutral-300 bg-white overflow-hidden text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => setIncludeBacklog(false)}
                className={`px-3 py-1.5 transition ${
                  !includeBacklog
                    ? 'bg-brand-ink text-brand-amber'
                    : 'text-neutral-600 hover:bg-neutral-50'
                }`}
              >
                Solo del mes
              </button>
              <button
                type="button"
                onClick={() => setIncludeBacklog(true)}
                className={`px-3 py-1.5 transition border-l border-neutral-300 ${
                  includeBacklog
                    ? 'bg-brand-ink text-brand-amber'
                    : 'text-neutral-600 hover:bg-neutral-50'
                }`}
              >
                Mes + backlog
              </button>
            </div>
          )}
        </div>

        {kpis.compliance != null && (
          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${
            isHistorical
              ? 'bg-brand-envSoft/60 border-brand-env/30'
              : 'bg-brand-passSoft/60 border-brand-pass/30'
          }`}>
            <span className={`text-[10px] uppercase tracking-wider font-bold ${
              isHistorical ? 'text-brand-env' : 'text-brand-pass'
            }`}>
              Cumplimiento {isHistorical ? '(final)' : ''}
            </span>
            <span className={`text-2xl font-extrabold ${
              isHistorical ? 'text-brand-env' : 'text-brand-pass'
            }`}>
              {kpis.compliance}%
            </span>
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-5 border-b border-neutral-100">
        <Kpi
          label="Planificadas"
          value={kpis.planificadas}
          tone="ink"
          foot={isHistorical ? 'Total del snapshot' : 'Programadas + arrastradas sin notificar'}
        />
        <Kpi
          label="Ejecutadas"
          value={kpis.ejecutadas}
          tone="pass"
          foot={isHistorical ? 'Cerradas dentro del mes' : 'Tienen fecha de notificación SAP'}
        />
        <Kpi
          label={isHistorical ? 'Incumplidas' : 'Vencidas'}
          value={kpis.vencidas}
          tone="fail"
          foot={kpis.vencidas > 0
            ? (isHistorical ? 'No se notificaron a tiempo' : 'Requieren acción inmediata')
            : 'Sin desviaciones'}
        />
      </div>

      {/* Matriz */}
      <div className={`grid grid-cols-1 ${isHistorical ? 'lg:grid-cols-2' : 'lg:grid-cols-3'} gap-4 p-5`}>
        <Bucket
          title="Cumplidas"
          tone="pass"
          rows={parts.cumplidas}
          emptyMsg="Aún no hay cumplimientos."
          isHistorical={isHistorical}
        />
        {!isHistorical && (
          <Bucket
            title="En progreso"
            tone="warn"
            rows={parts.enProgreso}
            emptyMsg="Nada en progreso ahora."
            isHistorical={false}
          />
        )}
        <Bucket
          title={isHistorical ? 'Incumplidas' : 'Vencidas / Incumplidas'}
          tone="fail"
          rows={parts.vencidas}
          showComments
          emptyMsg="Sin desviaciones — todo al día."
          isHistorical={isHistorical}
        />
      </div>
    </div>
  );
}

function Kpi({ label, value, foot, tone }) {
  const top = {
    ink:  'border-t-brand-ink',
    pass: 'border-t-brand-pass',
    fail: 'border-t-brand-fail',
    warn: 'border-t-brand-warn',
  }[tone] || 'border-t-neutral-300';
  const txt = {
    pass: 'text-brand-pass',
    fail: 'text-brand-fail',
    warn: 'text-amber-700',
  }[tone] || '';

  return (
    <div className={`bg-white rounded-xl border border-neutral-200 border-t-4 ${top} p-4 shadow-card`}>
      <div className="text-[11px] uppercase tracking-wide text-neutral-500 font-semibold">{label}</div>
      <div className={`text-3xl font-bold mt-1 ${txt}`}>{value}</div>
      {foot && <div className="text-[11.5px] text-neutral-500 mt-1">{foot}</div>}
    </div>
  );
}

function Bucket({ title, tone, rows, emptyMsg, showComments = false, isHistorical = false }) {
  const headerCls = {
    pass: 'bg-brand-passSoft/50 text-brand-pass border-brand-pass/20',
    warn: 'bg-brand-warnSoft/50 text-amber-700 border-brand-warn/20',
    fail: 'bg-brand-failSoft/50 text-brand-fail border-brand-fail/20',
  }[tone] || 'bg-neutral-100 text-neutral-700 border-neutral-200';
  const dotCls = {
    pass: 'bg-brand-pass',
    warn: 'bg-brand-warn',
    fail: 'bg-brand-fail',
  }[tone] || 'bg-neutral-400';

  return (
    <div className="border border-neutral-200 rounded-xl overflow-hidden">
      <div className={`px-3 py-2.5 border-b ${headerCls} flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${dotCls}`} />
          <span className="text-[12px] font-bold uppercase tracking-wider">{title}</span>
        </div>
        <span className="text-[12px] font-mono font-bold">{rows.length}</span>
      </div>

      <div className="divide-y divide-neutral-100 max-h-[280px] overflow-y-auto">
        {rows.length === 0 ? (
          <div className="px-3 py-6 text-center text-[12px] italic text-neutral-400">{emptyMsg}</div>
        ) : (
          rows.slice(0, 8).map((r) => (
            <div key={r.wo_number} className="px-3 py-2 text-[11.5px]">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-bold text-brand-ink">OT {r.wo_number}</span>
                <span className="text-neutral-500 text-[10.5px]">
                  {formatDate(r.scheduled_date) || 'sin fecha'}
                </span>
              </div>
              <div className="truncate text-neutral-700 mt-0.5" title={r.equipment_name}>
                {r.equipment_name || r.short_text || '—'}
              </div>
              {showComments && (isHistorical ? r.comentario_historico : r.comments) && (
                <div className="text-[10.5px] text-brand-fail italic mt-1 line-clamp-2"
                     title={isHistorical ? r.comentario_historico : r.comments}>
                  «{isHistorical ? r.comentario_historico : r.comments}»
                </div>
              )}
            </div>
          ))
        )}

        {rows.length > 8 && (
          <div className="px-3 py-2 text-center text-[10.5px] text-neutral-400 italic">
            +{rows.length - 8} más
          </div>
        )}
      </div>
    </div>
  );
}