'use client';
// components/faro/FaroDashboardClient.jsx
// =========================================================================
// FARO DASHBOARD CLIENT — Sprint 17 (orquestador reactivo + lifted period)
// -------------------------------------------------------------------------
// Wrapper cliente que envuelve el Faro completo. Tiene DOS estados:
//
//   1) filtered  — subset filtrado por la tabla (search + área + estado).
//                  La tabla lo emite vía onFilteredChange (uncontrolled).
//   2) period    — Sprint 17, lifted state up: el período que controla los
//                  3 gráficos sincronizados. Vive aquí, baja como prop.
//
// Distribución del estado `period`:
//   • <ComplianceChart period setPeriod /> → Maestro, renderiza el <select>
//   • <StatusDonutChart period />          → Esclavo, filtra y re-renderiza
//   • <TrendLineChart   period />          → Esclavo, filtra y re-renderiza
//
// Garantía: al mover el dropdown del ComplianceChart, los tres gráficos
// se re-renderizan en la misma transición de React (mismo estado padre).
//
// La tabla sigue siendo "uncontrolled" para sus filtros internos.
// =========================================================================

import { useCallback, useState } from 'react';
import ReactiveKpis from '@/components/dashboard/ReactiveKpis';
import ComplianceChart from '@/components/dashboard/ComplianceChart';
import StatusDonutChart from '@/components/dashboard/StatusDonutChart';
import TrendLineChart from '@/components/dashboard/TrendLineChart';
import PositionsTableClient from './PositionsTableClient';

export default function FaroDashboardClient({ positions, section }) {
  // Subset filtrado por la tabla (search + área + estado)
  const [filtered, setFiltered] = useState(positions);

  // Sprint 17 — lifted state: el período compartido por los 3 gráficos
  const [period, setPeriod] = useState('current');

  // Callback estable para evitar re-runs innecesarios en la tabla
  const handleFilteredChange = useCallback((next) => {
    setFiltered(next);
  }, []);

  return (
    <>
      {/* 1) KPIs reactivos al subset filtrado */}
      <ReactiveKpis positions={filtered} section={section} />

      {/* 2) Grid de gráficos esclavos (Donut + Trend) — leen `period` */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <StatusDonutChart
          positions={filtered}
          period={period}
          onSectionClick={(status) => {
            // Hook para cross-filtering futuro (donut → tabla).
            // Por ahora solo log; mantenemos la firma estable.
            // eslint-disable-next-line no-console
            console.log('Donut click → filtro solicitado:', status);
          }}
        />
        <TrendLineChart positions={filtered} period={period} />
      </div>

      {/* 3) Maestro — único componente con el <select> visible */}
      <ComplianceChart
        positions={filtered}
        period={period}
        setPeriod={setPeriod}
      />

      {/* 4) Tabla con sus filtros internos + sort + emisión del subset */}
      <PositionsTableClient
        positions={positions}
        section={section}
        onFilteredChange={handleFilteredChange}
      />
    </>
  );
}