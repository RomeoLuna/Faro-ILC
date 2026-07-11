'use client';
// components/layout/TopNavigation.jsx
// =========================================================================
// TOP NAVIGATION (Client Component)
// -------------------------------------------------------------------------
// Topbar persistente con:
//   - Título y subtítulo dinámicos según la ruta
//   - Píldora de la sección activa (Envasado azul / Ingeniería teal / Compartido gris)
//   - Buscador global
//   - Chip de usuario AUTENTICADO (de Supabase via useUser)
//   - Botón "Salir" → POST a /auth/signout
// =========================================================================

import { usePathname } from 'next/navigation';
import { useUser } from '@/components/auth/UserProvider';

const TITLES = {
  '/envasado':              { title: 'Faro de Calibraciones — Envasado',   sub: 'Líneas 1, 2 y 4 · Sección Envasado',          kind: 'env' },
  '/envasado/backlog':      { title: 'Backlog y Alertas — Envasado',       sub: 'Pendientes de las líneas de envasado',        kind: 'env' },
  '/envasado/cronograma':   { title: 'Cronograma — Envasado',              sub: 'Proyección anual de calibraciones',           kind: 'env' },
  '/ingenieria':            { title: 'Faro de Calibraciones — Ingeniería', sub: 'Elaboración + Utilidades',                    kind: 'eng' },
  '/ingenieria/backlog':    { title: 'Backlog Ingeniería',                 sub: 'Pendientes BTS, Caldera, Refrigeración',      kind: 'eng' },
  '/ingenieria/tendencias': { title: 'Tendencias por Sensor',              sub: 'Análisis histórico de deriva por POS MTTO',   kind: 'eng' },
  '/certificados':          { title: 'Certificados',                       sub: 'Repositorio compartido',                      kind: 'shared' },
  '/catalogos':             { title: 'Catálogo de Patrones',               sub: 'Fluke, Pozo Seco, etc.',                      kind: 'shared' },
};

function pillFor(kind) {
  const map = {
    env:    { className: 'bg-brand-envSoft text-brand-env', dot: 'bg-brand-env',   label: 'Sección Envasado' },
    eng:    { className: 'bg-brand-engSoft text-brand-eng', dot: 'bg-brand-eng',   label: 'Sección Ingeniería' },
    shared: { className: 'bg-neutral-200 text-neutral-700', dot: 'bg-neutral-500', label: 'Compartido' },
  };
  return map[kind] || map.shared;
}

function rolePillClass(role) {
  switch (role) {
    case 'admin':   return 'bg-brand-amber/20 text-amber-700 border-amber-300';
    case 'tecnico': return 'bg-brand-pass/10 text-brand-pass border-brand-pass/30';
    default:        return 'bg-neutral-200 text-neutral-600 border-neutral-300';
  }
}

function roleLabel(role) {
  return { admin: 'Admin', tecnico: 'Técnico', viewer: 'Viewer' }[role] || 'Viewer';
}

function initials(fullName, email) {
  if (fullName) return fullName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  if (email) return email.slice(0, 2).toUpperCase();
  return '··';
}

export default function TopNavigation({ onOpenDrawer }) {
  const pathname = usePathname();
  const meta = TITLES[pathname] || TITLES['/envasado'];
  const pill = pillFor(meta.kind);

  const ctx = useUser();
  const profile = ctx?.profile;
  const name = profile?.full_name || profile?.email || 'Sin nombre';
  const role = profile?.role || 'viewer';

  return (
    <header className="bg-white border-b border-neutral-200 px-4 md:px-7 py-3 flex items-center justify-between sticky top-0 z-30 gap-2">
      {/* Sprint 40: Hamburger button — solo visible en mobile */}
      <button
        type="button"
        onClick={onOpenDrawer}
        className="md:hidden shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-lg border border-neutral-300 hover:bg-neutral-100"
        aria-label="Abrir menú"
      >
        <svg className="w-5 h-5 text-neutral-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="3" y1="6"  x2="21" y2="6"  />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="min-w-0">
          <div className="text-[14px] md:text-[18px] font-bold leading-tight truncate">{meta.title}</div>
          <div className="text-[11px] md:text-[12px] text-neutral-500 truncate hidden sm:block">{meta.sub}</div>
        </div>
        {/* Píldora solo desde sm+ */}
        <span className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${pill.className}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${pill.dot}`}></span>
          {pill.label}
        </span>
      </div>

      <div className="flex items-center gap-2 md:gap-3 shrink-0">
        {/* Buscador solo en desktop grande */}
        <div className="hidden lg:flex items-center bg-neutral-100 border border-neutral-200 rounded-lg px-3 py-1.5 gap-2 min-w-[280px]">
          <svg className="w-4 h-4 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input className="bg-transparent outline-none text-[13px] w-full" placeholder="Buscar por POS MTTO, equipo, OT..." />
        </div>

        {/* Chip de usuario — solo iniciales en mobile, completo en desktop */}
        <div className="flex items-center gap-2 px-1.5 md:px-2 py-1 md:py-1.5 rounded-lg bg-neutral-50 border border-neutral-200">
          <div className="w-8 h-8 rounded-full bg-brand-ink text-brand-amber grid place-items-center font-bold text-xs shrink-0">
            {initials(profile?.full_name, profile?.email)}
          </div>
          <div className="leading-tight hidden md:block">
            <div className="text-[12.5px] font-semibold">{name}</div>
            <div className="flex items-center gap-1.5">
              <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${rolePillClass(role)}`}>
                {roleLabel(role)}
              </span>
            </div>
          </div>
        </div>

        {/* Salir */}
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            title="Cerrar sesión"
            className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-neutral-300 hover:bg-neutral-100 transition"
          >
            <svg className="w-4 h-4 text-neutral-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </form>
      </div>
    </header>
  );
}