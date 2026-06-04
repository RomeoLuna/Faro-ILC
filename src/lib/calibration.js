// lib/calibration.js
// =========================================================================
// LÓGICA DE CÁLCULO DE CALIBRACIÓN (portada de v4)
// -------------------------------------------------------------------------
// Funciones puras + constantes que cualquier componente puede importar.
// No depende del DOM ni de React, por lo que es testeable en aislamiento.
// =========================================================================

/** Span del lazo de corriente (4-20 mA → 16 mA). */
export const SPAN_LOOP = 16;

/** Tolerancia por defecto (±%) — la app puede sobreescribirla por POS. */
export const TOLERANCIA_DEFAULT = 5.0;

/** Categorías de sensores soportadas (con sus unidades válidas). */
export const SENSORES = {
  Temperatura:   ['ºC', 'ºF'],
  Presión:       ['PSI', 'bar', 'mbar'],
  Conductividad: ['µS', 'mS'],
  Oxígeno:       ['ppm'],
  Turbidez:      ['EBC (25º)', 'EBC (90º)'],
  CO2:           ['ppm'],
  Alcohol:       ['º Platos'],
  'pH/ORP':      ['pH'],
};

/** Los 9 puntos canónicos (subida 0..100 + bajada 75..0). */
export const PUNTOS = [
  { pct: 0,   nominal_ma: 4.00,  fase: 'Subida' },
  { pct: 25,  nominal_ma: 8.00,  fase: 'Subida' },
  { pct: 50,  nominal_ma: 12.00, fase: 'Subida' },
  { pct: 75,  nominal_ma: 16.00, fase: 'Subida' },
  { pct: 100, nominal_ma: 20.00, fase: 'Pico Máx' },
  { pct: 75,  nominal_ma: 16.00, fase: 'Bajada' },
  { pct: 50,  nominal_ma: 12.00, fase: 'Bajada' },
  { pct: 25,  nominal_ma: 8.00,  fase: 'Bajada' },
  { pct: 0,   nominal_ma: 4.00,  fase: 'Bajada' },
];

/**
 * Convierte un valor físico a mA dado un rango lineal.
 * Ej.: valor=5, min=0, max=10 → 12 mA
 * @returns {number|null}
 */
export function fisicoToMa(valor, min, max) {
  const v = Number(valor);
  const mn = Number(min);
  const mx = Number(max);
  if (!Number.isFinite(v) || !Number.isFinite(mn) || !Number.isFinite(mx) || mx - mn === 0) {
    return null;
  }
  return 4 + ((v - mn) / (mx - mn)) * SPAN_LOOP;
}

/**
 * Inversa: mA → unidad física.
 * Ej.: ma=12, min=0, max=10 → 5
 * @returns {number|null}
 */
export function maToFisico(ma, min, max) {
  const m = Number(ma);
  const mn = Number(min);
  const mx = Number(max);
  if (!Number.isFinite(m) || !Number.isFinite(mn) || !Number.isFinite(mx)) {
    return null;
  }
  return mn + (mx - mn) * ((m - 4) / SPAN_LOOP);
}

/**
 * Calcula el error porcentual de lazo + resuelve PASS/FAIL.
 *
 * Devuelve también `maComputed` (el mA que efectivamente se usó para
 * comparar contra el nominal). Esto es CRÍTICO en modo 'fisico', porque
 * la UI necesita mostrar el mA derivado al técnico (igual que la app v4).
 *
 * @param {object} opts
 * @param {'mA'|'fisico'} opts.modo
 * @param {number|string} opts.valorEntrada  Lo que escribió el técnico
 * @param {number} opts.nominalMa            El nominal teórico del punto
 * @param {number} [opts.rangoMin]           Necesario si modo='fisico'
 * @param {number} [opts.rangoMax]           Necesario si modo='fisico'
 * @param {number} [opts.tolerancia=0.5]     ±%
 *
 * @returns {{
 *   maComputed: number|null,   // mA efectivamente usado en el cálculo
 *   errorPct:   number|null,
 *   result:     'PASS'|'FAIL'|null,
 * }}
 */
export function calcularPunto({
  modo,
  valorEntrada,
  nominalMa,
  rangoMin,
  rangoMax,
  tolerancia = TOLERANCIA_DEFAULT,
}) {
  // Sin entrada → no hay nada que calcular
  if (valorEntrada === '' || valorEntrada == null || isNaN(valorEntrada)) {
    return { maComputed: null, errorPct: null, result: null };
  }

  const valor = Number(valorEntrada);
  let maComputed; // el mA que se compara contra el nominal

  if (modo === 'mA') {
    // El técnico tecleó mA → comparar directo
    maComputed = valor;
  } else {
    // Modo físico: derivamos mA desde el valor físico (igual que v4)
    //   maComputed = 4 + ((valor - min) / (max - min)) * 16
    const ma = fisicoToMa(valor, rangoMin, rangoMax);
    if (ma == null) {
      return { maComputed: null, errorPct: null, result: null };
    }
    maComputed = ma;
  }

  // Error % del lazo (idéntico a v4)
  //   errorPct = ((maComputed - nominalMa) / SPAN_LOOP) * 100
  const errorPct = ((maComputed - nominalMa) / SPAN_LOOP) * 100;
  const result = Math.abs(errorPct) <= tolerancia ? 'PASS' : 'FAIL';

  return { maComputed, errorPct, result };
}

/**
 * Determina el resultado global del evento a partir de los puntos.
 *   - Si todos PASS → PASS
 *   - Si alguno FAIL → FAIL
 *   - Si alguno está en el filo (>=80% de la tolerancia) → PASS_LIMITE
 *   - Si faltan datos → PENDING
 */
export function resolverResultadoGlobal(puntos, tolerancia = TOLERANCIA_DEFAULT) {
  if (!puntos || puntos.length === 0) return 'PENDING';
  if (puntos.some((p) => p.result == null)) return 'PENDING';
  if (puntos.some((p) => p.result === 'FAIL')) return 'FAIL';
  const limite = puntos.some(
    (p) => p.errorPct != null && Math.abs(p.errorPct) >= 0.8 * tolerancia
  );
  return limite ? 'PASS_LIMITE' : 'PASS';
}