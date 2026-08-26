'use client';
// components/auth/UserProvider.jsx
// =========================================================================
// USER PROVIDER STUB — Sprint 21 (auth-free)
// -------------------------------------------------------------------------
// Reemplaza el provider real de Supabase. createContext recibe MOCK_OPERATOR
// como DEFAULT VALUE: cualquier useUser() llamado fuera de un Provider
// retorna el operador mock sin crashear — exactamente lo que necesitamos
// porque (app)/layout.js ya no envuelve con UserProvider.
//
// useUser()                  → { user, profile } del operador mock
// useCanSignCalibration()    → true  (el PIN es el gate real)
// useHasRole(...)            → true  (los roles ya no aplican)
//
// MISMA API que el provider real — los 5 archivos que lo importan
// (Sidebar, TopNavigation, CalibrationModal, ExternalCertModal,
// RowActions) siguen funcionando sin tocarlos.
// =========================================================================

import { createContext, useContext } from 'react';
import { MOCK_OPERATOR } from '@/lib/auth';

// DEFAULT VALUE = MOCK_OPERATOR → useContext sin provider devuelve el mock.
const UserContext = createContext(MOCK_OPERATOR);

export function UserProvider({ value, children }) {
  // Si alguien aún pasa value={session}, lo respetamos. Si value es null
  // o undefined, caemos al mock. Así nunca dejamos el ctx en null.
  return (
    <UserContext.Provider value={value || MOCK_OPERATOR}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}

/** Sprint 21: el gate real es el PIN, no el rol → siempre true. */
export function useCanSignCalibration() {
  return true;
}

/** Sprint 21: roles obsoletos → siempre true. */
export function useHasRole(..._allowed) {
  return true;
}