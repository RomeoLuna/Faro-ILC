// app/(app)/ingenieria/tendencias/page.js
// =========================================================================
// TENDENCIAS POR SENSOR — Server Component (Sprint 47)
// -------------------------------------------------------------------------
// Trae SOLO las POS que tienen al menos 1 calibración interna en la app.
// Los certificados externos (source='external') se ignoran — no tienen
// puntos punto-a-punto, solo el PDF, así que no se puede graficar deriva.
//
// El client component se encarga del sidebar de POS + gráfico dinámico.
// =========================================================================

export const dynamic = 'force-dynamic';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import TendenciasClient from '@/components/tendencias/TendenciasClient';

export default async function TendenciasPage() {
  const supabase = createSupabaseServerClient();

  // 1) Eventos internos con puntos suficientes para graficar
  const { data: events, error: errEvents } = await supabase
    .from('calibration_events')
    .select('id, position_id, performed_at, sensor_type, result, tolerance_pct')
    .eq('source', 'internal')
    .not('performed_at', 'is', null);

  if (errEvents) {
    return (
      <section className="p-7">
        <div className="bg-brand-failSoft border border-brand-fail/30 text-brand-fail rounded-xl px-5 py-3 text-[13px]">
          Error cargando eventos: {errEvents.message}
        </div>
      </section>
    );
  }

  // 2) Agrupar por position_id
  const byPos = new Map();
  for (const e of events || []) {
    if (!byPos.has(e.position_id)) byPos.set(e.position_id, []);
    byPos.get(e.position_id).push(e);
  }

  const posIds = [...byPos.keys()];

  // 3) Info de las POS (solo las que tienen calibraciones)
  let positions = [];
  if (posIds.length > 0) {
    const { data, error: errPos } = await supabase
      .from('maintenance_positions_view')
      .select('id, pos_mtto, equipment_name, description, sensor_type, area, sub_area, area_name, section, tolerance_pct, unit, range_min, range_max')
      .in('id', posIds)
      .eq('active', true);

    if (errPos) {
      return (
        <section className="p-7">
          <div className="bg-brand-failSoft border border-brand-fail/30 text-brand-fail rounded-xl px-5 py-3 text-[13px]">
            Error cargando POS: {errPos.message}
          </div>
        </section>
      );
    }
    positions = data || [];
  }

  // 4) Enrich con summary para el sidebar
  const enriched = positions.map((p) => {
    const evs = byPos.get(p.id) || [];
    const sorted = [...evs].sort(
      (a, b) => new Date(b.performed_at) - new Date(a.performed_at)
    );
    const lastResult = sorted[0]?.result;
    return {
      ...p,
      total_calibrations: evs.length,
      ultima_calibracion:  sorted[0]?.performed_at || null,
      primera_calibracion: sorted[sorted.length - 1]?.performed_at || null,
      lastResult,
    };
  })
  .sort((a, b) => new Date(b.ultima_calibracion) - new Date(a.ultima_calibracion));

  return (
    <section className="p-7">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <svg className="w-6 h-6 text-brand-eng" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 17 9 11 13 15 21 7" />
            <polyline points="14 7 21 7 21 14" />
          </svg>
          Tendencias por Sensor
        </h1>
        <p className="text-[13.5px] text-neutral-500 mt-1">
          Historia de error por punto para sensores calibrados internamente en la app.
          Los certificados externos (PDF) no se grafican — no se tienen los puntos individuales.
          <strong className="text-neutral-700"> {enriched.length}</strong> POS con datos suficientes.
        </p>
      </div>

      <TendenciasClient positions={enriched} />
    </section>
  );
}