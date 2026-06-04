'use client';
// components/layout/Sidebar.jsx
// =========================================================================
// SIDEBAR PERSISTENTE (Client Component) — Sprint 11
// -------------------------------------------------------------------------
// Estructura:
//   1. Marca AB
//   2. <SectionSwitcher /> — tarjetas Envasado / Ingeniería
//   3. Menú dinámico según la sección activa (detectada por la ruta)
//   4. Bloque "Compartido" (Certificados, Catálogo de Patrones)
//   5. Bloque "Administración" — CONDICIONAL: sólo visible para role=admin
//
// La sección activa se infiere del pathname:
//   /envasado/*   → menú Envasado
//   /ingenieria/* → menú Ingeniería
//   /certificados, /catalogos, /admin → no fuerza sección (mantiene la última)
// =========================================================================

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import SectionSwitcher from './SectionSwitcher';
import { useUser } from '@/components/auth/UserProvider';

// Mapas de navegación por sección. Centralizados aquí para que agregar
// nuevas páginas sea un solo edit.
const NAV = {
  envasado: [
    { href: '/envasado',            label: 'Faro Envasado',     badge: { text: '86', tone: 'env' } },
    { href: '/envasado/backlog',    label: 'Backlog y Alertas', badge: { text: '4',  tone: 'fail' } },
    { href: '/envasado/cronograma', label: 'Cronograma' },
  ],
  ingenieria: [
    { href: '/ingenieria',            label: 'Faro Ingeniería',      badge: { text: '132', tone: 'eng' } },
    { href: '/ingenieria/backlog',    label: 'Backlog Ingeniería',   badge: { text: '7',   tone: 'warn' } },
    { href: '/ingenieria/tendencias', label: 'Tendencias por Sensor' },
  ],
};

const SHARED = [
  { href: '/certificados', label: 'Certificados' },
  { href: '/catalogos',    label: 'Catálogo de Patrones' },
];

function badgeClass(tone) {
  const map = {
    env:  'bg-brand-env/20 text-brand-env',
    eng:  'bg-brand-eng/20 text-brand-eng',
    fail: 'bg-brand-fail text-white',
    warn: 'bg-brand-warn text-white',
  };
  return `ml-auto text-[10px] px-1.5 py-0.5 rounded ${map[tone] || map.env}`;
}

function NavLink({ href, label, badge, exact = false }) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13.5px] transition ${
        active
          ? 'nav-active bg-brand-graphite text-white'
          : 'text-neutral-300 hover:bg-brand-graphite hover:text-white'
      }`}
    >
      <span>{label}</span>
      {badge && <span className={badgeClass(badge.tone)}>{badge.text}</span>}
    </Link>
  );
}

// ─── Link especializado para el bloque Admin (incluye ícono) ────────────
function AdminNavLink({ href, label }) {
  const pathname = usePathname();
  const active = pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13.5px] transition ${
        active
          ? 'nav-active bg-brand-graphite text-white'
          : 'text-neutral-300 hover:bg-brand-graphite hover:text-white'
      }`}
    >
      {/* Ícono de escudo con check (seguridad / acceso protegido) */}
      <svg
        className="w-4 h-4 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <polyline points="9 12 11 14 15 10" />
      </svg>
      <span>{label}</span>
      <span className="ml-auto text-[10px] bg-brand-amber/20 text-brand-amber px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
        Admin
      </span>
    </Link>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const section = pathname.startsWith('/ingenieria') ? 'ingenieria' : 'envasado';
  const links = NAV[section];

  // Lectura del profile para gating del bloque Admin
  const ctx = useUser();
  const isAdmin = ctx?.profile?.role === 'admin';

  return (
    <aside className="bg-brand-ink text-white flex flex-col sticky top-0 h-screen">
      {/* Marca */}
      <div className="px-5 pt-5 pb-4 border-b border-brand-line/60 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-brand-amber text-black grid place-items-center font-extrabold text-lg">
          AB
        </div>
        <div>
          <div className="text-[13px] font-bold tracking-wide leading-tight">CALIBRACIONES</div>
          <div className="text-[11px] text-neutral-400">LC Beer El Salvador · v2</div>
        </div>
      </div>

      {/* Switcher de sección (bifurcación visual) */}
      <SectionSwitcher activeSection={section} />

      {/* Menú dinámico */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto hide-scrollbar">
        <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500 px-3 pt-2 pb-1">
          {section === 'envasado' ? 'Envasado · Operación' : 'Ingeniería · Operación'}
        </div>

        <div className="space-y-0.5">
          {links.map((l) => (
            <NavLink key={l.href} {...l} exact={l.href === `/${section}`} />
          ))}
        </div>

        {/* Bloque compartido */}
        <div className="mt-4 pt-3 border-t border-brand-line/60 space-y-0.5">
          <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500 px-3 pt-2 pb-1">
            Compartido
          </div>
          {SHARED.map((l) => (
            <NavLink key={l.href} {...l} />
          ))}
        </div>

        {/* Bloque Administración — sólo visible para role=admin */}
        {isAdmin && (
          <div className="mt-4 pt-3 border-t border-brand-line/60 space-y-0.5">
            <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500 px-3 pt-2 pb-1">
              Administración
            </div>
            <AdminNavLink href="/admin" label="Administración" />
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-brand-line/60 text-[11px] text-neutral-400">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-brand-pass mr-1.5"></span>
        Backend pausado · UI v2
      </div>
    </aside>
  );
}