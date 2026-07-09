'use client';
// components/layout/TopNavigation.jsx
// =========================================================================
// TOP NAVIGATION (Client Component) — Sprint 36 (3 secciones)
// -------------------------------------------------------------------------
// Sección activa por ruta:
//   /envasado/*   → chip azul
//   /ingenieria/* → chip teal
//   /calidad/*    → chip púrpura
//   /certificados, /catalogos → chip gris "Compartido"
// =========================================================================

import { usePathname } from 'next/navigation';
import { useUser } from '@/components/auth/UserProvider';

const TITLES = {
  // Envasado
  '/envasado':              { title: 'Faro de Calibraciones — Envasado',   sub: 'Líneas 1, 2 y 4 · Sección Envasado',          kind: 'env' },
  '/envasado/backlog':      { title: 'Backlog y Alertas — Envasado',       sub: 'Pendientes de las líneas de envasado',        kind: 'env' },
  '/envasado/cronograma':   { title: 'Cronograma — Envasado',              sub: 'Proyección anual de calibraciones',           kind: 'env' },

  // Ingeniería
  '/ingenieria':            { title: 'Faro de Calibraciones — Ingeniería', sub: 'Elaboración + Utilidades',                    kind: 'eng' },
  '/ingenieria/backlog':    { title: 'Backlog Ingeniería',                 sub: 'Pendientes BTS, Caldera, Refrigeración',      kind: 'eng' },
  '/ingenieria/tendencias': { title: 'Tendencias por Sensor',              sub: 'Análisis histórico de deriva por POS MTTO',   kind: 'eng' },

  // Calidad — Sprint 36
  '/calidad':               { title: 'Faro de Calibraciones — Calidad',    sub: 'Planta Cerveza + Patrones · Sección Calidad', kind: 'qual' },
  '/calidad/backlog':       { title: 'Backlog Calidad',                    sub: 'Pendientes de Lab y Patrones',                kind: 'qual' },
  '/calidad/cronograma':    { title: 'Cronograma — Calidad',               sub: 'Proyección anual de calibraciones Calidad',   kind: 'qual' },

  // Compartidos
  '/certificados':          { title: 'Certificados',                       sub: 'Repositorio compartido',                      kind: 'shared' },
  '/catalogos':             { title: 'Catálogo de Patrones',               sub: 'Fluke, Pozo Seco, etc.',                      kind: 'shared' },
};

// Sprint 36: si no matchea la ruta exacta, inferimos por prefijo para no
// caer siempre a "Envasado" como default.
function inferMeta(pathname) {
  if (TITLES[pathname]) return TITLES[pathname];
  if (pathname.startsWith('/calidad'))    return { title: 'Calidad',    sub: 'Sección Calidad',    kind: 'qual' };
  if (pathname.startsWith('/ingenieria')) return { title: 'Ingeniería', sub: 'Sección Ingeniería', kind: 'eng'  };
  if (pathname.startsWith('/envasado'))   return { title: 'Envasado',   sub: 'Sección Envasado',   kind: 'env'  };
  return { title: 'Calibraciones', sub: '', kind: 'shared' };
}

function pillFor(kind) {
  const map = {
    env:    { className: 'bg-brand-envSoft  text-brand-env',  dot: 'bg-brand-env',   label: 'Sección Envasado'   },
    eng:    { className: 'bg-brand-engSoft  text-brand-eng',  dot: 'bg-brand-eng',   label: 'Sección Ingeniería' },
    qual:   { className: 'bg-brand-qualSoft text-brand-qual', dot: 'bg-brand-qual',  label: 'Sección Calidad'    },
    shared: { className: 'bg-neutral-200    text-neutral-700', dot: 'bg-neutral-500', label: 'Compartido'         },
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

export default function TopNavigation() {
  const pathname = usePathname();
  const meta = inferMeta(pathname);
  const pill = pillFor(meta.kind);

  const ctx = useUser();
  const profile = ctx?.profile;
  const name = profile?.full_name || profile?.email || 'Sin nombre';
  const role = profile?.role || 'viewer';

  return (
    <header className="bg-white border-b border-neutral-200 px-7 py-3 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <div>
          <div className="text-[18px] font-bold leading-tight">{meta.title}</div>
          <div className="text-[12px] text-neutral-500">{meta.sub}</div>
        </div>
        <span className={`ml-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${pill.className}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${pill.dot}`}></span>
          {pill.label}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center bg-neutral-100 border border-neutral-200 rounded-lg px-3 py-1.5 gap-2 min-w-[280px]">
          <svg className="w-4 h-4 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input className="bg-transparent outline-none text-[13px] w-full" placeholder="Buscar por POS MTTO, equipo, OT..." />
        </div>

        {/* Chip de usuario autenticado */}
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-neutral-50 border border-neutral-200">
          <div className="w-8 h-8 rounded-full bg-brand-ink text-brand-amber grid place-items-center font-bold text-xs">
            {initials(profile?.full_name, profile?.email)}
          </div>
          <div className="leading-tight">
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