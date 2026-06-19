'use server';
// app/(app)/admin/actions.js
// =========================================================================
// SERVER ACTIONS — Administración (STUBS - SISTEMA SIN AUTH)
// -------------------------------------------------------------------------
// Como se eliminó la gestión de usuarios (auth) para evitar el bloqueo de 
// Netlify Edge, estas funciones ya no tienen utilidad.
// 
// Se mantienen declaradas devolviendo un error controlado para evitar
// fallos de compilación en caso de que algún componente huérfano 
// (como UsersTable.jsx) todavía intente importarlas.
// =========================================================================

export async function updateUserRole(userId, newRole) {
  return { 
    ok: false, 
    error: 'La gestión de usuarios por roles ha sido desactivada. El sistema opera mediante PIN de seguridad.' 
  };
}

export async function setUserActive(userId, active) {
  return { 
    ok: false, 
    error: 'La gestión de usuarios ha sido desactivada.' 
  };
}