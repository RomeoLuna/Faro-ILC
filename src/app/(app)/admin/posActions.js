// app/(app)/admin/posActions.js
// =========================================================================
// SERVER ACTIONS — Gestión simplificada de POS de Mantenimiento (Sprint 50)
// -------------------------------------------------------------------------
// El formulario acepta SOLO 8 campos (los del CSV SAP):
//
//   1. pos_mtto            → Pos.mantenim.
//   2. equipment_name      → TxtPosicManten
//   3. description         → Denominación
//   4. ubicacion_tecnica   → Ubicac.técnica
//   5. area                → Area (texto SAP)
//   6. sub_area            → Sub-Area
//   7. tag                 → TAG
//   8. frequency_months    → Frecuencia en meses
//
// El area_id (FK a public.areas) se INFIERE automáticamente comparando
// el texto SAP con los nombres del catálogo — así el operador no elige
// dos veces la misma cosa.
// =========================================================================

'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const POS_PASSWORD = '150202';

function requirePassword(pw) {
  if (pw !== POS_PASSWORD) return { ok: false, error: 'Contraseña incorrecta.' };
  return null;
}


// ─── Inferencia de area_id desde el texto SAP ────────────────────────────
// Mapa suave: CALIDAD → 'Calidad', ELABORACION → 'Elaboración', etc.
// Devuelve el area_id o null si no matchea con ningún área conocida.
async function inferAreaId(supabase, areaText) {
  if (!areaText) return null;
  const clean = String(areaText).trim();
  if (!clean) return null;

  // Traemos las áreas conocidas
  const { data: areas } = await supabase
    .from('areas')
    .select('id, name');

  if (!areas || areas.length === 0) return null;

  // Estrategia de match (ordenada por confianza):
  //   1. Exacto case-insensitive
  //   2. Sin acentos, case-insensitive
  //   3. Substring en cualquier dirección
  const normalize = (s) =>
    (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

  const cleanNorm = normalize(clean);

  // Exacto
  for (const a of areas) {
    if (normalize(a.name) === cleanNorm) return a.id;
  }
  // Substring
  for (const a of areas) {
    const an = normalize(a.name);
    if (an.includes(cleanNorm) || cleanNorm.includes(an)) return a.id;
  }

  return null;
}


// ── CREATE ─────────────────────────────────────────────────────────────
export async function addPos(payload) {
  const pwErr = requirePassword(payload.password);
  if (pwErr) return pwErr;

  // Sprint 51: los 8 campos son obligatorios (paridad con el CSV SAP)
  const pos_mtto          = (payload.pos_mtto          || '').trim();
  const equipment_name    = (payload.equipment_name    || '').trim();
  const description       = (payload.description       || '').trim();
  const ubicacion_tecnica = (payload.ubicacion_tecnica || '').trim();
  const area              = (payload.area              || '').trim();
  const sub_area          = (payload.sub_area          || '').trim();
  const tag               = (payload.tag               || '').trim();
  const freqStr           = String(payload.frequency_months ?? '').trim();

  if (!pos_mtto)          return { ok: false, error: 'Pos.mantenim. es obligatorio.' };
  if (!equipment_name)    return { ok: false, error: 'TxtPosicManten es obligatorio.' };
  if (!description)       return { ok: false, error: 'Denominación es obligatoria.' };
  if (!ubicacion_tecnica) return { ok: false, error: 'Ubicac.técnica es obligatoria.' };
  if (!area)              return { ok: false, error: 'Area es obligatoria.' };
  if (!sub_area)          return { ok: false, error: 'Sub-Area es obligatoria.' };
  if (!tag)               return { ok: false, error: 'TAG es obligatorio.' };
  if (!freqStr)           return { ok: false, error: 'Frecuencia en meses es obligatoria.' };

  const freqNum = Number(freqStr);
  if (!Number.isFinite(freqNum) || freqNum < 1) {
    return { ok: false, error: 'Frecuencia en meses debe ser un número ≥ 1.' };
  }

  const supabase = createSupabaseServerClient();

  // Verificar duplicado
  const { data: existing } = await supabase
    .from('maintenance_positions')
    .select('id, active')
    .eq('pos_mtto', pos_mtto)
    .maybeSingle();

  if (existing && existing.active) {
    return { ok: false, error: `Ya existe la POS ${pos_mtto} y está activa.` };
  }

  // Inferir area_id del texto SAP
  const area_id = await inferAreaId(supabase, area);

  const insertData = {
    pos_mtto,
    equipment_name,
    description,
    ubicacion_tecnica,
    area:              area.toUpperCase(),
    sub_area:          sub_area.toUpperCase(),
    tag,
    frequency_months:  freqNum,
    area_id,
    active:            true,
    updated_at:        new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('maintenance_positions')
    .upsert(insertData, { onConflict: 'pos_mtto' })
    .select('*')
    .single();

  if (error) return { ok: false, error: error.message };

  revalidatePath('/admin');
  revalidatePath('/envasado');
  revalidatePath('/ingenieria');
  revalidatePath('/calidad');

  return {
    ok: true,
    pos: data,
    wasReactivated: !!(existing && !existing.active),
    areaMatched:    area_id != null,
  };
}


// ── DELETE (soft) ──────────────────────────────────────────────────────
export async function softDeletePos({ id, password }) {
  const pwErr = requirePassword(password);
  if (pwErr) return pwErr;
  if (!id) return { ok: false, error: 'Falta id de la POS.' };

  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from('maintenance_positions')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/admin');
  revalidatePath('/envasado');
  revalidatePath('/ingenieria');
  revalidatePath('/calidad');
  return { ok: true };
}