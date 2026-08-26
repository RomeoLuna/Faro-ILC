'use client';
// components/herramientas/CsvToolsClient.jsx
// =========================================================================
// CSV TOOLS — Client Component (Sprint 46)
// -------------------------------------------------------------------------
// Flujo integrado en 3 pasos:
//   1. Purgar IW37N (subes crudo → salen: purgado + lista de Órdenes)
//      • Descarga automática del CSV purgado
//      • Botón "Copiar todas las Órdenes" para pegarlas en IP24 (SAP)
//      • El purgado se auto-carga en el paso 2
//
//   2. Cruzar con IP24
//      • Base principal = auto-cargada del paso 1 (editable)
//      • Solo subís el IP24 nuevo
//      • Descarga automática del CSV cruzado
//
//   3. Sincronizar directo a Supabase
//      • Botón nuevo que hace el UPSERT sin pasar por /admin
//      • Progreso en chunks (misma lógica que SapSyncPanel)
//
// Detección automática de separador (, o ;) para archivos generados
// desde Excel/SAP en distintos idiomas del sistema (Sprint 45c).
// Rename de headers duplicados como pandas (Sprint 45b).
// =========================================================================

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { parseCsv, detectSeparator, cleanIsoDate, validateAndMap, dedupeByWoNumber, CHUNK_SIZE } from '@/lib/sapSync';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

// ─── Helpers CSV ────────────────────────────────────────────────────────

function dedupeHeaders(headers) {
  const seen = new Map();
  return headers.map((h) => {
    const raw = (h || '').trim();
    const n = seen.get(raw) || 0;
    seen.set(raw, n + 1);
    return n === 0 ? raw : `${raw}.${n}`;
  });
}

function escapeCell(v) {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function rowsToCsv(headers, rows) {
  const lines = [
    headers.map(escapeCell).join(','),
    ...rows.map((r) => r.map((c) => escapeCell(c)).join(',')),
  ];
  return lines.join('\n');
}

function downloadCsv(content, filename) {
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function rowsToObjects(headers, rows) {
  return rows.map((r) => {
    const o = {};
    headers.forEach((h, i) => { o[h] = r[i]; });
    return o;
  });
}

function objectsToRows(headers, objects) {
  return objects.map((o) => headers.map((h) => o[h] ?? ''));
}


// ═════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL — mantiene estado compartido entre pasos
// ═════════════════════════════════════════════════════════════════════════
export default function CsvToolsClient() {
  // Estado compartido: resultado del purgado (auto-carga al paso 2)
  const [purgedResult, setPurgedResult] = useState(null);
  // Estado compartido: CSV final cruzado (para el sync directo del paso 3)
  const [fusionResult, setFusionResult] = useState(null);

  return (
    <div className="space-y-6">
      <PurgadorIW37N onPurgadoOk={setPurgedResult} onReset={() => { setPurgedResult(null); setFusionResult(null); }} />
      <FusionIP24
        purgedResult={purgedResult}
        onFusionOk={setFusionResult}
      />
      <SyncDirecto fusionResult={fusionResult} />

      <div className="rounded-lg bg-brand-envSoft/40 border border-brand-env/30 p-4 text-[12.5px] text-neutral-700">
        <div className="flex items-start gap-2.5">
          <svg className="w-5 h-5 text-brand-env mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <div>
            <strong>Privacidad total.</strong> Los CSVs se procesan en la memoria del navegador.
            El paso 3 sí sube datos a Supabase (necesario para actualizar el faro).
            Auto-detecta CSVs con separador <code className="font-mono bg-white px-1 rounded">,</code>{' '}
            o <code className="font-mono bg-white px-1 rounded">;</code> según la configuración regional del sistema.
          </div>
        </div>
      </div>
    </div>
  );
}


// ═════════════════════════════════════════════════════════════════════════
// PASO 1 — PURGADOR IW37N
// ═════════════════════════════════════════════════════════════════════════
function PurgadorIW37N({ onPurgadoOk, onReset }) {
  const [file, setFile]     = useState(null);
  const [phase, setPhase]   = useState('idle');
  const [error, setError]   = useState(null);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  function pickFile(f) {
    setError(null);
    setResult(null);
    setCopied(false);
    onReset();
    if (!f) { setFile(null); return; }
    if (!f.name.toLowerCase().endsWith('.csv')) {
      setError('Sólo se aceptan archivos .csv');
      setFile(null);
      return;
    }
    setFile(f);
  }

  async function process() {
    if (!file) { setError('Adjunta el CSV primero.'); return; }
    setError(null);
    setPhase('processing');

    try {
      const text = await file.text();
      const sep = detectSeparator(text);
      const parsed = parseCsv(text, sep);
      const headers = dedupeHeaders(parsed.headers);
      const rows = parsed.rows;
      if (rows.length === 0) throw new Error('El CSV no contiene filas.');

      const requiredCols = ['Pos.mantenim.', 'Orden', 'Fe.inic.extrema', 'Status sistema'];
      for (const col of requiredCols) {
        if (!headers.includes(col)) {
          throw new Error(`Falta la columna "${col}" en el CSV.`);
        }
      }

      const posIdx    = headers.indexOf('Pos.mantenim.');
      const ordIdx    = headers.indexOf('Orden');
      const fechaIdx  = headers.indexOf('Fe.inic.extrema');
      const statusIdx = headers.indexOf('Status sistema');

      const byPos = new Map();
      for (const r of rows) {
        const pos = (r[posIdx] || '').trim();
        if (!pos) continue;
        if (!byPos.has(pos)) byPos.set(pos, []);
        byPos.get(pos).push(r);
      }

      const purgedRows = [];
      for (const [, group] of byPos) {
        const withDates = group.map((r) => ({
          row: r,
          iso: cleanIsoDate(r[fechaIdx]) || '0000-00-00',
        }));
        withDates.sort((a, b) => b.iso.localeCompare(a.iso));

        const top2 = withDates.slice(0, 2);
        const top2Orden = new Set(top2.map((x) => x.row[ordIdx]));

        const notis = withDates.filter((x) =>
          (x.row[statusIdx] || '').toUpperCase().includes('NOTI')
        );

        let out = top2;
        if (notis.length > 0) {
          const ultimaNoti = notis[0];
          if (!top2Orden.has(ultimaNoti.row[ordIdx])) {
            out = [...top2, ultimaNoti];
          }
        }
        purgedRows.push(...out.map((x) => x.row));
      }

      purgedRows.sort((a, b) => {
        const posCmp = String(a[posIdx] || '').localeCompare(String(b[posIdx] || ''));
        if (posCmp !== 0) return posCmp;
        const dA = cleanIsoDate(a[fechaIdx]) || '0000-00-00';
        const dB = cleanIsoDate(b[fechaIdx]) || '0000-00-00';
        return dB.localeCompare(dA);
      });

      // Extraer todas las Órdenes únicas
      const ordenes = Array.from(new Set(
        purgedRows.map((r) => (r[ordIdx] || '').trim()).filter(Boolean)
      ));

      const csv = rowsToCsv(headers, purgedRows);
      const stamp = new Date().toISOString().slice(0, 10);
      const filename = `IW37N_Purgado_Con_NOTI_${stamp}.csv`;
      downloadCsv(csv, filename);

      const resultData = {
        headers, rows: purgedRows,
        csv, filename,
        totalIn: rows.length,
        totalOut: purgedRows.length,
        posCount: byPos.size,
        ordenes,
      };
      setResult(resultData);
      setPhase('done');

      // Compartir con el paso 2
      onPurgadoOk({
        headers, rows: purgedRows,
        csv, filename,
      });
    } catch (e) {
      setError(e.message || 'Error procesando el CSV.');
      setPhase('idle');
    }
  }

  async function copyOrdenes() {
    if (!result?.ordenes?.length) return;
    const text = result.ordenes.join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('No se pudo copiar al portapapeles.');
    }
  }

  function reset() {
    setFile(null);
    setResult(null);
    setError(null);
    setPhase('idle');
    setCopied(false);
    onReset();
  }

  return (
    <div className="bg-white rounded-xl border border-neutral-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-[12px] uppercase tracking-wider text-neutral-600 font-bold flex items-center gap-2">
            <span className="w-6 h-6 rounded-md bg-brand-ink text-brand-amber grid place-items-center text-[11px] font-extrabold">1</span>
            Purgador IW37N
          </div>
          <div className="text-[11.5px] text-neutral-500 mt-0.5">
            Últimas 2 OTs por POS + última NOTI. Descarga automática + auto-carga al paso 2.
          </div>
        </div>
      </div>

      <div className="p-5 space-y-4">
        <FilePicker file={file} onPick={pickFile} placeholder="Arrastra el IW37N crudo o hacé click" />

        {error && (
          <div className="text-[12.5px] text-brand-fail bg-brand-failSoft border border-brand-fail/30 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {phase === 'done' && result && (
          <>
            <div className="rounded-lg border border-brand-pass/30 bg-brand-passSoft/40 p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-full bg-brand-pass text-white grid place-items-center">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
                <div>
                  <div className="text-[14px] font-bold text-brand-pass">Purga completada</div>
                  <div className="text-[11.5px] text-neutral-600">
                    Descargado como <strong>{result.filename}</strong> · auto-cargado al paso 2 ↓
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Metric label="Filas leídas"  value={result.totalIn}  tone="env" />
                <Metric label="POS únicas"    value={result.posCount} tone="neutral" />
                <Metric label="Filas purgadas" value={result.totalOut} tone="pass" />
              </div>
            </div>

            {/* Órdenes extraídas — para copiar al portapapeles y pegar en IP24 */}
            <div className="rounded-lg border-2 border-brand-amber/50 bg-brand-amberSoft/30 p-4">
              <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
                <div>
                  <div className="text-[12px] uppercase tracking-wider text-brand-ink font-bold">
                    Órdenes para IP24 · {result.ordenes.length} únicas
                  </div>
                  <div className="text-[10.5px] text-neutral-600 mt-0.5">
                    Pegalas en la transacción IP24 de SAP para exportar el archivo de fusión.
                  </div>
                </div>
                <button
                  onClick={copyOrdenes}
                  className={`px-3 py-2 rounded-lg text-[12.5px] font-bold inline-flex items-center gap-2 transition ${
                    copied
                      ? 'bg-brand-pass text-white'
                      : 'bg-brand-ink text-brand-amber hover:bg-neutral-800'
                  }`}
                >
                  {copied ? (
                    <>
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      Copiado
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                      Copiar todas
                    </>
                  )}
                </button>
              </div>
              <textarea
                readOnly
                value={result.ordenes.join('\n')}
                onFocus={(e) => e.target.select()}
                className="w-full mt-2 h-32 rounded-md border border-neutral-300 bg-white px-3 py-2 text-[12px] font-mono resize-y focus:outline-none focus:ring-2 focus:ring-brand-amber/30"
              />
              <div className="mt-1.5 text-[10px] text-neutral-500">
                También podés seleccionar y copiar manualmente (Cmd+A · Cmd+C).
              </div>
            </div>
          </>
        )}

        <div className="flex justify-end gap-2">
          {phase === 'done' && (
            <button
              onClick={reset}
              className="px-4 py-2 rounded-lg border border-neutral-300 text-[13px] font-semibold hover:bg-neutral-100"
            >
              Reiniciar
            </button>
          )}
          <button
            onClick={process}
            disabled={!file || phase === 'processing'}
            className="px-4 py-2 rounded-lg bg-brand-amber text-black text-[13px] font-bold hover:bg-brand-amberHover disabled:opacity-60 inline-flex items-center gap-2"
          >
            {phase === 'processing' ? (
              <>
                <Spinner />
                Procesando…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Purgar y descargar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}


// ═════════════════════════════════════════════════════════════════════════
// PASO 2 — FUSIÓN CON IP24
// ═════════════════════════════════════════════════════════════════════════
function FusionIP24({ purgedResult, onFusionOk }) {
  const [mainFile, setMainFile] = useState(null);   // Override manual del auto-cargado
  const [ip24File, setIp24File] = useState(null);
  const [phase, setPhase]       = useState('idle');
  const [error, setError]       = useState(null);
  const [result, setResult]     = useState(null);

  // Base principal efectiva: si el usuario subió un archivo manual úsalo,
  // sino usa el purgado del paso 1
  const hasAutoBase = !mainFile && purgedResult;
  const displayMainName = mainFile?.name || purgedResult?.filename || null;

  function pickMain(f) {
    setError(null); setResult(null);
    if (!f) { setMainFile(null); return; }
    if (!f.name.toLowerCase().endsWith('.csv')) { setError('Base principal debe ser .csv'); return; }
    setMainFile(f);
  }
  function pickIp24(f) {
    setError(null); setResult(null);
    if (!f) { setIp24File(null); return; }
    if (!f.name.toLowerCase().endsWith('.csv')) { setError('IP24 debe ser .csv'); return; }
    setIp24File(f);
  }

  async function process() {
    if (!mainFile && !purgedResult) { setError('Falta la base principal. Purgá primero o subí un CSV.'); return; }
    if (!ip24File) { setError('Adjunta el archivo IP24.'); return; }

    setError(null);
    setPhase('processing');

    try {
      // Base principal: si vino del paso 1, ya tenemos headers y rows en memoria.
      // Si el usuario subió otro, lo parseamos.
      let mainHeaders, mainRowsArr;
      if (mainFile) {
        const mainText = await mainFile.text();
        const mainSep = detectSeparator(mainText);
        const parsedMainRaw = parseCsv(mainText, mainSep);
        mainHeaders = dedupeHeaders(parsedMainRaw.headers);
        mainRowsArr = parsedMainRaw.rows;
      } else {
        mainHeaders = purgedResult.headers;
        mainRowsArr = purgedResult.rows;
      }

      if (!mainHeaders.includes('Orden')) {
        throw new Error('La base principal no tiene la columna "Orden".');
      }
      const mainObjs = rowsToObjects(mainHeaders, mainRowsArr);

      // IP24
      const ip24Text = await ip24File.text();
      const ip24Sep = detectSeparator(ip24Text);
      const parsedIp24Raw = parseCsv(ip24Text, ip24Sep);
      const ip24Headers = dedupeHeaders(parsedIp24Raw.headers);
      for (const col of ['Orden', 'Fe.planif.', 'Fecha de cierre']) {
        if (!ip24Headers.includes(col)) {
          throw new Error(`El CSV IP24 no tiene la columna "${col}".`);
        }
      }
      const ip24Objs = rowsToObjects(ip24Headers, parsedIp24Raw.rows);

      // Dedupe IP24 por Orden
      const ip24ByOrden = new Map();
      for (const o of ip24Objs) {
        const key = (o['Orden'] || '').trim();
        if (!key) continue;
        if (!ip24ByOrden.has(key)) {
          ip24ByOrden.set(key, {
            'Fe.planif.':      o['Fe.planif.']      || '',
            'Fecha de cierre': o['Fecha de cierre'] || '',
          });
        }
      }

      // LEFT JOIN
      let matched = 0;
      const finalObjs = mainObjs.map((row) => {
        const key = (row['Orden'] || '').trim();
        const match = ip24ByOrden.get(key);
        if (match) matched++;
        return {
          ...row,
          'Fe.planif.':      match ? match['Fe.planif.']      : (row['Fe.planif.']      || ''),
          'Fecha de cierre': match ? match['Fecha de cierre'] : (row['Fecha de cierre'] || ''),
        };
      });

      const finalHeaders = [...mainHeaders];
      if (!finalHeaders.includes('Fe.planif.'))       finalHeaders.push('Fe.planif.');
      if (!finalHeaders.includes('Fecha de cierre'))  finalHeaders.push('Fecha de cierre');

      const finalRows = objectsToRows(finalHeaders, finalObjs);
      const csv = rowsToCsv(finalHeaders, finalRows);

      const stamp = new Date().toISOString().slice(0, 10);
      const filename = `BD_SAP_Cruzada_Final_${stamp}.csv`;
      downloadCsv(csv, filename);

      const resultData = {
        headers: finalHeaders,
        rows: finalRows,
        csv, filename,
        totalMain: mainObjs.length,
        totalIp24: ip24Objs.length,
        ip24Unique: ip24ByOrden.size,
        matched,
        unmatched: mainObjs.length - matched,
        finalColumns: finalHeaders.length,
      };
      setResult(resultData);
      setPhase('done');
      onFusionOk({ csv, filename });
    } catch (e) {
      setError(e.message || 'Error cruzando los CSVs.');
      setPhase('idle');
    }
  }

  function resetMain() {
    setMainFile(null);
  }

  return (
    <div className="bg-white rounded-xl border border-neutral-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-[12px] uppercase tracking-wider text-neutral-600 font-bold flex items-center gap-2">
            <span className="w-6 h-6 rounded-md bg-brand-ink text-brand-amber grid place-items-center text-[11px] font-extrabold">2</span>
            Fusión con IP24
          </div>
          <div className="text-[11.5px] text-neutral-500 mt-0.5">
            Cruce por <span className="font-mono">Orden</span> · agrega Fe.planif. + Fecha de cierre.
          </div>
        </div>
      </div>

      <div className="p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Base principal — auto-cargada o manual */}
          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-neutral-600 mb-1">
              Base principal (purgada)
            </div>
            {hasAutoBase ? (
              <div className="rounded-xl border-2 border-brand-pass/40 bg-brand-passSoft/30 p-4 text-center">
                <div className="text-[11.5px] font-bold text-brand-pass mb-0.5 flex items-center justify-center gap-1.5">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  {displayMainName}
                </div>
                <div className="text-[10.5px] text-neutral-500 mt-1">
                  Cargado automáticamente desde el paso 1 · {purgedResult.rows.length} filas
                </div>
                <label className="mt-2 inline-block text-[10.5px] text-brand-env hover:underline cursor-pointer">
                  Cambiar por otro archivo
                  <input
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={(e) => pickMain(e.target.files?.[0])}
                  />
                </label>
              </div>
            ) : (
              <FilePicker
                file={mainFile}
                onPick={pickMain}
                placeholder="Subí manualmente o completá el paso 1"
              />
            )}
            {mainFile && (
              <button
                onClick={resetMain}
                className="mt-1 text-[10.5px] text-brand-env hover:underline"
              >
                Volver a usar el purgado del paso 1
              </button>
            )}
          </div>

          {/* IP24 */}
          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-neutral-600 mb-1">
              Archivo IP24
            </div>
            <FilePicker file={ip24File} onPick={pickIp24} placeholder="IP24_XXXX.csv" />
          </div>
        </div>

        {error && (
          <div className="text-[12.5px] text-brand-fail bg-brand-failSoft border border-brand-fail/30 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {phase === 'done' && result && (
          <div className="rounded-lg border border-brand-pass/30 bg-brand-passSoft/40 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-full bg-brand-pass text-white grid place-items-center">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <div>
                <div className="text-[14px] font-bold text-brand-pass">Cruce completado</div>
                <div className="text-[11.5px] text-neutral-600">
                  <strong>{result.filename}</strong> · listo para el paso 3 ↓
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Metric label="Filas base"     value={result.totalMain}   tone="env" />
              <Metric label="IP24 únicas"    value={result.ip24Unique}  tone="neutral" />
              <Metric label="OTs matched"    value={result.matched}     tone="pass" />
              <Metric label="Sin match IP24" value={result.unmatched}   tone={result.unmatched > 0 ? 'warn' : 'neutral'} />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={process}
            disabled={(!mainFile && !purgedResult) || !ip24File || phase === 'processing'}
            className="px-4 py-2 rounded-lg bg-brand-amber text-black text-[13px] font-bold hover:bg-brand-amberHover disabled:opacity-60 inline-flex items-center gap-2"
          >
            {phase === 'processing' ? (
              <>
                <Spinner />
                Cruzando…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M17 3l4 4-4 4"/>
                  <path d="M21 7H9a4 4 0 0 0-4 4v0"/>
                  <path d="M7 21l-4-4 4-4"/>
                  <path d="M3 17h12a4 4 0 0 0 4-4v0"/>
                </svg>
                Cruzar y descargar
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}


// ═════════════════════════════════════════════════════════════════════════
// PASO 3 — SYNC DIRECTO A SUPABASE
// ═════════════════════════════════════════════════════════════════════════
function SyncDirecto({ fusionResult }) {
  const router = useRouter();
  const [phase, setPhase]       = useState('idle');      // 'idle' | 'syncing' | 'done'
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError]       = useState(null);
  const [result, setResult]     = useState(null);

  const canRun = !!fusionResult?.csv;

  async function syncNow() {
    if (!fusionResult?.csv) { setError('Primero completá el cruce del paso 2.'); return; }

    setError(null);
    setResult(null);
    setPhase('syncing');

    try {
      // Reusa validateAndMap del sync existente
      const parsed = parseCsv(fusionResult.csv, ',');   // el cruce siempre sale con ","
      const mapped = validateAndMap(parsed.rows, parsed.headers);
      if (mapped.error) throw new Error(mapped.error);

      const { valid, skipped_reasons } = mapped;
      const deduped = dedupeByWoNumber(valid);
      if (deduped.length === 0) throw new Error('No hay filas válidas para sincronizar.');

      const supabase = createSupabaseBrowserClient();
      const totalChunks = Math.ceil(deduped.length / CHUNK_SIZE);
      setProgress({ done: 0, total: totalChunks });

      let upserted = 0;
      for (let i = 0; i < deduped.length; i += CHUNK_SIZE) {
        const chunkIdx = Math.floor(i / CHUNK_SIZE) + 1;
        const chunk    = deduped.slice(i, i + CHUNK_SIZE);

        const { error: dbErr } = await supabase
          .from('sap_work_orders')
          .upsert(chunk, { onConflict: 'wo_number' });

        if (dbErr) {
          throw new Error(
            `Error en chunk ${chunkIdx}/${totalChunks} ` +
            `(filas ${i + 1}-${i + chunk.length}): ${dbErr.message}. ` +
            `Se alcanzaron a sincronizar ${upserted} filas antes de la falla.`
          );
        }
        upserted += chunk.length;
        setProgress({ done: chunkIdx, total: totalChunks });
        await new Promise((r) => setTimeout(r, 0));  // yield al event loop
      }

      setResult({
        total: parsed.rows.length,
        valid: valid.length,
        upserted,
        skipped: skipped_reasons.length,
        batches: totalChunks,
      });
      setPhase('done');
      router.refresh();
    } catch (e) {
      setError(e.message || 'Error sincronizando.');
      setPhase('idle');
    }
  }

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className={`bg-white rounded-xl border shadow-card overflow-hidden ${
      canRun ? 'border-brand-amber/40' : 'border-neutral-200 opacity-70'
    }`}>
      <div className="px-5 py-3 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-[12px] uppercase tracking-wider text-neutral-600 font-bold flex items-center gap-2">
            <span className="w-6 h-6 rounded-md bg-brand-ink text-brand-amber grid place-items-center text-[11px] font-extrabold">3</span>
            Sincronizar a Supabase
          </div>
          <div className="text-[11.5px] text-neutral-500 mt-0.5">
            {canRun
              ? 'Actualiza el faro directamente con el CSV cruzado — no hace falta pasar por /admin.'
              : 'Habilitado al completar el cruce del paso 2.'}
          </div>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {phase === 'syncing' && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[12.5px] text-brand-env">
              <Spinner /> Enviando chunk {progress.done}/{progress.total}…
            </div>
            <div className="w-full h-2 rounded-full bg-neutral-100 overflow-hidden">
              <div
                className="h-full bg-brand-amber transition-all duration-200"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}

        {error && (
          <div className="text-[12.5px] text-brand-fail bg-brand-failSoft border border-brand-fail/30 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {phase === 'done' && result && (
          <div className="rounded-lg border border-brand-pass/30 bg-brand-passSoft/40 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-full bg-brand-pass text-white grid place-items-center">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <div>
                <div className="text-[14px] font-bold text-brand-pass">Sincronización completada</div>
                <div className="text-[11.5px] text-neutral-600">
                  {result.upserted} OTs sincronizadas en {result.batches} chunks · el faro ya se actualizó.
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Metric label="Líneas leídas" value={result.total}    tone="neutral" />
              <Metric label="Válidas"       value={result.valid}    tone="env" />
              <Metric label="Upserted"      value={result.upserted} tone="pass" />
              <Metric label="Descartadas"   value={result.skipped}  tone={result.skipped > 0 ? 'warn' : 'neutral'} />
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <button
            onClick={syncNow}
            disabled={!canRun || phase === 'syncing'}
            className="px-4 py-2 rounded-lg bg-brand-ink text-brand-amber text-[13px] font-bold hover:bg-neutral-800 disabled:opacity-40 inline-flex items-center gap-2"
          >
            {phase === 'syncing' ? (
              <>
                <Spinner />
                Sincronizando…
              </>
            ) : phase === 'done' ? (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="1 4 1 10 7 10" />
                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                </svg>
                Volver a sincronizar
              </>
            ) : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="1 4 1 10 7 10" />
                  <polyline points="23 20 23 14 17 14" />
                  <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
                </svg>
                Actualizar base de datos
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── Sub-componentes UI ─────────────────────────────────────────────────
function FilePicker({ file, onPick, placeholder }) {
  const [dragging, setDragging] = useState(false);

  return (
    <label
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); onPick(e.dataTransfer.files?.[0]); }}
      className={`block cursor-pointer rounded-xl border-2 border-dashed p-4 text-center transition ${
        dragging
          ? 'border-brand-amber bg-brand-amberSoft/40'
          : file
            ? 'border-brand-pass/40 bg-brand-passSoft/30'
            : 'border-neutral-300 bg-neutral-50 hover:border-brand-amber hover:bg-brand-amberSoft/20'
      }`}
    >
      <input
        type="file"
        accept=".csv"
        onChange={(e) => onPick(e.target.files?.[0])}
        className="hidden"
      />
      {file ? (
        <div>
          <div className="text-[12.5px] font-bold text-brand-pass">{file.name}</div>
          <div className="text-[10.5px] text-neutral-500 mt-0.5">
            {(file.size / 1024).toFixed(1)} KB · click para cambiar
          </div>
        </div>
      ) : (
        <div>
          <svg className="w-6 h-6 text-neutral-400 mx-auto mb-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <div className="text-[12.5px] font-semibold text-neutral-600">{placeholder}</div>
          <div className="text-[10.5px] text-neutral-400 mt-0.5">Arrastrá o hacé click</div>
        </div>
      )}
    </label>
  );
}

function Metric({ label, value, tone = 'neutral' }) {
  const toneMap = {
    neutral: 'bg-white border-neutral-200 text-neutral-700',
    env:     'bg-brand-envSoft border-brand-env/20 text-brand-env',
    pass:    'bg-white border-brand-pass/30 text-brand-pass',
    warn:    'bg-brand-warnSoft border-brand-warn/20 text-amber-700',
  };
  return (
    <div className={`rounded-md border px-3 py-2 ${toneMap[tone] || toneMap.neutral}`}>
      <div className="text-[10px] uppercase tracking-wider font-bold opacity-80">{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/>
      <path d="M22 12a10 10 0 0 1-10 10"/>
    </svg>
  );
}