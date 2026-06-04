// app/(app)/admin/page.js
// =========================================================================
// PANEL DE ADMINISTRACIÓN — Server Component (Sprint 11)
// -------------------------------------------------------------------------
// Vista exclusiva para usuarios con rol 'admin'.
//
// Flujo:
//   1. Lee la sesión y profile del usuario actual (SSR).
//   2. Si NO es admin → renderiza <AccessDenied />.
//   3. Si es admin → fetcha public.profiles + calcula stats globales, y
//      delega la tabla con buscador a <UsersTable /> (Client Component).
//
// La búsqueda y el cambio de rol son interactivos (Client). El KPI grid
// se queda en el server para mostrarse instantáneo.
// =========================================================================

export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUserWithProfile } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import UsersTable from '@/components/admin/UsersTable';
import SapSyncPanel from '@/components/admin/SapSyncPanel';

// ─── Página principal ───────────────────────────────────────────────────
export default async function AdminPage() {
  const session = await getCurrentUserWithProfile();

  if (!session) {
    redirect('/login');
  }

  // Gate de rol: cualquier rol que no sea 'admin' ve la pantalla de bloqueo
  if (session.profile?.role !== 'admin') {
    return <AccessDenied profile={session.profile} />;
  }

  // Fetch de TODOS los profiles (la RLS permite select a los admins)
  const supabase = createSupabaseServerClient();
  const { data: users, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, area_scope, active, created_at, updated_at')
    .order('created_at', { ascending: true });

  if (error) {
    return (
      <section className="p-7">
        <div className="bg-brand-failSoft border border-brand-fail/30 text-brand-fail rounded-xl px-5 py-3 text-[13px]">
          Error cargando usuarios: {error.message}
        </div>
      </section>
    );
  }

  // Stats por rol (informativo, calculadas en server)
  const totals = (users || []).reduce(
    (acc, u) => {
      acc.total += 1;
      if (u.role === 'admin')   acc.admin   += 1;
      if (u.role === 'tecnico') acc.tecnico += 1;
      if (u.role === 'viewer')  acc.viewer  += 1;
      if (u.active === false)   acc.inactive += 1;
      return acc;
    },
    { total: 0, admin: 0, tecnico: 0, viewer: 0, inactive: 0 }
  );

  return (
    <section className="p-7">
      {/* Encabezado */}
      <div className="flex justify-between items-end mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Administración de Usuarios</h1>
          <p className="text-[13.5px] text-neutral-500 mt-1">
            Gestión de roles y permisos del sistema · sólo accesible para admins
          </p>
        </div>
        <Link
          href="/envasado"
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-neutral-300 text-[13px] font-semibold hover:bg-neutral-50"
        >
          ← Volver al Faro
        </Link>
      </div>

      {/* Stats de roles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total usuarios"  value={totals.total}   tone="ink" />
        <StatCard label="Administradores" value={totals.admin}   tone="amber" />
        <StatCard label="Técnicos"        value={totals.tecnico} tone="pass" />
        <StatCard label="Viewers"         value={totals.viewer}  tone="env" />
      </div>

      {/* Sincronización IW37N (SAP) — Sprint 12 */}
      <SapSyncPanel />

      {/* Tabla interactiva (con búsqueda) */}
      <UsersTable users={users || []} currentUserId={session.user.id} />
    </section>
  );
}

// ─── Sub-componente: pantalla "Acceso denegado" ──────────────────────────
function AccessDenied({ profile }) {
  const roleLabel = profile?.role
    ? { admin: 'Admin', tecnico: 'Técnico', viewer: 'Viewer' }[profile.role] || profile.role
    : 'sin asignar';

  return (
    <section className="p-7">
      <div className="max-w-md mx-auto bg-white rounded-2xl border border-brand-fail/30 shadow-card p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-brand-failSoft text-brand-fail grid place-items-center mx-auto mb-4">
          <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h1 className="text-xl font-bold">Acceso denegado</h1>
        <p className="text-[13.5px] text-neutral-600 mt-2 leading-relaxed">
          Este módulo es exclusivo para administradores. Tu rol actual es{' '}
          <strong className="text-neutral-900">{roleLabel}</strong>.
          Solicita una promoción a Automatización si necesitas acceso.
        </p>
        <Link
          href="/envasado"
          className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-ink text-white text-[13px] font-semibold hover:bg-brand-steel"
        >
          ← Volver al Faro
        </Link>
      </div>
    </section>
  );
}

// ─── Sub-componente: KPI mini ────────────────────────────────────────────
function StatCard({ label, value, tone }) {
  const toneTop = {
    ink:   'border-t-brand-ink',
    amber: 'border-t-brand-amber',
    pass:  'border-t-brand-pass',
    env:   'border-t-brand-env',
  }[tone] || 'border-t-brand-ink';

  return (
    <div className={`bg-white rounded-xl border border-neutral-200 border-t-4 ${toneTop} p-4 shadow-card`}>
      <div className="text-[11px] uppercase tracking-wide text-neutral-500 font-semibold">{label}</div>
      <div className="text-3xl font-bold mt-1">{value}</div>
    </div>
  );
}