// components/modals/actions.js
// =========================================================================
// SERVER ACTIONS — Persistencia atómica de calibraciones en Supabase
// -------------------------------------------------------------------------
// Sprint 5: la firma del técnico ya NO se captura. El responsable queda
// registrado como performed_by = auth.uid() (lo asigna el RPC).
//
// El supervisor que aprueba se elige desde un <select> con catálogo
// estático (lib/supervisors.js). La firma del supervisor (base64 PNG)
// viaja en p_supervisor_signature y es la misma imagen que se inyectará
// en el certificado PDF del próximo sprint.
//
// DEFENSA EN PROFUNDIDAD:
//   1. UI    — botón "Guardar" oculto para viewer.
//   2. Action — chequea canSignCalibration() antes del RPC.
//   3. RLS   — policy de calibration_events bloquea a viewer en BD.
// =========================================================================

'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentUserWithProfile, canSignCalibration } from '@/lib/auth';

/**
 * @param {object} payload
 * @param {string} payload.position_id
 * @param {string} [payload.sap_wo]
 * @param {string} [payload.instrument_tag]
 * @param {string} [payload.serial_number]
 * @param {string} [payload.pattern_used]
 * @param {string} [payload.pattern_cert_id]        Sprint 29: N° certificado del patrón
 * @param {string} [payload.pattern_certificate_url] Sprint 35: URL al PDF del cert del patrón
 * @param {number} payload.range_min
 * @param {number} payload.range_max
 * @param {string} [payload.unit]
 * @param {number} [payload.tolerance_pct]
 * @param {string} [payload.sensor_type]
 * @param {string} [payload.technician_name]       Sprint 29: nombre técnico (texto libre)
 * @param {string} [payload.observations]
 * @param {string} payload.supervisor_name         "Romeo Luna" — para auditoría
 * @param {string} payload.supervisor_signature    Base64 PNG (irá al PDF)
 * @param {'PASS'|'PASS_LIMITE'|'FAIL'|'PENDING'} [payload.result]
 * @param {Array<object>} payload.points           Exactamente 9 puntos
 *
 * @returns {Promise<{ok: true, event_id: string} | {ok: false, error: string}>}
 */
export async function saveCalibrationEvent(payload) {
  // ── 1) Auth + autorización ──────────────────────────────────────────────
  const session = await getCurrentUserWithProfile();
  if (!session) {
    return { ok: false, error: 'No autenticado.' };
  }
  if (!canSignCalibration(session.profile?.role)) {
    return { ok: false, error: 'Tu rol no permite firmar calibraciones.' };
  }

  // ── 2) Validación del payload ───────────────────────────────────────────
  if (!payload?.position_id) {
    return { ok: false, error: 'Falta position_id.' };
  }
  // Sprint 44: aceptamos 3/5/7/9 filas según puntos_n (2..5) del modal.
  const validRowCounts = [3, 5, 7, 9];
  if (!Array.isArray(payload.points) || !validRowCounts.includes(payload.points.length)) {
    return {
      ok: false,
      error: `Cantidad de puntos inválida (${payload.points?.length ?? 0}). Esperado: 3, 5, 7 o 9.`,
    };
  }
  if (payload.range_min == null || payload.range_max == null) {
    return { ok: false, error: 'Faltan rango mín/máx del instrumento.' };
  }
  // ⚠ El supervisor es el nuevo requisito (en lugar de la firma del técnico)
  if (!payload.supervisor_name || !payload.supervisor_signature) {
    return { ok: false, error: 'Selecciona el supervisor que aprueba la calibración.' };
  }

  // Normalizar los puntos (JSON limpio para el RPC)
  const normalizedPoints = payload.points.map((p, i) => ({
    point_index:    i,
    pct:            p.pct,
    phase:          p.phase,
    nominal_ma:     p.nominal_ma,
    expected_value: p.expected_value ?? null,
    reading_ma:     p.reading_ma ?? null,
    reading_value:  p.reading_value ?? null,
    error_pct:      p.error_pct ?? null,
    result:         p.result ?? '',
  }));

  // ── 3) Llamar al RPC atómico ────────────────────────────────────────────
  // Mapping de campos del nuevo flujo al RPC actual:
  //   - performed_by:           lo pone el RPC con auth.uid() (técnico = usuario logueado)
  //   - technician_signature:   ya no se captura → NULL
  //   - supervisor_signature:   base64 PNG de la firma escaneada del supervisor
  //   - supervisor_id:          NULL hasta que tengamos los supervisors en auth.users
  //                             (mientras tanto, el nombre queda en observations
  //                              como traza adicional)
  const observationsConFirma = [
    payload.observations,
    `Aprobado por: ${payload.supervisor_name}`,
  ].filter(Boolean).join('\n');

  const supabase = createSupabaseServerClient();

  const { data: eventId, error } = await supabase.rpc(
    'insert_calibration_with_points',
    {
      p_position_id:          payload.position_id,
      p_sap_wo:               payload.sap_wo ?? null,
      p_instrument_tag:       payload.instrument_tag ?? null,
      p_serial_number:        payload.serial_number ?? null,
      p_pattern_used:         payload.pattern_used ?? null,
      p_range_min:            payload.range_min,
      p_range_max:            payload.range_max,
      p_unit:                 payload.unit ?? null,
      p_tolerance_pct:        payload.tolerance_pct ?? 0.5,
      p_sensor_type:          payload.sensor_type ?? null,
      p_observations:         observationsConFirma,
      p_technician_signature: null, // ⛔ ya no se captura
      p_supervisor_signature: payload.supervisor_signature, // ✅ base64 → PDF
      p_supervisor_id:        null, // pendiente: cuando los supervisores estén en auth.users
      p_result:               payload.result ?? 'PENDING',
      p_points:               normalizedPoints,
    }
  );

  if (error) {
    console.error('[saveCalibrationEvent] RPC error:', error);
    return { ok: false, error: error.message };
  }

  // ── 4) Sprint 29/35: UPDATE post-INSERT para campos que el RPC no acepta ──
  // El RPC fue diseñado en Sprint 4 sin parámetros para technician_name,
  // pattern_cert_id ni pattern_certificate_url. Hacemos un UPDATE quirúrgico
  // para llenarlos. Si falla, no abortamos — el evento ya está persistido.
  if (
    payload.technician_name ||
    payload.pattern_cert_id ||
    payload.pattern_certificate_url ||
    payload.performed_at
  ) {
    const patch = {};
    if (payload.technician_name)         patch.technician_name = payload.technician_name;
    if (payload.pattern_cert_id)         patch.pattern_cert_id = payload.pattern_cert_id;
    if (payload.pattern_certificate_url) patch.pattern_certificate_url = payload.pattern_certificate_url;
    // Sprint 42: fecha editable de la calibración
    if (payload.performed_at) {
      const d = new Date(`${payload.performed_at}T12:00:00`);
      if (!isNaN(d.getTime())) patch.performed_at = d.toISOString();
    }

    const { error: patchErr } = await supabase
      .from('calibration_events')
      .update(patch)
      .eq('id', eventId);

    if (patchErr) {
      console.warn('[saveCalibrationEvent] post-update warning:', patchErr.message);
      // No retornamos error — el evento principal está guardado
    }
  }

  // ── 5) Invalidar caché del faro ─────────────────────────────────────────
  revalidatePath('/envasado');
  revalidatePath('/ingenieria');
  revalidatePath('/calidad');

  return { ok: true, event_id: eventId };
}

// =========================================================================
// SPRINT 7: Historial de calibraciones por POS
// -------------------------------------------------------------------------
// Devuelve TODOS los eventos de una posición de mantenimiento, con sus
// 9 puntos anidados y el profile del técnico que ejecutó cada uno.
//
// La firma del supervisor viene como base64 dentro del evento (lo que va
// al PDF). Su NOMBRE se extrae de `observations` (formato del saveAction:
// "<obs reales>\nAprobado por: <Nombre>").
//
// Cualquier usuario autenticado puede leer: la RLS de calibration_events
// permite SELECT a 'authenticated' (admin/tecnico/viewer).
//
// @param {string} positionId  UUID de maintenance_positions
// @returns {Promise<
//   { ok: true, events: Array<HistoryEvent> } |
//   { ok: false, error: string }
// >}
//
// HistoryEvent = {
//   id, source, sap_wo, instrument_tag, serial_number, pattern_used,
//   range_min, range_max, unit, tolerance_pct, sensor_type,
//   result, performed_at, observations, observations_clean,
//   supervisor_signature, supervisor_name, supervisor_role,
//   external_provider, external_cert_pdf_url,
//   technician: { name, role },
//   points: [...sorted by point_index]
// }
// =========================================================================

import { SUPERVISORS } from '@/lib/supervisors';

export async function getCalibrationHistory(positionId) {
  if (!positionId) {
    return { ok: false, error: 'Falta positionId.' };
  }

  const session = await getCurrentUserWithProfile();
  if (!session) {
    return { ok: false, error: 'No autenticado.' };
  }

  const supabase = createSupabaseServerClient();

  // Query con nested select: eventos + puntos + profile del técnico
  // (el FK alias profiles!performed_by le dice a PostgREST que use esa
  //  relación específica para resolver el join)
  const { data: events, error } = await supabase
    .from('calibration_events')
    .select(`
      id, source,
      sap_wo, instrument_tag, serial_number,
      pattern_used, pattern_cert_id, pattern_certificate_url,
      range_min, range_max, unit, tolerance_pct, sensor_type,
      result, performed_at, performed_by,
      technician_name,
      supervisor_signature,
      observations,
      external_provider, external_cert_number, external_cert_pdf_url,
      certificate_url,
      points:calibration_points (
        id, point_index, pct, phase, nominal_ma,
        expected_value, reading_ma, reading_value, error_pct, result
      ),
      technician:profiles!performed_by (
        id, full_name, email, role
      )
    `)
    .eq('position_id', positionId)
    .order('performed_at', { ascending: false });

  if (error) {
    console.error('[getCalibrationHistory] query error:', error);
    return { ok: false, error: error.message };
  }

  // Post-procesar: ordenar puntos por point_index y extraer supervisor
  const processed = (events || []).map((ev) => {
    // 1) Ordenar puntos (Supabase normalmente los devuelve en orden de
    //    inserción, pero garantizamos por point_index)
    const points = [...(ev.points || [])].sort(
      (a, b) => a.point_index - b.point_index
    );

    // 2) Extraer supervisor name de observations
    //    Formato esperado: "<obs reales>\nAprobado por: <Nombre>"
    let observations_clean = ev.observations || '';
    let supervisor_name = null;
    const m = observations_clean.match(/^([\s\S]*?)\n?Aprobado por:\s*(.+?)\s*$/);
    if (m) {
      observations_clean = m[1].trim();
      supervisor_name = m[2].trim();
    }

    // 3) Lookup del supervisor en el catálogo para obtener el rol
    const supervisor =
      supervisor_name &&
      SUPERVISORS.find((s) => s.name === supervisor_name);
    const supervisor_role = supervisor?.role || 'Supervisor';

    // 4) Normalizar el technician — Sprint 29: prioridad a technician_name
    //    (texto libre en BD desde el modal). Fallback al join via profiles
    //    para eventos antiguos pre-Sprint 29 que sólo tenían performed_by.
    let technician;
    if (ev.technician_name) {
      technician = { name: ev.technician_name, role: 'Técnico' };
    } else if (ev.technician) {
      technician = {
        name: ev.technician.full_name || ev.technician.email || '—',
        role: { admin: 'Admin', tecnico: 'Técnico', viewer: 'Viewer' }[ev.technician.role] || 'Técnico',
      };
    } else {
      technician = { name: '—', role: 'Técnico' };
    }

    return {
      ...ev,
      points,
      observations_clean,
      supervisor_name,
      supervisor_role,
      technician,
    };
  });

  return { ok: true, events: processed };
}

// =========================================================================
// SPRINT 8: saveExternalCalibration  (certificados emitidos por proveedores)
// -------------------------------------------------------------------------
// Flujo:
//   A) Sube el PDF al bucket `external_certs` con nombre único
//      ext_<POS>_<timestamp>.pdf
//   B) Obtiene la URL pública del archivo
//   C) Inserta UN solo row en calibration_events con:
//       source = 'external'
//       result = 'PASS' (asumido)
//       external_cert_pdf_url = <publicUrl>
//      NO usa el RPC de los 9 puntos — no hay grid en certificados externos.
//
// FormData es obligatorio porque Server Actions sólo aceptan archivos
// reales vía FormData (no via objeto plano serializado).
//
// Si el INSERT falla DESPUÉS de subir el PDF, intentamos borrar el archivo
// para no dejar huérfanos en Storage.
// =========================================================================

export async function saveExternalCalibration(formData) {
  // ── 1) Auth + autorización ──────────────────────────────────────────────
  const session = await getCurrentUserWithProfile();
  if (!session) return { ok: false, error: 'No autenticado.' };
  if (!canSignCalibration(session.profile?.role)) {
    return { ok: false, error: 'Tu rol no permite registrar certificados externos.' };
  }

  // ── 2) Extraer y validar campos ─────────────────────────────────────────
  const positionId      = (formData.get('position_id')          || '').toString();
  // AGREGAR después de la línea `const positionId = ...`
  const sapWo = (formData.get('sap_wo') || '').toString().trim();
  const posMtto         = (formData.get('pos_mtto')             || '').toString();
  const provider        = (formData.get('external_provider')    || '').toString().trim();
  const certNumber      = (formData.get('external_cert_number') || '').toString().trim();
  const performedAt     = (formData.get('performed_at')         || '').toString();
  const certificateUrl  = (formData.get('certificate_url')      || '').toString().trim();
  const file            = formData.get('pdf_file');

  if (!positionId)  return { ok: false, error: 'Falta position_id.' };
  if (!sapWo) return { ok: false, error: 'La OT SAP es obligatoria para vincular el certificado.' };
  if (!provider)    return { ok: false, error: 'Indica el proveedor que emitió el certificado.' };
  if (!performedAt) return { ok: false, error: 'Indica la fecha de calibración.' };

  // Sprint 28: PDF es opcional si se provee URL de SharePoint.
  const hasFile = !!(file && file instanceof File && file.size > 0);
  const hasUrl  = !!certificateUrl;

  if (!hasFile && !hasUrl) {
    return { ok: false, error: 'Adjunta el PDF o pega el enlace de SharePoint.' };
  }

  // Validar URL si vino
  if (hasUrl) {
    try {
      const u = new URL(certificateUrl);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        return { ok: false, error: 'El enlace debe ser una URL HTTP/HTTPS válida.' };
      }
    } catch {
      return { ok: false, error: 'El enlace del certificado no es una URL válida.' };
    }
  }

  // Validar archivo si vino
  if (hasFile) {
    if (file.size > 15 * 1024 * 1024) {
      return { ok: false, error: 'El PDF supera 15 MB.' };
    }
    const isPdf =
      file.type === 'application/pdf' ||
      file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) return { ok: false, error: 'Sólo se aceptan archivos .pdf.' };
  }

  // ── 3) Subir PDF (si vino) ──────────────────────────────────────────────
  const supabase = createSupabaseServerClient();
  let publicUrl = null;
  let filename  = null;

  if (hasFile) {
    const safePos = (posMtto || positionId).replace(/[^A-Za-z0-9_-]/g, '');
    filename = `ext_${safePos}_${Date.now()}.pdf`;

    const { error: uploadError } = await supabase
      .storage
      .from('external_certs')
      .upload(filename, file, {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (uploadError) {
      console.error('[saveExternalCalibration] upload error:', uploadError);
      return { ok: false, error: `No se pudo subir el PDF: ${uploadError.message}` };
    }

    const { data: urlData } = supabase
      .storage
      .from('external_certs')
      .getPublicUrl(filename);
    publicUrl = urlData?.publicUrl;

    if (!publicUrl) {
      await supabase.storage.from('external_certs').remove([filename]);
      return { ok: false, error: 'No se pudo obtener la URL pública del PDF.' };
    }
  }

  // ── 4) Insert directo en calibration_events ─────────────────────────────
  // Construir observations dinámico según qué fuentes tenemos
  const sources = [];
  if (hasFile) sources.push('PDF en bucket interno');
  if (hasUrl)  sources.push('enlace SharePoint');
  const observations =
    `Certificado externo emitido por ${provider}` +
    (certNumber ? ` (N° ${certNumber})` : '') +
    ` · Fuente: ${sources.join(' + ')}`;

  const { data: event, error: insertError } = await supabase
    .from('calibration_events')
    .insert({
  position_id:           positionId,
  source:                'external',
  sap_wo:                sapWo,         // Sprint 53: obligatorio para trazabilidad
  result:                'PASS',
  performed_at:          new Date(performedAt).toISOString(),
  performed_by:          null,
  external_provider:     provider,
  external_cert_number:  certNumber || null,
  external_cert_pdf_url: publicUrl,
  certificate_url:       certificateUrl || null,
  observations,
})
    .select('id')
    .single();

  if (insertError) {
    console.error('[saveExternalCalibration] insert error:', insertError);
    // Compensación: si subimos PDF pero falló el INSERT, lo borramos
    if (filename) {
      await supabase.storage.from('external_certs').remove([filename]);
    }
    return { ok: false, error: insertError.message };
  }

  // ── 5) Invalidar caché del faro ─────────────────────────────────────────
  revalidatePath('/envasado');
  revalidatePath('/ingenieria');
  revalidatePath('/calidad');

  return {
    ok: true,
    event_id:        event.id,
    pdf_url:         publicUrl,         // null si fue solo URL
    certificate_url: certificateUrl || null,
    filename,
  };
}