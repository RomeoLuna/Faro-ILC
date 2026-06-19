// lib/auth.js
// =========================================================================
// AUTH STUBS — Sprint 21 (auth-free, controlado por PIN client-side)
// -------------------------------------------------------------------------
// REEMPLAZA toda la lógica de Supabase Auth. La planta accede sin login;
// las escrituras se gatean con PIN en el cliente (ver PinGate.jsx).
//
// ¿Por qué stubs y no eliminar el archivo?
//   • Hay 9 archivos que aún importan estas funciones (admin/page,
//     admin/actions, sapActions, modals/actions, etc.). Borrarlas
//     forzaría tocar TODOS para deployar, gastando deploys.
//   • Stubs con la misma firma → cero cambios en call sites → 1 deploy.
//
// El "operador" mock tiene rol = 'admin' para que cualquier UI gated por
// role no oculte botones. El control de escritura real es el PIN.
// =========================================================================

/**
 * Sesión mock — todos los Server Components y Server Actions reciben
 * este objeto en vez de pasar por Supabase Auth.
 */
export const MOCK_OPERATOR = {
  user: {
    id:    'public-operator',
    email: 'operador@faro.local',
  },
  profile: {
    id:         'public-operator',
    email:      'operador@faro.local',
    full_name:  'Operador',
    role:       'admin',   // admin para que ninguna UI oculte botones
    area_scope: null,
    active:     true,
  },
};

/**
 * Reemplaza la lectura real desde Supabase. Siempre devuelve el operador
 * público — la app no tiene noción de usuario individual ya.
 */
export async function getCurrentUserWithProfile() {
  return MOCK_OPERATOR;
}

/** Útil para call sites que solo necesitan el rol. */
export async function getCurrentRole() {
  return MOCK_OPERATOR.profile.role;
}

/** Roles que tienen permiso "histórico" para firmar — ahora trivialmente true. */
export const ROLES_QUE_FIRMAN = ['admin', 'tecnico'];

export function canSignCalibration(role) {
  // Sprint 21: el gate real es el PIN, no el rol.
  // Retornamos true para que el flujo de firma no bloquee.
  return true;
}