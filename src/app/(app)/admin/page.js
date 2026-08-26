// app/(app)/admin/page.js
// =========================================================================
// PANEL DE ADMINISTRACIÓN — Server Component (Sprint 54 + diagnóstico)
// =========================================================================

export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUserWithProfile } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import UsersTable from '@/components/admin/UsersTable';
import SapSyncPanel from '@/components/admin/SapSyncPanel';
import PosManagerPanel from '@/components/admin/PosManagerPanel';
import SupervisorManagerPanel from '@/components/admin/SupervisorManagerPanel';

export default async function AdminPage() {
  const session = await getCurrentUserWithProfile();

  if (!session) {
    redirect('/login');
  }

  if (session.profile?.role !== 'admin') {
    return <AccessDenied profile={session.profile} />;
  }

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

  // Sprint 50: fetch de POS activas — expone errores para diagnóstico
  const { data: positions, error: posErr } = await supabase
    .from('maintenance_positions')
    .select('id, pos_mtto, equipment_name, description, ubicacion_tecnica, area, sub_area, tag, frequency_months, active')
    .eq('active', true)
    .order('pos_mtto', { ascending: true });

  if (posErr) {
    console.error('[admin/page.js] Error fetching positions:', posErr);
  }

  // Sprint 54: fetch de supervisores — defensivo si la tabla aún no existe
  let supervisors = [];
  try {
    const { data, error: supErr } = await supabase
      .from('supervisores')
      .select('id, slug, name, role, signature, active')
      .eq('active', true)
      .order('name', { ascending: true });
    if (supErr) {
      console.warn('[admin/page.js] Supervisores no disponible aún:', supErr.message);
    } else {
      supervisors = data || [];
    }
  } catch (e) {
    console.warn('[admin/page.js] Excepción en supervisores fetch:', e.message);
  }

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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total usuarios"  value={totals.total}   tone="ink" />
        <StatCard label="Administradores" value={totals.admin}   tone="amber" />
        <StatCard label="Técnicos"        value={totals.tecnico} tone="pass" />
        <StatCard label="Viewers"         value={totals.viewer}  tone="env" />
      </div>

      <SapSyncPanel />

      {/* Banner de diagnóstico si el fetch de POS falla o vuelve vacío */}
      {posErr && (
        <div className="mb-4 bg-brand-failSoft border border-brand-fail/30 text-brand-fail rounded-xl px-5 py-3 text-[13px]">
          <strong>Error cargando POS:</strong> {posErr.message}
          {posErr.code && <> · <span className="text-[11px] font-mono">code {posErr.code}</span></>}
        </div>
      )}
      {!posErr && (positions?.length ?? 0) === 0 && (
        <div className="mb-4 bg-brand-warnSoft border border-brand-warn/30 text-amber-800 rounded-xl px-5 py-3 text-[13px]">
          <strong>Aviso:</strong> el fetch de POS no devolvió filas. Verificá en Supabase con{' '}
          <code className="font-mono">select count(*) from public.maintenance_positions where active = true</code>.
        </div>
      )}

      <PosManagerPanel initialPositions={positions || []} />

      <SupervisorManagerPanel initialSupervisors={supervisors || []} />

      <UsersTable users={users || []} currentUserId={session.user.id} />
    </section>
  );
}

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