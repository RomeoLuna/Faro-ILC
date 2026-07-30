'use client';
// components/tendencias/TendenciasClient.jsx
// =========================================================================
// TENDENCIAS POR SENSOR — Client Component (Sprint 47)
// -------------------------------------------------------------------------
// Layout:
//   Sidebar izquierda:
//     • Buscador
//     • Lista de POS con calibraciones (con badge de N eventos + última)
//   Panel derecho:
//     • Header POS con KPIs (última calibración, promedio de error, resultado)
//     • Selector de puntos (0/25/50/75/100 — checkbox por línea)
//     • Gráfico SVG con líneas históricas + banda de tolerancia
//     • Tabla resumen por evento
// =========================================================================

import { useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { maToFisico } from '@/lib/calibration';

const MESES_CORTOS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2,'0')} ${MESES_CORTOS[d.getMonth()]} ${d.getFullYear()}`;
}

function formatDateShort(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,'0')}${MESES_CORTOS[d.getMonth()][0].toLowerCase()}${MESES_CORTOS[d.getMonth()].slice(1,3).toLowerCase()}·${String(d.getFullYear()).slice(2)}`;
}

// Paleta consistente por punto nominal — verde subida, ámbar pico, azul bajada
const PCT_COLORS = {
  0:   '#059669',   // brand-pass (verde)
  25:  '#0D9488',   // brand-eng (teal)
  50:  '#2563EB',   // brand-env (azul)
  75:  '#7C3AED',   // brand-qual (púrpura)
  100: '#DC2626',   // brand-fail (rojo — pico)
};

function colorForPct(pct) {
  // Redondeamos a los canónicos más cercanos
  const canon = [0, 25, 33, 50, 66, 75, 100];
  const nearest = canon.reduce((a, b) =>
    Math.abs(b - pct) < Math.abs(a - pct) ? b : a
  );
  return PCT_COLORS[nearest] || '#525252';
}


// ═════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═════════════════════════════════════════════════════════════════════════
export default function TendenciasClient({ positions }) {
  const [query, setQuery]         = useState('');
  const [selectedId, setSelected] = useState(positions[0]?.id || null);

  // Filtrado por búsqueda
  const filtered = useMemo(() => {
    if (!query.trim()) return positions;
    const q = query.trim().toLowerCase();
    return positions.filter((p) =>
      String(p.pos_mtto).toLowerCase().includes(q)
      || (p.equipment_name || '').toLowerCase().includes(q)
      || (p.description    || '').toLowerCase().includes(q)
      || (p.area           || '').toLowerCase().includes(q)
      || (p.sub_area       || '').toLowerCase().includes(q)
    );
  }, [query, positions]);

  const selectedPos = positions.find((p) => p.id === selectedId) || null;

  if (positions.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-neutral-200 shadow-card p-8 text-center">
        <div className="text-[14px] font-bold text-neutral-700">Sin datos aún</div>
        <div className="text-[12.5px] text-neutral-500 mt-1">
          Cuando hagas calibraciones internas en la app, aparecerán acá para ver la tendencia.
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4">
      {/* Sidebar de POS */}
      <aside className="bg-white rounded-xl border border-neutral-200 shadow-card overflow-hidden flex flex-col max-h-[80vh]">
        <div className="p-3 border-b border-neutral-200 bg-neutral-50">
          <div className="flex items-center bg-white border border-neutral-300 rounded-lg px-3 py-1.5 gap-2 focus-within:ring-2 focus-within:ring-brand-amber/40 focus-within:border-brand-amber">
            <svg className="w-4 h-4 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar POS / equipo / área…"
              className="bg-transparent outline-none text-[12.5px] w-full"
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-neutral-400 hover:text-neutral-900 text-[14px] leading-none px-1">×</button>
            )}
          </div>
          <div className="mt-2 text-[10.5px] text-neutral-500">
            {filtered.length} de {positions.length} POS con calibraciones
          </div>
        </div>

        <div className="overflow-y-auto flex-1 divide-y divide-neutral-100">
          {filtered.map((p) => {
            const active = p.id === selectedId;
            return (
              <button
                key={p.id}
                onClick={() => setSelected(p.id)}
                className={`w-full text-left px-3 py-3 transition ${
                  active
                    ? 'bg-brand-eng/10 border-l-4 border-brand-eng'
                    : 'hover:bg-neutral-50 border-l-4 border-transparent'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-0.5">
                  <span className={`font-mono font-bold text-[12.5px] ${active ? 'text-brand-eng' : 'text-neutral-700'}`}>
                    {p.pos_mtto}
                  </span>
                  <span className="text-[9.5px] uppercase tracking-wider font-bold text-neutral-400">
                    {p.total_calibrations} evt
                  </span>
                </div>
                <div className="text-[11.5px] font-semibold text-neutral-800 line-clamp-1">
                  {p.equipment_name || '—'}
                </div>
                <div className="text-[10px] text-neutral-500 mt-0.5">
                  {p.area} · última {formatDate(p.ultima_calibracion)}
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="p-6 text-center text-[12px] italic text-neutral-400">
              Sin coincidencias
            </div>
          )}
        </div>
      </aside>

      {/* Panel principal */}
      <div>
        {selectedPos ? (
          <PosTendenciaPanel key={selectedPos.id} pos={selectedPos} />
        ) : (
          <div className="bg-white rounded-xl border border-neutral-200 shadow-card p-8 text-center text-neutral-500">
            Elegí una POS del panel izquierdo para ver su tendencia.
          </div>
        )}
      </div>
    </div>
  );
}


// ═════════════════════════════════════════════════════════════════════════
// PANEL DE TENDENCIA DE UNA POS
// ═════════════════════════════════════════════════════════════════════════
function PosTendenciaPanel({ pos }) {
  const [events, setEvents]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [visiblePcts, setVisPcts] = useState(null);   // Set<number> o null=todos
  // Sprint 47b: modo de visualización
  //   'error'   → deriva del error % (histórico como estaba)
  //   'lectura' → valores reales en la unidad del sensor
  const [viewMode, setViewMode] = useState('error');

  // Fetch de eventos + puntos al montarse (o al cambiar de POS por 'key')
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      const supabase = createSupabaseBrowserClient();
      const { data, error: err } = await supabase
        .from('calibration_events')
        .select(`
          id, performed_at, sensor_type, result, tolerance_pct,
          range_min, range_max, unit,
          points:calibration_points (
            point_index, pct, phase, nominal_ma, expected_value, reading_ma, reading_value, error_pct, result
          )
        `)
        .eq('position_id', pos.id)
        .eq('source', 'internal')
        .order('performed_at', { ascending: true });

      if (cancelled) return;
      if (err) {
        setError(err.message);
      } else {
        setEvents(data || []);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [pos.id]);

  // Puntos disponibles: pcts únicos redondeados
  const availablePcts = useMemo(() => {
    const set = new Set();
    for (const ev of events) {
      for (const p of ev.points || []) {
        if (p.error_pct != null) set.add(Math.round(Number(p.pct)));
      }
    }
    return [...set].sort((a, b) => a - b);
  }, [events]);

  // Estado inicial de visibilidad: todos visibles
  const activePcts = visiblePcts ?? new Set(availablePcts);

  function togglePct(pct) {
    const next = new Set(activePcts);
    if (next.has(pct)) next.delete(pct);
    else next.add(pct);
    setVisPcts(next);
  }
  function selectAll() { setVisPcts(new Set(availablePcts)); }
  function selectNone() { setVisPcts(new Set()); }

  // Series por pct para el gráfico
  // Sprint 47c: TODA lectura en unidad física. Si el técnico calibró en
  // modo mA, convertimos reading_ma → físico usando el rango del evento.
  const seriesByPct = useMemo(() => {
    const map = new Map();
    for (const pct of availablePcts) map.set(pct, []);
    for (const ev of events) {
      const rMin = ev.range_min != null ? Number(ev.range_min) : (pos.range_min != null ? Number(pos.range_min) : null);
      const rMax = ev.range_max != null ? Number(ev.range_max) : (pos.range_max != null ? Number(pos.range_max) : null);
      const canConvert = rMin != null && rMax != null && Number.isFinite(rMin) && Number.isFinite(rMax);

      for (const p of ev.points || []) {
        if (p.error_pct == null) continue;
        const rounded = Math.round(Number(p.pct));
        if (!map.has(rounded)) map.set(rounded, []);

        // Lectura física real:
        //   • Si viene reading_value (modo físico), la usamos tal cual
        //   • Si viene reading_ma (modo mA), la convertimos con maToFisico
        //   • Si no hay rango, cae al valor mA como último recurso
        let readingFisico = null;
        if (p.reading_value != null) {
          readingFisico = Number(p.reading_value);
        } else if (p.reading_ma != null && canConvert) {
          readingFisico = maToFisico(Number(p.reading_ma), rMin, rMax);
        } else if (p.reading_ma != null) {
          readingFisico = Number(p.reading_ma);   // fallback: mA crudos
        }

        // Valor esperado físico (para las líneas de referencia):
        let expectedFisico = null;
        if (p.expected_value != null) {
          expectedFisico = Number(p.expected_value);
        } else if (p.nominal_ma != null && canConvert) {
          expectedFisico = maToFisico(Number(p.nominal_ma), rMin, rMax);
        }

        map.get(rounded).push({
          date:      ev.performed_at,
          error:     Number(p.error_pct),
          reading:   readingFisico,
          expected:  expectedFisico,
          readingMa:      p.reading_ma    != null ? Number(p.reading_ma)    : null,
          nominalMa:      p.nominal_ma    != null ? Number(p.nominal_ma)    : null,
          unit:      ev.unit || pos.unit || '',
          result:    p.result,
          eventId:   ev.id,
        });
      }
    }
    return map;
  }, [events, availablePcts, pos.range_min, pos.range_max, pos.unit]);

  // Sprint 47c: unidad del eje Y — la sacamos del evento más reciente o de la POS
  const unitInfo = useMemo(() => {
    if (events.length === 0) return { unit: '', hasPhysical: false };
    const lastUnit = [...events].reverse().find((e) => e.unit)?.unit;
    return {
      unit: lastUnit || pos.unit || '',
      hasPhysical: true,   // ahora siempre convertimos a físico si hay rango
    };
  }, [events, pos.unit]);

  // KPIs del panel
  const kpis = useMemo(() => {
    if (events.length === 0) return null;
    const last = events[events.length - 1];
    const lastAvgErr = (last.points || [])
      .filter((p) => p.error_pct != null)
      .reduce((s, p, _, arr) => s + Math.abs(Number(p.error_pct)) / arr.length, 0);

    const allErrs = events.flatMap((ev) =>
      (ev.points || []).filter((p) => p.error_pct != null).map((p) => Math.abs(Number(p.error_pct)))
    );
    const globalAvg = allErrs.length ? allErrs.reduce((a, b) => a + b, 0) / allErrs.length : 0;

    const passCount = events.filter((e) => e.result === 'PASS').length;

    return {
      total: events.length,
      lastDate: last.performed_at,
      lastResult: last.result,
      lastAvgErr,
      globalAvg,
      passCount,
      complianceRate: events.length ? Math.round((passCount / events.length) * 100) : 0,
      tolerance: Number(last.tolerance_pct ?? pos.tolerance_pct ?? 0.5),
    };
  }, [events, pos.tolerance_pct]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-neutral-200 shadow-card p-8 text-center text-neutral-500 text-[13px]">
        Cargando eventos…
      </div>
    );
  }
  if (error) {
    return (
      <div className="bg-brand-failSoft border border-brand-fail/30 text-brand-fail rounded-xl px-5 py-3 text-[13px]">
        Error: {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header POS */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-card p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold mb-1">
              POS {pos.pos_mtto}
            </div>
            <div className="text-[18px] font-bold text-neutral-900">{pos.equipment_name || '—'}</div>
            {pos.description && (
              <div className="text-[12px] text-neutral-500 mt-0.5">{pos.description}</div>
            )}
            <div className="mt-2 flex items-center gap-2 flex-wrap text-[11px]">
              <span className="px-2 py-0.5 rounded-md bg-brand-engSoft text-brand-eng font-semibold">
                {pos.area || '—'}
              </span>
              {pos.sub_area && (
                <span className="text-neutral-500">{pos.sub_area}</span>
              )}
              {pos.sensor_type && (
                <span className="text-neutral-500">· {pos.sensor_type}</span>
              )}
            </div>
          </div>
        </div>

        {kpis && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <Kpi label="Calibraciones" value={kpis.total} tone="ink" foot={`Desde ${formatDate(pos.primera_calibracion)}`} />
            <Kpi label="Última calibración" value={formatDate(kpis.lastDate)} tone="eng" foot={`Error prom. ${kpis.lastAvgErr.toFixed(2)}%`} />
            <Kpi label="Error promedio global" value={`${kpis.globalAvg.toFixed(2)}%`} tone={kpis.globalAvg > kpis.tolerance ? 'fail' : 'pass'} foot={`Tolerancia ±${kpis.tolerance}%`} />
            <Kpi label="Cumplimiento" value={`${kpis.complianceRate}%`} tone={kpis.complianceRate >= 90 ? 'pass' : kpis.complianceRate >= 70 ? 'warn' : 'fail'} foot={`${kpis.passCount} de ${kpis.total} PASS`} />
          </div>
        )}
      </div>

      {events.length === 0 ? (
        <div className="bg-white rounded-xl border border-neutral-200 shadow-card p-8 text-center">
          <div className="text-[13.5px] italic text-neutral-500">
            Esta POS no tiene eventos internos aún.
          </div>
        </div>
      ) : (
        <>
          {/* Selector de puntos + gráfico */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-card">
            <div className="px-5 py-3 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="text-[12px] uppercase tracking-wider text-neutral-600 font-bold">
                  {viewMode === 'error'
                    ? 'Deriva histórica del error por punto'
                    : `Lectura física histórica${unitInfo.unit ? ` en ${unitInfo.unit}` : ''}`}
                </div>
                <div className="text-[10.5px] text-neutral-500 mt-0.5">
                  {viewMode === 'error'
                    ? `Banda ámbar = ±${kpis?.tolerance}% (tolerancia). Fuera de la banda = falla.`
                    : 'Lecturas reales en la unidad del sensor. Punteado tenue = valor esperado por punto.'}
                </div>
              </div>

              {/* Sprint 47b: toggle vista error / lectura */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="inline-flex rounded-lg border border-neutral-300 overflow-hidden text-[11px] font-bold">
                  <button
                    onClick={() => setViewMode('error')}
                    className={`px-3 py-1.5 transition ${
                      viewMode === 'error'
                        ? 'bg-brand-ink text-brand-amber'
                        : 'bg-white text-neutral-600 hover:bg-neutral-100'
                    }`}
                  >
                    Desviación
                  </button>
                  <button
                    onClick={() => setViewMode('lectura')}
                    className={`px-3 py-1.5 border-l border-neutral-300 transition ${
                      viewMode === 'lectura'
                        ? 'bg-brand-ink text-brand-amber'
                        : 'bg-white text-neutral-600 hover:bg-neutral-100'
                    }`}
                  >
                    Lectura física
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  <button onClick={selectAll}   className="text-[10.5px] px-2 py-1 rounded border border-neutral-300 hover:bg-neutral-100 font-semibold">Todos</button>
                  <button onClick={selectNone}  className="text-[10.5px] px-2 py-1 rounded border border-neutral-300 hover:bg-neutral-100 font-semibold">Ninguno</button>
                </div>
              </div>
            </div>

            <div className="p-4">
              {/* Toggles por pct */}
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                {availablePcts.map((pct) => {
                  const on = activePcts.has(pct);
                  const color = colorForPct(pct);
                  return (
                    <button
                      key={pct}
                      onClick={() => togglePct(pct)}
                      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10.5px] font-bold border transition ${
                        on
                          ? 'bg-white border-neutral-300 shadow-sm'
                          : 'bg-neutral-50 border-neutral-200 opacity-50 hover:opacity-100'
                      }`}
                    >
                      <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
                      {pct}%
                    </button>
                  );
                })}
              </div>

              {/* Gráfico SVG */}
              <TendenciaChart
                events={events}
                seriesByPct={seriesByPct}
                activePcts={activePcts}
                tolerance={kpis?.tolerance ?? 0.5}
                viewMode={viewMode}
                unitLabel={unitInfo.unit || 'unidad'}
              />
            </div>
          </div>

          {/* Tabla de eventos */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-card overflow-hidden">
            <div className="px-5 py-3 border-b border-neutral-200 bg-neutral-50">
              <div className="text-[12px] uppercase tracking-wider text-neutral-600 font-bold">
                Historial de calibraciones · {events.length} eventos
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead className="bg-neutral-50/60 border-b border-neutral-200 text-left">
                  <tr>
                    <th className="px-3 py-2 font-bold text-[10.5px] uppercase tracking-wider text-neutral-600">Fecha</th>
                    <th className="px-3 py-2 font-bold text-[10.5px] uppercase tracking-wider text-neutral-600">Sensor</th>
                    <th className="px-3 py-2 font-bold text-[10.5px] uppercase tracking-wider text-neutral-600 text-right">Error prom.</th>
                    <th className="px-3 py-2 font-bold text-[10.5px] uppercase tracking-wider text-neutral-600 text-right">Error máx.</th>
                    <th className="px-3 py-2 font-bold text-[10.5px] uppercase tracking-wider text-neutral-600 text-center">Resultado</th>
                    <th className="px-3 py-2 font-bold text-[10.5px] uppercase tracking-wider text-neutral-600 text-right">Puntos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {[...events].reverse().map((ev) => {
                    const errs = (ev.points || []).filter((p) => p.error_pct != null).map((p) => Math.abs(Number(p.error_pct)));
                    const prom = errs.length ? errs.reduce((a,b) => a+b, 0) / errs.length : 0;
                    const maxE = errs.length ? Math.max(...errs) : 0;
                    return (
                      <tr key={ev.id} className="hover:bg-neutral-50">
                        <td className="px-3 py-2.5 font-semibold text-neutral-800">{formatDate(ev.performed_at)}</td>
                        <td className="px-3 py-2.5 text-neutral-600">{ev.sensor_type || '—'}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{prom.toFixed(2)}%</td>
                        <td className={`px-3 py-2.5 text-right font-mono font-bold ${maxE > (ev.tolerance_pct ?? 0.5) ? 'text-brand-fail' : 'text-neutral-700'}`}>
                          {maxE.toFixed(2)}%
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <ResultBadge result={ev.result} />
                        </td>
                        <td className="px-3 py-2.5 text-right text-neutral-500">{(ev.points || []).length}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}


// ═════════════════════════════════════════════════════════════════════════
// GRÁFICO SVG DE TENDENCIA
// ═════════════════════════════════════════════════════════════════════════
function TendenciaChart({ events, seriesByPct, activePcts, tolerance, viewMode = 'error', unitLabel = 'mA' }) {
  const [hover, setHover] = useState(null); // { x, y, series[] }

  // Dimensiones
  const width  = 900;
  const height = 340;
  const margin = { top: 20, right: 20, bottom: 40, left: 65 };
  const iw = width  - margin.left - margin.right;
  const ih = height - margin.top  - margin.bottom;

  // Escalas X (compartido entre modos)
  const dates = events.map((e) => new Date(e.performed_at).getTime());
  const minT = Math.min(...dates);
  const maxT = Math.max(...dates);
  const spanT = Math.max(1, maxT - minT);

  // Sprint 47b: escala Y depende del modo
  //   'error'   → simétrica alrededor de 0, dominada por la tolerancia
  //   'lectura' → asimétrica, cubre todas las lecturas + expected values
  let yMin, yMax;
  if (viewMode === 'error') {
    const allErrors = [];
    for (const [pct, arr] of seriesByPct.entries()) {
      if (!activePcts.has(pct)) continue;
      for (const p of arr) allErrors.push(p.error);
    }
    const absTol = Math.max(tolerance * 1.5, 1);
    yMax = Math.max(absTol, ...allErrors.map((e) => Math.abs(e)));
    yMin = -yMax;
  } else {
    // lectura: usa reading + expected
    const allValues = [];
    for (const [pct, arr] of seriesByPct.entries()) {
      if (!activePcts.has(pct)) continue;
      for (const p of arr) {
        if (p.reading != null) allValues.push(p.reading);
        if (p.expected != null) allValues.push(p.expected);
      }
    }
    if (allValues.length === 0) {
      yMin = 0; yMax = 1;
    } else {
      const vMin = Math.min(...allValues);
      const vMax = Math.max(...allValues);
      const pad  = (vMax - vMin) * 0.08 || 0.1;
      yMin = vMin - pad;
      yMax = vMax + pad;
    }
  }

  const scaleX = (t) => margin.left + ((t - minT) / spanT) * iw;
  const scaleY = (v) => margin.top + (1 - (v - yMin) / (yMax - yMin)) * ih;

  // Ticks Y (5 líneas)
  const yTicks = [];
  if (viewMode === 'error') {
    const stepY = yMax / 2;
    for (let i = -2; i <= 2; i++) yTicks.push(i * stepY);
  } else {
    const stepY = (yMax - yMin) / 4;
    for (let i = 0; i <= 4; i++) yTicks.push(yMin + i * stepY);
  }

  // Sprint 47b: helper para acceder al valor a graficar según modo
  const yValue = (p) => viewMode === 'error' ? p.error : p.reading;

  // Ticks X (máximo 6 fechas)
  const xTickCount = Math.min(6, events.length);
  const xTicks = [];
  for (let i = 0; i < xTickCount; i++) {
    const idx = Math.floor((i / Math.max(1, xTickCount - 1)) * (events.length - 1));
    xTicks.push(dates[idx]);
  }

  function onMouseMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    if (px < margin.left || px > margin.left + iw) { setHover(null); return; }
    const t = minT + ((px - margin.left) / iw) * spanT;
    const bucket = [];
    for (const [pct, arr] of seriesByPct.entries()) {
      if (!activePcts.has(pct)) continue;
      let closest = null;
      let minDist = Infinity;
      for (const p of arr) {
        const dist = Math.abs(new Date(p.date).getTime() - t);
        if (dist < minDist) { minDist = dist; closest = p; }
      }
      if (closest) bucket.push({ pct, ...closest });
    }
    setHover({
      x: bucket[0] ? scaleX(new Date(bucket[0].date).getTime()) : px,
      series: bucket,
      date: bucket[0]?.date,
    });
  }

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto"
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHover(null)}
      >
        {/* Sprint 47b — Modo ERROR: banda de tolerancia + eje 0 */}
        {viewMode === 'error' && (
          <>
            <rect
              x={margin.left}
              y={scaleY(tolerance)}
              width={iw}
              height={scaleY(-tolerance) - scaleY(tolerance)}
              fill="#F59E0B"
              fillOpacity="0.10"
            />
            <line x1={margin.left} y1={scaleY(tolerance)}  x2={margin.left + iw} y2={scaleY(tolerance)}  stroke="#F59E0B" strokeDasharray="4 4" strokeWidth="1" />
            <line x1={margin.left} y1={scaleY(-tolerance)} x2={margin.left + iw} y2={scaleY(-tolerance)} stroke="#F59E0B" strokeDasharray="4 4" strokeWidth="1" />
            <line x1={margin.left} y1={scaleY(0)} x2={margin.left + iw} y2={scaleY(0)} stroke="#525252" strokeWidth="1" />
          </>
        )}

        {/* Sprint 47b — Modo LECTURA: líneas de expected values */}
        {viewMode === 'lectura' && [...seriesByPct.entries()].map(([pct, arr]) => {
          if (!activePcts.has(pct) || arr.length === 0) return null;
          const expected = arr.find((p) => p.expected != null)?.expected;
          if (expected == null) return null;
          const color = colorForPct(pct);
          return (
            <g key={`exp-${pct}`}>
              <line
                x1={margin.left} y1={scaleY(expected)}
                x2={margin.left + iw} y2={scaleY(expected)}
                stroke={color}
                strokeOpacity="0.30"
                strokeDasharray="3 5"
                strokeWidth="1"
              />
            </g>
          );
        })}

        {/* Grid Y + labels */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={margin.left} y1={scaleY(v)} x2={margin.left + iw} y2={scaleY(v)} stroke="#e5e5e5" strokeWidth="0.5" />
            <text
              x={margin.left - 8}
              y={scaleY(v)}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize="10"
              fill="#737373"
              fontFamily="ui-monospace, monospace"
            >
              {viewMode === 'error'
                ? `${v.toFixed(1)}%`
                : `${v.toFixed(2)}`}
            </text>
          </g>
        ))}

        {/* Sprint 47b: label del eje Y en modo lectura */}
        {viewMode === 'lectura' && (
          <text
            x={margin.left - 45}
            y={margin.top + ih / 2}
            transform={`rotate(-90 ${margin.left - 45} ${margin.top + ih / 2})`}
            textAnchor="middle"
            fontSize="10"
            fontWeight="bold"
            fill="#737373"
          >
            Lectura ({unitLabel})
          </text>
        )}

        {/* Ticks X + labels */}
        {xTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={scaleX(t)} y1={margin.top + ih}
              x2={scaleX(t)} y2={margin.top + ih + 4}
              stroke="#737373" strokeWidth="1"
            />
            <text
              x={scaleX(t)}
              y={margin.top + ih + 18}
              textAnchor="middle"
              fontSize="10"
              fill="#525252"
            >
              {formatDateShort(new Date(t).toISOString())}
            </text>
          </g>
        ))}

        {/* Series (líneas) — Sprint 47b: usa yValue(p) según viewMode */}
        {[...seriesByPct.entries()].map(([pct, arr]) => {
          if (!activePcts.has(pct)) return null;
          // Filtrar puntos con valor válido en el modo actual
          const valid = arr.filter((p) => yValue(p) != null);
          if (valid.length === 0) return null;
          const color = colorForPct(pct);
          const points = valid.map((p) =>
            `${scaleX(new Date(p.date).getTime())},${scaleY(yValue(p))}`
          ).join(' ');
          return (
            <g key={pct}>
              <polyline
                points={points}
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {valid.map((p, i) => (
                <circle
                  key={i}
                  cx={scaleX(new Date(p.date).getTime())}
                  cy={scaleY(yValue(p))}
                  r={3}
                  fill="white"
                  stroke={color}
                  strokeWidth="2"
                />
              ))}
            </g>
          );
        })}

        {/* Hover cursor */}
        {hover && (
          <line
            x1={hover.x} y1={margin.top}
            x2={hover.x} y2={margin.top + ih}
            stroke="#525252" strokeDasharray="3 3" strokeWidth="1"
          />
        )}
      </svg>

      {/* Tooltip */}
      {hover?.series?.length > 0 && (
        <div
          className="absolute bg-brand-ink text-white rounded-lg px-3 py-2 shadow-pop pointer-events-none text-[11px] font-mono min-w-[140px]"
          style={{
            left:  `${(hover.x / width) * 100}%`,
            top:   0,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="text-[10px] font-bold text-brand-amber uppercase mb-1">
            {formatDate(hover.date)}
          </div>
          {hover.series.map((s) => {
            const val = viewMode === 'error' ? s.error : s.reading;
            if (val == null) return null;
            return (
              <div key={s.pct} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: colorForPct(s.pct) }} />
                  {s.pct}%
                </span>
                {viewMode === 'error' ? (
                  <span className={val > 0 ? 'text-orange-300' : 'text-cyan-300'}>
                    {val > 0 ? '+' : ''}{val.toFixed(2)}%
                  </span>
                ) : (
                  <span className="text-brand-amber">
                    {val.toFixed(2)} {unitLabel}
                    {s.expected != null && (
                      <span className="text-neutral-400 ml-1.5 text-[10px]">
                        /esp {s.expected.toFixed(2)}
                      </span>
                    )}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


// ─── Sub-componentes ────────────────────────────────────────────────────
function Kpi({ label, value, foot, tone = 'ink' }) {
  const topMap = {
    ink:   'border-t-brand-ink',
    eng:   'border-t-brand-eng',
    pass:  'border-t-brand-pass',
    fail:  'border-t-brand-fail',
    warn:  'border-t-brand-warn',
  };
  const valMap = {
    ink:   'text-neutral-800',
    eng:   'text-brand-eng',
    pass:  'text-brand-pass',
    fail:  'text-brand-fail',
    warn:  'text-amber-700',
  };
  return (
    <div className={`bg-white rounded-lg border border-neutral-200 border-t-4 ${topMap[tone]} p-3`}>
      <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">{label}</div>
      <div className={`text-[18px] font-bold mt-1 ${valMap[tone]}`}>{value}</div>
      {foot && <div className="text-[10.5px] text-neutral-500 mt-0.5">{foot}</div>}
    </div>
  );
}

function ResultBadge({ result }) {
  const map = {
    PASS:        { label: 'PASS',   cls: 'bg-brand-passSoft text-brand-pass' },
    PASS_LIMITE: { label: 'LÍMITE', cls: 'bg-brand-warnSoft text-amber-700' },
    FAIL:        { label: 'FAIL',   cls: 'bg-brand-failSoft text-brand-fail' },
    PENDING:     { label: 'Pend.',  cls: 'bg-neutral-200 text-neutral-600' },
  };
  const m = map[result] || map.PENDING;
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[10.5px] font-bold ${m.cls}`}>
      {m.label}
    </span>
  );
}