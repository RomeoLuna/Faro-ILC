// components/faro/BacklogPanel.jsx
// =========================================================================
// BACKLOG PANEL — Server Component (Sprint 15)
// -------------------------------------------------------------------------
// Panel gerencial de crisis. Fetch directo a maintenance_positions_view
// con filtro por status IN ('VENCIDO','PROXIMO_7') Y por section.
//
// Estructura visual:
//   1. Crisis Header (gradiente rojo→ámbar, icono triangular de alerta)
//   2. 4 KPIs específicos:
//        Total backlog · Vencidos · Próximos 7 días · Días promedio de atraso
//   3. <PositionsTableClient /> (reutilizado) con el subset crítico
//
// Cuando NO hay backlog, muestra estado de celebración verde.
// =========================================================================

import { createSupabaseServerClient } from '@/lib/supabase/server';
import PositionsTableClient from './PositionsTableClient';

const SECTION_META = {
  envasado:   { label: 'Sección Envasado',   short: 'envasado' },
  ingenieria: { label: 'Sección Ingeniería', short: 'ingenieria' },
};

export default async function BacklogPanel({ section }) {
  const meta = SECTION_META[section] || SECTION_META.envasado;

  const supabase = createSupabaseServerClient();
  const { data: positions, error } = await supabase
    .from('maintenance_positions_view')
    .select('*')
    .eq('section', section)
    .eq('active', true)
    .in('status', ['VENCIDO', 'PROXIMO_7'])
    .order('pos_mtto', { ascending: true });

  if (error) {
    return (
      <section className="p-7">
        <div className="bg-brand-failSoft border border-brand-fail/30 text-brand-fail rounded-xl px-5 py-3 text-[13px]">
          Error cargando el backlog: {error.message}
        </div>
      </section>
    );
  }

  const rows = positions || [];

  // KPIs específicos del backlog
  const total      = rows.length;
  const vencidos   = rows.filter((p) => p.status === 'VENCIDO').length;
  const proximos7  = rows.filter((p) => p.status === 'PROXIMO_7').length;

  const delays = rows
    .filter((p) => p.status === 'VENCIDO' && p.days_remaining != null)
    .map((p) => Math.abs(p.days_remaining));
  const avgDelay = delays.length
    ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length)
    : 0;
  const maxDelay = delays.length ? Math.max(...delays) : 0;

  // Caso feliz: sin backlog → celebración
  if (total === 0) {
    return (
      <section className="p-7">
        <div className="max-w-2xl mx-auto bg-brand-passSoft border-2 border-brand-pass/40 rounded-2xl p-10 text-center shadow-card">
          <div className="w-16 h-16 rounded-full bg-brand-pass text-white grid place-items-center mx-auto mb-4">
            <svg className="w-9 h-9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-extrabold text-brand-pass">¡Sin backlog!</h1>
          <p className="text-[13.5px] text-neutral-700 mt-2 leading-relaxed">
            Todos los equipos activos de la <strong>{meta.label}</strong> tienen
            sus OTs SAP al día. No hay vencidos ni próximos a vencer.
          </p>
          <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-brand-pass/30 text-[11.5px] font-semibold text-brand-pass">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-pass"></span>
            Cero alertas activas
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="p-7">
      {/* Crisis Header */}
      <div className="bg-gradient-to-r from-brand-fail to-brand-warn rounded-2xl p-6 mb-6 text-white shadow-pop border-2 border-brand-fail/40">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-xl bg-white/20 backdrop-blur grid place-items-center shrink-0">
            <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9"  x2="12"    y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-wider font-bold opacity-90">
              {meta.label}
            </div>
            <h1 className="text-3xl font-extrabold mt-0.5">
              Zona de Backlog y Alertas
            </h1>
            <p className="text-[13.5px] opacity-90 mt-1">
              <strong>{total}</strong> equipos requieren atención inmediata
              {' · '}
              <strong>{vencidos}</strong> vencidos
              {' · '}
              <strong>{proximos7}</strong> próximos a vencer
            </p>
          </div>
        </div>
      </div>

      {/* KPIs de crisis */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <CrisisKpi
          label="Total backlog"
          value={total}
          tone="ink"
          foot="POS que requieren acción"
        />
        <CrisisKpi
          label="Vencidos"
          value={vencidos}
          tone="fail"
          foot={vencidos > 0 ? 'Backlog crítico SAP' : 'Sin vencidos'}
        />
        <CrisisKpi
          label="Próximos 7 días"
          value={proximos7}
          tone="warn"
          foot={proximos7 > 0 ? 'Programar técnicos pronto' : 'Sin alertas inmediatas'}
        />
        <CrisisKpi
          label="Días promedio de atraso"
          value={avgDelay ? `${avgDelay} d` : '—'}
          tone="fail"
          foot={maxDelay ? `Máximo: ${maxDelay} d` : 'Sin atrasos medibles'}
        />
      </div>

      {/* Tabla con los críticos (reutilizando el componente del faro) */}
      <PositionsTableClient positions={rows} section={section} />
    </section>
  );
}

// ─── Sub-componente: KPI de crisis ──────────────────────────────────────
function CrisisKpi({ label, value, foot, tone }) {
  const top = {
    ink:   'border-t-brand-ink',
    fail:  'border-t-brand-fail',
    warn:  'border-t-brand-warn',
    amber: 'border-t-brand-amber',
  }[tone] || 'border-t-brand-ink';

  const txt = {
    ink:   '',
    fail:  'text-brand-fail',
    warn:  'text-brand-warn',
    amber: '',
  }[tone] || '';

  return (
    <div className={`bg-white rounded-xl border border-neutral-200 border-t-4 ${top} p-4 shadow-card`}>
      <div className="text-[11px] uppercase tracking-wide text-neutral-500 font-semibold">
        {label}
      </div>
      <div className={`text-3xl font-bold mt-1 ${txt}`}>{value}</div>
      {foot && (
        <div className="text-[11.5px] text-neutral-500 mt-1">{foot}</div>
      )}
    </div>
  );
}