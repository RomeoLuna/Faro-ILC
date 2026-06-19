'use server';
// components/modals/actions.js
// =========================================================================
// SERVER ACTIONS — PIN GATE (NO AUTH)
// =========================================================================

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { SUPERVISORS } from '@/lib/supervisors';

export async function saveCalibrationEvent(payload) {
  if (!payload?.position_id) return { ok: false, error: 'Falta position_id.' };
  if (!Array.isArray(payload.points) || payload.points.length !== 9) return { ok: false, error: 'Se esperan exactamente 9 puntos.' };
  if (payload.range_min == null || payload.range_max == null) return { ok: false, error: 'Faltan rango mín/máx.' };
  if (!payload.supervisor_name || !payload.supervisor_signature) return { ok: false, error: 'Selecciona supervisor.' };

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
      p_technician_signature: null, 
      p_supervisor_signature: payload.supervisor_signature, 
      p_supervisor_id:        null, 
      p_result:               payload.result ?? 'PENDING',
      p_points:               normalizedPoints,
    }
  );

  if (error) {
    console.error('[saveCalibrationEvent] RPC error:', error);
    return { ok: false, error: error.message };
  }

  revalidatePath('/envasado');
  revalidatePath('/ingenieria');

  return { ok: true, event_id: eventId };
}

export async function getCalibrationHistory(positionId) {
  if (!positionId) return { ok: false, error: 'Falta positionId.' };

  const supabase = createSupabaseServerClient();

  const { data: events, error } = await supabase
    .from('calibration_events')
    .select(`
      id, source, sap_wo, instrument_tag, serial_number, pattern_used,
      range_min, range_max, unit, tolerance_pct, sensor_type,
      result, performed_at, performed_by, supervisor_signature, observations,
      external_provider, external_cert_number, external_cert_pdf_url,
      points:calibration_points (
        id, point_index, pct, phase, nominal_ma, expected_value, reading_ma, reading_value, error_pct, result
      ),
      technician:profiles!performed_by (id, full_name, email, role)
    `)
    .eq('position_id', positionId)
    .order('performed_at', { ascending: false });

  if (error) return { ok: false, error: error.message };

  const processed = (events || []).map((ev) => {
    const points = [...(ev.points || [])].sort((a, b) => a.point_index - b.point_index);

    let observations_clean = ev.observations || '';
    let supervisor_name = null;
    const m = observations_clean.match(/^([\s\S]*?)\n?Aprobado por:\s*(.+?)\s*$/);
    if (m) {
      observations_clean = m[1].trim();
      supervisor_name = m[2].trim();
    }

    const supervisor = supervisor_name && SUPERVISORS.find((s) => s.name === supervisor_name);
    
    const technician = ev.technician
      ? {
          name: ev.technician.full_name || ev.technician.email || '—',
          role: { admin: 'Admin', tecnico: 'Técnico', viewer: 'Viewer' }[ev.technician.role] || 'Técnico',
        }
      : { name: 'Faro Mantenimiento', role: 'Operador' };

    return {
      ...ev, points, observations_clean, supervisor_name,
      supervisor_role: supervisor?.role || 'Supervisor', technician,
    };
  });

  return { ok: true, events: processed };
}

export async function saveExternalCalibration(formData) {
  const positionId  = (formData.get('position_id') || '').toString();
  const provider    = (formData.get('external_provider') || '').toString().trim();
  const certNumber  = (formData.get('external_cert_number') || '').toString().trim();
  const performedAt = (formData.get('performed_at') || '').toString();
  const file        = formData.get('pdf_file');

  if (!positionId || !provider || !performedAt) return { ok: false, error: 'Faltan datos obligatorios.' };
  if (!file || typeof file === 'string' || !(file instanceof File)) return { ok: false, error: 'PDF inválido.' };

  const supabase = createSupabaseServerClient();
  const filename = `ext_${positionId}_${Date.now()}.pdf`;

  const { error: uploadError } = await supabase.storage.from('external_certs').upload(filename, file, { contentType: 'application/pdf' });
  if (uploadError) return { ok: false, error: uploadError.message };

  const { data: urlData } = supabase.storage.from('external_certs').getPublicUrl(filename);
  const publicUrl = urlData?.publicUrl;

  const { data: event, error: insertError } = await supabase
    .from('calibration_events')
    .insert({
      position_id: positionId, source: 'external', result: 'PASS', 
      performed_at: new Date(performedAt).toISOString(), external_provider: provider,
      external_cert_number: certNumber || null, external_cert_pdf_url: publicUrl,
      observations: `Certificado externo emitido por ${provider}` + (certNumber ? ` (N° ${certNumber})` : ''),
    })
    .select('id').single();

  if (insertError) {
    await supabase.storage.from('external_certs').remove([filename]);
    return { ok: false, error: insertError.message };
  }

  revalidatePath('/envasado');
  revalidatePath('/ingenieria');

  return { ok: true, event_id: event.id, pdf_url: publicUrl, filename };
}