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
import AppShell from '@/components/layout/AppShell';

import CalibrationModal from '@/components/modals/CalibrationModal';
import HistoryModal from '@/components/modals/HistoryModal';
import ExternalCertModal from '@/components/modals/ExternalCertModal';
import InfoModal from '@/components/modals/InfoModal';
import Toast from '@/components/layout/Toast';

export default function AppLayout({ children }) {
  return (
    <PinGateProvider>
      {/* Sprint 40: AppShell hace el layout responsive (sidebar drawer en mobile) */}
      <AppShell>{children}</AppShell>

      {/* Modales globales — mismos que antes */}
      <CalibrationModal />
      <HistoryModal />
      <ExternalCertModal />
      <InfoModal />

      {/* Corrección: confirmación visual al guardar certificados */}
      <Toast />
    </PinGateProvider>
  );
}