'use client';
// components/layout/AppShell.jsx
// =========================================================================
// APP SHELL — Sprint 40 (mobile-friendly)
// -------------------------------------------------------------------------
// Wrapper que hace el layout responsive:
//   • Desktop (≥ md): sidebar fija 260px + main scrolleable
//   • Mobile  (< md): sidebar oculta por defecto, drawer overlay al hacer
//     tap en el hamburger del TopNav. Cierra al tap en overlay o al
//     navegar (usePathname change).
//
// Maneja:
//   • Estado abierto/cerrado del drawer
//   • Auto-cierre en cambio de ruta
//   • Overlay clickeable
//   • Bloqueo de scroll body cuando drawer abierto
// =========================================================================

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import TopNavigation from './TopNavigation';

export default function AppShell({ children }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  // Auto-cierre al cambiar de ruta (usuario tocó un link del sidebar)
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Bloquear scroll del body cuando drawer abierto
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen]);

  return (
    <div className="flex min-h-screen">
      {/* ─── Sidebar ────────────────────────────────────────────────
          Desktop: static a la izquierda (md:block).
          Mobile: fixed overlay drawer con animación slide-in.  */}
      <aside
        className={`
          fixed md:static inset-y-0 left-0 z-50 w-[260px] shrink-0
          transform transition-transform duration-200 ease-out
          ${drawerOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        <Sidebar />
      </aside>

      {/* Overlay oscuro cuando drawer abierto (solo mobile) */}
      {drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          aria-hidden="true"
        />
      )}

      {/* ─── Main content ─────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0">
        <TopNavigation onOpenDrawer={() => setDrawerOpen(true)} />
        {children}
      </main>
    </div>
  );
}