'use client';
// components/modals/CalibrationGrid.jsx
// =========================================================================
// CALIBRATION GRID — Client Component (paridad funcional con v4)
// -------------------------------------------------------------------------
// Tabla interactiva de los 9 puntos canónicos de calibración (4-20 mA):
//   • Subida:  0%, 25%, 50%, 75%, 100%
//   • Bajada:  75%, 50%, 25%, 0%
//
// COMPORTAMIENTO IDÉNTICO A LA APP V4 (swap dinámico de columnas):
//
//   ┌─────────┬──────────────────────────┬──────────────────────────┐
//   │  modo   │      Columna 4           │     Columna 5 (input)    │
//   ├─────────┼──────────────────────────┼──────────────────────────┤
//   │  'mA'   │  Unidad Física           │  Lectura mA              │
//   │         │  (calculada del input    │  (lo que teclea el       │
//   │         │   o del nominal)         │   técnico en mA)         │
//   ├─────────┼──────────────────────────┼──────────────────────────┤
//   │ 'fisico'│  Lectura mA derivada     │  Unidad Física           │
//   │         │  (4 + (val-min)/(max-min)│  (lo que teclea el       │
//   │         │   * 16)                  │   técnico en unidad)     │
//   └─────────┴──────────────────────────┴──────────────────────────┘
//
// En ambos modos, el % de error se calcula como:
//   ((maComputed - nominal_ma) / 16) * 100
// y la fila se pinta verde/rojo según |error| ≤ tolerance.
// =========================================================================

import { useEffect, useState } from 'react';
import {
  PUNTOS,
  calcularPunto,
  fisicoToMa,
  maToFisico,
  resolverResultadoGlobal,
} from '@/lib/calibration';

export default function CalibrationGrid({
  rangeMin,
  rangeMax,
  unit = '',
  tolerance = 0.5,
  modo = 'mA',           // 'mA' | 'fisico'
  readOnly = false,
  onChange,
}) {
  // Estado: lecturas del técnico (9 strings)
  const [readings, setReadings] = useState(() => Array(9).fill(''));
  // Sprint 31: % editable por fila. Iniciamos con los canónicos del HTML
  // (0/25/50/75/100/75/50/25/0). El técnico los puede ajustar caso por caso.
  const [pcts, setPcts] = useState(() => PUNTOS.map((p) => String(p.pct)));

  // ── Helper: parsea un pct con clamp [0..100] ─────────────────────────────
  function parsePct(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    if (n < 0) return 0;
    if (n > 100) return 100;
    return n;
  }

  // ── Cómputo derivado de los 9 puntos ────────────────────────────────────
  const computed = PUNTOS.map((punto, i) => {
    const reading  = readings[i];
    // Sprint 31: pct dinámico (caer al canónico si el técnico borró)
    const pctEffective = parsePct(pcts[i]);
    const pctValid = pctEffective != null;
    const pctForCalc = pctValid ? pctEffective : punto.pct;
    // Nominal mA recalculado por fila: 4 mA + (pct/100)*16 mA
    const nominalMaDynamic = 4 + (pctForCalc / 100) * 16;
    const hasRange =
      rangeMin !== '' && rangeMin != null &&
      rangeMax !== '' && rangeMax != null;

    // Llamamos a calcularPunto para obtener {maComputed, errorPct, result}
    // Sprint 31: usar nominalMaDynamic (recalculado del pct editable)
    const { maComputed, errorPct, result } = calcularPunto({
      modo,
      valorEntrada: reading,
      nominalMa: nominalMaDynamic,
      rangoMin: rangeMin,
      rangoMax: rangeMax,
      tolerancia: tolerance,
    });

    // ── Columna 4 (se muestra siempre, su contenido depende del modo) ────
    let col4Display;   // texto que se renderiza
    let col4Muted;     // si va en gris (cuando es sólo un esperado, no calculado)
    if (modo === 'mA') {
      // En modo mA mostramos la unidad física (calculada del input, o
      // del nominal si todavía no hay input).
      if (hasRange) {
        const fisicoFromInput = reading !== ''
          ? maToFisico(Number(reading), rangeMin, rangeMax)
          : maToFisico(nominalMaDynamic, rangeMin, rangeMax);
        col4Display = `${fisicoFromInput.toFixed(2)} ${unit}`.trim();
        col4Muted = reading === ''; // gris si es sólo el esperado
      } else {
        col4Display = '—';
        col4Muted = true;
      }
    } else {
      // En modo físico mostramos el mA derivado del input físico.
      if (reading !== '' && maComputed != null) {
        col4Display = `${maComputed.toFixed(3)} mA`;
        col4Muted = false;
      } else if (hasRange) {
        // Sin input → mostrar entre paréntesis el físico esperado (igual que v4)
        const vEsperado = rangeMin + (rangeMax - rangeMin) * (pctForCalc / 100);
        col4Display = `(${Number(vEsperado).toFixed(2)} ${unit})`.trim();
        col4Muted = true;
      } else {
        col4Display = '—';
        col4Muted = true;
      }
    }

    return {
      point_index: i,
      pct: pctForCalc,                    // Sprint 31: pct efectivo (puede ser custom)
      phase: punto.fase,                  // fase queda fija según el índice
      nominal_ma: nominalMaDynamic,       // Sprint 31: recalculado del pct
      // Datos crudos para el payload
      expected_value: hasRange
        ? rangeMin + (rangeMax - rangeMin) * (pctForCalc / 100)
        : null,
      reading_ma:    modo === 'mA'     && reading !== '' ? Number(reading) : null,
      reading_value: modo === 'fisico' && reading !== '' ? Number(reading) : null,
      ma_computed:   maComputed, // mA derivado/usado para el cálculo
      error_pct:     errorPct,
      result,
      // Para render
      col4Display,
      col4Muted,
    };
  });

  // Resultado global (para el footer y para el evento)
  const globalResult = resolverResultadoGlobal(
    computed.map((c) => ({ result: c.result, errorPct: c.error_pct })),
    tolerance
  );

  // Emitir al padre. Quitamos del payload los campos de UI.
  useEffect(() => {
    if (onChange) {
      const payload = computed.map(({ col4Display, col4Muted, ...rest }) => rest);
      onChange({ points: payload, globalResult });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readings.join('|'), pcts.join('|'), rangeMin, rangeMax, tolerance, modo]);

  function setReading(i, v) {
    if (readOnly) return;
    setReadings((prev) => prev.map((x, idx) => (idx === i ? v : x)));
  }

  // Sprint 31: setter del % editable por fila
  function setPct(i, v) {
    if (readOnly) return;
    setPcts((prev) => prev.map((x, idx) => (idx === i ? v : x)));
  }

  // ── Encabezados dinámicos (swap por modo, idéntico a v4) ────────────────
  const headerCol4   = modo === 'mA' ? 'Unidad Física'    : 'Lectura mA (derivada)';
  const headerCol5   = modo === 'mA'
    ? 'Lectura mA'
    : `Lectura ${unit || 'físico'}`;
  const inputUnit    = modo === 'mA' ? 'mA' : (unit || '');

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[12px] font-bold uppercase tracking-wider text-neutral-700">
          Puntos de calibración ·{' '}
          <span className="text-brand-ink">
            modo {modo === 'mA' ? 'Lectura mA' : 'Lectura física'}
          </span>
        </div>
        <div className="text-[11.5px] text-neutral-500">
          Tolerancia <span className="font-semibold text-neutral-700">±{tolerance}%</span>
        </div>
      </div>

      {/* Sprint 40b: vista CARDS mobile-first (< md) — un card por punto */}
      <div className="md:hidden space-y-2.5">
        {computed.map((row, i) => {
          const cardTone =
            row.result === 'PASS' ? 'border-brand-pass/40 bg-brand-passSoft/30'
            : row.result === 'FAIL' ? 'border-brand-fail/40 bg-brand-failSoft/30'
            : 'border-neutral-200 bg-white';

          return (
            <div key={i} className={`rounded-xl border-2 ${cardTone} p-3`}>
              {/* Header: fase + % editable + estado */}
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`text-[10px] uppercase tracking-wider font-extrabold ${
                    row.phase === 'Bajada' ? 'text-brand-amber'
                    : row.phase === 'Pico Máx' ? 'text-brand-amber'
                    : 'text-neutral-500'
                  }`}>
                    {row.phase}
                  </span>
                  <span className="text-neutral-300">·</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={pcts[i]}
                      onChange={(e) => setPct(i, e.target.value)}
                      disabled={readOnly}
                      className="w-14 px-1.5 py-1 border-2 border-blue-400 rounded-md text-center font-bold text-[13px] bg-blue-50/50 focus:outline-none focus:ring-2 focus:ring-blue-400/40 disabled:bg-neutral-100 disabled:border-neutral-300 disabled:text-neutral-500"
                    />
                    <span className="text-[11.5px] font-bold text-neutral-500">%</span>
                  </div>
                </div>
                <div>
                  {row.result === 'PASS' && (
                    <span className="px-2.5 py-1 rounded-full text-[10.5px] font-extrabold bg-brand-pass text-white">
                      PASA
                    </span>
                  )}
                  {row.result === 'FAIL' && (
                    <span className="px-2.5 py-1 rounded-full text-[10.5px] font-extrabold bg-brand-fail text-white">
                      FALLA
                    </span>
                  )}
                  {!row.result && (
                    <span className="px-2.5 py-1 rounded-full text-[10.5px] font-semibold bg-neutral-200 text-neutral-600">
                      Pendiente
                    </span>
                  )}
                </div>
              </div>

              {/* Grid interno: Nominal + Esperado */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="rounded-lg border border-neutral-200 bg-emerald-50/30 px-3 py-2">
                  <div className="text-[9.5px] uppercase tracking-wider text-neutral-500 font-bold mb-0.5">
                    Nominal (mA)
                  </div>
                  <div className="text-[15px] font-bold text-neutral-800">
                    {row.nominal_ma.toFixed(2)}
                  </div>
                </div>
                <div className={`rounded-lg border px-3 py-2 ${
                  row.col4Muted
                    ? 'border-neutral-200 bg-neutral-50'
                    : 'border-blue-300 bg-blue-50/50'
                }`}>
                  <div className="text-[9.5px] uppercase tracking-wider text-neutral-500 font-bold mb-0.5">
                    {headerCol4}
                  </div>
                  <div className={`text-[14px] font-bold ${
                    row.col4Muted ? 'text-neutral-400' : 'text-blue-700'
                  }`}>
                    {row.col4Display}
                  </div>
                </div>
              </div>

              {/* Input GRANDE de lectura */}
              <div className="mb-2">
                <label className="block text-[10.5px] uppercase tracking-wider font-bold text-neutral-600 mb-1">
                  {headerCol5}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.001"
                    value={readings[i]}
                    onChange={(e) => setReading(i, e.target.value)}
                    disabled={readOnly}
                    placeholder="--.--"
                    className="flex-1 px-3 py-3 border-2 border-brand-amber rounded-lg text-center font-bold text-[18px] bg-amber-50 focus:outline-none focus:ring-4 focus:ring-brand-amber/30 disabled:bg-neutral-100 disabled:border-neutral-300 disabled:text-neutral-500"
                  />
                  <span className="text-[13px] font-bold text-neutral-700 min-w-[36px] text-center">
                    {inputUnit}
                  </span>
                </div>
              </div>

              {/* Error % footer */}
              <div className="flex items-center justify-between pt-2 border-t border-neutral-200/60">
                <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold">
                  Error
                </span>
                <span className={`text-[13px] font-mono font-bold ${
                  row.result === 'PASS' ? 'text-brand-pass'
                  : row.result === 'FAIL' ? 'text-brand-fail'
                  : 'text-neutral-500'
                }`}>
                  {row.error_pct != null ? `${row.error_pct.toFixed(2)}%` : '—'}
                </span>
              </div>
            </div>
          );
        })}

        {/* Resultado global mobile */}
        <div className="rounded-xl border-2 border-brand-ink bg-neutral-50 p-3 flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wider font-bold text-neutral-700">
            Resultado global
          </span>
          {globalResult === 'PASS' && (
            <span className="px-3 py-1.5 rounded-full text-[12px] font-extrabold bg-brand-pass text-white">
              PASS
            </span>
          )}
          {globalResult === 'PASS_LIMITE' && (
            <span className="px-3 py-1.5 rounded-full text-[12px] font-extrabold bg-brand-warn text-white">
              LÍMITE
            </span>
          )}
          {globalResult === 'FAIL' && (
            <span className="px-3 py-1.5 rounded-full text-[12px] font-extrabold bg-brand-fail text-white">
              FAIL
            </span>
          )}
          {globalResult === 'PENDING' && (
            <span className="px-3 py-1.5 rounded-full text-[12px] font-semibold bg-neutral-300 text-neutral-700">
              Pendiente
            </span>
          )}
        </div>
      </div>

      {/* Tabla — solo desktop (md+) */}
      <div className="hidden md:block rounded-lg border border-neutral-200 overflow-x-auto">
        <table className="w-full text-[12.5px] min-w-[720px]">
          <thead className="bg-brand-ink text-brand-amber">
            <tr>
              <th className="px-3 py-2 text-center w-24">Fase</th>
              <th className="px-3 py-2 text-center w-16">Punto</th>
              <th className="px-3 py-2 text-center w-28">Nominal (mA)</th>
              <th className="px-3 py-2 text-center">
                {headerCol4}
              </th>
              <th className="px-3 py-2 text-center w-44">
                {headerCol5} ✏️
              </th>
              <th className="px-3 py-2 text-center w-24">Error %</th>
              <th className="px-3 py-2 text-center w-24">Estado</th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {computed.map((row, i) => {
              const rowTone =
                row.result === 'PASS' ? 'bg-brand-passSoft/40'
                : row.result === 'FAIL' ? 'bg-brand-failSoft/40'
                : '';
              const phaseTone =
                row.phase === 'Bajada' ? 'text-brand-amber'
                : row.phase === 'Pico Máx' ? 'text-brand-amber font-extrabold'
                : 'text-neutral-600';

              return (
                <tr
                  key={i}
                  className={`border-b border-neutral-100 last:border-b-0 transition-colors ${rowTone}`}
                >
                  <td className={`px-3 py-2 text-center uppercase text-[11px] font-bold ${phaseTone}`}>
                    {row.phase}
                  </td>
                  {/* Sprint 31: Punto (%) editable */}
                  <td className="px-3 py-2 text-center">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={pcts[i]}
                      onChange={(e) => setPct(i, e.target.value)}
                      disabled={readOnly}
                      className="w-16 px-1 py-1 border-2 border-blue-400 rounded-md text-center font-bold text-[13px] bg-blue-50/50 focus:outline-none focus:ring-2 focus:ring-blue-400/40 disabled:bg-neutral-100 disabled:border-neutral-300 disabled:text-neutral-500"
                    />
                  </td>
                  <td className="px-3 py-2 text-center text-neutral-700 bg-emerald-50/30">
                    {row.nominal_ma.toFixed(2)} mA
                  </td>

                  {/* Columna 4 — Esperado (modo mA) o mA derivado (modo físico) */}
                  <td
                    className={`px-3 py-2 text-center font-semibold ${
                      row.col4Muted ? 'text-neutral-400' : 'text-blue-700 bg-blue-50/40'
                    }`}
                  >
                    {row.col4Display}
                  </td>

                  {/* Columna 5 — INPUT del técnico */}
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-center gap-1.5">
                      <input
                        type="number"
                        step="0.001"
                        value={readings[i]}
                        onChange={(e) => setReading(i, e.target.value)}
                        disabled={readOnly}
                        placeholder="--.--"
                        className="w-28 px-2 py-1.5 border-2 border-brand-amber rounded-md text-center font-bold text-[14px] bg-amber-50 focus:outline-none focus:ring-2 focus:ring-brand-amber/40 disabled:bg-neutral-100 disabled:border-neutral-300 disabled:text-neutral-500"
                      />
                      <span className="text-[11px] font-bold text-neutral-600 min-w-[28px] text-left">
                        {inputUnit}
                      </span>
                    </div>
                  </td>

                  <td
                    className={`px-3 py-2 text-center font-bold ${
                      row.result === 'PASS'
                        ? 'text-brand-pass'
                        : row.result === 'FAIL'
                        ? 'text-brand-fail'
                        : 'text-neutral-500'
                    }`}
                  >
                    {row.error_pct != null ? `${row.error_pct.toFixed(2)}%` : '—'}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {row.result === 'PASS' && (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-brand-passSoft text-brand-pass">
                        PASA
                      </span>
                    )}
                    {row.result === 'FAIL' && (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-brand-failSoft text-brand-fail">
                        FALLA
                      </span>
                    )}
                    {!row.result && (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-neutral-200 text-neutral-600">
                        P/F
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-neutral-50 border-t-2 border-neutral-200">
            <tr>
              <td colSpan={6} className="px-3 py-2 text-right text-[11px] font-bold uppercase tracking-wider text-neutral-600">
                Resultado global
              </td>
              <td className="px-3 py-2 text-center">
                {globalResult === 'PASS' && (
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-brand-pass text-white">
                    PASS
                  </span>
                )}
                {globalResult === 'PASS_LIMITE' && (
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-brand-warn text-white">
                    LÍMITE
                  </span>
                )}
                {globalResult === 'FAIL' && (
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-brand-fail text-white">
                    FAIL
                  </span>
                )}
                {globalResult === 'PENDING' && (
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-neutral-300 text-neutral-700">
                    Pendiente
                  </span>
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Hint amistoso si falta rango */}
      {(rangeMin === null || rangeMin === undefined || rangeMin === '' ||
        rangeMax === null || rangeMax === undefined || rangeMax === '') && (
        <div className="mt-2 text-[11.5px] text-amber-700 bg-brand-warnSoft border border-brand-warn/40 rounded-md px-3 py-2">
          Ingresa <strong>rango mín</strong> y <strong>rango máx</strong> para que se calcule el valor físico esperado / el mA derivado.
        </div>
      )}
    </div>
  );
}