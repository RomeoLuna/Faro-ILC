'use client';
// components/faro/FaroDashboardClient.jsx
// =========================================================================
// FARO DASHBOARD CLIENT — Sprint 37
// -------------------------------------------------------------------------
// Cambios respecto a Sprint 17:
//   • ComplianceChart (barra horizontal) → REEMPLAZADO por
//     SubAreaComplianceBars (barras verticales apiladas por sub-área).
//   • El período (select del nuevo chart) ahora FILTRA también la tabla
//     de POS de abajo: cuando el usuario cambia de mes, la tabla muestra
//     solo POS cuyo next_sap_date cae en ese período.
//
// Estado:
//   period    — lifted, controla SubAreaComplianceBars + Donut + Trend + tabla
//   filtered  — subset filtrado por la tabla (search + área + estado)
//               → alimenta a Donut y Trend (que se enfocan en el subset del user)
//
// Flujo de datos:
//   positions (todas la sección)
//     → periodFiltered (filtro por next_sap_date en período)
//         → PositionsTableClient
//             → filtered (search/area/estado del usuario)
//                 → StatusDonut / TrendLine / KPIs
// =========================================================================

import { useCallback, useMemo, useState } from 'react';
import { periodRange, inRange } from '@/lib/periodRange';
import ReactiveKpis from '@/components/dashboard/ReactiveKpis';
import SubAreaComplianceBars from '@/components/dashboard/SubAreaComplianceBars';
import StatusDonutChart from '@/components/dashboard/StatusDonutChart';
import TrendLineChart from '@/components/dashboard/TrendLineChart';
import PositionsTableClient from './PositionsTableClient';

export default function FaroDashboardClient({ positions, section }) {
  // Sprint 17 — lifted state del período
  // Sprint 49: default cambia de 'current' → 'all' porque eliminamos "Mes Actual"
  const [period, setPeriod] = useState('all');

  // Sprint 37 — pre-filtro por período: positions → periodFiltered → tabla
  const periodFiltered = useMemo(() => {
    if (period === 'all') return positions;
    const [start, end] = periodRange(period);
    return positions.filter(
      (p) => p.next_sap_date && inRange(p.next_sap_date, start, end)
    );
  }, [positions, period]);

  // Subset filtrado por la tabla (search + área + estado) → alimenta a los charts esclavos
  const [filtered, setFiltered] = useState(positions);

  const handleFilteredChange = useCallback((next) => {
    setFiltered(next);
  }, []);

  return (
    <>
      {/* 1) KPIs reactivos al subset filtrado */}
      <ReactiveKpis positions={filtered} section={section} />

      {/* 2) Sprint 37 — MAESTRO: barras verticales apiladas por sub-área
             (reemplaza al ComplianceChart horizontal antiguo). Es quien
             tiene el <select> de período; el resto son esclavos. */}
      <SubAreaComplianceBars
        positions={positions}
        section={section}
        period={period}
        setPeriod={setPeriod}
      />

      {/* 3) Grid de gráficos esclavos (Donut + Trend) — leen `period` */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <StatusDonutChart
          positions={filtered}
          period={period}
          onSectionClick={(status) => {
            // eslint-disable-next-line no-console
            console.log('Donut click → filtro solicitado:', status);
          }}
        />
        <TrendLineChart positions={filtered} period={period} />
      </div>

      {/* 4) Tabla — Sprint 37: recibe positions pre-filtradas por período.
             Sus filtros internos (search / área / estado) siguen funcionando
             encima del período. Emite `filtered` para los charts esclavos. */}
      <PositionsTableClient
        positions={periodFiltered}
        section={section}
        onFilteredChange={handleFilteredChange}
      />
    </>
  );
}