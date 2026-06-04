// components/faro/PositionsTable.jsx
// =========================================================================
// POSITIONS TABLE — Server Component (Sprint 13, sin cambios estructurales)
// -------------------------------------------------------------------------
// Responsabilidades MÍNIMAS:
//   • Hacer el fetch SSR del view enriquecida `maintenance_positions_view`.
//   • Pasar el array de positions + la sección al Client Component que se
//     encarga del UI (búsqueda en tiempo real + render de filas).
//
// El `select('*')` arrastra automáticamente las columnas nuevas que la
// vista expone tras el Sprint 13:
//   sap_open_wo, sap_planned_date, sap_discrepancy
// El cliente las consume sin que tengamos que tocar nada aquí.
// =========================================================================

import { createSupabaseServerClient } from '@/lib/supabase/server';
import PositionsTableClient from './PositionsTableClient';

export default async function PositionsTable({ section }) {
  const supabase = createSupabaseServerClient();

  const { data: positions, error } = await supabase
    .from('maintenance_positions_view')
    .select('*')
    .eq('section', section)
    .eq('active', true)
    .order('pos_mtto', { ascending: true });

  if (error) {
    return (
      <div className="bg-brand-failSoft border border-brand-fail/30 text-brand-fail rounded-xl px-5 py-3 text-[13px]">
        Error cargando el censo: {error.message}
      </div>
    );
  }

  if (!positions || positions.length === 0) {
    return (
      <div className="bg-white border border-neutral-200 rounded-xl px-5 py-8 text-center text-neutral-500 text-[13.5px]">
        Aún no se ha cargado el censo. Sube{' '}
        <span className="font-mono text-brand-amber">BD PLANES.csv</span> desde el módulo Admin.
      </div>
    );
  }

  return <PositionsTableClient positions={positions} section={section} />;
}