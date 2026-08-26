// lib/sensors.js
// =========================================================================
// CATÁLOGO DE TIPOS DE SENSOR Y SUS UNIDADES
// -------------------------------------------------------------------------
// Migrado del HTML "App de calibracions updates 8 junio 2026.html" para
// mantener paridad con el formato físico de los certificados de la planta.
//
// El modal de calibración usa este catálogo para:
//   1. Pintar las pestañas/dropdown de tipos de sensor
//   2. Filtrar las unidades válidas según el tipo seleccionado
//   3. Cuando aplica (Turbidez), elegir entre dos ángulos (25º vs 90º)
//
// Si añades un nuevo tipo de medidor, agrégalo aquí y la UI se actualiza
// automáticamente — el modal lee SENSOR_TYPES dinámicamente.
// =========================================================================

export const SENSOR_TYPES = [
  { id: 'Temperatura',      label: 'Temperatura',       units: ['ºC', 'ºF'] },
  { id: 'Presión',          label: 'Presión',           units: ['PSI', 'bar', 'mbar'] },
  { id: 'Conductividad',    label: 'Conductividad',     units: ['µS', 'mS'] },
  { id: 'Oxígeno',          label: 'Oxígeno',           units: ['ppm'] },
  { id: 'Turbidez',         label: 'Turbidez',          units: ['EBC (25º)', 'EBC (90º)'] },
  { id: 'CO2',              label: 'CO2',               units: ['ppm'] },
  { id: 'Alcohol',          label: 'Alcohol',           units: ['º Platos'] },
  { id: 'pH/ORP',           label: 'pH/ORP',            units: ['pH'] },
  { id: 'Medidor de Flujo', label: 'Medidor de Flujo',  units: ['m³', 'hL', 'Kg'] },
];

/**
 * Devuelve las unidades válidas para un tipo de sensor dado.
 * Si el tipo no se encuentra (o viene null), devuelve un set por defecto
 * con TODAS las unidades para no bloquear al técnico.
 */
export function getUnitsForSensor(sensorType) {
  const t = SENSOR_TYPES.find((s) => s.id === sensorType);
  if (t) return t.units;
  // Fallback: todas las unidades únicas
  return Array.from(new Set(SENSOR_TYPES.flatMap((s) => s.units)));
}

/** Lookup directo del tipo de sensor por id. */
export function getSensorById(id) {
  return SENSOR_TYPES.find((s) => s.id === id) || null;
}