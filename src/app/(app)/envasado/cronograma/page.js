// app/(app)/envasado/cronograma/page.js
// =========================================================================
// CRONOGRAMA Y PROYECCIÓN — Server Component (Sprint 23)
// -------------------------------------------------------------------------
// Ruta nueva (movida desde /cronograma a /envasado/cronograma para encajar
// con el item ya existente en el sidebar de Envasado).
//
// Cambios Sprint 23:
//   1) Fetch del listado de meses históricos disponibles (ot_kpi_history).
//   2) El fetch del live se mantiene contra ot_cronograma_view, que ahora
//      tiene reglas estrictas (ROW_NUMBER + filtro temporal) — la lógica
//      de filtrado por mes vive en SQL, no en el cliente.
// =========================================================================

export const dynamic = 'force-dynamic';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import CronogramaClient from '@/components/cronograma/CronogramaClient';

export default async function CronogramaEnvasadoPage() {
  const supabase = createSupabaseServerClient();

  // 1) Vista en vivo — ya viene filtrada y deduplicada (ROW_NUMBER) por SQL
  const liveQuery = supabase
    .from('ot_cronograma_view')
    .select('*')
    .order('sort_date', { ascending: true, nullsFirst: false })
    .order('wo_number', { ascending: false });

  // 2) Meses históricos disponibles (para el selector)
  const monthsQuery = supabase
    .from('ot_kpi_history')
    .select('mes_anio')
    .order('mes_anio', { ascending: false });

  const [
    { data: liveRows,    error: liveError },
    { data: monthsRows,  error: monthsError },
  ] = await Promise.all([liveQuery, monthsQuery]);

  // Lista deduplicada de meses (kpi_history tiene 5 rows por mes — uno por tab)
  const availableMonths = monthsRows
    ? [...new Set(monthsRows.map((m) => m.mes_anio))]
    : [];

  return (
    <section className="p-7">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Cronograma y Proyección</h1>
        <p className="text-[13.5px] text-neutral-500 mt-1">
          Planifica fechas de ejecución y evalúa el cumplimiento mensual.
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