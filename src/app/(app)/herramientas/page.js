// app/(app)/herramientas/page.js
// =========================================================================
// HERRAMIENTAS CSV — Server Component (Sprint 45)
// -------------------------------------------------------------------------
// Migración de los 2 scripts de Colab a la app:
//   1. Purgador IW37N: top 2 OTs + última NOTI por POS
//   2. Fusión con IP24: cruce por Orden que agrega Fe.planif. y Fecha de cierre
//
// Todo corre 100% en el navegador — nada se sube a Supabase ni a un server.
// =========================================================================

export const dynamic = 'force-dynamic';

import CsvToolsClient from '@/components/herramientas/CsvToolsClient';

export default function HerramientasPage() {
  return (
    <section className="p-7">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <svg className="w-6 h-6 text-brand-amber" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </svg>
          Herramientas CSV
        </h1>
        <p className="text-[13.5px] text-neutral-500 mt-1">
          Purga y cruza tus CSVs de SAP directamente en el navegador — sin Colab, sin subir nada a un servidor externo.
        </p>
      </div>

      <CsvToolsClient />
    </section>
  );
}