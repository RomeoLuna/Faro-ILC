// app/(app)/calidad/cronograma/page.js
// =========================================================================
// CRONOGRAMA CALIDAD — Server Component (Sprint 36)
// -------------------------------------------------------------------------
// Mismo fetch que /envasado/cronograma. El componente CronogramaClient
// muestra todo el cronograma; el filtro por sección lo aplicará el propio
// componente si tuviera prop `section` — mientras no la use, la página
// muestra todas las OTs (comportamiento consistente con Envasado).
// =========================================================================

export const dynamic = 'force-dynamic';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import CronogramaClient from '@/components/cronograma/CronogramaClient';

export default async function CronogramaCalidadPage() {
  const supabase = createSupabaseServerClient();

  const liveQuery = supabase
    .from('ot_cronograma_view')
    .select('*')
    .order('sort_date', { ascending: true, nullsFirst: false })
    .order('wo_number', { ascending: false });

  const monthsQuery = supabase
    .from('ot_kpi_history')
    .select('mes_anio')
    .order('mes_anio', { ascending: false });

  const [
    { data: liveRows,    error: liveError },
    { data: monthsRows,  error: monthsError },
  ] = await Promise.all([liveQuery, monthsQuery]);

  const availableMonths = monthsRows
    ? [...new Set(monthsRows.map((m) => m.mes_anio))]
    : [];

  return (
    <section className="p-7">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Cronograma y Proyección · Calidad</h1>
        <p className="text-[13.5px] text-neutral-500 mt-1">
          Planifica fechas de ejecución y evalúa el cumplimiento mensual para
          los equipos de Laboratorio y Patrones de Calidad.
        </p>
      </div>

      {liveError ? (
        <div className="bg-brand-failSoft border border-brand-fail/30 text-brand-fail rounded-xl px-5 py-3 text-[13px]">
          Error cargando el cronograma: {liveError.message}
        </div>
      ) : (
        <CronogramaClient
          initialRows={liveRows || []}
          availableMonths={availableMonths}
        />
      )}

      {monthsError && (
        <div className="mt-3 text-[11.5px] text-amber-700">
          Aviso: no se pudo cargar el listado de meses históricos ({monthsError.message}).
        </div>
      )}
    </section>
  );
}