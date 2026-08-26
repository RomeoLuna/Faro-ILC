'use client';
// components/layout/SectionSwitcher.jsx
// =========================================================================
// SECTION SWITCHER — Sprint 36 (3 secciones: Envasado, Ingeniería, Calidad)
// -------------------------------------------------------------------------
// Tarjetas visuales en la cabecera del sidebar. Grid pasa de 2 a 3 columnas.
// El "activeSection" lo determina el Sidebar a partir del pathname.
//
// Nota Tailwind: NO usamos template strings dinámicos (`bg-brand-${color}`)
// porque el JIT no los detecta y las clases no se generan. Todas las clases
// están hard-coded literalmente por sección.
// =========================================================================

import Link from 'next/link';

const SECTIONS = [
  {
    id:    'envasado',
    href:  '/envasado',
    title: 'Envasado',
    sub:   'Líneas 1 · 2 · 4',
    cls: {
      dot:      'bg-brand-env',
      border:   'border-brand-env',
      ring:     'ring-brand-env/40',
      hover:    'hover:border-brand-env',
    },
  },
  {
    id:    'ingenieria',
    href:  '/ingenieria',
    title: 'Ingeniería',
    sub:   'Elaboración + Utilidades',
    cls: {
      dot:      'bg-brand-eng',
      border:   'border-brand-eng',
      ring:     'ring-brand-eng/40',
      hover:    'hover:border-brand-eng',
    },
  },
  {
    id:    'calidad',
    href:  '/calidad',
    title: 'Calidad',
    sub:   'Planta Cerveza + Patrones',
    cls: {
      dot:      'bg-brand-qual',
      border:   'border-brand-qual',
      ring:     'ring-brand-qual/40',
      hover:    'hover:border-brand-qual',
    },
  },
];

function SectionCard({ section, active }) {
  const { cls, href, title, sub } = section;
  return (
    <Link
      href={href}
      className={`group rounded-xl bg-brand-graphite border py-3 px-2 text-left transition ${
        active
          ? `${cls.border} ring-2 ${cls.ring}`
          : `border-brand-line ${cls.hover}`
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span className={`w-2.5 h-2.5 rounded-full ${cls.dot}`}></span>
        <span className="text-[10px] uppercase tracking-wider text-neutral-300">Sección</span>
      </div>
      <div className="mt-1 text-[13px] font-bold leading-tight text-white">{title}</div>
      <div className="text-[10px] text-neutral-400 leading-tight mt-0.5 truncate">{sub}</div>
    </Link>
  );
}

export default function SectionSwitcher({ activeSection }) {
  return (
    <div className="px-3 pt-4 pb-2">
      <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500 px-3 mb-2">
        Ecosistema de trabajo
      </div>
      <div className="grid grid-cols-3 gap-1.5 px-1">
        {SECTIONS.map((s) => (
          <SectionCard
            key={s.id}
            section={s}
            active={activeSection === s.id}
          />
        ))}
      </div>
    </div>
  );
}