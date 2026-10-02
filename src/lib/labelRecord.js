// lib/labelRecord.js
// =========================================================================
// QUÉ MUESTRA UN STICKER QR — reglas únicas para la app y para /qr/[id]
// -------------------------------------------------------------------------
// Dos fuentes posibles para "la última calibración" de un sensor:
//
//   FARO   → lo que el sistema ya sabe de la POS vinculada: la última NOTI
//            de SAP (fecha + OT) y, si se emitió certificado en Faro, su
//            resultado / técnico / enlace (calibration_events).
//   MANUAL → el historial propio del sticker (calibration_label_records),
//            registrado desde la app. source='sap' significa "confirma y
//            completa la notificación SAP para este sensor".
//
// Reglas (decididas con Henry, oct-2026):
//   • Se muestra UN registro completo, nunca campos mezclados de dos
//     calibraciones distintas. Excepción: COMPLETAR — si el registro manual
//     es la MISMA calibración que la NOTI de SAP (misma OT o misma fecha),
//     lo escrito rellena los huecos de SAP.
//   • Modo por sticker (display_mode):
//       auto   → la calibración más reciente. En POS con VARIOS sensores,
//                una NOTI de SAP no se aplica sola (puede haber sido solo
//                algún sensor): queda "por confirmar" hasta que se confirme
//                para este sensor.
//       manual → siempre el historial propio (aviso si SAP tiene algo más nuevo)
//       faro   → siempre el dato del Faro
//   • APROBADO (verde) exige resultado + fecha + responsable. Si falta
//     algo → "POR COMPLETAR". Vencido nunca sale en verde.
//   • Fuera de servicio manda sobre todo: "NO USAR".
// =========================================================================

import { describePosStatus, freqDueDate, parseLocalDate } from './posStatus';

export const RESULT_OPTIONS = [
  { value: 'PASS',        label: 'Aprobado',           short: 'APROBADO',           tone: 'pass' },
  { value: 'PASS_LIMITE', label: 'Aprobado al límite', short: 'APROBADO AL LÍMITE', tone: 'warn' },
  { value: 'FAIL',        label: 'Rechazado',          short: 'RECHAZADO',          tone: 'fail' },
];

export const MODE_OPTIONS = [
  { value: 'auto',   label: 'Automático',   hint: 'Muestra la calibración más reciente' },
  { value: 'manual', label: 'Solo manual',  hint: 'Siempre lo registrado en la app' },
  { value: 'faro',   label: 'Solo Faro',    hint: 'Siempre el dato de SAP / Faro' },
];

export function resultInfo(value) {
  return RESULT_OPTIONS.find((r) => r.value === value) || null;
}

function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  return parseLocalDate(String(v).slice(0, 10));
}

function iso(d) {
  return d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null;
}

function addMonthsDate(d, months) {
  if (!d || !months) return null;
  const n = new Date(d);
  n.setMonth(n.getMonth() + Number(months));
  return n;
}

function daysUntil(d) {
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

function vigenciaFromDate(next) {
  const d = daysUntil(next);
  if (d == null) return null;
  if (d < 0)  return { tone: 'fail', label: 'Vencido',          hint: `Vencida hace ${Math.abs(d)} días` };
  if (d <= 7) return { tone: 'warn', label: 'Próximo a vencer', hint: d === 0 ? 'Vence hoy' : `Vence en ${d} días` };
  return            { tone: 'pass', label: 'Vigente',          hint: `Vence en ${d} días` };
}

/** Último registro válido (no anulado) del historial del sticker. */
export function latestRecord(records = []) {
  const valid = records.filter((r) => !r.voided);
  valid.sort((a, b) =>
    String(b.performed_at).localeCompare(String(a.performed_at)) ||
    String(b.registered_at || '').localeCompare(String(a.registered_at || ''))
  );
  return valid[0] || null;
}

/** Registro "Faro" de la POS (última NOTI + certificado Faro si corresponde). */
export function faroRecord(pos, lastEvent = null) {
  if (!pos) return null;
  const notiDate = pos.last_noti_date ? String(pos.last_noti_date).slice(0, 10) : null;
  const evDate   = lastEvent?.performed_at ? String(lastEvent.performed_at).slice(0, 10) : null;
  // El certificado de Faro solo describe la calibración vigente si no es
  // más viejo que la última NOTI.
  const ev = evDate && (!notiDate || evDate >= notiDate) ? lastEvent : null;
  const date = ev ? evDate : notiDate;
  if (!date) return null;
  return {
    origin:      'faro',
    performedAt: toDate(date),
    performedBy: ev ? (ev.technician_name || ev.external_provider || null) : null,
    result:      ev?.result && resultInfo(ev.result) ? ev.result : null,
    sapWo:       ev?.sap_wo || pos.last_noti_wo || null,
    certUrl:     ev ? (ev.external_cert_pdf_url || ev.certificate_url || null) : null,
    nextDate:    freqDueDate(pos.last_noti_date, pos.frequency_months) || toDate(pos.next_sap_date),
    notes:       null,
    hasFaroCert: !!ev,
  };
}

function manualToRec(r, pos) {
  if (!r) return null;
  const performedAt = toDate(r.performed_at);
  return {
    origin:      'manual',
    sourceTag:   r.source, // 'manual' | 'sap'
    performedAt,
    performedBy: r.performed_by || null,
    result:      r.result || null,
    sapWo:       r.sap_wo || null,
    certUrl:     r.certificate_url || null,
    nextDate:    toDate(r.next_date) || addMonthsDate(performedAt, pos?.frequency_months),
    notes:       r.notes || null,
    registeredBy: r.registered_by || null,
    registeredAt: r.registered_at || null,
    recordId:    r.id,
  };
}

/** ¿El registro manual es la MISMA calibración que la NOTI de SAP? */
function sameCalibration(man, faro) {
  if (!man || !faro) return false;
  const wo = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
  const fw = wo(faro.sapWo);
  if (man.sapWo && fw.includes(String(man.sapWo).trim())) return true;
  return iso(man.performedAt) === iso(faro.performedAt);
}

/** Manual completa a Faro: lo escrito manda, lo vacío viene de SAP. */
function merge(man, faro) {
  return {
    ...faro,
    ...Object.fromEntries(Object.entries(man).filter(([, v]) => v !== null && v !== undefined && v !== '')),
    origin: 'merged',
    performedAt: faro.performedAt || man.performedAt,
    sapWo: man.sapWo || faro.sapWo,
    nextDate: man.nextDate || faro.nextDate,
  };
}

const MISSING_LABELS = { result: 'resultado', performedBy: 'responsable', performedAt: 'fecha' };

/**
 * @param {object}   label        fila de calibration_labels
 * @param {object}   ctx
 * @param {object}   [ctx.pos]          fila de maintenance_positions_view
 * @param {object}   [ctx.lastEvent]    último calibration_event de la POS
 * @param {object[]} [ctx.records]      historial del sticker
 * @param {number}   [ctx.sensorsInPos] cuántos stickers activos tiene la POS
 */
export function effectiveRecord(label, ctx = {}) {
  const { pos = null, lastEvent = null, records = [], sensorsInPos = 1 } = ctx;
  const mode  = label.display_mode || 'auto';
  const multi = sensorsInPos > 1;

  const faro = faroRecord(pos, lastEvent);
  const man  = manualToRec(latestRecord(records), pos);
  const alerts = [];

  const faroNewer = faro && (!man || (iso(faro.performedAt) > iso(man.performedAt) && !sameCalibration(man, faro)));

  let shown = null;
  let why   = '';
  let unconfirmed = false; // dato de la POS aún no confirmado para ESTE sensor

  if (mode === 'faro') {
    shown = faro;
    why = 'Modo "Solo Faro"';
  } else if (mode === 'manual') {
    shown = man;
    why = 'Modo "Solo manual"';
    if (man && faroNewer) alerts.push({ type: 'sap_newer', tone: 'warn', text: `SAP notificó una calibración más reciente (${fmt(faro.performedAt)}) — revisar` });
  } else if (man && faro && sameCalibration(man, faro)) {
    shown = merge(man, faro);
    why = 'Calibración SAP completada en la app';
  } else if (man && faro && faroNewer) {
    if (multi) {
      shown = man;
      why = 'Último registro de este sensor';
      alerts.push({ type: 'confirm_sap', tone: 'warn', text: `SAP notificó la POS el ${fmt(faro.performedAt)} — confirmar si este sensor se calibró` });
    } else {
      shown = faro;
      why = 'SAP tiene la calibración más reciente';
    }
  } else if (man) {
    shown = man;
    why = 'Registro de la app (más reciente)';
  } else if (faro) {
    shown = faro;
    why = multi ? 'Dato de la POS — no confirmado para este sensor' : 'Dato de SAP / Faro';
    unconfirmed = multi;
    if (multi) alerts.push({ type: 'confirm_sap', tone: 'warn', text: `Dato de la POS (SAP ${fmt(faro.performedAt)}) — confirmar para este sensor` });
  }

  // Campos mínimos para poder decir APROBADO
  const missing = shown
    ? Object.keys(MISSING_LABELS).filter((k) => !shown[k]).map((k) => MISSING_LABELS[k])
    : [];
  if (shown && missing.length) {
    alerts.push({ type: 'incomplete', tone: 'warn', text: `Falta: ${missing.join(', ')}` });
  }

  // Vigencia
  let vigencia = null;
  if (shown?.nextDate) vigencia = vigenciaFromDate(shown.nextDate);
  if (shown?.origin === 'faro' && pos) {
    // Mismo estado que la tabla del Faro (incluye backlog de OT vencida)
    const st = describePosStatus(pos);
    vigencia = { tone: st.tone, label: st.label, hint: st.tone === 'fail' ? st.hint : (vigencia?.hint || st.hint) };
  }

  // Banner principal
  const r = resultInfo(shown?.result);
  let banner;
  if (label.out_of_service) {
    banner = { tone: 'fail', title: 'FUERA DE SERVICIO', sub: `NO USAR${label.oos_reason ? ` — ${label.oos_reason}` : ''}` };
  } else if (!shown) {
    banner = { tone: 'neutral', title: 'SIN REGISTRO', sub: 'Aún no se ha registrado una calibración' };
  } else if (vigencia?.tone === 'fail') {
    banner = { tone: 'fail', title: 'VENCIDO', sub: r ? `Última calibración: ${r.label.toLowerCase()}` : vigencia.hint };
  } else if (unconfirmed) {
    banner = { tone: 'warn', title: 'POR CONFIRMAR', sub: `SAP notificó la POS el ${fmt(shown.performedAt)} — falta confirmar este sensor` };
  } else if (r?.value === 'FAIL') {
    banner = { tone: 'fail', title: 'RECHAZADO', sub: 'No usar hasta nueva calibración' };
  } else if (missing.length) {
    banner = { tone: 'warn', title: 'POR COMPLETAR', sub: `Calibrado el ${fmt(shown.performedAt) || '—'} · falta ${missing.join(', ')}` };
  } else if (r?.value === 'PASS_LIMITE') {
    banner = { tone: 'warn', title: 'APROBADO AL LÍMITE', sub: vigencia?.hint || null };
  } else {
    banner = { tone: vigencia?.tone === 'warn' ? 'warn' : 'pass', title: 'APROBADO', sub: vigencia?.hint || null };
  }

  return {
    shown, why, mode, multi, faro, manual: man, faroNewer,
    resultInfo: r, vigencia, banner, alerts, missing,
    needsReview: !shown || alerts.some((a) => a.type === 'sap_newer' || a.type === 'confirm_sap') || missing.length > 0 || vigencia?.tone === 'fail' || r?.value === 'FAIL',
  };
}

function fmt(d) {
  if (!d) return null;
  const M = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return `${String(d.getDate()).padStart(2, '0')} ${M[d.getMonth()]} ${d.getFullYear()}`;
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

/**
 * @param {Function} [recOf]  label → effectiveRecord(...) (necesario para 'proxima')
 */
export function sortLabels(list, key, posById, recOf = null) {
  const coll = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
  const posOf = (l) => (l.pos_id ? posById.get(l.pos_id) : null);
  const val = {
    pos:       (l) => [posOf(l)?.pos_mtto || l.pos_mtto || '~', l.instrument_name || ''],
    area:      (l) => [posOf(l)?.area || l.area || '~', posOf(l)?.sub_area || '', posOf(l)?.pos_mtto || l.pos_mtto || '~', l.instrument_name || ''],
    ubicacion: (l) => [l.ubicacion || '~', l.instrument_name || ''],
    nombre:    (l) => [l.instrument_name || '~'],
    tag:       (l) => [l.tag || '~', l.instrument_name || ''],
    proxima:   (l) => {
      const d = recOf ? recOf(l)?.shown?.nextDate : null;
      return [d ? iso(d) : '~', l.instrument_name || ''];
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
