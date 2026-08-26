'use client';
// components/security/PinGate.jsx
// =========================================================================
// PIN GATE — Sprint 21 (auth zero, control client-side por PIN)
// -------------------------------------------------------------------------
// REEMPLAZA el sistema de autenticación de Supabase. NO hay usuarios. Para
// ejecutar acciones de escritura (subir CSV de SAP, registrar calibración,
// subir certificado externo), el componente protegido llama a
// `requestPin('Nombre de la acción')` y obtiene una Promise<boolean>.
//
// FLUJO:
//   1. Componente llama: const ok = await requestPin('Sincronizar IW37N');
//   2. Si el PIN ya fue validado en esta sesión → resuelve true sin modal.
//   3. Si no → abre modal, usuario teclea PIN.
//      • PIN correcto → marca sessionStorage, resuelve true.
//      • PIN incorrecto → muestra error, NO resuelve, deja intentar otra vez.
//      • Cancel → resuelve false.
//
// SCOPE DE LA AUTORIZACIÓN:
//   sessionStorage — vive mientras la pestaña esté abierta. Cerrar pestaña
//   o navegador exige re-entrar el PIN. No usamos localStorage para no
//   dejar la autorización pegada indefinidamente.
//
// ADVERTENCIA DE SEGURIDAD:
//   Este gate es UX, NO seguridad real. La anon key de Supabase está en
//   el bundle y cualquiera puede saltarse el gate haciendo HTTP directo.
//   Para una planta interna en red controlada es aceptable; para
//   exposición pública NO.
// =========================================================================

import { createContext, useContext, useState, useCallback, useRef } from 'react';

// ─── Configuración ──────────────────────────────────────────────────────
// El PIN está hardcodeado a propósito — la idea es que sea conocido por
// el equipo de Automatización. Si quieres rotarlo, cámbialo aquí y re-deploy.
const PIN_CODE = '150202';

// Clave en sessionStorage que indica "el usuario ya validó el PIN".
const PIN_GRANTED_KEY = '_faro_pin_granted';

// ─── Context ────────────────────────────────────────────────────────────
const PinGateContext = createContext(null);

export function usePinGate() {
  const ctx = useContext(PinGateContext);
  if (!ctx) {
    throw new Error('usePinGate debe usarse dentro de <PinGateProvider>');
  }
  return ctx;
}

// ─── Provider ───────────────────────────────────────────────────────────
export function PinGateProvider({ children }) {
  // Estado del modal: si null no se muestra.
  const [modal, setModal] = useState(null);
  // resolveRef guarda la función resolve de la Promise pendiente
  // para que el modal pueda resolverla cuando el usuario interactúa.
  const resolveRef = useRef(null);

  /**
   * requestPin('Acción a proteger') → Promise<boolean>
   *   true  = autorizado (PIN correcto o ya guardado en sesión)
   *   false = cancelado
   */
  const requestPin = useCallback((actionLabel = 'esta acción') => {
    // Cortocircuito: PIN ya validado en esta sesión.
    if (typeof window !== 'undefined' &&
        sessionStorage.getItem(PIN_GRANTED_KEY) === '1') {
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setModal({ actionLabel });
    });
  }, []);

  /** Limpia la autorización (útil para un botón "Bloquear sesión"). */
  const revokePin = useCallback(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(PIN_GRANTED_KEY);
    }
  }, []);

  /** Indica si el PIN ya fue ingresado en esta sesión. */
  const isGranted = useCallback(() => {
    return typeof window !== 'undefined' &&
           sessionStorage.getItem(PIN_GRANTED_KEY) === '1';
  }, []);

  // Callbacks del modal — el componente los recibe vía props.
  function handleCorrect() {
    sessionStorage.setItem(PIN_GRANTED_KEY, '1');
    resolveRef.current?.(true);
    resolveRef.current = null;
    setModal(null);
  }

  function handleCancel() {
    resolveRef.current?.(false);
    resolveRef.current = null;
    setModal(null);
  }

  return (
    <PinGateContext.Provider value={{ requestPin, revokePin, isGranted }}>
      {children}
      {modal && (
        <PinModal
          actionLabel={modal.actionLabel}
          onCorrect={handleCorrect}
          onCancel={handleCancel}
        />
      )}
    </PinGateContext.Provider>
  );
}

// ─── Modal interno ──────────────────────────────────────────────────────
function PinModal({ actionLabel, onCorrect, onCancel }) {
  const [value, setValue]     = useState('');
  const [error, setError]     = useState(null);
  const [attempts, setAttempts] = useState(0);

  function onSubmit(e) {
    e.preventDefault();
    if (value === PIN_CODE) {
      onCorrect();
    } else {
      setError('PIN incorrecto. Intenta de nuevo.');
      setAttempts((a) => a + 1);
      setValue('');
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pingate-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    >
      <div className="bg-white rounded-2xl shadow-pop w-full max-w-sm p-7 border-t-4 border-brand-amber">
        {/* Icono candado */}
        <div className="w-14 h-14 rounded-xl bg-brand-amber text-black grid place-items-center mx-auto mb-3">
          <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        </div>

        <h2 id="pingate-title" className="text-center text-lg font-bold">
          Autorización requerida
        </h2>
        <p className="text-center text-[12.5px] text-neutral-500 mt-1">
          Ingresa el PIN para <strong>{actionLabel}</strong>.
        </p>

        <form onSubmit={onSubmit} className="mt-5 space-y-3">
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            value={value}
            onChange={(e) => { setValue(e.target.value); setError(null); }}
            placeholder="••••••"
            maxLength={12}
            className="w-full border border-neutral-300 rounded-lg px-3 py-2.5 text-center text-lg font-mono tracking-[0.5em] focus:ring-2 focus:ring-brand-amber focus:border-brand-amber outline-none"
          />

          {error && (
            <div role="alert" aria-live="polite"
              className="text-[12.5px] text-brand-fail bg-brand-failSoft border border-brand-fail/30 rounded-md px-3 py-2 text-center"
            >
              {error}
              {attempts >= 3 && (
                <div className="text-[11px] mt-1 text-neutral-600">
                  Contacta a Automatización si olvidaste el PIN.
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-2.5 rounded-lg border border-neutral-300 text-[13px] font-semibold text-neutral-700 hover:bg-neutral-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-lg bg-brand-ink text-white font-bold text-[13px] hover:bg-brand-steel"
            >
              Validar
            </button>
          </div>
        </form>

        <p className="text-center text-[11px] text-neutral-400 mt-4">
          La autorización dura mientras esta pestaña esté abierta.
        </p>
      </div>
    </div>
  );
}