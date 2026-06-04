'use client';
// components/faro/RowActions.jsx
// =========================================================================
// ROW ACTIONS — Client Component con role gate
// -------------------------------------------------------------------------
// Botones por fila:
//   - "Histórico"     → abre <HistoryModal /> (Sprint 7) — TODOS los roles
//   - "Calibrar"      → abre <CalibrationModal /> — admin/tecnico
//   - "Cert. externo" → abre <ExternalCertModal /> — admin/tecnico
//
// El botón Histórico es read-only (sólo consulta + re-descarga de PDFs),
// por eso lo ven incluso los viewers — necesitan poder auditar.
// =========================================================================

import { useCanSignCalibration } from '@/components/auth/UserProvider';

export default function RowActions({ position }) {
  const canSign = useCanSignCalibration();

  // Botón Histórico — siempre visible
  const historyButton = (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent('open:history', { detail: position }))}
      title="Ver historial de calibraciones"
      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-neutral-300 text-neutral-700 text-[11.5px] font-semibold hover:bg-neutral-50"
    >
      {/* Icono de reloj/historia */}
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
      Histórico
    </button>
  );

  if (!canSign) {
    return (
      <div className="flex justify-end gap-1.5">
        {historyButton}
      </div>
    );
  }

  return (
    <div className="flex justify-end gap-1.5">
      {historyButton}
      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent('open:calibration', { detail: position }))}
        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-brand-ink text-white text-[11.5px] font-semibold hover:bg-brand-steel"
      >
        Calibrar
      </button>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent('open:external-cert', { detail: position }))}
        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-brand-amber text-brand-ink text-[11.5px] font-semibold bg-brand-amberSoft hover:bg-brand-amber/30"
      >
        Cert. externo
      </button>
    </div>
  );
}