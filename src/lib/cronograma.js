// lib/cronograma.js
// =========================================================================
// CRONOGRAMA — Helpers de fechas, categorización y KPIs
// -------------------------------------------------------------------------
// Sprint 36: se añade tab 'calidad' que filtra por section='calidad'.
// =========================================================================

// ─── Parsing de fechas locales (evita drift UTC) ────────────────────────
export function parseLocalDate(iso) {
  if (!iso) return null;
  if (iso instanceof Date) return isNaN(iso.getTime()) ? null : iso;
  let d;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, day] = iso.split('-').map(Number);
    d = new Date(y, m - 1, day);
  } else {
    d = new Date(iso);
  }
  return isNaN(d.getTime()) ? null : d;
}

export function formatDate(iso) {
  const d = parseLocalDate(iso);
  if (!d) return null;
  const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const day = d.getDate().toString().padStart(2, '0');
  return `${day} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

// ─── Rangos del mes corriente ───────────────────────────────────────────
export function monthBounds(today = new Date()) {
  const t = stripTime(today);
  const start = new Date(t.getFullYear(), t.getMonth(), 1);
  const end   = new Date(t.getFullYear(), t.getMonth() + 1, 0);
  return { start, end, today: t };
}

function stripTime(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function isSapNotificada(status) {
  if (!status) return false;
  return status.toString().toUpperCase().includes('NOTI');
}

// ─── Categorización por OT ──────────────────────────────────────────────
export function categorizeOT(ot, today = new Date()) {
  const scheduled = parseLocalDate(ot.scheduled_date);
  if (!scheduled) return 'NOT_PLANNED';

  const { start, end, today: t } = monthBounds(today);

  if (scheduled > end) return 'FUTURE';

  const closed = parseLocalDate(ot.fecha_cierre);
  if (closed) return 'COMPLETED';

  if (scheduled >= t && scheduled <= end) return 'IN_PROGRESS';

  return 'OVERDUE';
}

// ─── KPIs del mes ───────────────────────────────────────────────────────
export function computeKpis(rows, today = new Date()) {
  const { start, end } = monthBounds(today);

  let planificadas = 0;
  let ejecutadas   = 0;
  let enProgreso   = 0;
  let vencidas     = 0;
  let cumplidas    = 0;

  for (const row of rows) {
    const status = categorizeOT(row, today);
    if (status === 'NOT_PLANNED' || status === 'FUTURE') continue;

    planificadas++;
    if (status === 'COMPLETED')   { ejecutadas++; cumplidas++; }
    if (status === 'IN_PROGRESS') { enProgreso++; }
    if (status === 'OVERDUE')     { vencidas++; }
  }

  const compliance = planificadas
    ? Math.round((ejecutadas / planificadas) * 100)
    : null;

  return {
    planificadas, ejecutadas, cumplidas, enProgreso, vencidas, compliance,
    monthStart: start, monthEnd: end,
  };
}

// ─── Particiones para el dashboard ──────────────────────────────────────
export function partitionForDashboard(rows, today = new Date()) {
  const cumplidas   = [];
  const enProgreso  = [];
  const vencidas    = [];
  for (const row of rows) {
    const status = categorizeOT(row, today);
    if      (status === 'COMPLETED')   cumplidas.push(row);
    else if (status === 'IN_PROGRESS') enProgreso.push(row);
    else if (status === 'OVERDUE')     vencidas.push(row);
  }
  return { cumplidas, enProgreso, vencidas };
}

// ─── Filtros por tab ────────────────────────────────────────────────────
// Sprint 36: se añade tab 'calidad' que filtra por section='calidad'.
export const TABS = [
  { key: 'global',         label: 'Global',         match: () => true },
  { key: 'envasado',       label: 'Envasado',       match: (r) => r.section === 'envasado' },
  { key: 'medio_ambiente', label: 'Medio Ambiente', match: (r) => r.area === 'MEDIO AMBIENTE' },
  { key: 'suministros',    label: 'Suministros',    match: (r) => r.area === 'SUMINISTROS' },
  { key: 'elaboracion',    label: 'Elaboración',    match: (r) => r.area === 'ELABORACION' },
  { key: 'calidad',        label: 'Calidad',        match: (r) => r.section === 'calidad' },
];

export function filterByTab(rows, tabKey) {
  const tab = TABS.find((t) => t.key === tabKey) || TABS[0];
  return rows.filter(tab.match);
}

// ─── Etiquetas visuales para el badge ───────────────────────────────────
export const STATUS_META = {
  COMPLETED:   { label: 'Cumplida',    dot: 'bg-brand-pass', cls: 'bg-brand-passSoft text-brand-pass border-brand-pass/30' },
  IN_PROGRESS: { label: 'En progreso', dot: 'bg-brand-warn', cls: 'bg-brand-warnSoft text-amber-700 border-brand-warn/30' },
  OVERDUE:     { label: 'Vencida',     dot: 'bg-brand-fail', cls: 'bg-brand-failSoft text-brand-fail border-brand-fail/30' },
  NOT_PLANNED: { label: 'Sin planificar', dot: 'bg-neutral-400', cls: 'bg-neutral-100 text-neutral-600 border-neutral-300' },
  FUTURE:      { label: 'Programada (futuro)', dot: 'bg-brand-env', cls: 'bg-brand-envSoft text-brand-env border-brand-env/30' },
};