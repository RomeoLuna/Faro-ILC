'use client';
// components/dashboard/SubAreaComplianceBars.jsx
// =========================================================================
// SUB-AREA COMPLIANCE BARS — Sprint 37 (reemplaza ComplianceChart)
// -------------------------------------------------------------------------
// Card con:
//   • Header: título + píldora "% cumplimiento sección" + selector de período
//   • Grid de barras verticales apiladas (una por sub-área/línea)
//     Cada barra: verde (VIGENTE + NUNCA_CALIBRADO) / ámbar (PROXIMO_7)
//                 / rojo (VENCIDO). % dentro del segmento si ≥ 8%.
//   • Separador visual
//   • 2 barras "consolidadas": Global Sección + Global Planta
//
// AGRUPACIÓN por sección:
//   envasado    → agrupa por `area_name` (Línea 1, Línea 2, Línea 4)
//   ingenieria  → agrupa por `area_name` (Elaboración, BTS, Caldera, …)
//   calidad     → agrupa por `sub_area`   (PLANTA CERVEZA, PATRONES)
//
// CRITERIO DE FILTRO:
//   period='all'   → todas las POS de la sección
//   period=otros   → POS cuyo next_sap_date cae en el período
//                    (mismo criterio que StatusDonut / TrendLine)
//
// GLOBAL PLANTA: fetch client-side al mount de todas las POS activas
//                (sin importar sección) para el snapshot cross-planta.
// =========================================================================

import { useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { PERIODS, periodRange, inRange, periodLabel } from '@/lib/periodRange';

// ─── Categorización de una POS por su status enum del view ──────────────
function bucketOf(status) {
  if (status === 'VENCIDO')                                return 'rojo';
  if (status === 'PROXIMO_7')                              return 'warn';
  if (status === 'VIGENTE' || status === 'NUNCA_CALIBRADO') return 'verde';
  return null;
}

// ─── Filtro por período (mismo criterio que StatusDonut) ────────────────
function keepByPeriod(p, period) {
  if (period === 'all') return true;
  const [start, end] = periodRange(period);
  return p.next_sap_date && inRange(p.next_sap_date, start, end);
}

// ─── Nombre del bucket a mostrar en el label debajo de la barra ─────────
function bucketKey(p, section) {
  if (section === 'calidad') return (p.sub_area || '—').trim();
  return (p.area_name || p.area || '—').trim();
}

// ─── Cuenta {verde, warn, rojo, total, pct*} para un conjunto de POS ────
function tallyStatus(rows) {
  let verde = 0, warn = 0, rojo = 0;
  for (const p of rows) {
    const b = bucketOf(p.status);
    if (b === 'verde') verde++;
    else if (b === 'warn') warn++;
    else if (b === 'rojo') rojo++;
  }
  const total = verde + warn + rojo;
  return {
    verde, warn, rojo, total,
    pctVerde: total ? (verde / total) * 100 : 0,
    pctWarn:  total ? (warn  / total) * 100 : 0,
    pctRojo:  total ? (rojo  / total) * 100 : 0,
  };
}

// ─── Componente principal ──────────────────────────────────────────────
export default function SubAreaComplianceBars({ positions, section, period, setPeriod }) {

  // Fetch client-side de TODAS las POS activas (para la barra "Global Planta")
  const [plantaAll, setPlantaAll] = useState([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase
        .from('maintenance_positions_view')
        .select('pos_mtto, area_name, area, sub_area, section, status, next_sap_date')
        .eq('active', true);
      if (!cancelled && data) setPlantaAll(data);
    })();
    return () => { cancelled = true; };
  }, []);

  // Filtrar por período (mismo criterio para las 3 vistas: sub-área, sección, planta)
  const subsetSection = useMemo(
    () => positions.filter((p) => keepByPeriod(p, period)),
    [positions, period]
  );

  const subsetPlanta = useMemo(
    () => plantaAll.filter((p) => keepByPeriod(p, period)),
    [plantaAll, period]
  );

  // Agrupar por sub-área/línea y calcular tally para cada grupo
  const grupos = useMemo(() => {
    const buckets = new Map();
    for (const p of subsetSection) {
      const key = bucketKey(p, section);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(p);
    }
    // Ordenar alfabéticamente para consistencia visual
    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, rows]) => ({ key, ...tallyStatus(rows) }));
  }, [subsetSection, section]);

  const consolidadoSeccion = useMemo(() => tallyStatus(subsetSection), [subsetSection]);
  const consolidadoPlanta  = useMemo(() => tallyStatus(subsetPlanta),  [subsetPlanta]);

  // % cumplimiento de la sección para el header pill
  const cumplimientoSeccion = consolidadoSeccion.total
    ? Math.round(consolidadoSeccion.pctVerde)
    : null;

  return (
    <div className="bg-white rounded-xl border border-neutral-200 shadow-card mb-6">
      {/* ─── Header ─────────────────────────────────────────────────── */}
      <div className="px-5 py-3 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-[12px] uppercase tracking-wider text-neutral-600 font-bold">
            % de Instrumentación Calibrada
          </div>
          <div className="text-[10.5px] text-neutral-500 mt-0.5">
            Distribución por {section === 'calidad' ? 'sub-área' : 'área'} · {periodLabel(period)} · sincronizado con la tabla
          </div>
        </div>

        <div className="flex items-center gap-3">
          {cumplimientoSeccion != null && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand-passSoft/60 border border-brand-pass/30">
              <span className="text-[10px] uppercase tracking-wider font-bold text-brand-pass">Cumplimiento</span>
              <span className="text-[15px] font-extrabold text-brand-pass">{cumplimientoSeccion}%</span>
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

      {/* ─── Cuerpo ─────────────────────────────────────────────────── */}
      <div className="p-5">
        {consolidadoSeccion.total === 0 ? (
          <div className="text-center text-[13px] italic text-neutral-400 py-8">
            Sin POS en este período
          </div>
        ) : (
          <div className="flex items-stretch gap-4 overflow-x-auto pb-2">
            {/* Barras por sub-área */}
            {grupos.map((g) => (
              <StackedBar key={g.key} label={g.key} tally={g} />
            ))}

            {/* Separador visual */}
            {grupos.length > 0 && (
              <div className="border-l-2 border-dashed border-neutral-200 mx-2" />
            )}

            {/* Barra consolidada: Global Sección */}
            <StackedBar
              label={`Total ${sectionShortLabel(section)}`}
              tally={consolidadoSeccion}
              highlight="section"
            />

            {/* Barra consolidada: Global Planta */}
            <StackedBar
              label="Total Planta"
              tally={consolidadoPlanta}
              highlight="planta"
              loading={plantaAll.length === 0}
            />
          </div>
        )}

        {/* Leyenda inferior */}
        <div className="mt-5 pt-3 border-t border-neutral-100 flex items-center gap-5 flex-wrap text-[11.5px]">
          <LegendDot color="bg-brand-pass" label="Vigentes" />
          <LegendDot color="bg-brand-warn" label="Próximas a vencer (30d)" />
          <LegendDot color="bg-brand-fail" label="Vencidas" />
          <span className="text-neutral-400 ml-auto text-[10.5px]">
            El selector de período filtra también la tabla de abajo.
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-componentes ──────────────────────────────────────────────────
function StackedBar({ label, tally, highlight = null, loading = false }) {
  const { verde, warn, rojo, total, pctVerde, pctWarn, pctRojo } = tally;

  // Toque estético: los consolidados llevan un halo/tinte de fondo
  const cardCls =
    highlight === 'section' ? 'bg-brand-amberSoft/40 border-brand-amber/30' :
    highlight === 'planta'  ? 'bg-neutral-100 border-neutral-300' :
    'bg-white border-neutral-200';

  const numberCls =
    highlight === 'section' ? 'text-brand-ink' :
    highlight === 'planta'  ? 'text-brand-ink' :
    'text-neutral-800';

  return (
    <div className={`flex flex-col items-center gap-2 min-w-[92px] rounded-lg border ${cardCls} p-2.5`}>
      {/* Barra vertical apilada */}
      <div className="relative w-11 h-52 rounded-md overflow-hidden bg-neutral-100 border border-neutral-200 flex flex-col justify-end">
        {total === 0 && !loading && (
          <div className="absolute inset-0 grid place-items-center text-[9.5px] italic text-neutral-400">
            sin POS
          </div>
        )}
        {loading && (
          <div className="absolute inset-0 grid place-items-center text-[9.5px] italic text-neutral-400">
            …
          </div>
        )}

        {/* Rojo (VENCIDO) — abajo */}
        {rojo > 0 && (
          <div
            className="w-full bg-brand-fail transition-all duration-500 flex items-center justify-center"
            style={{ height: `${pctRojo}%` }}
            title={`Vencidas: ${rojo} (${pctRojo.toFixed(1)}%)`}
          >
            {pctRojo >= 8 && (
              <span className="text-[9.5px] font-bold text-white leading-none">
                {pctRojo.toFixed(0)}%
              </span>
            )}
          </div>
        )}

        {/* Ámbar (PROXIMO_7) — en medio */}
        {warn > 0 && (
          <div
            className="w-full bg-brand-warn transition-all duration-500 flex items-center justify-center"
            style={{ height: `${pctWarn}%` }}
            title={`Próximas a vencer: ${warn} (${pctWarn.toFixed(1)}%)`}
          >
            {pctWarn >= 8 && (
              <span className="text-[9.5px] font-bold text-white leading-none">
                {pctWarn.toFixed(0)}%
              </span>
            )}
          </div>
        )}

        {/* Verde (VIGENTE + NUNCA_CALIBRADO) — arriba */}
        {verde > 0 && (
          <div
            className="w-full bg-brand-pass transition-all duration-500 flex items-center justify-center relative"
            style={{ height: `${pctVerde}%` }}
            title={`Vigentes: ${verde} (${pctVerde.toFixed(1)}%)`}
          >
            {pctVerde >= 12 && (
              <span className="text-[11px] font-extrabold text-white leading-none">
                {pctVerde.toFixed(1)}%
              </span>
            )}
          </div>
        )}
      </div>

      {/* Label + total */}
      <div className="text-center max-w-[110px]">
        <div className={`text-[11px] font-bold leading-tight uppercase tracking-wide ${numberCls} truncate`} title={label}>
          {label}
        </div>
        <div className="text-[10px] text-neutral-500 mt-0.5">
          {total} POS
        </div>
      </div>
    </div>
  );
}

function LegendDot({ color, label }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-2.5 h-2.5 rounded-full ${color}`}></span>
      <span className="text-neutral-700 font-semibold">{label}</span>
    </div>
  );
}

function sectionShortLabel(section) {
  return { envasado: 'Envasado', ingenieria: 'Ingeniería', calidad: 'Calidad' }[section] || 'Sección';
}