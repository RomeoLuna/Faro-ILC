'use client';
// components/faro/PositionsTableClient.jsx
// =========================================================================
// POSITIONS TABLE CLIENT — Sprint 18 (override de frecuencia técnica NOTI)
// -------------------------------------------------------------------------
// Mantiene la estructura Sprint 17 intacta:
//   • 10 columnas (POS, Equipo, Área/Sub-área, Frec, Inicio Ext., Cierre,
//     NOTI, Próxima SAP, Estado, Acciones).
//   • Filtros en cascada Área → Sub-área.
//   • SapDateCell genérico para las 4 columnas de fechas SAP.
//
// CAMBIO Sprint 18 — única regla de negocio añadida:
//   Si han pasado más meses desde `last_noti_date` que los permitidos por
//   `frequency_months`, la POS se considera VENCIDA por antigüedad técnica,
//   independientemente del status SAP. Se aplica ANTES de:
//     • renderizar el StatusBadge (cambia label a "Vencido (frecuencia)")
//     • renderizar el icono ⚠️ en la celda Última (Inicio Ext.)
//     • emitir `filtered` al padre (KPIs, Donut, Trend, Compliance)
// =========================================================================

import { useEffect, useMemo, useState } from 'react';
import RowActions from './RowActions';

// ─── Constantes ─────────────────────────────────────────────────────────
const MESES_ABR = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const STATUS_OPTIONS = [
  { value: 'VIGENTE',         label: 'Vigente' },
  { value: 'PROXIMO_7',       label: 'Próximo a vencer' },
  { value: 'VENCIDO',         label: 'Vencido (backlog SAP)' },
  { value: 'NUNCA_CALIBRADO', label: 'Vigente' },
];

const STATUS_RANK = {
  VENCIDO:         1,
  PROXIMO_7:       2,
  VIGENTE:         3,
  NUNCA_CALIBRADO: 4,
};

// ─── Parser de fecha local ──────────────────────────────────────────────
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

function formatDate(iso) {
  const d = parseLocalDate(iso);
  if (!d) return null;
  const day = d.getDate().toString().padStart(2, '0');
  const mon = MESES_ABR[d.getMonth()];
  const yr  = d.getFullYear();
  return `${day} ${mon} ${yr}`;
}

function primaryStatusToken(status) {
  if (!status) return null;
  // Sprint 39: robusto a syncs que perdieron los espacios (bug de cleanText).
  // Los status de SAP siempre empiezan con un token de 4 caracteres
  // (CTEC, NOTI, ABIE, LIB., CERR, ZONA, etc.). Cortamos a 4 chars siempre.
  return status.trim().slice(0, 4).replace(/\.$/, '');
}

// ─── Validación de frecuencia técnica (Sprint 18) ───────────────────────
// Compara la ÚLTIMA NOTIFICACIÓN EFECTIVA (last_noti_date, status %NOTI%)
// contra la frecuencia permitida (frequency_months).
//
// Regla: si hoy > last_noti_date + frequency_months, la POS está VENCIDA
// por antigüedad técnica, aunque SAP muestre la OT como CTEC.
function isFreqOverdue(lastNotiDate, frequencyMonths) {
  if (!lastNotiDate || !frequencyMonths) return false;
  const last = parseLocalDate(lastNotiDate);
  if (!last) return false;
  const due = new Date(last);
  due.setMonth(due.getMonth() + Number(frequencyMonths));
  return Date.now() > due.getTime();
}

// Status efectivo del faro:
//   - Si isFreqOverdue(last_noti_date, frequency_months) → 'VENCIDO' (override
//     duro sobre el status SAP-driven, aunque la OT esté en CTEC).
//   - En cualquier otro caso respetamos el status SAP-driven que viene
//     de la vista maintenance_positions_view.
function effectiveStatus(p) {
  if (isFreqOverdue(p.last_noti_date, p.frequency_months)) return 'VENCIDO';
  return p.status;
}

function statusBadgeProps(status, daysRemaining, lastSapDateExtrema, freqOverdue) {
  // Sprint 18: cuando el VENCIDO viene del override por frecuencia técnica
  // (no del backlog SAP), distinguimos el label para que el usuario sepa
  // que la causa es la antigüedad de la última NOTI, no una OT abierta atrasada.
  if (status === 'VENCIDO' && freqOverdue) {
    return {
      cls:   'bg-brand-failSoft text-brand-fail',
      dot:   'bg-brand-fail',
      label: 'Vencido (frecuencia)',
      hint:  'Última NOTI supera la frecuencia técnica',
    };
  }

  switch (status) {
    case 'VIGENTE':
      return {
        cls:   'bg-brand-passSoft text-brand-pass',
        dot:   'bg-brand-pass',
        label: 'Vigente',
        hint:  daysRemaining != null ? `Vence en ${daysRemaining} d` : null,
      };
    case 'PROXIMO_7':
      return {
        cls:   'bg-brand-warnSoft text-amber-700',
        dot:   'bg-brand-warn',
        label: 'Próximo a vencer',
        hint:  daysRemaining != null ? `Vence en ${daysRemaining} d` : null,
      };
    case 'VENCIDO':
      return {
        cls:   'bg-brand-failSoft text-brand-fail',
        dot:   'bg-brand-fail',
        label: 'Vencido',
        hint:  daysRemaining != null ? `Atraso ${Math.abs(daysRemaining)} d` : null,
      };
    case 'NUNCA_CALIBRADO':
  // Sprint 41: cuando no hay OT abierta, la POS ya está al día. Mostrarla
  // como Vigente igual que VIGENTE — la columna PRÓXIMA (SAP) es la que
  // indica si hay OT abierta o liberada.
      return {
        cls:   'bg-brand-passSoft text-brand-pass',
        dot:   'bg-brand-pass',
        label: 'Vigente',
        hint:  lastSapDateExtrema ? `Última ext. ${formatDate(lastSapDateExtrema)}` : null,
       };
    default:
      return {
        cls:   'bg-neutral-200 text-neutral-600',
        dot:   'bg-neutral-500',
        label: 'Pendiente',
        hint:  null,
      };
  }
}

function matchesQuery(position, q) {
  if (!q) return true;
  const haystack = [
    position.pos_mtto,
    position.equipment_name,
    position.description,
    position.sap_open_wo,
    position.last_closed_wo,
    position.last_noti_wo,
    position.area,
    position.sub_area,
  ]
    .filter(Boolean)
    .map((s) => s.toString().toLowerCase())
    .join('   ');
  return haystack.includes(q);
}

function sortValue(position, key) {
  if (key === 'area')          return ((position.area || '') + (position.sub_area || '')).toLowerCase();
  if (key === 'status')        return STATUS_RANK[position.status] ?? 99;
  if (key === 'next_sap_date') return position.next_sap_date || null;
  return null;
}

// =========================================================================
// SUB-COMPONENTES
// =========================================================================

function SortHeader({ label, sortKey, current, onClick, align = 'left' }) {
  const active = current.key === sortKey;
  const alignCls = align === 'right' ? 'justify-end ml-auto' : '';

  return (
    <button
      type="button"
      onClick={() => onClick(sortKey)}
      title={active
        ? `Ordenado ${current.dir === 'asc' ? 'ascendente' : 'descendente'} · click para cambiar`
        : `Ordenar por ${label}`}
      className={`group inline-flex items-center gap-1 font-bold text-[10.5px] uppercase tracking-wider transition select-none ${alignCls} ${
        active ? 'text-brand-amber' : 'text-neutral-700 hover:text-neutral-900'
      }`}
    >
      <span>{label}</span>
      <span className={`inline-block w-3 text-center text-[11px] leading-none ${
        active ? 'opacity-100' : 'opacity-30 group-hover:opacity-60'
      }`}>
        {active && current.dir === 'asc'  && '↑'}
        {active && current.dir === 'desc' && '↓'}
        {!active && '↕'}
      </span>
    </button>
  );
}

function StatusBadge({ status, daysRemaining, lastSapDateExtrema, freqOverdue }) {
  const badge = statusBadgeProps(status, daysRemaining, lastSapDateExtrema, freqOverdue);

  return (
    <div className="flex flex-col gap-1 w-fit">
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold w-fit ${badge.cls}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`}></span>
        {badge.label}
      </span>
      {badge.hint && (
        <span className="text-[10.5px] text-neutral-500 italic px-1">{badge.hint}</span>
      )}
    </div>
  );
}

function SapDateCell({ dateIso, woNumber, sapStatus, isFutureAlert = false, freqOverdue = false }) {
  if (!dateIso && !woNumber) return <span className="text-neutral-400">—</span>;

  const code = primaryStatusToken(sapStatus);
  const dateStr = formatDate(dateIso);

  return (
    <div className="flex flex-col gap-0.5 min-w-[110px]">
      <div className="inline-flex items-center gap-1">
        <span className={`font-semibold ${isFutureAlert || freqOverdue ? 'text-brand-fail' : 'text-neutral-800'}`}>
          {dateStr || <span className="text-neutral-400 font-normal">—</span>}
        </span>
        {freqOverdue && (
          <span
            title="Vencido por frecuencia técnica: hoy > (last_noti_date + frequency_months)"
            className="text-brand-fail inline-flex"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9"  x2="12"    y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </span>
        )}
      </div>
      {woNumber && (
        <div className="flex items-center gap-1.5 font-mono text-[10px] leading-tight mt-0.5">
          <span className="text-neutral-500">OT {woNumber}</span>
          {code && (
            <span title={sapStatus} className="px-1.5 py-[1px] rounded bg-brand-ink text-brand-amber font-bold tracking-wider">
              {code}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// =========================================================================
// COMPONENTE PRINCIPAL
// =========================================================================
export default function PositionsTableClient({ positions, section, onFilteredChange }) {
  const [query, setQuery]                 = useState('');
  const [areaFilter, setAreaFilter]       = useState('');
  const [subAreaFilter, setSubAreaFilter] = useState('');
  const [statusFilter, setStatusFilter]   = useState('');
  const [sort, setSort]                   = useState({ key: null, dir: 'asc' });

  // ── Enriched: aplica el override de frecuencia técnica antes que nada ──
  // Cada fila gana:
  //   _freqOverdue : boolean   ¿se disparó la regla last_noti_date + freq?
  //   status       : reemplazado por effectiveStatus(p) para que todos los
  //                  consumidores aguas abajo (filtros, sort, KPIs,
  //                  ComplianceChart, StatusDonutChart, TrendLineChart)
  //                  vean exactamente el mismo veredicto.
  const enriched = useMemo(
    () => positions.map((p) => ({
      ...p,
      _freqOverdue: isFreqOverdue(p.last_noti_date, p.frequency_months),
      status:       effectiveStatus(p),
    })),
    [positions]
  );

  // ── Áreas únicas (CENSO v3) para el dropdown ─────────────────────────
  const areas = useMemo(() => {
    const set = new Set();
    for (const p of enriched) {
      if (p.area) set.add(p.area);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
  }, [enriched]);

  // ── Sub-áreas únicas (depende del Área seleccionada) ─────────────────
  const subAreas = useMemo(() => {
    const set = new Set();
    for (const p of enriched) {
      if (areaFilter && p.area !== areaFilter) continue;
      if (p.sub_area) set.add(p.sub_area);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
  }, [enriched, areaFilter]);

  // ── Subset filtrado (search + área + sub-área + estado) ──────────────
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = enriched;
    if (q)             rows = rows.filter((p) => matchesQuery(p, q));
    if (areaFilter)    rows = rows.filter((p) => p.area === areaFilter);
    if (subAreaFilter) rows = rows.filter((p) => p.sub_area === subAreaFilter);
    if (statusFilter)  rows = rows.filter((p) => p.status === statusFilter);
    return rows;
  }, [enriched, query, areaFilter, subAreaFilter, statusFilter]);

  // ── Notificar al padre cuando cambia el subset filtrado ──────────────
  useEffect(() => {
    if (onFilteredChange) onFilteredChange(filtered);
  }, [filtered, onFilteredChange]);

  // ── Filtered + sort, para render ─────────────────────────────────────
  const processed = useMemo(() => {
    if (!sort.key) return filtered;
    return [...filtered].sort((a, b) => {
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sort]);

  // ── Toggle de sort en 3 fases ────────────────────────────────────────
  function toggleSort(key) {
    setSort((prev) => {
      if (prev.key !== key)   return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return { key: null, dir: 'asc' };
    });
  }

  // ── Limpieza global de filtros ───────────────────────────────────────
  const hasFilters = !!(query || areaFilter || subAreaFilter || statusFilter || sort.key);
  function clearAll() {
    setQuery('');
    setAreaFilter('');
    setSubAreaFilter('');
    setStatusFilter('');
    setSort({ key: null, dir: 'asc' });
  }

  // Cambio de Área → resetea la sub-área (cascada)
  function handleAreaChange(e) {
    setAreaFilter(e.target.value);
    setSubAreaFilter('');
  }

  // Sprint 36: 3 secciones
  const posClass =
    section === 'envasado' ? 'text-brand-env'
    : section === 'calidad' ? 'text-brand-qual'
    : 'text-brand-eng';

  return (
    <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-card">
      {/* Header del card */}
      <div className="flex flex-col gap-3 px-5 py-3 border-b border-neutral-200 bg-neutral-50">

        {/* Row 1: título + contador */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-[12px] uppercase tracking-wider text-neutral-600 font-bold">
              Faro de mantenimiento
            </div>
            <div className="text-[10.5px] text-neutral-500 mt-0.5">
              Trazabilidad Total: Cierres, Notificaciones y Planificación SAP
            </div>
          </div>
          <div className="text-[11.5px] text-neutral-500 whitespace-nowrap">
            {hasFilters
              ? <>{processed.length} de {positions.length}</>
              : <>{positions.length} resultados</>}
          </div>
        </div>

        {/* Row 2: buscador + selectores + clear */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-white border border-neutral-300 rounded-lg px-3 py-1.5 gap-2 w-full sm:w-auto sm:min-w-[240px] focus-within:ring-2 focus-within:ring-brand-amber/40 focus-within:border-brand-amber">
            <svg className="w-4 h-4 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por POS, equipo, OT…"
              className="bg-transparent outline-none text-[13px] w-full"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                title="Limpiar texto"
                className="text-neutral-400 hover:text-neutral-900 text-[14px] leading-none px-1"
              >
                ×
              </button>
            )}
          </div>

          <select
            value={areaFilter}
            onChange={handleAreaChange}
            className="bg-white border border-neutral-300 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold focus:outline-none focus:ring-2 focus:ring-brand-amber/40 focus:border-brand-amber"
          >
            <option value="">Todas las áreas</option>
            {areas.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>

          <select
            value={subAreaFilter}
            onChange={(e) => setSubAreaFilter(e.target.value)}
            className="bg-white border border-neutral-300 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold focus:outline-none focus:ring-2 focus:ring-brand-amber/40 focus:border-brand-amber disabled:bg-neutral-100 disabled:text-neutral-400"
            disabled={subAreas.length === 0}
          >
            <option value="">Todas las sub-áreas</option>
            {subAreas.map((sa) => (
              <option key={sa} value={sa}>{sa}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white border border-neutral-300 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold focus:outline-none focus:ring-2 focus:ring-brand-amber/40 focus:border-brand-amber"
          >
            <option value="">Todos los estados</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>

          {hasFilters && (
            <button
              type="button"
              onClick={clearAll}
              className="ml-1 px-2.5 py-1.5 rounded-lg border border-neutral-300 text-[11.5px] font-semibold text-neutral-600 hover:bg-neutral-100"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* Sprint 40b: Vista CARDS mobile (< md) — SIMPLIFICADA */}
      {/* Solo POS + Equipo + Estado + Botón Info. Los detalles y acciones
          quedan detrás de InfoModal y RowActions abajo. */}
      <div className="md:hidden divide-y divide-neutral-100">
        {processed.map((p) => {
          const freqOverdue = p._freqOverdue;
          return (
            <div key={p.id} className="p-3.5 hover:bg-amber-50/40">
              {/* Fila superior: POS + Estado */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0 flex-1">
                  <div className={`font-mono font-bold text-[13px] ${posClass}`}>
                    {p.pos_mtto}
                  </div>
                  <div className="text-[10px] text-neutral-500 uppercase tracking-wider mt-0.5 truncate">
                    {p.area || '—'} {p.sub_area && <span className="text-neutral-400">· {p.sub_area}</span>}
                  </div>
                </div>
                <div className="shrink-0">
                  <StatusBadge
                    status={p.status}
                    daysRemaining={p.days_remaining}
                    lastSapDateExtrema={p.last_sap_date_extrema}
                    freqOverdue={freqOverdue}
                  />
                </div>
              </div>

              {/* Equipo (solo esto en el body) */}
              <div className="text-[13px] font-semibold text-neutral-800 mb-2 line-clamp-2" title={p.equipment_name}>
                {p.equipment_name || '—'}
              </div>

              {/* Acciones en fila con botón Info primero */}
              <div className="flex items-center gap-1.5 pt-2 mt-1 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('open:position-info', { detail: p }));
                  }}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border border-brand-ink bg-brand-ink text-brand-amber text-[11.5px] font-bold hover:bg-neutral-800 active:scale-95 transition"
                  title="Ver detalles"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  Info
                </button>
                <div className="flex items-center gap-1">
                  <RowActions position={p} />
                </div>
              </div>
            </div>
          );
        })}

        {processed.length === 0 && (
          <div className="p-6 text-center text-[13px] text-neutral-500">
            <div className="font-semibold">Sin coincidencias con los filtros actuales</div>
            <div className="text-[11.5px] text-neutral-400 mt-1">
              Prueba con otra palabra, otra área u otro estado.
            </div>
            {hasFilters && (
              <button
                type="button"
                onClick={clearAll}
                className="mt-3 px-3 py-1.5 rounded-lg bg-brand-amber text-black text-[11.5px] font-bold hover:bg-brand-amberHover"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tabla scrollable — solo desktop (md+) */}
      <div className="overflow-x-auto hidden md:block">
        <table className="w-full text-[12.5px]">
          <thead className="bg-neutral-50 border-b-2 border-neutral-200">
            <tr className="text-left">
              <th className="px-3 py-3 font-bold text-[10.5px] uppercase tracking-wider text-neutral-700">POS MTTO</th>
              <th className="px-3 py-3 font-bold text-[10.5px] uppercase tracking-wider text-neutral-700">Equipo / Descripción</th>
              <th className="px-3 py-3">
                <SortHeader label="Área / Sub-área" sortKey="area" current={sort} onClick={toggleSort} />
              </th>
              <th className="px-3 py-3 font-bold text-[10.5px] uppercase tracking-wider text-neutral-700">Frec.</th>
              <th className="px-3 py-3 font-bold text-[10.5px] uppercase tracking-wider text-neutral-700 bg-neutral-100/50">Última (Inicio Ext.)</th>
              <th className="px-3 py-3 font-bold text-[10.5px] uppercase tracking-wider text-neutral-700 bg-neutral-100/50">Última (Cierre)</th>
              <th className="px-3 py-3 font-bold text-[10.5px] uppercase tracking-wider text-neutral-700 bg-neutral-100/50">Última (NOTI)</th>
              <th className="px-3 py-3 bg-amber-50">
                <SortHeader label="Próxima (SAP)" sortKey="next_sap_date" current={sort} onClick={toggleSort} />
              </th>
              <th className="px-3 py-3">
                <SortHeader label="Estado" sortKey="status" current={sort} onClick={toggleSort} />
              </th>
              <th className="px-3 py-3 font-bold text-[10.5px] uppercase tracking-wider text-neutral-700 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {processed.map((p) => {
              // freqOverdue ya viene pre-calculado en `enriched`. Lo leemos
              // desde el flag inyectado para no recalcular en cada render.
              const freqOverdue = p._freqOverdue;

              return (
                <tr key={p.id} className="hover:bg-amber-50/40">
                  <td className={`px-3 py-3 font-mono font-semibold ${posClass}`}>
                    {p.pos_mtto}
                  </td>

                  <td className="px-3 py-3">
                    <div className="font-semibold line-clamp-1" title={p.equipment_name}>
                      {p.equipment_name || '—'}
                    </div>
                    {p.description && (
                      <div className="text-[11px] text-neutral-500 line-clamp-1" title={p.description}>
                        {p.description}
                      </div>
                    )}
                  </td>

                  <td className="px-3 py-3">
                    <div className="font-bold text-neutral-700">{p.area || '—'}</div>
                    {p.sub_area && (
                      <div className="text-[11px] text-neutral-500">{p.sub_area}</div>
                    )}
                  </td>

                  <td className="px-3 py-3">{p.frequency_label || '—'}</td>

                  {/* ÚLTIMA (Inicio Extremo) — icono ⚠️ si freq NOTI vencida */}
                  <td className="px-3 py-3 bg-neutral-50/30">
                    <SapDateCell
                      dateIso={p.last_sap_date_extrema}
                      woNumber={p.last_closed_wo}
                      sapStatus={p.last_sap_status}
                      freqOverdue={freqOverdue}
                    />
                  </td>

                  {/* ÚLTIMA (Fecha de cierre) */}
                  <td className="px-3 py-3 bg-neutral-50/30">
                    <SapDateCell
                      dateIso={p.last_sap_fecha_cierre}
                      woNumber={p.last_closed_wo}
                      sapStatus={p.last_sap_status}
                    />
                  </td>

                  {/* ÚLTIMA (NOTI) */}
                  <td className="px-3 py-3 bg-neutral-50/30 border-r border-neutral-100">
                    <SapDateCell
                      dateIso={p.last_noti_date}
                      woNumber={p.last_noti_wo}
                      sapStatus={p.last_noti_status}
                    />
                  </td>

                  {/* PRÓXIMA (SAP) */}
                  <td className="px-3 py-3 bg-amber-50/10">
                    <SapDateCell
                      dateIso={p.next_sap_date}
                      woNumber={p.sap_open_wo}
                      sapStatus={p.sap_open_status}
                      isFutureAlert={p.status === 'VENCIDO'}
                    />
                  </td>

                  {/* Estado — Badge con override por frecuencia */}
                  <td className="px-3 py-3">
                    <StatusBadge
                      status={p.status}
                      daysRemaining={p.days_remaining}
                      lastSapDateExtrema={p.last_sap_date_extrema}
                      freqOverdue={freqOverdue}
                    />
                  </td>

                  <td className="px-3 py-3">
                    <RowActions position={p} />
                  </td>
                </tr>
              );
            })}

            {processed.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-neutral-500 text-[13px]">
                  <div className="font-semibold">Sin coincidencias con los filtros actuales</div>
                  <div className="text-[11.5px] text-neutral-400 mt-1">
                    Prueba con otra palabra, otra área u otro estado.
                  </div>
                  {hasFilters && (
                    <button
                      type="button"
                      onClick={clearAll}
                      className="mt-3 px-3 py-1.5 rounded-md border border-neutral-300 text-[11.5px] font-semibold text-neutral-700 hover:bg-neutral-50"
                    >
                      Limpiar todos los filtros
                    </button>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}