'use client';
// components/layout/TopNavigation.jsx
// =========================================================================
// TOP NAVIGATION (Client Component)
// -------------------------------------------------------------------------
// Topbar persistente con:
//   - Título y subtítulo dinámicos según la ruta
//   - Píldora de la sección activa (Envasado azul / Ingeniería teal / Compartido gris)
//   - Buscador global
//   - Chip de usuario logueado
//
// El título/subtítulo se calcula en el mapa TITLES indexado por pathname.
// Si la ruta no está en el mapa, cae al default de Envasado.
// =========================================================================

import { usePathname } from 'next/navigation';

const TITLES = {
  '/envasado':              { title: 'Faro de Calibraciones — Envasado',   sub: 'Líneas 1, 2 y 4 · 86 posiciones activas',     kind: 'env' },
  '/envasado/backlog':      { title: 'Backlog y Alertas — Envasado',       sub: 'Pendientes de las líneas de envasado',        kind: 'env' },
  '/envasado/cronograma':   { title: 'Cronograma — Envasado',              sub: 'Proyección anual de calibraciones',           kind: 'env' },
  '/ingenieria':            { title: 'Faro de Calibraciones — Ingeniería', sub: 'Elaboración + Utilidades · 132 posiciones',   kind: 'eng' },
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

export default function TopNavigation() {
  const pathname = usePathname();
  const meta = TITLES[pathname] || TITLES['/envasado'];
  const pill = pillFor(meta.kind);

  return (
    <header className="bg-white border-b border-neutral-200 px-7 py-3 flex items-center justify-between sticky top-0 z-30">
      {/* Lado izquierdo: título + píldora de sección */}
      <div className="flex items-center gap-3">
        <div>
          <div className="text-[18px] font-bold leading-tight">{meta.title}</div>
          <div className="text-[12px] text-neutral-500">{meta.sub}</div>
        </div>
        <span
          className={`ml-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${pill.className}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${pill.dot}`}></span>
          {pill.label}
        </span>
      </div>

      {/* Lado derecho: buscador + chip de usuario */}
      <div className="flex items-center gap-3">
        <div className="flex items-center bg-neutral-100 border border-neutral-200 rounded-lg px-3 py-1.5 gap-2 min-w-[280px]">
          <svg
            className="w-4 h-4 text-neutral-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            className="bg-transparent outline-none text-[13px] w-full"
            placeholder="Buscar por POS MTTO, equipo, OT..."
          />
        </div>
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-neutral-50 border border-neutral-200">
          <div className="w-8 h-8 rounded-full bg-brand-ink text-brand-amber grid place-items-center font-bold text-xs">
            RL
          </div>
          <div className="leading-tight">
            <div className="text-[12.5px] font-semibold">Romeo Lunar</div>
            <div className="text-[10.5px] text-neutral-500">Automatización · Admin</div>
          </div>
        </div>
      </div>
    </header>
  );
}
