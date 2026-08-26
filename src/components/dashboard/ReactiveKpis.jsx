'use client';
// components/dashboard/ReactiveKpis.jsx
// =========================================================================
// REACTIVE KPIs — Sprint 15
// -------------------------------------------------------------------------
// 4 tarjetas KPI que recalculan automáticamente cuando cambia el subset
// de positions filtrado. El componente NO posee filter state — recibe el
// array ya filtrado y derive las métricas con useMemo.
//
// KPIs:
//   1. Equipos activos      — count del subset (responde a TODOS los filtros)
//   2. Vencidos             — status === 'VENCIDO'
//   3. Próximos 7 días      — status === 'PROXIMO_7'
//   4. Calibrados este mes  — positions con last_sap_date en mes corriente
//
// Diferencia con el RPC SQL del Sprint 9:
//   • El SQL faro_kpis contaba OTs cerradas this month vía updated_at.
//   • Aquí contamos positions cuya OT CERRADA más reciente cae en el mes
//     corriente. Es una aproximación (1 position = 1 cierre como máximo),
//     pero responde a filtros del usuario.
// =========================================================================

import { useMemo } from 'react';

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

function inCurrentMonth(iso) {
  const d = parseLocalDate(iso);
  if (!d) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function nombreMesActual() {
  return new Date().toLocaleDateString('es-SV', { month: 'long' });
}

export default function ReactiveKpis({ positions, section }) {
  const kpis = useMemo(() => {
    let activos        = positions.length;
    let vencidos       = 0;
    let proximos7      = 0;
    let calibradosMes  = 0;

    for (const p of positions) {
      if (p.status === 'VENCIDO')   vencidos++;
      if (p.status === 'PROXIMO_7') proximos7++;
      if (p.last_sap_date && inCurrentMonth(p.last_sap_date)) calibradosMes++;
    }

    return { activos, vencidos, proximos7, calibradosMes };
  }, [positions]);

  const sectionTone = section === 'envasado' ? 'env' : 'eng';

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <KpiCard
        label="Equipos activos"
        value={kpis.activos}
        tone={sectionTone}
        foot="Recalcula con filtros"
      />
      <KpiCard
        label="Vencidos"
        value={kpis.vencidos}
        tone="fail"
        foot={kpis.vencidos === 0 ? 'Todo al día' : 'Atrasos SAP en el subset'}
      />
      <KpiCard
        label="Próximos 7 días"
        value={kpis.proximos7}
        tone="warn"
        foot={kpis.proximos7 === 0 ? 'Sin alertas inmediatas' : 'Programar técnicos pronto'}
      />
      <KpiCard
        label="Calibrados este mes"
        value={kpis.calibradosMes}
        tone="amber"
        foot={`Cierres en ${nombreMesActual()}`}
      />
    </div>
  );
}

// ─── Sub-componente: KPI card ───────────────────────────────────────────
function KpiCard({ label, value, foot, tone = 'amber' }) {
  const top = {
    amber: 'border-t-brand-amber',
    warn:  'border-t-brand-warn',
    fail:  'border-t-brand-fail',
    env:   'border-t-brand-env',
    eng:   'border-t-brand-eng',
    pass:  'border-t-brand-pass',
  }[tone] || 'border-t-brand-amber';

  const txt = {
    amber: '',
    warn:  'text-brand-warn',
    fail:  'text-brand-fail',
    env:   'text-brand-env',
    eng:   'text-brand-eng',
    pass:  'text-brand-pass',
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