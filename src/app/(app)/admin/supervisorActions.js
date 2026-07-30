// app/(app)/admin/supervisorActions.js
// =========================================================================
// SERVER ACTIONS — Gestión de Supervisores (Sprint 54)
// -------------------------------------------------------------------------
// CRUD sobre public.supervisores.
// Protegido con la misma contraseña de gestión de POS (150202).
// =========================================================================

'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const PASSWORD = '150202';

function requirePassword(pw) {
  if (pw !== PASSWORD) return { ok: false, error: 'Contraseña incorrecta.' };
  return null;
}

// Validaciones básicas de la firma (data URL base64)
function validateSignature(signature) {
  if (!signature) return { ok: true, value: null };  // opcional
  if (typeof signature !== 'string') return { ok: false, error: 'Firma inválida.' };
  if (!signature.startsWith('data:image/')) {
    return { ok: false, error: 'La firma debe ser una imagen (PNG o JPG).' };
  }
  // Peso máximo del base64 completo: ~1MB (equivale a ~700KB de imagen)
  if (signature.length > 1_050_000) {
    return { ok: false, error: 'La firma supera 1 MB. Recomprimí la imagen.' };
  }
  return { ok: true, value: signature };
}


// ── CREATE ─────────────────────────────────────────────────────────────
export async function addSupervisor(payload) {
  const pwErr = requirePassword(payload.password);
  if (pwErr) return pwErr;

  const name = (payload.name || '').trim();
  const role = (payload.role || '').trim();

  if (!name) return { ok: false, error: 'El nombre es obligatorio.' };
  if (!role) return { ok: false, error: 'El rol/puesto es obligatorio.' };

  const sigCheck = validateSignature(payload.signature);
  if (!sigCheck.ok) return sigCheck;

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('supervisores')
    .insert({
      name,
      role,
      slug:      (payload.slug || '').trim() || null,
      signature: sigCheck.value,
      active:    true,
    })
    .select('id, slug, name, role, signature, active')
    .single();

  if (error) {
    if (error.code === '23505') return { ok: false, error: 'Ese slug ya está usado.' };
    return { ok: false, error: error.message };
  }

  revalidatePath('/admin');
  return { ok: true, supervisor: data };
}


// ── UPDATE ─────────────────────────────────────────────────────────────
export async function updateSupervisor(payload) {
  const pwErr = requirePassword(payload.password);
  if (pwErr) return pwErr;

  const { id } = payload;
  if (!id) return { ok: false, error: 'Falta id del supervisor.' };

  const name = (payload.name || '').trim();
  const role = (payload.role || '').trim();
  if (!name) return { ok: false, error: 'El nombre es obligatorio.' };
  if (!role) return { ok: false, error: 'El rol/puesto es obligatorio.' };

  // La firma solo se actualiza si vino explícitamente en el payload
  const patch = {
    name,
    role,
    slug: (payload.slug || '').trim() || null,
  };

  if (payload.signature !== undefined) {
    const sigCheck = validateSignature(payload.signature);
    if (!sigCheck.ok) return sigCheck;
    patch.signature = sigCheck.value;
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('supervisores')
    .update(patch)
    .eq('id', id)
    .select('id, slug, name, role, signature, active')
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath('/admin');
  return { ok: true, supervisor: data };
}


// ── DELETE (soft) ──────────────────────────────────────────────────────
export async function softDeleteSupervisor({ id, password }) {
  const pwErr = requirePassword(password);
  if (pwErr) return pwErr;

  if (!id) return { ok: false, error: 'Falta id del supervisor.' };

  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from('supervisores')
    .update({ active: false })
    .eq('id', id);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/admin');
  return { ok: true };
}