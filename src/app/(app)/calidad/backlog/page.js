// app/(app)/calidad/backlog/page.js
// =========================================================================
// BACKLOG CALIDAD — Server Component (Sprint 36)
// -------------------------------------------------------------------------
// Reutiliza <BacklogPanel /> igual que Envasado / Ingeniería.
// =========================================================================

export const dynamic = 'force-dynamic';

import BacklogPanel from '@/components/faro/BacklogPanel';

export default function BacklogCalidadPage() {
  return <BacklogPanel section="calidad" />;
}