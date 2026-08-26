// components/catalogos/actions.js
// =========================================================================
// SERVER ACTIONS — Catálogo de Patrones (Sprint 43)
// -------------------------------------------------------------------------
// Cambios respecto a Sprint 42:
//   • Add/Update/Delete requieren password (verificado en el server).
//   • Nuevo campo cert_number (N° del certificado del patrón).
// =========================================================================

'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// Password del catálogo (server-side check). Cambiar sincronizado con
// components/catalogos/CatalogoPatronesClient.jsx.
const CATALOG_PASSWORD = 'N3tm45k1!';

function requirePassword(pw) {
  if (pw !== CATALOG_PASSWORD) {
    return { ok: false, error: 'Contraseña incorrecta.' };
  }
  return null;
}

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
export async function addPatron({ nombre, certificate_url, pos_mtto, cert_number, password }) {
  const pwErr = requirePassword(password);
  if (pwErr) return pwErr;

  const nombreClean = (nombre || '').trim();
  if (!nombreClean) return { ok: false, error: 'El nombre del patrón es obligatorio.' };

  const urlCheck = validarUrl(certificate_url);
  if (!urlCheck.ok) return { ok: false, error: urlCheck.error };

  const posClean       = (pos_mtto    || '').trim() || null;
  const certNumberClean = (cert_number || '').trim() || null;

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('patrones_catalogo')
    .insert({
      nombre:          nombreClean,
      certificate_url: urlCheck.url,
      pos_mtto:        posClean,
      cert_number:     certNumberClean,
      active:          true,
    })
    .select('id, nombre, certificate_url, pos_mtto, cert_number')
    .single();

  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: 'Ya existe un patrón con ese nombre.' };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath('/catalogos');
  return { ok: true, patron: data };
}


// ── UPDATE ───────────────────────────────────────────────────────────────
export async function updatePatron({ id, nombre, certificate_url, pos_mtto, cert_number, password }) {
  const pwErr = requirePassword(password);
  if (pwErr) return pwErr;

  if (!id) return { ok: false, error: 'Falta id del patrón.' };

  const nombreClean = (nombre || '').trim();
  if (!nombreClean) return { ok: false, error: 'El nombre del patrón es obligatorio.' };

  const urlCheck = validarUrl(certificate_url);
  if (!urlCheck.ok) return { ok: false, error: urlCheck.error };

  const posClean        = (pos_mtto    || '').trim() || null;
  const certNumberClean = (cert_number || '').trim() || null;

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('patrones_catalogo')
    .update({
      nombre:          nombreClean,
      certificate_url: urlCheck.url,
      pos_mtto:        posClean,
      cert_number:     certNumberClean,
    })
    .eq('id', id)
    .select('id, nombre, certificate_url, pos_mtto, cert_number')
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
export async function deletePatron({ id, password }) {
  const pwErr = requirePassword(password);
  if (pwErr) return pwErr;

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