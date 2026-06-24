'use client';
// components/admin/SapSyncPanel.jsx
// =========================================================================
// SAP SYNC PANEL — Sprint 25 (client-side, sin timeout de Netlify)
// -------------------------------------------------------------------------
// CAUSA RAÍZ DEL HANG INFINITO:
//   El Server Action `syncSapData` corría en Netlify Functions con timeout
//   de 26s. Un CSV de IW37N con >10k filas (incluso con chunks de 500
//   internos) suma >26s en la misma request → Netlify mata el proceso →
//   el frontend nunca recibe respuesta → spinner infinito.
//
// FIX:
//   • Parser CSV y validación corren en el browser (lib/sapSync.js).
//   • Upsert por chunks de 500 con createSupabaseBrowserClient(), una
//     request HTTP por chunk → cada request es < 5s → cero timeout.
//   • PIN gate como en el resto del proyecto.
//   • Barra de progreso visible chunk a chunk.
//   • Si un chunk falla, reportamos cuántas filas se sincronizaron antes
//     de la falla (recuperación informada).
//
// La vista `ot_cronograma_view` NO afecta esto: una view normal (no
// materialized) es transparente para los INSERT/UPSERT en sap_work_orders.
// Lo verificado:
//   • Sin triggers nuevos en sap_work_orders.
//   • Sin foreign keys que apunten a sap_work_orders.
//   • Sin constraints que consulten la view.
// =========================================================================

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { usePinGate } from '@/components/security/PinGate';
import {
  CHUNK_SIZE,
  parseCsv,
  validateAndMap,
  dedupeByWoNumber,
} from '@/lib/sapSync';

export default function SapSyncPanel() {
  const router = useRouter();
  const fileInputRef = useRef(null);
  const { requestPin } = usePinGate();

  const [file, setFile]         = useState(null);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase]       = useState('idle');       // 'idle'|'parsing'|'syncing'|'done'
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError]       = useState(null);
  const [result, setResult]     = useState(null);

  // ── Validación local del archivo ─────────────────────────────────────
  function pickFile(f) {
    setResult(null);
    setError(null);
    if (!f) { setFile(null); return; }
    const isCsv = f.type === 'text/csv'
      || f.type === 'application/vnd.ms-excel'
      || f.name.toLowerCase().endsWith('.csv');
    if (!isCsv)                     { setError('Sólo se aceptan archivos .csv'); setFile(null); return; }
    if (f.size > 25 * 1024 * 1024)  { setError('El CSV supera 25 MB.');           setFile(null); return; }
    setFile(f);
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    pickFile(e.dataTransfer.files?.[0]);
  }

  function clearFile() {
    setFile(null);
    setResult(null);
    setError(null);
    setPhase('idle');
    setProgress({ done: 0, total: 0 });
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // ── Submit principal — TODO en cliente ───────────────────────────────
  async function onSubmit() {
    if (!file) { setError('Adjunta el CSV primero.'); return; }
    setError(null);
    setResult(null);

    // PIN antes de empezar
    const authorized = await requestPin('Sincronizar IW37N');
    if (!authorized) {
      setError('Operación cancelada: PIN no proporcionado.');
      return;
    }

    // ── 1) Leer + parsear (browser) ────────────────────────────────────
    setPhase('parsing');
    setProgress({ done: 0, total: 0 });

    let text;
    try {
      text = await file.text();
    } catch (e) {
      setError(`No se pudo leer el archivo: ${e.message}`);
      setPhase('idle');
      return;
    }

    const { headers, rows } = parseCsv(text);
    if (rows.length === 0) {
      setError('El CSV no contiene filas de datos.');
      setPhase('idle');
      return;
    }

    // ── 2) Validar + mapear ────────────────────────────────────────────
    const mapped = validateAndMap(rows, headers);
    if (mapped.error) {
      setError(mapped.error);
      setPhase('idle');
      return;
    }
    const { valid, skipped_reasons } = mapped;
    const deduped = dedupeByWoNumber(valid);

    if (deduped.length === 0) {
      setError('No hay filas válidas para sincronizar.');
      setPhase('idle');
      return;
    }

    // ── 3) Upsert por chunks contra Supabase (anon) ────────────────────
    setPhase('syncing');
    const supabase    = createSupabaseBrowserClient();
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
        // Reporte parcial — útil para reintento manual
        setError(
          `Error en chunk ${chunkIdx}/${totalChunks} ` +
          `(filas ${i + 1}-${i + chunk.length}): ${dbErr.message}. ` +
          `Se alcanzaron a sincronizar ${upserted} filas antes de la falla.`
        );
        setResult({
          total:   rows.length,
          valid:   valid.length,
          upserted,
          skipped: skipped_reasons.length,
          skipped_reasons: skipped_reasons.slice(0, 20),
          batches: chunkIdx - 1,
          partialFailure: true,
        });
        setPhase('idle');
        return;
      }

      upserted += chunk.length;
      setProgress({ done: chunkIdx, total: totalChunks });

      // Yield al event loop para que el UI repinte sin lag.
      await new Promise((r) => setTimeout(r, 0));
    }

    // ── 4) Éxito ────────────────────────────────────────────────────────
    setResult({
      total:   rows.length,
      valid:   valid.length,
      upserted,
      skipped: skipped_reasons.length,
      skipped_reasons: skipped_reasons.slice(0, 20),
      batches: totalChunks,
    });
    setPhase('done');

    // Refrescar páginas server-rendered para que los nuevos datos se vean
    router.refresh();
  }

  const isBusy = phase === 'parsing' || phase === 'syncing';
  const pct    = progress.total > 0
    ? Math.round((progress.done / progress.total) * 100)
    : 0;

  return (
    <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-card mb-6">
      {/* Header */}
      <div className="px-5 py-3 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-[12px] uppercase tracking-wider text-neutral-600 font-bold">
            Sincronización IW37N (SAP)
          </div>
          <div className="text-[11.5px] text-neutral-500 mt-0.5">
            Sube el CSV semanal. El upsert hará match por{' '}
            <span className="font-mono">wo_number</span>. Procesado en el navegador en chunks de {CHUNK_SIZE}.
          </div>
        </div>
        <span className="px-2 py-0.5 rounded-md bg-brand-amberSoft text-amber-700 text-[10.5px] font-bold uppercase tracking-wider">
          PIN-gated
        </span>
      </div>

      <div className="p-5 space-y-4">

        {/* Drag & drop / picker */}
        <label
          htmlFor="sap-csv-file"
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`block border-2 border-dashed rounded-xl p-6 text-center transition cursor-pointer
            ${dragging
              ? 'border-brand-amber bg-brand-amberSoft/40'
              : 'border-neutral-300 bg-neutral-50 hover:border-brand-amber hover:bg-brand-amberSoft/30'}
            ${isBusy ? 'pointer-events-none opacity-60' : ''}`}
        >
          <svg className="w-10 h-10 mx-auto text-brand-amber" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="9"  y1="15" x2="15" y2="15"/>
            <line x1="9"  y1="12" x2="15" y2="12"/>
            <line x1="9"  y1="18" x2="15" y2="18"/>
          </svg>
          <div className="mt-2 text-[14px] font-semibold text-neutral-800">
            {dragging ? 'Suelta el CSV aquí' : 'Arrastra el CSV de IW37N o haz clic para seleccionar'}
          </div>
          <div className="text-[12px] text-neutral-500 mt-1">
            Sólo archivos .csv · máx. 25 MB
          </div>
          <input
            ref={fileInputRef}
            id="sap-csv-file"
            type="file"
            accept=".csv,text/csv"
            disabled={isBusy}
            onChange={(e) => pickFile(e.target.files?.[0])}
            className="hidden"
          />
        </label>

        {/* Preview del archivo */}
        {file && !isBusy && !result && (
          <div className="flex items-center gap-3 p-3 rounded-lg border border-brand-amber/40 bg-brand-amberSoft/40">
            <div className="w-10 h-10 rounded-md bg-brand-amber/20 text-amber-700 grid place-items-center font-bold text-[11px]">
              CSV
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold truncate">{file.name}</div>
              <div className="text-[11.5px] text-neutral-500">
                {(file.size / 1024).toFixed(1)} KB · listo para sincronizar
              </div>
            </div>
            <button
              type="button"
              onClick={clearFile}
              className="text-[11.5px] text-neutral-500 hover:text-brand-fail px-2 py-1 rounded-md hover:bg-neutral-200"
            >
              Quitar
            </button>
            <button
              type="button"
              onClick={onSubmit}
              className="ml-1 px-3 py-1.5 rounded-md bg-brand-amber text-black text-[12px] font-bold hover:bg-brand-amberHover inline-flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Sincronizar ahora
            </button>
          </div>
        )}

        {/* Estado de carga + barra de progreso */}
        {phase === 'parsing' && (
          <div className="flex items-center gap-3 p-3 rounded-lg border border-brand-env/30 bg-brand-envSoft/50">
            <svg className="w-5 h-5 text-brand-env animate-spin shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
              <path d="M22 12a10 10 0 0 1-10 10" />
            </svg>
            <div>
              <div className="text-[13px] font-semibold text-brand-env">Parseando CSV…</div>
              <div className="text-[11.5px] text-neutral-600">
                Validando columnas y filas en el navegador.
              </div>
            </div>
          </div>
        )}

        {phase === 'syncing' && (
          <div className="p-4 rounded-lg border border-brand-env/30 bg-brand-envSoft/40 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-brand-env animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                  <path d="M22 12a10 10 0 0 1-10 10" />
                </svg>
                <span className="text-[13px] font-semibold text-brand-env">
                  Sincronizando chunk {progress.done}/{progress.total}
                </span>
              </div>
              <span className="text-[12px] font-mono font-bold text-brand-env">{pct}%</span>
            </div>
            {/* Barra de progreso */}
            <div className="w-full h-2 bg-white rounded-full overflow-hidden border border-brand-env/20">
              <div
                className="h-full bg-brand-env transition-all duration-200"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="text-[10.5px] text-neutral-600">
              No cierres esta ventana. Cada chunk son {CHUNK_SIZE} filas.
            </div>
          </div>
        )}

        {/* Error global */}
        {error && (
          <div className="p-3 rounded-lg border border-brand-fail/30 bg-brand-failSoft text-brand-fail text-[12.5px]">
            <div className="font-semibold mb-0.5">
              {result?.partialFailure ? 'Sincronización parcial' : 'No se pudo sincronizar'}
            </div>
            <div className="text-[12px] leading-snug">{error}</div>
          </div>
        )}

        {/* Resultado de éxito */}
        {result && phase === 'done' && (
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
                  {result.upserted} órdenes sincronizadas en {result.batches} chunk{result.batches === 1 ? '' : 's'}.
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
              <MetricMini label="Líneas leídas"   value={result.total} />
              <MetricMini label="Filas válidas"   value={result.valid}    tone="env" />
              <MetricMini label="Upserted"        value={result.upserted} tone="pass" />
              <MetricMini label="Descartadas"     value={result.skipped}  tone={result.skipped > 0 ? 'warn' : 'neutral'} />
            </div>

            {result.skipped > 0 && result.skipped_reasons?.length > 0 && (
              <div className="mt-3 border-t border-brand-pass/20 pt-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-700 mb-1">
                  Filas descartadas (primeras {result.skipped_reasons.length})
                </div>
                <ul className="text-[11.5px] text-neutral-600 space-y-0.5 font-mono">
                  {result.skipped_reasons.map((sk, i) => (
                    <li key={i}>Línea {sk.line}: {sk.reason}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={clearFile}
                className="px-3 py-1.5 rounded-md border border-neutral-300 text-[12px] font-semibold hover:bg-neutral-50"
              >
                Subir otro archivo
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ─── Sub-componente: mini-stat tile ─────────────────────────────────────
function MetricMini({ label, value, tone = 'neutral' }) {
  const toneMap = {
    neutral: 'bg-white border-neutral-200 text-neutral-700',
    env:     'bg-brand-envSoft border-brand-env/20 text-brand-env',
    pass:    'bg-brand-passSoft border-brand-pass/20 text-brand-pass',
    warn:    'bg-brand-warnSoft border-brand-warn/20 text-amber-700',
  };
  return (
    <div className={`rounded-md border px-3 py-2 ${toneMap[tone] || toneMap.neutral}`}>
      <div className="text-[10px] uppercase tracking-wider font-bold opacity-80">{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}