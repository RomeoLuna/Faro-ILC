// app/(app)/admin/actions.js
// =========================================================================
// SERVER ACTIONS — Administración de usuarios (Sprint 10)
// -------------------------------------------------------------------------
// Funciones invocadas desde la UI del panel admin (/admin) para modificar
// la tabla public.profiles. Toda la lógica de autorización vive aquí en
// el servidor — el cliente NO puede llamarlas si no tiene rol admin.
//
// DEFENSA EN PROFUNDIDAD:
//   1. UI         — la página /admin sólo muestra el selector si el caller
//                   es admin (gate en page.js).
//   2. Action     — esta función vuelve a chequear el rol admin antes de
//                   ejecutar el UPDATE (defensa adicional).
//   3. RLS BD     — la policy "profiles admin update" del schema.sql sólo
//                   permite UPDATE a usuarios cuyo rol sea admin.
//
// Reglas de negocio extras:
//   • newRole debe ser uno de: 'viewer', 'tecnico', 'admin'.
//   • Un admin NO puede degradar su propio rol (evitar quedarse sin admins
//     por accidente). Si quiere degradar, otro admin debe hacerlo.
// =========================================================================

'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentUserWithProfile } from '@/lib/auth';

const VALID_ROLES = ['viewer', 'tecnico', 'admin'];

/**
 * Cambia el rol de un usuario en public.profiles.
 *
 * @param {string} userId   UUID del profile a actualizar
 * @param {string} newRole  'viewer' | 'tecnico' | 'admin'
 * @returns {Promise<{ok: true} | {ok: false, error: string}>}
 */
export async function updateUserRole(userId, newRole) {
  // 1) Autenticación + autorización
  const session = await getCurrentUserWithProfile();
  if (!session) {
    return { ok: false, error: 'No autenticado.' };
  }
  if (session.profile?.role !== 'admin') {
    return { ok: false, error: 'Solo los administradores pueden cambiar roles.' };
  }

  // 2) Validación de parámetros
  if (!userId || typeof userId !== 'string') {
    return { ok: false, error: 'userId inválido.' };
  }
  if (!VALID_ROLES.includes(newRole)) {
    return {
      ok: false,
      error: `Rol inválido. Debe ser uno de: ${VALID_ROLES.join(', ')}.`,
    };
  }

  // 3) Defensa: no permitir self-demote (evitar quedarse sin admin por error)
  if (userId === session.user.id && newRole !== 'admin') {
    return {
      ok: false,
      error: 'No puedes degradar tu propio rol de admin. Pídele a otro admin que lo haga.',
    };
  }

  // 4) UPDATE en la tabla
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from('profiles')
    .update({ role: newRole })
    .eq('id', userId);

  if (error) {
    console.error('[updateUserRole] update error:', error);
    return { ok: false, error: error.message };
  }

  // 5) Invalidar caché del panel admin
  revalidatePath('/admin');

  return { ok: true };
}

/**
 * Alterna el flag active del profile (suspender / reactivar).
 * Reservado para una mejora futura — no se invoca todavía desde la UI.
 *
 * @param {string} userId
 * @param {boolean} active
 * @returns {Promise<{ok: true} | {ok: false, error: string}>}
 */
export async function setUserActive(userId, active) {
  const session = await getCurrentUserWithProfile();
  if (!session)                              return { ok: false, error: 'No autenticado.' };
  if (session.profile?.role !== 'admin')    return { ok: false, error: 'Solo admin.' };
  if (!userId)                               return { ok: false, error: 'userId inválido.' };
  if (typeof active !== 'boolean')           return { ok: false, error: 'active debe ser boolean.' };
  if (userId === session.user.id && !active) return { ok: false, error: 'No puedes desactivarte a ti mismo.' };

  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from('profiles')
    .update({ active })
    .eq('id', userId);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/admin');
  return { ok: true };
}