// app/(app)/envasado/backlog/page.js
// =========================================================================
// BACKLOG ENVASADO — Server Component
// -------------------------------------------------------------------------
// Delega el render completo a <BacklogPanel section="envasado" />.
// =========================================================================

export const dynamic = 'force-dynamic';

import BacklogPanel from '@/components/faro/BacklogPanel';

export default function BacklogEnvasadoPage() {
  return <BacklogPanel section="envasado" />;
}