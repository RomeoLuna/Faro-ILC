// lib/labelRecord.js
// =========================================================================
// REGISTRO EFECTIVO DE UN STICKER QR — lo que se muestra al escanear
// -------------------------------------------------------------------------
// Cada sticker (calibration_labels) tiene su propio "registro de
// calibración" editable desde la app:
//     result · technician_name · last_calibration_date ·
//     next_calibration_date · sap_wo · certificate_url
//
// Regla: lo que se escribió en el sticker MANDA. Si un campo está vacío y
// el sticker está vinculado a una POS, se completa con el dato en vivo del
// Faro (último calibration_event de la POS / última NOTI / frecuencia).
//
// Se usa igual en la card de la app (sin evento) y en /qr/[id] (con el
// último evento), para que ambas pantallas digan exactamente lo mismo.
// =========================================================================

import { describePosStatus, freqDueDate, parseLocalDate } from './posStatus';

export const RESULT_OPTIONS = [
  { value: 'PASS',        label: 'Aprobado',           short: 'APROBADO',           tone: 'pass' },
  { value: 'PASS_LIMITE', label: 'Aprobado al límite', short: 'APROBADO AL LÍMITE', tone: 'warn' },
  { value: 'FAIL',        label: 'Rechazado',          short: 'RECHAZADO',          tone: 'fail' },
];

export function resultInfo(value) {
  return RESULT_OPTIONS.find((r) => r.value === value) || null;
}

function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  return parseLocalDate(String(v).slice(0, 10));
}

function daysUntil(d) {
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

/** Vigencia a partir de una fecha "próxima calibración". */
function vigenciaFromDate(next) {
  const d = daysUntil(next);
  if (d == null) return null;
  if (d < 0)  return { tone: 'fail', label: 'Vencido',          hint: `Vencida hace ${Math.abs(d)} días` };
  if (d <= 7) return { tone: 'warn', label: 'Próximo a vencer', hint: d === 0 ? 'Vence hoy' : `Vence en ${d} días` };
  return            { tone: 'pass', label: 'Vigente',          hint: `Vence en ${d} días` };
}

/**
 * @param {object}      label      fila de calibration_labels
 * @param {object|null} pos        fila de maintenance_positions_view (si está vinculada)
 * @param {object|null} lastEvent  último calibration_event de la POS (opcional)
 */
export function effectiveRecord(label, pos = null, lastEvent = null) {
  // ¿El último evento del Faro corresponde a la última NOTI? (si es más
  // viejo, su resultado/técnico no describen la calibración vigente)
  const evDate   = lastEvent?.performed_at ? String(lastEvent.performed_at).slice(0, 10) : null;
  const notiDate = pos?.last_noti_date ? String(pos.last_noti_date).slice(0, 10) : null;
  const ev = evDate && (!notiDate || evDate >= notiDate) ? lastEvent : null;

  const fromFaro = {}; // qué campos vinieron del Faro (para rotularlos)
  function pick(own, faro, key) {
    if (own !== null && own !== undefined && own !== '') return own;
    if (faro !== null && faro !== undefined && faro !== '') { fromFaro[key] = true; return faro; }
    return null;
  }

  const result      = pick(label.result,          ev?.result, 'result');
  const performedBy = pick(label.technician_name, ev?.technician_name || ev?.external_provider, 'performedBy');
  const performedAt = toDate(pick(label.last_calibration_date, evDate || notiDate, 'performedAt'));
  const sapWo       = pick(label.sap_wo,          ev?.sap_wo || pos?.last_noti_wo, 'sapWo');
  const certUrl     = pick(label.certificate_url, ev?.external_cert_pdf_url || ev?.certificate_url, 'certUrl');

  let nextDate = toDate(label.next_calibration_date);
  if (!nextDate && pos) {
    nextDate = freqDueDate(pos.last_noti_date, pos.frequency_months) || toDate(pos.next_sap_date);
    if (nextDate) fromFaro.nextDate = true;
  }

  // Vigencia: fecha propia del sticker si existe; si no, estado del Faro.
  let vigencia = label.next_calibration_date ? vigenciaFromDate(nextDate) : null;
  if (!vigencia && pos) {
    // Estado (color/etiqueta) = el del Faro, para que el QR y la tabla
    // coincidan. El texto "vence en N días" se calcula sobre la fecha que
    // se muestra; si el Faro dice vencido, se usa su explicación.
    const st = describePosStatus(pos);
    const byDate = vigenciaFromDate(nextDate);
    vigencia = { tone: st.tone, label: st.label, hint: st.tone === 'fail' ? st.hint : (byDate?.hint || st.hint) };
  }
  if (!vigencia) vigencia = vigenciaFromDate(nextDate);

  // Banner principal: lo más importante primero. Una calibración vencida
  // NUNCA se muestra en verde aunque haya sido aprobada.
  const r = resultInfo(result);
  let banner;
  if (vigencia?.tone === 'fail') {
    banner = { tone: 'fail', title: 'VENCIDO', sub: r ? `Última calibración: ${r.label.toLowerCase()}` : vigencia.hint };
  } else if (r && r.tone !== 'pass') {
    banner = { tone: r.tone, title: r.short, sub: vigencia?.hint || null };
  } else if (r) {
    banner = { tone: vigencia?.tone === 'warn' ? 'warn' : 'pass', title: 'APROBADO', sub: vigencia?.hint || null };
  } else if (vigencia) {
    banner = { tone: vigencia.tone, title: vigencia.label.toUpperCase(), sub: vigencia.hint };
  } else {
    banner = { tone: 'neutral', title: 'SIN REGISTRO', sub: 'Aún no se ha registrado una calibración' };
  }

  const anyOwn = ['result', 'technician_name', 'last_calibration_date', 'next_calibration_date', 'sap_wo', 'certificate_url']
    .some((k) => label[k]);

  return {
    result, resultInfo: r, performedBy, performedAt, nextDate, sapWo, certUrl,
    vigencia, banner, fromFaro, hasOwnRecord: anyOwn,
  };
}

/** Ordenamientos disponibles para listar / imprimir stickers. */
export const SORT_OPTIONS = [
  { value: 'pos',       label: 'POS MTTO' },
  { value: 'area',      label: 'Área y POS' },
  { value: 'ubicacion', label: 'Ubicación' },
  { value: 'nombre',    label: 'Nombre del sensor' },
  { value: 'tag',       label: 'TAG' },
  { value: 'proxima',   label: 'Próxima calibración' },
];

export function sortLabels(list, key, posById) {
  const coll = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
  const posOf = (l) => (l.pos_id ? posById.get(l.pos_id) : null);
  const val = {
    pos:       (l) => [posOf(l)?.pos_mtto || l.pos_mtto || '~', l.instrument_name || ''],
    area:      (l) => [posOf(l)?.area || l.area || '~', posOf(l)?.sub_area || '', posOf(l)?.pos_mtto || l.pos_mtto || '~', l.instrument_name || ''],
    ubicacion: (l) => [l.ubicacion || '~', l.instrument_name || ''],
    nombre:    (l) => [l.instrument_name || '~'],
    tag:       (l) => [l.tag || '~', l.instrument_name || ''],
    proxima:   (l) => {
      const d = effectiveRecord(l, posOf(l)).nextDate;
      return [d ? d.toISOString().slice(0, 10) : '~', l.instrument_name || ''];
    },
  }[key] || ((l) => [l.instrument_name || '']);

  return [...list].sort((a, b) => {
    const va = val(a), vb = val(b);
    for (let i = 0; i < Math.max(va.length, vb.length); i++) {
      const c = coll.compare(String(va[i] ?? ''), String(vb[i] ?? ''));
      if (c) return c;
    }
    return 0;
  });
}
