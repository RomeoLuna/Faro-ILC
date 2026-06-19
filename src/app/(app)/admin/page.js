// app/(app)/admin/page.js
// =========================================================================
// PANEL DE ADMINISTRACIÓN — Server Component (PIN GATE)
// -------------------------------------------------------------------------
// Vista general de administración.
// Como se eliminó la gestión de usuarios por roles, esta página ahora
// se centra en las acciones críticas del sistema (como sincronizar SAP).
// Las acciones individuales están protegidas por PIN internamente.
// =========================================================================

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import SapSyncPanel from '@/components/admin/SapSyncPanel';

export default async function AdminPage() {
  return (
    <section className="p-7">
      {/* Encabezado */}
      <div className="flex justify-between items-end mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Administración del Sistema</h1>
          <p className="text-[13.5px] text-neutral-500 mt-1">
            Mantenimiento y sincronización de datos operativos
          </p>
        </div>
        <Link
          href="/envasado"
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-neutral-300 text-[13px] font-semibold hover:bg-neutral-50"
        >
          ← Volver al Faro
        </Link>
      </div>

      {/* Sincronización IW37N (SAP) — Sprint 12 */}
      {/* Nota: SapSyncPanel ya tiene el usePinGate() integrado para pedir el 150202 */}
      <SapSyncPanel />

    </section>
  );
}