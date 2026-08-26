'use client';
// components/certificados/CertificadosClient.jsx
// =========================================================================
// DASHBOARD DE CERTIFICADOS — Client Component (Sprint 52b, rediseño)
// -------------------------------------------------------------------------
// Grid de cards (no tabla). Cada card muestra toda la info relevante:
//   • POS + Equipo (grande)
//   • Área / Sub-área / Sección con chip
//   • Fecha de NOTI prominente
//   • Info del certificado (si tiene) o acción para emitir (si falta)
// =========================================================================

import { useMemo, useState } from 'react';

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function formatDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return String(iso);
  return `${String(d).padStart(2,'0')} ${MESES[m - 1]} ${y}`;
}

function daysSince(iso) {
  if (!iso) return null;
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y) return null;
  const then = new Date(y, m - 1, d).getTime();
  const now  = Date.now();
  return Math.floor((now - then) / 86400000);
}

function sectionLabel(s) {
  return { envasado: 'Envasado', ingenieria: 'Ingeniería', calidad: 'Calidad' }[s] || '—';
}

function sectionTone(s) {
  return {
    envasado:   { chip: 'bg-brand-envSoft  text-brand-env  border-brand-env/30',   dot: 'bg-brand-env'  },
    ingenieria: { chip: 'bg-brand-engSoft  text-brand-eng  border-brand-eng/30',   dot: 'bg-brand-eng'  },
    calidad:    { chip: 'bg-brand-qualSoft text-brand-qual border-brand-qual/30',  dot: 'bg-brand-qual' },
  }[s] || { chip: 'bg-neutral-100 text-neutral-600 border-neutral-300', dot: 'bg-neutral-500' };
}


export default function CertificadosClient({ rows, kpis, cutoff }) {
  const [tab, setTab]           = useState('pendientes');
  const [query, setQuery]       = useState('');
  const [areaFilter, setArea]   = useState('');
  const [sectionFilter, setSec] = useState('');

  const areas = useMemo(() => {
    const s = new Set();
    for (const r of rows) if (r.area) s.add(r.area);
    return [...s].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (tab === 'pendientes' &&  r.hasCert) return false;
      if (tab === 'con_cert'   && !r.hasCert) return false;
      if (areaFilter    && r.area    !== areaFilter)    return false;
      if (sectionFilter && r.section !== sectionFilter) return false;
      if (!q) return true;
      return (
        String(r.pos_mtto).toLowerCase().includes(q)
        || String(r.noti_wo || '').toLowerCase().includes(q)
        || (r.equipment_name || '').toLowerCase().includes(q)
        || (r.description    || '').toLowerCase().includes(q)
        || (r.area           || '').toLowerCase().includes(q)
        || (r.sub_area       || '').toLowerCase().includes(q)
        || (r.tag            || '').toLowerCase().includes(q)
      );
    });
  }, [rows, tab, query, areaFilter, sectionFilter]);

  function clearFilters() {
    setQuery(''); setArea(''); setSec('');
  }
  const hasFilters = query || areaFilter || sectionFilter;

  return (
    <>
      {/* ─── KPIs ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard
          label="POS notificadas"
          value={kpis.total}
          tone="ink"
          foot={`Desde ${formatDate(cutoff)}`}
          icon={
            <path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          }
        />
        <KpiCard
          label="Con certificado"
          value={kpis.conCert}
          tone="pass"
          foot={kpis.total > 0 ? `${Math.round((kpis.conCert / kpis.total) * 100)}% del universo` : '—'}
          icon={
            <>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <polyline points="9 15 11 17 15 13"/>
            </>
          }
        />
        <KpiCard
          label="Sin certificado"
          value={kpis.sinCert}
          tone="fail"
          foot={kpis.sinCert === 0 ? 'Todas cubiertas ✓' : 'Requieren emisión'}
          icon={
            <>
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9"  x2="9"  y2="15" />
              <line x1="9"  y1="9"  x2="15" y2="15" />
            </>
          }
        />
        <KpiCard
          label="Cobertura"
          value={`${kpis.coverage}%`}
          tone={kpis.coverage >= 90 ? 'pass' : kpis.coverage >= 70 ? 'warn' : 'fail'}
          foot="Objetivo: 100%"
          icon={
            <>
              <circle cx="12" cy="12" r="10"/>
              <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
              <line x1="9"  y1="9"  x2="9.01"  y2="9"/>
              <line x1="15" y1="9"  x2="15.01" y2="9"/>
            </>
          }
        />
      </div>

      {/* ─── Tabs + filtros ─────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-card mb-6">
        <div className="px-5 pt-4 border-b border-neutral-200">
          <div className="flex items-center gap-1 flex-wrap">
            <TabPill
              active={tab === 'pendientes'}
              onClick={() => setTab('pendientes')}
              tone="fail"
              label="Sin certificado"
              count={rows.filter((r) => !r.hasCert).length}
            />
            <TabPill
              active={tab === 'con_cert'}
              onClick={() => setTab('con_cert')}
              tone="pass"
              label="Con certificado"
              count={rows.filter((r) => r.hasCert).length}
            />
          </div>
        </div>

        <div className="px-5 py-3 flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-neutral-50 border border-neutral-300 rounded-lg px-3 py-1.5 gap-2 min-w-[240px] flex-1 focus-within:ring-2 focus-within:ring-brand-amber/40 focus-within:border-brand-amber">
            <svg className="w-4 h-4 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar POS, equipo, área, TAG, OT…"
              className="bg-transparent outline-none text-[13px] w-full"
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-neutral-400 hover:text-neutral-900 text-[14px] leading-none px-1">×</button>
            )}
          </div>

          <select
            value={sectionFilter}
            onChange={(e) => setSec(e.target.value)}
            className="bg-white border border-neutral-300 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold focus:outline-none focus:ring-2 focus:ring-brand-amber/40"
          >
            <option value="">Todas las secciones</option>
            <option value="envasado">Envasado</option>
            <option value="ingenieria">Ingeniería</option>
            <option value="calidad">Calidad</option>
          </select>

          <select
            value={areaFilter}
            onChange={(e) => setArea(e.target.value)}
            className="bg-white border border-neutral-300 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold focus:outline-none focus:ring-2 focus:ring-brand-amber/40"
          >
            <option value="">Todas las áreas</option>
            {areas.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="ml-1 px-2.5 py-1.5 rounded-lg border border-neutral-300 text-[11.5px] font-semibold text-neutral-600 hover:bg-neutral-100"
            >
              Limpiar
            </button>
          )}

          <div className="ml-auto text-[11px] text-neutral-500 whitespace-nowrap">
            <strong>{filtered.length}</strong> {filtered.length === 1 ? 'resultado' : 'resultados'}
          </div>
        </div>
      </div>

      {/* ─── Grid de cards ────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <EmptyState tab={tab} hasFilters={hasFilters} onClear={clearFilters} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((r) => (
            <PosCard key={r.id} row={r} />
          ))}
        </div>
      )}
    </>
  );
}


// ═════════════════════════════════════════════════════════════════════════
// CARD PRINCIPAL DE POS
// ═════════════════════════════════════════════════════════════════════════
function PosCard({ row }) {
  const secTone = sectionTone(row.section);
  const dias = daysSince(row.noti_date);

  return (
    <div className={`bg-white rounded-xl border shadow-card overflow-hidden hover:shadow-pop transition ${
      row.hasCert
        ? 'border-neutral-200 border-t-4 border-t-brand-pass'
        : 'border-neutral-200 border-t-4 border-t-brand-fail'
    }`}>
      {/* Header con POS + estado */}
      <div className="px-4 pt-3 pb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[9.5px] uppercase tracking-wider text-neutral-500 font-bold mb-0.5">POS Mtto</div>
          <div className="font-mono text-[15px] font-extrabold text-brand-ink">{row.pos_mtto}</div>
        </div>
        {row.hasCert ? (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-brand-passSoft text-brand-pass border border-brand-pass/30 text-[10.5px] font-bold uppercase tracking-wider">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Con cert.
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-brand-failSoft text-brand-fail border border-brand-fail/30 text-[10.5px] font-bold uppercase tracking-wider">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <line x1="18" y1="6"  x2="6"  y2="18" />
              <line x1="6"  y1="6"  x2="18" y2="18" />
            </svg>
            Pendiente
          </span>
        )}
      </div>

      {/* Equipo grande */}
      <div className="px-4 pb-2">
        <div className="text-[15px] font-bold text-neutral-900 leading-snug line-clamp-2" title={row.equipment_name}>
          {row.equipment_name || '—'}
        </div>
        {row.description && (
          <div className="text-[12px] text-neutral-500 leading-snug mt-0.5 line-clamp-1" title={row.description}>
            {row.description}
          </div>
        )}
      </div>

      {/* Chips: sección · área · sub-área · sensor · TAG */}
      <div className="px-4 pb-3 flex items-center gap-1.5 flex-wrap">
        {row.section && (
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wider ${secTone.chip}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${secTone.dot}`}></span>
            {sectionLabel(row.section)}
          </span>
        )}
        {row.area && (
          <span className="text-[10.5px] font-semibold text-neutral-700 bg-neutral-100 px-1.5 py-0.5 rounded-md">
            {row.area}
          </span>
        )}
        {row.sub_area && (
          <span className="text-[10.5px] text-neutral-500">· {row.sub_area}</span>
        )}
        {row.tag && (
          <span className="text-[10.5px] font-mono font-bold text-brand-env bg-brand-envSoft px-1.5 py-0.5 rounded-md">
            TAG {row.tag}
          </span>
        )}
      </div>

      {/* Bloque NOTI — fecha grande */}
      <div className="mx-4 mb-3 rounded-lg border border-neutral-200 bg-gradient-to-br from-neutral-50 to-white p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[9.5px] uppercase tracking-wider text-neutral-500 font-bold mb-0.5">Última notificación SAP</div>
            <div className="text-[17px] font-extrabold text-neutral-900 leading-none">
              {formatDate(row.noti_date)}
            </div>
            <div className="text-[10.5px] text-neutral-500 mt-1">
              {dias != null ? `hace ${dias} d` : ''}
              {row.sensor_type && <> · {row.sensor_type}</>}
              {row.frequency_label && <> · {row.frequency_label}</>}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[9.5px] uppercase tracking-wider text-neutral-500 font-bold mb-0.5">OT</div>
            <div className="text-[12px] font-mono font-bold text-brand-ink">{row.noti_wo || '—'}</div>
            {row.noti_status && (
              <span title={row.noti_status} className="mt-1 inline-block px-1.5 py-0.5 rounded bg-brand-ink text-brand-amber text-[9.5px] font-bold tracking-wider">
                {row.noti_status.trim().slice(0, 4).replace(/\.$/, '')}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Footer: certificado + acciones */}
      {row.hasCert ? (
        <CertFooter event={row.event} />
      ) : (
        <PendingFooter row={row} />
      )}
    </div>
  );
}


// ═════════════════════════════════════════════════════════════════════════
// FOOTERS DE CARD (CON O SIN CERTIFICADO)
// ═════════════════════════════════════════════════════════════════════════
function CertFooter({ event }) {
  const isInternal = event?.source === 'internal';
  const url = event?.external_cert_pdf_url || event?.certificate_url;

  return (
    <div className="border-t border-neutral-100 bg-brand-passSoft/20 px-4 py-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="text-[9.5px] uppercase tracking-wider text-brand-pass font-bold mb-0.5">
            Certificado emitido
          </div>
          <div className="flex items-center gap-1.5 mb-1">
            {isInternal ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-brand-ink text-brand-amber text-[10px] font-bold uppercase tracking-wider">
                Interno
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-brand-env text-white text-[10px] font-bold uppercase tracking-wider">
                Externo
              </span>
            )}
            <span className="text-[11px] font-mono text-neutral-600">
              {formatDate(event?.performed_at)}
            </span>
          </div>
          <div className="text-[11px] text-neutral-600">
            {isInternal
              ? `Técnico: ${event?.technician_name || '—'}`
              : `Proveedor: ${event?.external_provider || '—'}`}
            {event?.external_cert_number && (
              <span className="ml-1">· N° {event.external_cert_number}</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {isInternal ? (
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('open:history', { detail: { id: event.position_id } }))}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-brand-pass text-white text-[12px] font-bold hover:bg-emerald-700"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            Ver histórico
          </button>
        ) : url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-brand-env text-white text-[12px] font-bold hover:bg-blue-700"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            Abrir certificado
          </a>
        ) : (
          <div className="flex-1 text-center text-[11px] italic text-neutral-400 py-2">
            Sin archivo adjunto
          </div>
        )}
      </div>
    </div>
  );
}


function PendingFooter({ row }) {
  function openInterno() {
    if (!row.id) return;
    window.dispatchEvent(new CustomEvent('open:calibration', {
      detail: {
        id: row.id,
        pos_mtto: row.pos_mtto,
        equipment_name: row.equipment_name,
        description: row.description,
        area: row.area,
        sub_area: row.sub_area,
        area_name: row.area_name,
        sensor_type: row.sensor_type,
        sap_open_wo: row.noti_wo,
        frequency_months: row.frequency_months,
        tag: row.tag,
        range_min: row.range_min,
        range_max: row.range_max,
        unit: row.unit,
      },
    }));
  }
  function openExterno() {
    if (!row.id) return;
    window.dispatchEvent(new CustomEvent('open:external-cert', {
      detail: {
        id: row.id,
        pos_mtto: row.pos_mtto,
        equipment_name: row.equipment_name,
        sap_open_wo: row.noti_wo,
      },
    }));
  }

  return (
    <div className="border-t border-neutral-100 bg-brand-failSoft/20 px-4 py-3">
      <div className="mb-2 text-[11px] text-brand-fail font-semibold">
        Necesita certificado — elegir el tipo:
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={openInterno}
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg bg-brand-ink text-brand-amber text-[12px] font-bold hover:bg-neutral-800 transition"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          Calibración interna
        </button>
        <button
          onClick={openExterno}
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg border-2 border-brand-amber text-brand-ink text-[12px] font-bold hover:bg-brand-amberSoft transition"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Registrar externo
        </button>
      </div>
    </div>
  );
}


// ═════════════════════════════════════════════════════════════════════════
// KPI card
// ═════════════════════════════════════════════════════════════════════════
function KpiCard({ label, value, foot, tone = 'ink', icon }) {
  const topMap = {
    ink:  'border-t-brand-ink',
    pass: 'border-t-brand-pass',
    warn: 'border-t-brand-warn',
    fail: 'border-t-brand-fail',
  };
  const valMap = {
    ink:  'text-neutral-800',
    pass: 'text-brand-pass',
    warn: 'text-amber-700',
    fail: 'text-brand-fail',
  };
  const iconMap = {
    ink:  'bg-neutral-100 text-neutral-600',
    pass: 'bg-brand-passSoft text-brand-pass',
    warn: 'bg-brand-warnSoft text-amber-700',
    fail: 'bg-brand-failSoft text-brand-fail',
  };
  return (
    <div className={`bg-white rounded-xl border border-neutral-200 border-t-4 ${topMap[tone]} p-4 shadow-card`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wide text-neutral-500 font-semibold">{label}</div>
          <div className={`text-3xl font-bold mt-1 ${valMap[tone]}`}>{value}</div>
          {foot && <div className="text-[11px] text-neutral-500 mt-1">{foot}</div>}
        </div>
        {icon && (
          <div className={`w-10 h-10 rounded-lg grid place-items-center shrink-0 ${iconMap[tone]}`}>
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {icon}
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}


function TabPill({ active, onClick, tone, label, count }) {
  const toneMap = {
    fail: { active: 'border-brand-fail text-brand-fail bg-brand-failSoft', count: 'bg-brand-fail text-white' },
    pass: { active: 'border-brand-pass text-brand-pass bg-brand-passSoft', count: 'bg-brand-pass text-white' },
  };
  const t = toneMap[tone] || toneMap.pass;
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-t-lg text-[13px] font-bold border-b-2 -mb-px transition inline-flex items-center gap-2 ${
        active
          ? t.active
          : 'border-transparent text-neutral-500 hover:text-neutral-800'
      }`}
    >
      {label}
      <span className={`text-[10.5px] px-1.5 py-0.5 rounded-md font-bold ${
        active ? t.count : 'bg-neutral-100 text-neutral-500'
      }`}>
        {count}
      </span>
    </button>
  );
}


function EmptyState({ tab, hasFilters, onClear }) {
  return (
    <div className="bg-white rounded-xl border border-neutral-200 shadow-card p-12 text-center">
      <div className={`w-16 h-16 rounded-full mx-auto mb-3 grid place-items-center ${
        tab === 'pendientes' ? 'bg-brand-passSoft text-brand-pass' : 'bg-neutral-100 text-neutral-400'
      }`}>
        <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {tab === 'pendientes' ? (
            <polyline points="20 6 9 17 4 12" />
          ) : (
            <>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </>
          )}
        </svg>
      </div>
      <div className="text-[15px] font-bold text-neutral-800">
        {tab === 'pendientes'
          ? '¡Sin pendientes!'
          : 'Aún no hay certificados emitidos'}
      </div>
      <div className="text-[13px] text-neutral-500 mt-1 max-w-md mx-auto">
        {hasFilters
          ? 'Con los filtros aplicados no hay coincidencias. Probá ampliar el criterio.'
          : tab === 'pendientes'
            ? 'Todas las POS notificadas desde el cutoff tienen certificado.'
            : 'A medida que se registren calibraciones (internas o externas) aparecerán aquí.'}
      </div>
      {hasFilters && (
        <button
          onClick={onClear}
          className="mt-4 px-4 py-2 rounded-lg bg-brand-amber text-black text-[12.5px] font-bold hover:bg-brand-amberHover"
        >
          Limpiar filtros
        </button>
      )}
    </div>
  );
}