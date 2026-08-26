'use client';
// components/faro/RowActions.jsx
// =========================================================================
// ROW ACTIONS — Client Component (NO AUTH - PIN GATE)
// -------------------------------------------------------------------------
// Botones por fila:
//   - "Histórico"     → abre <HistoryModal />
//   - "Calibrar"      → abre <CalibrationModal /> (Protegido por PIN interno)
//   - "Cert. externo" → abre <ExternalCertModal /> (Protegido por PIN interno)
// =========================================================================

export default function RowActions({ position }) {
  // En este nuevo modelo sin roles, todos los botones son visibles.
  // El bloqueo se realiza vía PIN Gate al intentar guardar.

  return (
    <div className="flex justify-end gap-1.5">
      {/* Botón Histórico */}
      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent('open:history', { detail: position }))}
        title="Ver historial de calibraciones"
        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-neutral-300 text-neutral-700 text-[11.5px] font-semibold hover:bg-neutral-50"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        Histórico
      </button>

      {/* Botón Calibrar */}
      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent('open:calibration', { detail: position }))}
        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-brand-ink text-white text-[11.5px] font-semibold hover:bg-brand-steel"
      >
        Calibrar
      </button>

      {/* Botón Certificado Externo */}
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