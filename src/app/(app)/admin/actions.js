'use server';
// app/(app)/admin/actions.js
// =========================================================================
// SERVER ACTIONS — Administración (STUBS - SISTEMA SIN AUTH)
// -------------------------------------------------------------------------
// Se mantienen las firmas de las funciones para evitar errores de 
// compilación si otros componentes las invocan, pero la lógica de auth
// ha sido eliminada.
// =========================================================================

import { revalidatePath } from 'next/cache';

/**
 * La gestión de roles ha sido desactivada en el nuevo sistema sin login.
 */
export async function updateUserRole(userId, newRole) {
  return { 
    ok: false, 
    error: 'La gestión de usuarios por roles ha sido desactivada.' 
  };
}

/**
 * La gestión de usuarios ha sido desactivada.
 */
export async function setUserActive(userId, active) {
  return { 
    ok: false, 
    error: 'La gestión de usuarios ha sido desactivada.' 
  };
}