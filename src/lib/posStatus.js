// lib/posStatus.js
// =========================================================================
// ESTADO EFECTIVO DE UNA POS — compartido entre Faro, Etiquetas y /qr/[id]
// -------------------------------------------------------------------------
// Misma regla que PositionsTableClient.jsx (Sprint 18):
//   • Si hoy > last_noti_date + frequency_months → VENCIDO por frecuencia,
//     aunque SAP muestre la OT como CTEC.
//   • Si no, se respeta el status que calcula maintenance_positions_view
//     (VIGENTE | PROXIMO_7 | VENCIDO | NUNCA_CALIBRADO).
//
// Vive aparte (sin 'use client') para poder usarse tanto en Server
// Components (página pública del QR) como en Client Components.
// =========================================================================

export function parseLocalDate(iso) {
  if (!iso) return null;
  let d;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(iso))) {
    const [y, m, day] = String(iso).split('-').map(Number);
    d = new Date(y, m - 1, day);
  } else {
    d = new Date(iso);
  }
  return isNaN(d.getTime()) ? null : d;
}

/** Fecha en que vence la frecuencia técnica: última NOTI + N meses. */
export function freqDueDate(lastNotiDate, frequencyMonths) {
  const last = parseLocalDate(lastNotiDate);
  if (!last || !frequencyMonths) return null;
  const due = new Date(last);
  due.setMonth(due.getMonth() + Number(frequencyMonths));
  return due;
}

export function isFreqOverdue(lastNotiDate, frequencyMonths) {
  const due = freqDueDate(lastNotiDate, frequencyMonths);
  return due ? Date.now() > due.getTime() : false;
}

/**
 * Devuelve el estado efectivo + textos y tono listos para pintar.
 * @param {object|null} pos  fila de maintenance_positions_view
 * @returns {{ key: string, label: string, tone: 'pass'|'warn'|'fail'|'neutral', hint: string|null, freqOverdue: boolean }}
 */
export function describePosStatus(pos) {
  if (!pos) {
    return { key: 'SIN_DATOS', label: 'Sin datos', tone: 'neutral', hint: null, freqOverdue: false };
  }
  const freqOverdue = isFreqOverdue(pos.last_noti_date, pos.frequency_months);
  const key = freqOverdue ? 'VENCIDO' : pos.status;
  const dr = pos.days_remaining;

  switch (key) {
    case 'VENCIDO':
      return {
        key, tone: 'fail', freqOverdue,
        label: 'Vencido',
        hint: freqOverdue
          ? 'La última calibración supera la frecuencia técnica'
          : dr != null ? `Atraso de ${Math.abs(dr)} días` : null,
      };
    case 'PROXIMO_7':
      return {
        key, tone: 'warn', freqOverdue,
        label: 'Próximo a vencer',
        hint: dr != null ? `Vence en ${dr} días` : null,
      };
    case 'VIGENTE':
    case 'NUNCA_CALIBRADO': // Sprint 41: sin OT abierta = al día
      return {
        key, tone: 'pass', freqOverdue,
        label: 'Vigente',
        hint: dr != null && key === 'VIGENTE' ? `Vence en ${dr} días` : null,
      };
    default:
      return { key: key || 'PENDIENTE', label: 'Pendiente', tone: 'neutral', hint: null, freqOverdue };
  }
}

/** Clases Tailwind por tono (paleta de la app). */
export const STATUS_TONE_CLASSES = {
  pass:    { chip: 'bg-brand-passSoft text-brand-pass border-brand-pass/30', dot: 'bg-brand-pass' },
  warn:    { chip: 'bg-brand-warnSoft text-amber-700 border-brand-warn/30',  dot: 'bg-brand-warn' },
  fail:    { chip: 'bg-brand-failSoft text-brand-fail border-brand-fail/30', dot: 'bg-brand-fail' },
  neutral: { chip: 'bg-neutral-100 text-neutral-600 border-neutral-300',     dot: 'bg-neutral-400' },
};
