// app/(app)/catalogos/page.js
// =========================================================================
// CATÁLOGO DE PATRONES — Sprint 35
// -------------------------------------------------------------------------
// Server Component: fetch de patrones activos ordenados por nombre.
// Delega toda la UI y las mutaciones al client component.
//
// Los patrones aquí registrados alimentan el dropdown del modal de
// calibración interna (`CalibrationModal`), que los lee al abrirse.
// =========================================================================

export const dynamic = 'force-dynamic';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import CatalogoPatronesClient from '@/components/catalogos/CatalogoPatronesClient';

export default async function CatalogosPage() {
  const supabase = createSupabaseServerClient();

  const { data: patrones, error } = await supabase
    .from('patrones_catalogo')
    .select('id, nombre, certificate_url, active, updated_at')
    .eq('active', true)
    .order('nombre', { ascending: true });

  return (
    <section className="p-7">
      {/* Encabezado */}
      <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <svg className="w-6 h-6 text-brand-amber" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2l2.4 7.4H22l-6.2 4.5L18.2 22 12 17.3 5.8 22l2.4-8.1L2 9.4h7.6L12 2z" />
            </svg>
            Catálogo de Patrones
          </h1>
          <p className="text-[13.5px] text-neutral-500 mt-1">
            Patrones disponibles con su certificado. Se reflejan en tiempo real
            en el modal de calibración interna.
          </p>
        </div>
      </div>

      {error ? (
        <div className="bg-brand-failSoft border border-brand-fail/30 text-brand-fail rounded-xl px-5 py-3 text-[13px]">
          Error cargando patrones: {error.message}
        </div>
      ) : (
        <CatalogoPatronesClient initialPatrones={patrones || []} />
      )}
    </section>
  );
}