// app/(app)/layout.js
// =========================================================================
// LAYOUT PÚBLICO — Sprint 21 (auth-free)
// -------------------------------------------------------------------------
// REEMPLAZA el layout autenticado de Sprint 4-19. Cambios:
//   • Sin getCurrentUserWithProfile, sin redirect('/login').
//   • Sin UserProvider (ya no hay usuario).
//   • <PinGateProvider> envuelve TODO para que cualquier acción
//     de escritura pueda exigir PIN vía usePinGate().
//
// Es Server Component (default Next 14), pero PinGateProvider es
// Client Component (lleva 'use client'). Esa frontera la maneja Next.
// =========================================================================

import { PinGateProvider } from '@/components/security/PinGate';
import Sidebar from '@/components/layout/Sidebar';
import TopNavigation from '@/components/layout/TopNavigation';

import CalibrationModal from '@/components/modals/CalibrationModal';
import HistoryModal from '@/components/modals/HistoryModal';
import ExternalCertModal from '@/components/modals/ExternalCertModal';

export default function AppLayout({ children }) {
  return (
    <PinGateProvider>
      <div className="grid grid-cols-[260px_1fr] min-h-screen">
        <Sidebar />
        <main className="flex flex-col min-w-0">
          <TopNavigation />
          {children}
        </main>
      </div>

      {/* Modales globales — mismos que antes */}
      <CalibrationModal />
      <HistoryModal />
      <ExternalCertModal />
    </PinGateProvider>
  );
}