// components/dashboard/KpiGrid.jsx
// =========================================================================
// KPI GRID (Server Component)
// -------------------------------------------------------------------------
// Grid responsive de tarjetas KPI:
//   - 1 columna en móvil
//   - 2 en tablet
//   - 4 en desktop
//
// Recibe un array `items` con la forma { label, value, foot, tone }.
// =========================================================================

import KpiCard from './KpiCard';

export default function KpiGrid({ items }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {items.map((kpi, idx) => (
        <KpiCard key={idx} {...kpi} />
      ))}
    </div>
  );
}
