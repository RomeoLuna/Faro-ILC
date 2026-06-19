'use client';
// components/admin/SapSyncPanel.jsx
// =========================================================================
// SAP SYNC PANEL — Client Component (Sprint 12)
// -------------------------------------------------------------------------
// Tarjeta en /admin para subir el CSV semanal de IW37N (purgado por el
// script Pandas) y disparar la sincronización con la tabla sap_work_orders.
//
// Estados visuales:
//   • idle          → drop zone vacía
//   • file selected → preview del archivo + botón "Sincronizar ahora"
//   • saving        → spinner + texto "Procesando…"
//   • success       → resumen: total / válidos / upserted / descartados
//   • error         → mensaje rojo
//
// Reglas:
//   - Sólo acepta .csv (validación mime + extensión)
//   - Máx. 25 MB (mismo límite que la server action)
// =========================================================================

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { syncSapData } from '@/app/(app)/admin/sapActions';
import { usePinGate } from '@/components/security/PinGate';

export default function SapSyncPanel() {
  const router = useRouter();
  const fileInputRef = useRef(null);
  const { requestPin } = usePinGate(); // Sprint 21: PIN gate

  const [file, setFile]         = useState(null);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState(null);
  const [result, setResult]     = useState(null);

  // ── Validación local del archivo ─────────────────────────────────────
  function pickFile(f) {
    setResult(null);
    if (!f) { setFile(null); return; }
    const isCsv = f.type === 'text/csv'
      || f.type === 'application/vnd.ms-excel'
      || f.name.toLowerCase().endsWith('.csv');
    if (!isCsv)                     { setError('Sólo se aceptan archivos .csv'); setFile(null); return; }
    if (f.size > 25 * 1024 * 1024)  { setError('El CSV supera 25 MB.');           setFile(null); return; }
    setError(null);
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
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function onSubmit() {
    if (!file) { setError('Adjunta el CSV primero.'); return; }
    setError(null);
    setResult(null);

    // Sprint 21: PIN gate antes de cualquier escritura a Supabase.
    const authorized = await requestPin('Sincronizar IW37N');
    if (!authorized) {
      setError('Operación cancelada: PIN no proporcionado.');
      return;
    }

    const fd = new FormData();
    fd.append('csv_file', file);

    setSaving(true);
    const res = await syncSapData(fd);
    setSaving(false);

    if (!res.ok) {
      setError(res.error || 'Error al procesar el CSV.');
      return;
    }

    setResult(res);
    // Refrescar la página para que los cambios reflejen en futuros widgets
    router.refresh();
  }

  return (
    <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-card mb-6">
      {/* Header */}
      <div className="px-5 py-3 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-[12px] uppercase tracking-wider text-neutral-600 font-bold">
            Sincronización IW37N (SAP)
          </div>
          <div className="text-[11.5px] text-neutral-500 mt-0.5">
            Sube el CSV semanal generado por el script Pandas. El upsert hará
            match por <span className="font-mono">wo_number</span>.
          </div>
        </div>
        <span className="px-2 py-0.5 rounded-md bg-brand-amberSoft text-amber-700 text-[10.5px] font-bold uppercase tracking-wider">
          Admin only
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
            ${saving ? 'pointer-events-none opacity-60' : ''}`}
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
            disabled={saving}
            onChange={(e) => pickFile(e.target.files?.[0])}
            className="hidden"
          />
        </label>

        {/* Preview del archivo */}
        {file && !saving && !result && (
          <div className="flex items-center gap-3 p-3 rounded-lg border border-brand-amber/40 bg-brand-amberSoft/40">
            <div className="w-10 h-10 rounded-md bg-brand-amber/20 text-amber-700 grid place-items-center font-bold text-[11px]">
              CSV
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold truncate">{file.name}</div>
              <div className="text-[11.5px] text-neutral-500">{(file.size / 1024).toFixed(1)} KB · listo para sincronizar</div>
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

        {/* Estado de carga */}
        {saving && (
          <div className="flex items-center gap-3 p-3 rounded-lg border border-brand-env/30 bg-brand-envSoft/50">
            <svg className="w-5 h-5 text-brand-env animate-spin shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
              <path d="M22 12a10 10 0 0 1-10 10" />
            </svg>
            <div>
              <div className="text-[13px] font-semibold text-brand-env">Procesando CSV…</div>
              <div className="text-[11.5px] text-neutral-600">
                Parseando + validando + upsert por chunks. No cierres la ventana.
              </div>
            </div>
          </div>
        )}

        {/* Error global */}
        {error && (
          <div className="p-3 rounded-lg border border-brand-fail/30 bg-brand-failSoft text-brand-fail text-[12.5px]">
            <div className="font-semibold mb-0.5">No se pudo sincronizar</div>
            <div className="text-[12px] leading-snug">{error}</div>
          </div>
        )}

        {/* Resultado de éxito */}
        {result && (
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
                  {result.upserted} órdenes sincronizadas correctamente en {result.batches} chunk{result.batches === 1 ? '' : 's'}.
                </div>
              </div>
            </div>

            {/* Mini-stats del run */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
              <MetricMini label="Líneas leídas"   value={result.total} />
              <MetricMini label="Filas válidas"   value={result.valid}    tone="env" />
              <MetricMini label="Upserted"        value={result.upserted} tone="pass" />
              <MetricMini label="Descartadas"     value={result.skipped}  tone={result.skipped > 0 ? 'warn' : 'neutral'} />
            </div>

            {/* Listado de filas descartadas (primeras 20) */}
            {result.skipped > 0 && result.skipped_reasons?.length > 0 && (
              <div className="mt-3 border-t border-brand-pass/20 pt-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-700 mb-1">
                  Filas descartadas (primeras {result.skipped_reasons.length})
                </div>
                <ul className="text-[11.5px] text-neutral-600 space-y-0.5 font-mono">
                  {result.skipped_reasons.map((sk, i) => (
                    <li key={i}>
                      Línea {sk.line}: {sk.reason}
                    </li>
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