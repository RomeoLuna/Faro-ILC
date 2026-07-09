// components/catalogos/actions.js
// =========================================================================
// SERVER ACTIONS — Catálogo de Patrones (Sprint 35)
// -------------------------------------------------------------------------
// CRUD sobre public.patrones_catalogo:
//   - addPatron({ nombre, certificate_url })
//   - updatePatron({ id, nombre, certificate_url })
//   - deletePatron({ id })  → soft delete (active=false)
//
// Todas revalidan /catalogos para que la lista se refresque tras la mutación.
// Sin PIN gate a nivel server — la app usa un mock operator; la protección
// vive en el UI (PinGate en el cliente).
// =========================================================================

'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// ── Utils ────────────────────────────────────────────────────────────────
function validarUrl(url) {
  if (!url) return { ok: true, url: null };
  const trimmed = url.trim();
  if (!trimmed) return { ok: true, url: null };
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return { ok: false, error: 'La URL debe ser http:// o https://' };
    }
    return { ok: true, url: trimmed };
  } catch {
    return { ok: false, error: 'La URL no es válida.' };
  }
}


// ── CREATE ───────────────────────────────────────────────────────────────
export async function addPatron({ nombre, certificate_url }) {
  const nombreClean = (nombre || '').trim();
  if (!nombreClean) return { ok: false, error: 'El nombre del patrón es obligatorio.' };

  const urlCheck = validarUrl(certificate_url);
  if (!urlCheck.ok) return { ok: false, error: urlCheck.error };

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('patrones_catalogo')
    .insert({
      nombre:          nombreClean,
      certificate_url: urlCheck.url,
      active:          true,
    })
    .select('id, nombre, certificate_url')
    .single();

  if (error) {
    // El índice único case-insensitive protege contra duplicados
    if (error.code === '23505') {
      return { ok: false, error: 'Ya existe un patrón con ese nombre.' };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath('/catalogos');
  return { ok: true, patron: data };
}


// ── UPDATE ───────────────────────────────────────────────────────────────
export async function updatePatron({ id, nombre, certificate_url }) {
  if (!id) return { ok: false, error: 'Falta id del patrón.' };

  const nombreClean = (nombre || '').trim();
  if (!nombreClean) return { ok: false, error: 'El nombre del patrón es obligatorio.' };

  const urlCheck = validarUrl(certificate_url);
  if (!urlCheck.ok) return { ok: false, error: urlCheck.error };

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('patrones_catalogo')
    .update({
      nombre:          nombreClean,
      certificate_url: urlCheck.url,
    })
    .eq('id', id)
    .select('id, nombre, certificate_url')
    .single();

  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: 'Ya existe otro patrón con ese nombre.' };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath('/catalogos');
  return { ok: true, patron: data };
}


// ── DELETE (soft) ────────────────────────────────────────────────────────
export async function deletePatron({ id }) {
  if (!id) return { ok: false, error: 'Falta id del patrón.' };

  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from('patrones_catalogo')
    .update({ active: false })
    .eq('id', id);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/catalogos');
  return { ok: true };
}