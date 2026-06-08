// lib/periodRange.js
// =========================================================================
// HELPERS DE PERÍODO COMPARTIDOS — Sprint 17 (lifted-state-up)
// -------------------------------------------------------------------------
// ÚNICA fuente de verdad para los rangos de fecha que usan los 3 gráficos
// del dashboard (ComplianceChart, TrendLineChart, StatusDonutChart). Si
// cambias la lista de PERIODS o la lógica de inRange, los tres gráficos
// se mantienen sincronizados automáticamente — no hay drift posible.
//
// PERIODS
//   'previous' → mes anterior calendario
//   'current'  → mes corriente
//   'next'     → mes próximo
//   'all'      → sin filtro (todo el horizonte SAP)
//
// API:
//   PERIODS                  array { value, label } para los <select>
//   parseLocalDate(iso)      Date local (evita drift UTC) o null
//   periodRange(period)      [Date start, Date end) o [null,null] para 'all'
//   inRange(iso, start, end) boolean (true si 'all' por convención)
//   periodLabel(period)      "junio 2026" / "Todo el horizonte SAP"
// =========================================================================

export const PERIODS = [
  { value: 'previous', label: 'Mes Anterior' },
  { value: 'current',  label: 'Mes Actual' },
  { value: 'next',     label: 'Próximo Mes' },
  { value: 'all',      label: 'Todos los meses' },
];

// Convierte 'YYYY-MM-DD' a Date local (sin drift por timezone).
// Para otros formatos delega en el constructor nativo.
export function parseLocalDate(iso) {
  if (!iso) return null;
  let d;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, day] = iso.split('-').map(Number);
    d = new Date(y, m - 1, day);
  } else {
    d = new Date(iso);
  }
  return isNaN(d.getTime()) ? null : d;
}

// Devuelve [start, end) — semiabierto, end exclusivo (estándar SQL).
// Para 'all' devuelve [null,null] e inRange tratará como "siempre true".
export function periodRange(period) {
  const now = new Date();
  const som = (offset = 0) =>
    new Date(now.getFullYear(), now.getMonth() + offset, 1);
  if (period === 'current')  return [som(0),  som(1)];
  if (period === 'previous') return [som(-1), som(0)];
  if (period === 'next')     return [som(1),  som(2)];
  return [null, null];
}

export function inRange(iso, start, end) {
  if (!start || !end) return true; // 'all'
  const d = parseLocalDate(iso);
  if (!d) return false;
  return d >= start && d < end;
}

// Subtítulo legible para el header del gráfico.
export function periodLabel(period) {
  const now = new Date();
  const monthName = (offset) => {
    const dt = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    return dt.toLocaleDateString('es-SV', { month: 'long', year: 'numeric' });
  };
  if (period === 'current')  return monthName(0);
  if (period === 'previous') return monthName(-1);
  if (period === 'next')     return monthName(1);
  return 'Todo el horizonte SAP';
}