'use client';
// components/cronograma/UnsavedChangesBar.jsx
// =========================================================================
// UNSAVED CHANGES BAR — Sprint 22
// -------------------------------------------------------------------------
// Sticky en la parte superior del cronograma. Muestra:
//   • Cuántos cambios sin guardar
//   • Botón "Guardar" → dispara PIN gate
//   • Botón "Descartar" → limpia patches locales
//   • Estado de saving / error / "guardado hace X seg"
// =========================================================================

import { useEffect, useState } from 'react';

export default function UnsavedChangesBar({ count, saving, error, savedAt, onFlush, onDiscard }) {
  // "guardado hace 5s" — actualiza cada segundo cuando hay savedAt
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!savedAt) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [savedAt]);

  // Error visible
  if (error) {
    return (
      <div className="mb-4 bg-brand-failSoft border border-brand-fail/30 rounded-xl px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
        <span className="text-[13px] text-brand-fail font-semibold">{error}</span>
        {count > 0 && (
          <button
            onClick={onFlush}
            className="px-3 py-1.5 rounded-lg bg-brand-fail text-white text-[12px] font-bold hover:opacity-90"
          >
            Reintentar
          </button>
        )}
      </div>
    );
  }

  // Sin cambios pendientes → indicador "guardado" o nada
  if (!count) {
    if (!savedAt) return null;
    const secondsAgo = Math.floor((Date.now() - savedAt.getTime()) / 1000);
    if (secondsAgo > 30) return null;
    return (
      <div className="mb-4 bg-brand-passSoft/40 border border-brand-pass/30 rounded-xl px-5 py-2 inline-flex items-center gap-2 text-[12px] text-brand-pass font-semibold">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        Cambios guardados {secondsAgo === 0 ? 'ahora' : `hace ${secondsAgo}s`}
      </div>
    );
  }

  // Hay cambios pendientes
  return (
    <div className="sticky top-0 z-10 mb-4 bg-brand-amber border border-brand-amberHover rounded-xl px-5 py-3 flex items-center justify-between gap-3 flex-wrap shadow-card">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-md bg-brand-ink text-brand-amber grid place-items-center font-bold text-sm shrink-0">
          {count}
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-bold text-brand-ink">
            {count} {count === 1 ? 'cambio sin guardar' : 'cambios sin guardar'}
          </div>
          <div className="text-[11.5px] text-brand-ink/70">
            Te pediremos el PIN al guardar.
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onDiscard}
          disabled={saving}
          className="px-3 py-1.5 rounded-lg border border-brand-ink/30 text-[12px] font-semibold text-brand-ink hover:bg-white/30 disabled:opacity-50"
        >
          Descartar
        </button>
        <button
          type="button"
          onClick={onFlush}
          disabled={saving}
          className="px-4 py-1.5 rounded-lg bg-brand-ink text-white text-[12px] font-bold hover:bg-brand-steel disabled:opacity-60 inline-flex items-center gap-2"
        >
          {saving ? (
            <>
              <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                <path d="M22 12a10 10 0 0 1-10 10" />
              </svg>
              Guardando…
            </>
          ) : (
            <>Guardar {count}</>
          )}
        </button>
      </div>
    </div>
  );
}