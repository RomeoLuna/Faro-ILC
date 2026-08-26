'use client';
// components/admin/RoleSelector.jsx
// =========================================================================
// ROLE SELECTOR — Client Component (Sprint 10)
// -------------------------------------------------------------------------
// Select reactivo para cambiar el rol de un usuario desde el panel admin.
//
// Estados visuales:
//   • idle    → bordes neutros
//   • saving  → spinner + select disabled
//   • saved   → checkmark verde (2 s) → vuelve a idle
//   • error   → mensaje inline rojo + select revierte al valor anterior
//
// Props:
//   - userId       (string)  UUID del profile a actualizar
//   - currentRole  (string)  'viewer' | 'tecnico' | 'admin'
//   - isSelf       (bool)    true si la fila es la del admin logueado.
//                            En ese caso bloqueamos cambios para evitar
//                            auto-degradación (también validado server-side).
// =========================================================================

import { useState, useTransition } from 'react';
import { updateUserRole } from '@/app/(app)/admin/actions';

const ROLE_OPTIONS = [
  { value: 'viewer',  label: 'Viewer' },
  { value: 'tecnico', label: 'Técnico' },
  { value: 'admin',   label: 'Admin' },
];

export default function RoleSelector({ userId, currentRole, isSelf = false }) {
  const [role, setRole]       = useState(currentRole);
  const [status, setStatus]   = useState('idle');     // 'idle' | 'saving' | 'saved' | 'error'
  const [error, setError]     = useState(null);
  const [pending, startTrans] = useTransition();

  async function handleChange(e) {
    const newRole = e.target.value;
    if (newRole === role) return;

    const prevRole = role;
    setRole(newRole);
    setStatus('saving');
    setError(null);

    startTrans(async () => {
      const res = await updateUserRole(userId, newRole);
      if (res.ok) {
        setStatus('saved');
        // Volver a 'idle' después de 2 s
        setTimeout(() => setStatus('idle'), 2000);
      } else {
        setStatus('error');
        setError(res.error || 'No se pudo guardar el rol.');
        // Revertir el valor del select al anterior
        setRole(prevRole);
        // Quitar el banner de error después de 4 s
        setTimeout(() => { setStatus('idle'); setError(null); }, 4000);
      }
    });
  }

  // Estilo del borde según estado
  const borderClass =
    status === 'saving' ? 'border-brand-env focus:ring-brand-env/30'
    : status === 'saved' ? 'border-brand-pass focus:ring-brand-pass/30'
    : status === 'error' ? 'border-brand-fail focus:ring-brand-fail/30'
    : 'border-neutral-300 focus:ring-brand-amber/30 focus:border-brand-amber';

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <select
          value={role}
          onChange={handleChange}
          disabled={isSelf || pending}
          title={isSelf ? 'No puedes cambiar tu propio rol' : 'Cambiar rol del usuario'}
          className={`text-[12.5px] font-semibold rounded-md border-2 px-2 py-1 bg-white focus:outline-none focus:ring-2 disabled:bg-neutral-100 disabled:cursor-not-allowed ${borderClass}`}
        >
          {ROLE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Feedback visual a la derecha del select */}
        {status === 'saving' && (
          <svg className="w-4 h-4 text-brand-env animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
            <path d="M22 12a10 10 0 0 1-10 10" />
          </svg>
        )}
        {status === 'saved' && (
          <svg className="w-4 h-4 text-brand-pass" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
        {status === 'error' && (
          <svg className="w-4 h-4 text-brand-fail" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        )}

        {isSelf && (
          <span className="text-[10.5px] text-neutral-500 italic">tú</span>
        )}
      </div>

      {/* Mensaje de error (debajo) */}
      {status === 'error' && error && (
        <span className="text-[10.5px] text-brand-fail max-w-[200px] leading-tight">
          {error}
        </span>
      )}
    </div>
  );
}