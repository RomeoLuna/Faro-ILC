// app/(app)/ingenieria/backlog/page.js
// =========================================================================
// BACKLOG INGENIERÍA — Server Component
// -------------------------------------------------------------------------
// Espejo del backlog de Envasado, filtrando por section='ingenieria'.
// =========================================================================

export const dynamic = 'force-dynamic';

import BacklogPanel from '@/components/faro/BacklogPanel';

export default function BacklogIngenieriaPage() {
  return <BacklogPanel section="ingenieria" />;
}