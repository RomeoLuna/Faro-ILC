// lib/kpis.js
// =========================================================================
// HELPER SERVER-SIDE — KPIs del Faro
// -------------------------------------------------------------------------
// Función pensada para invocarse desde Server Components (envasado/page.js
// e ingenieria/page.js) durante el SSR. No necesita 'use server' porque
// es lectura, no mutación.
//
// Llama al RPC público.faro_kpis(p_section) que devuelve los 4 valores
// del dashboard en una sola fila.
//
// Devuelve un objeto plano con números (todos default a 0 si la RPC falla,
// para que la UI no rompa).
// =========================================================================

import { createSupabaseServerClient } from './supabase/server';

/**
 * @param {'envasado'|'ingenieria'} section
 * @returns {Promise<{
 *   activos:        number,
 *   vencidos:       number,
 *   proximos7:      number,
 *   calibradosMes:  number,
 * }>}
 */
export async function getFaroKpis(section) {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .rpc('faro_kpis', { p_section: section })
    .single();

  if (error) {
    console.error('[getFaroKpis] RPC error:', error);
    return { activos: 0, vencidos: 0, proximos7: 0, calibradosMes: 0 };
  }

  return {
    activos:       data?.activos        ?? 0,
    vencidos:      data?.vencidos       ?? 0,
    proximos7:     data?.proximos_7     ?? 0,
    calibradosMes: data?.calibrados_mes ?? 0,
  };
}

/**
 * Helper de presentación: devuelve el nombre del mes corriente en español
 * para usarlo en el subtítulo del KPI 4 ("Calibrados en marzo").
 */
export function nombreMesActual() {
  return new Date().toLocaleDateString('es-SV', { month: 'long' });
}