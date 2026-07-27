'use client';
// components/herramientas/CsvToolsClient.jsx
// =========================================================================
// CSV TOOLS — Client Component (Sprint 45)
// -------------------------------------------------------------------------
// Herramientas migradas de los notebooks de Google Colab:
//   1. PurgadorIW37N — deja solo las últimas 2 OTs + última NOTI por POS
//   2. FusionIP24    — cruce por Orden que agrega Fe.planif. y Fecha cierre
//
// Todo corre en el browser. Zero llamadas al server. Los archivos nunca
// salen de la computadora del usuario.
// =========================================================================

import { useState } from 'react';
import { parseCsv, cleanIsoDate } from '@/lib/sapSync';

// ─── Helpers CSV ────────────────────────────────────────────────────────
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
  // BOM para que Excel lo abra bien en UTF-8
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

// Convierte { headers, rows[[]] } → array de objetos {header: value}
function rowsToObjects(headers, rows) {
  return rows.map((r) => {
    const o = {};
    headers.forEach((h, i) => { o[h] = r[i]; });
    return o;
  });
}

// Convierte array de objetos → rows[[]]  (respetando el orden de headers)
function objectsToRows(headers, objects) {
  return objects.map((o) => headers.map((h) => o[h] ?? ''));
}


// ─── Componente principal ───────────────────────────────────────────────
export default function CsvToolsClient() {
  return (
    <div className="space-y-6">
      <PurgadorIW37N />
      <FusionIP24 />

      <div className="rounded-lg bg-brand-envSoft/40 border border-brand-env/30 p-4 text-[12.5px] text-neutral-700">
        <div className="flex items-start gap-2.5">
          <svg className="w-5 h-5 text-brand-env mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <div>
            <strong>Privacidad total.</strong> Los CSVs se procesan en la memoria de este navegador.
            Nada se sube a Supabase, Netlify ni a ningún servidor externo.
            Al cerrar la pestaña todo desaparece.
          </div>
        </div>
      </div>
    </div>
  );
}


// ═════════════════════════════════════════════════════════════════════════
// HERRAMIENTA 1 — PURGADOR IW37N
// ═════════════════════════════════════════════════════════════════════════
function PurgadorIW37N() {
  const [file, setFile]       = useState(null);
  const [phase, setPhase]     = useState('idle');   // 'idle' | 'processing' | 'done'
  const [error, setError]     = useState(null);
  const [result, setResult]   = useState(null);

  function pickFile(f) {
    setError(null);
    setResult(null);
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
      const { headers, rows } = parseCsv(text);
      if (rows.length === 0) throw new Error('El CSV no contiene filas.');

      // Verificar columnas requeridas
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

      // Agrupar por Pos.mantenim.
      const byPos = new Map();
      for (const r of rows) {
        const pos = (r[posIdx] || '').trim();
        if (!pos) continue;
        if (!byPos.has(pos)) byPos.set(pos, []);
        byPos.get(pos).push(r);
      }

      // Aplicar lógica de purga por POS
      const purgedRows = [];
      for (const [, group] of byPos) {
        // Ordenar por fecha desc (más reciente primero)
        // cleanIsoDate devuelve YYYY-MM-DD que ordena bien alfabéticamente
        const withDates = group.map((r) => ({
          row: r,
          iso: cleanIsoDate(r[fechaIdx]) || '0000-00-00',
        }));
        withDates.sort((a, b) => b.iso.localeCompare(a.iso));

        // Top 2 más recientes
        const top2 = withDates.slice(0, 2);
        const top2Orden = new Set(top2.map((x) => x.row[ordIdx]));

        // Buscar OTs NOTI (todas las que tengan NOTI en status)
        const notis = withDates.filter((x) =>
          (x.row[statusIdx] || '').toUpperCase().includes('NOTI')
        );

        let out = top2;
        if (notis.length > 0) {
          // La primera es la más reciente (por el sort)
          const ultimaNoti = notis[0];
          // Si esa OT ya está en top2, no la agregamos otra vez
          if (!top2Orden.has(ultimaNoti.row[ordIdx])) {
            out = [...top2, ultimaNoti];
          }
        }
        purgedRows.push(...out.map((x) => x.row));
      }

      // Orden final: Pos.mantenim. asc, Fe.inic.extrema desc
      purgedRows.sort((a, b) => {
        const posCmp = String(a[posIdx] || '').localeCompare(String(b[posIdx] || ''));
        if (posCmp !== 0) return posCmp;
        const dA = cleanIsoDate(a[fechaIdx]) || '0000-00-00';
        const dB = cleanIsoDate(b[fechaIdx]) || '0000-00-00';
        return dB.localeCompare(dA);
      });

      const csv = rowsToCsv(headers, purgedRows);
      const stamp = new Date().toISOString().slice(0, 10);
      const filename = `IW37N_Purgado_Con_NOTI_${stamp}.csv`;
      downloadCsv(csv, filename);

      setResult({
        totalIn:  rows.length,
        totalOut: purgedRows.length,
        posCount: byPos.size,
        filename,
      });
      setPhase('done');
    } catch (e) {
      setError(e.message || 'Error procesando el CSV.');
      setPhase('idle');
    }
  }

  function reset() {
    setFile(null);
    setResult(null);
    setError(null);
    setPhase('idle');
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
            Deja solo las últimas 2 OTs por POS + la última NOTI si no estaba entre las 2.
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
                  Descargado como <strong>{result.filename}</strong>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Metric label="Filas leídas"  value={result.totalIn}  tone="env" />
              <Metric label="POS únicas"    value={result.posCount} tone="neutral" />
              <Metric label="Filas purgadas" value={result.totalOut} tone="pass" />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          {phase === 'done' && (
            <button
              onClick={reset}
              className="px-4 py-2 rounded-lg border border-neutral-300 text-[13px] font-semibold hover:bg-neutral-100"
            >
              Procesar otro
            </button>
          )}
          <button
            onClick={process}
            disabled={!file || phase === 'processing'}
            className="px-4 py-2 rounded-lg bg-brand-amber text-black text-[13px] font-bold hover:bg-brand-amberHover disabled:opacity-60 inline-flex items-center gap-2"
          >
            {phase === 'processing' ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/>
                  <path d="M22 12a10 10 0 0 1-10 10"/>
                </svg>
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
// HERRAMIENTA 2 — FUSIÓN CON IP24
// ═════════════════════════════════════════════════════════════════════════
function FusionIP24() {
  const [mainFile, setMainFile] = useState(null);
  const [ip24File, setIp24File] = useState(null);
  const [phase, setPhase]       = useState('idle');
  const [error, setError]       = useState(null);
  const [result, setResult]     = useState(null);

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
    if (!mainFile) { setError('Adjunta la base principal.'); return; }
    if (!ip24File) { setError('Adjunta el archivo IP24.'); return; }

    setError(null);
    setPhase('processing');

    try {
      // 1) Leer main
      const mainText = await mainFile.text();
      const parsedMain = parseCsv(mainText);
      if (!parsedMain.headers.includes('Orden')) {
        throw new Error('El CSV principal no tiene la columna "Orden".');
      }
      const mainObjs = rowsToObjects(parsedMain.headers, parsedMain.rows);

      // 2) Leer IP24
      const ip24Text = await ip24File.text();
      const parsedIp24 = parseCsv(ip24Text);
      for (const col of ['Orden', 'Fe.planif.', 'Fecha de cierre']) {
        if (!parsedIp24.headers.includes(col)) {
          throw new Error(`El CSV IP24 no tiene la columna "${col}".`);
        }
      }

      const ip24Objs = rowsToObjects(parsedIp24.headers, parsedIp24.rows);

      // 3) Dedupe IP24 por Orden (nos quedamos con la primera aparición)
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

      // 4) LEFT JOIN — agregar las 2 columnas al main
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

      // 5) Headers finales: los del main + los 2 nuevos (si no estaban)
      const finalHeaders = [...parsedMain.headers];
      if (!finalHeaders.includes('Fe.planif.'))       finalHeaders.push('Fe.planif.');
      if (!finalHeaders.includes('Fecha de cierre'))  finalHeaders.push('Fecha de cierre');

      const finalRows = objectsToRows(finalHeaders, finalObjs);
      const csv = rowsToCsv(finalHeaders, finalRows);

      const stamp = new Date().toISOString().slice(0, 10);
      const filename = `BD_SAP_Cruzada_Final_${stamp}.csv`;
      downloadCsv(csv, filename);

      setResult({
        totalMain:     mainObjs.length,
        totalIp24:     ip24Objs.length,
        ip24Unique:    ip24ByOrden.size,
        matched,
        unmatched:     mainObjs.length - matched,
        finalColumns:  finalHeaders.length,
        filename,
      });
      setPhase('done');
    } catch (e) {
      setError(e.message || 'Error cruzando los CSVs.');
      setPhase('idle');
    }
  }

  function reset() {
    setMainFile(null);
    setIp24File(null);
    setResult(null);
    setError(null);
    setPhase('idle');
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
            Cruza tu base principal con IP24 (por columna <span className="font-mono">Orden</span>) y agrega Fe.planif. + Fecha de cierre.
          </div>
        </div>
      </div>

      <div className="p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-neutral-600 mb-1">
              Paso 1: base principal (purgada)
            </div>
            <FilePicker file={mainFile} onPick={pickMain} placeholder="IW37N_Purgado_Con_NOTI.csv" />
          </div>
          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-neutral-600 mb-1">
              Paso 2: archivo IP24
            </div>
            <FilePicker file={ip24File} onPick={pickIp24} placeholder="IP24 1 de junio.csv" />
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
                  Descargado como <strong>{result.filename}</strong>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Metric label="Filas base"        value={result.totalMain}    tone="env" />
              <Metric label="IP24 únicas"       value={result.ip24Unique}   tone="neutral" />
              <Metric label="OTs matched"       value={result.matched}      tone="pass" />
              <Metric label="Sin match IP24"    value={result.unmatched}    tone={result.unmatched > 0 ? 'warn' : 'neutral'} />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          {phase === 'done' && (
            <button
              onClick={reset}
              className="px-4 py-2 rounded-lg border border-neutral-300 text-[13px] font-semibold hover:bg-neutral-100"
            >
              Procesar otro
            </button>
          )}
          <button
            onClick={process}
            disabled={!mainFile || !ip24File || phase === 'processing'}
            className="px-4 py-2 rounded-lg bg-brand-amber text-black text-[13px] font-bold hover:bg-brand-amberHover disabled:opacity-60 inline-flex items-center gap-2"
          >
            {phase === 'processing' ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/>
                  <path d="M22 12a10 10 0 0 1-10 10"/>
                </svg>
                Cruzando…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3" />
                  <polyline points="17 8 22 3 17 -2" style={{ display: 'none' }} />
                  <line x1="8" y1="12" x2="20" y2="12" />
                  <polyline points="16 8 20 12 16 16" />
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


// ─── Sub-componentes ────────────────────────────────────────────────────
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