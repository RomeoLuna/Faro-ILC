// app/(app)/layout.js
// =========================================================================
// LAYOUT DEL ECOSISTEMA AUTENTICADO  (CHASIS DE LA APP)
// -------------------------------------------------------------------------
// Envuelve todas las rutas privadas bajo (app)/*:
//   /envasado, /envasado/*  /ingenieria, /ingenieria/*
//   /certificados, /catalogos
//
// Responsabilidades:
//   1. Verifica sesión (defensa en profundidad sobre el middleware).
//      Si no hay sesión → redirect('/login').
//   2. Lee el profile del usuario (con rol) desde lib/auth.
//   3. Lo entrega vía <UserProvider> a TODOS los componentes cliente hijos
//      (Sidebar, TopNavigation, RowActions, modales, etc.).
//   4. Renderiza el CHASIS:
//        Sidebar persistente (260 px de ancho) + main scrollable que
//        contiene TopNavigation persistente + el {children} de la ruta.
//   5. Monta los 3 modales GLOBALES una sola vez, escuchando CustomEvents:
//        open:calibration    → CalibrationModal   (Sprint 4)
//        open:history        → HistoryModal       (Sprint 7)
//        open:external-cert  → ExternalCertModal  (Sprint 8)
//      Los dispara <RowActions /> al hacer click en los botones de la
//      tabla de posiciones.
//
// IMPORTANTE: este es un Server Component (default en Next.js 14). Los
// componentes Sidebar, TopNavigation y los 3 modales son Client Components
// (cada uno tiene 'use client' en su propio archivo).
// =========================================================================

import { redirect } from 'next/navigation';

import { getCurrentUserWithProfile } from '@/lib/auth';
import { UserProvider } from '@/components/auth/UserProvider';

import Sidebar from '@/components/layout/Sidebar';
import TopNavigation from '@/components/layout/TopNavigation';

import CalibrationModal from '@/components/modals/CalibrationModal';
import HistoryModal from '@/components/modals/HistoryModal';
import ExternalCertModal from '@/components/modals/ExternalCertModal';

export default async function AppLayout({ children }) {
  // 1) Verificación de sesión en servidor (SSR)
  const session = await getCurrentUserWithProfile();

  if (!session) {
    redirect('/login');
  }

  // 2) Render del chasis + entrega del profile vía Context
  return (
    <UserProvider value={session}>
      <div className="grid grid-cols-[260px_1fr] min-h-screen">
        {/* ── SIDEBAR persistente (oscuro, 260 px) ─────────────────── */}
        <Sidebar />

        {/* ── ÁREA PRINCIPAL: topbar sticky + contenido de la ruta ── */}
        <main className="flex flex-col min-w-0">
          <TopNavigation />
          {children}
        </main>
      </div>

      {/* ── MODALES GLOBALES (montados 1 sola vez) ──────────────────
          Cada modal tiene su propio listener de CustomEvent y maneja
          su visibilidad internamente con useState. */}
      <CalibrationModal />
      <HistoryModal />
      <ExternalCertModal />
    </UserProvider>
  );
}