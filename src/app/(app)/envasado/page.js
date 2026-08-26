// app/(app)/envasado/page.js
// =========================================================================
// FARO ENVASADO — Server Component (Sprint 15, dashboard reactivo)
// -------------------------------------------------------------------------
// Cambios respecto al Sprint 9:
//   • Ya no llamamos al RPC faro_kpis — los 4 KPIs se calculan ahora en
//     <ReactiveKpis /> a partir del subset filtrado por el usuario.
//   • El fetch de positions vive en este Server Component, los datos se
//     entregan a <FaroDashboardClient /> para orquestar KPIs + chart + tabla.
// =========================================================================

export const dynamic = 'force-dynamic';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import FaroDashboardClient from '@/components/faro/FaroDashboardClient';

export default async function EnvasadoPage() {
  const supabase = createSupabaseServerClient();

  const { data: positions, error } = await supabase
    .from('maintenance_positions_view')
    .select('*')
    .eq('section', 'envasado')
    .eq('active', true)
    .order('pos_mtto', { ascending: true });

  const rows = positions || [];

  return (
    <section className="p-7">
      {/* Encabezado de página */}
      <div className="flex justify-between items-end mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Faro de Calibraciones</h1>
          <p className="text-[13.5px] text-neutral-500 mt-1">
            {rows.length} posiciones · Sección Envasado · KPIs reactivos al subset filtrado
          </p>
        </div>
      </div>

      {/* Mensaje de error o dashboard reactivo */}
      {error ? (
        <div className="bg-brand-failSoft border border-brand-fail/30 text-brand-fail rounded-xl px-5 py-3 text-[13px]">
          Error cargando el faro: {error.message}
        </div>
      ) : (
        <FaroDashboardClient positions={rows} section="envasado" />
      )}
    </section>
  );
}