'use client';
// components/layout/SectionSwitcher.jsx
// =========================================================================
// SECTION SWITCHER
// -------------------------------------------------------------------------
// Tarjetas visuales Envasado / Ingeniería en la cabecera del sidebar.
// Cada tarjeta navega a la ruta raíz de su sección.
// El "activeSection" lo determina el Sidebar a partir del pathname.
// =========================================================================

import Link from 'next/link';

function SectionCard({ href, color, soft, title, sub, active }) {
  return (
    <Link
      href={href}
      className={`group rounded-xl bg-brand-graphite border py-3 px-2 text-left transition ${
        active
          ? `border-brand-${color} ring-2 ring-brand-${color}/40`
          : `border-brand-line hover:border-brand-${color}`
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`w-2.5 h-2.5 rounded-full bg-brand-${color}`}></span>
        <span className="text-[11px] uppercase tracking-wider text-neutral-300">Sección</span>
      </div>
      <div className="mt-1 text-sm font-bold leading-tight text-white">{title}</div>
      <div className="text-[10.5px] text-neutral-400 leading-tight mt-0.5">{sub}</div>
    </Link>
  );
}

export default function SectionSwitcher({ activeSection }) {
  return (
    <div className="px-3 pt-4 pb-2">
      <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500 px-3 mb-2">
        Ecosistema de trabajo
      </div>
      <div className="grid grid-cols-2 gap-2 px-1">
        <SectionCard
          href="/envasado"
          color="env"
          soft="envSoft"
          title="Envasado"
          sub="Líneas 1 · 2 · 4"
          active={activeSection === 'envasado'}
        />
        <SectionCard
          href="/ingenieria"
          color="eng"
          soft="engSoft"
          title="Ingeniería"
          sub="Elaboración + Utilidades"
          active={activeSection === 'ingenieria'}
        />
      </div>
    </div>
  );
}
