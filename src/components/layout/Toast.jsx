'use client';
// components/layout/Toast.jsx
// =========================================================================
// TOAST DE CONFIRMACIÓN — Corrección Sprint (Certificados)
// -------------------------------------------------------------------------
// Componente global montado una sola vez en app/(app)/layout.js.
// Cualquier parte de la app puede disparar un mensaje de confirmación así:
//
//   window.dispatchEvent(new CustomEvent('toast:success', {
//     detail: { message: 'Certificado guardado.' }
//   }));
//
// Se usa, por ejemplo, después de guardar una calibración interna o un
// certificado externo, para confirmar visualmente que la acción se guardó
// y que la lista de "pendientes" se está actualizando.
// =========================================================================

import { useEffect, useState } from 'react';

export default function Toast() {
  const [toast, setToast] = useState(null); // { message, tone } | null

  useEffect(() => {
    function handleSuccess(e) {
      setToast({ message: e.detail?.message || 'Listo.', tone: 'success' });
    }
    function handleError(e) {
      setToast({ message: e.detail?.message || 'Ocurrió un error.', tone: 'error' });
    }
    window.addEventListener('toast:success', handleSuccess);
    window.addEventListener('toast:error', handleError);
    return () => {
      window.removeEventListener('toast:success', handleSuccess);
      window.removeEventListener('toast:error', handleError);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast) return null;

  const tone = toast.tone === 'error'
    ? 'bg-brand-fail text-white'
    : 'bg-brand-pass text-white';

  return (
    <div className="fixed bottom-6 right-6 z-[100] animate-[fadeIn_0.2s_ease-out]">
      <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-pop ${tone}`}>
        <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          {toast.tone === 'error' ? (
            <>
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </>
          ) : (
            <polyline points="20 6 9 17 4 12" />
          )}
        </svg>
        <span className="text-[13px] font-semibold">{toast.message}</span>
      </div>
    </div>
  );
}
