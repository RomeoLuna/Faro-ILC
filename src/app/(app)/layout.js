// app/(app)/layout.js
// =========================================================================
// LAYOUT PÚBLICO — PIN GATE (NO AUTH)
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

      {/* Modales globales */}
      <CalibrationModal />
      <HistoryModal />
      <ExternalCertModal />
    </PinGateProvider>
  );
}