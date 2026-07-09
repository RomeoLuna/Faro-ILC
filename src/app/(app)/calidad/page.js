// app/(app)/calidad/page.js
// =========================================================================
// FARO CALIDAD — Server Component (Sprint 36)
// -------------------------------------------------------------------------
// Mismo patrón que /envasado y /ingenieria. Filtra positions por
// section='calidad'. Sub-áreas: PLANTA CERVEZA + PATRONES.
// =========================================================================

export const dynamic = 'force-dynamic';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import FaroDashboardClient from '@/components/faro/FaroDashboardClient';

export default async function CalidadPage() {
  const supabase = createSupabaseServerClient();

  const { data: positions, error } = await supabase
    .from('maintenance_positions_view')
    .select('*')
    .eq('section', 'calidad')
    .eq('active', true)
    .order('pos_mtto', { ascending: true });

  const rows = positions || [];

  return (
    <section className="p-7">
      <div className="flex justify-between items-end mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Faro de Calibraciones</h1>
          <p className="text-[13.5px] text-neutral-500 mt-1">
            {rows.length} posiciones · Sección Calidad · KPIs reactivos al subset filtrado
          </p>
        </div>
      </div>

      {error ? (
        <div className="bg-brand-failSoft border border-brand-fail/30 text-brand-fail rounded-xl px-5 py-3 text-[13px]">
          Error cargando el faro: {error.message}
        </div>
      ) : (
        <FaroDashboardClient positions={rows} section="calidad" />
      )}
    </section>
  );
}