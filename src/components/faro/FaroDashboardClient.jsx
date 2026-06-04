'use client';
// components/faro/FaroDashboardClient.jsx
// =========================================================================
// FARO DASHBOARD CLIENT — Sprint 15 (orquestador reactivo)
// -------------------------------------------------------------------------
// Wrapper cliente que envuelve el Faro completo. Su responsabilidad ES
// el ESTADO del subset filtrado: cuando la <PositionsTableClient /> aplica
// filtros (search + área + estado), nos llama vía onFilteredChange y
// guardamos el subset en state local. Ese state se entrega a:
//   • <ReactiveKpis />     → recalcula las 4 tarjetas en tiempo real
//   • <ComplianceChart />  → recalcula la gráfica con su propio dropdown
//                            de período aplicado al subset filtrado
//
// La tabla sigue siendo "uncontrolled" para los filtros (los maneja
// internamente). Solo nos NOTIFICA. Esto evita doble-binding y mantiene
// PositionsTableClient retrocompatible (sirve también para Backlog).
// =========================================================================

import { useCallback, useState } from 'react';
import ReactiveKpis from '@/components/dashboard/ReactiveKpis';
import ComplianceChart from '@/components/dashboard/ComplianceChart';
import PositionsTableClient from './PositionsTableClient';

export default function FaroDashboardClient({ positions, section }) {
  // Initial: el subset filtrado === positions (sin filtros activos)
  const [filtered, setFiltered] = useState(positions);

  // Callback estable para evitar re-runs innecesarios en la tabla
  const handleFilteredChange = useCallback((next) => {
    setFiltered(next);
  }, []);

  return (
    <>
      {/* KPIs reactivos al subset filtrado */}
      <ReactiveKpis positions={filtered} section={section} />

      {/* Chart reactivo al subset filtrado (con su propio dropdown) */}
      <ComplianceChart positions={filtered} />

      {/* Tabla con sus filtros internos + sort + emisión del subset */}
      <PositionsTableClient
        positions={positions}
        section={section}
        onFilteredChange={handleFilteredChange}
      />
    </>
  );
}