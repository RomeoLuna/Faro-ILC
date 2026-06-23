// lib/cronograma.js
// =========================================================================
// CRONOGRAMA — Helpers de fechas, categorización y KPIs
// -------------------------------------------------------------------------
// Funciones puras (sin React, sin Supabase) compartidas por:
//   • CronogramaTable    → muestra el badge por fila
//   • CronogramaDashboard → calcula KPIs + clasifica las 3 listas
//
// REGLAS DEL SEMÁFORO (acordadas con planta):
//   🟩 COMPLETED   scheduled_date <= fin del mes  AND  fecha_cierre IS NOT NULL
//   🟨 IN_PROGRESS scheduled_date dentro del mes  AND  fecha_cierre IS NULL
//                  AND scheduled_date >= today    (aún hay tiempo)
//   🟥 OVERDUE     scheduled_date <= fin del mes  AND  fecha_cierre IS NULL
//                  AND (scheduled_date < today  OR  month already closed)
//   ⚪ NOT_PLANNED scheduled_date IS NULL
//   ⏩ FUTURE      scheduled_date > fin del mes   (no cuenta en este mes)
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
  const end   = new Date(t.getFullYear(), t.getMonth() + 1, 0); // último día del mes
  return { start, end, today: t };
}

function stripTime(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// ─── Categorización por OT ──────────────────────────────────────────────
// Devuelve: 'COMPLETED' | 'IN_PROGRESS' | 'OVERDUE' | 'NOT_PLANNED' | 'FUTURE'
export function categorizeOT(ot, today = new Date()) {
  const scheduled = parseLocalDate(ot.scheduled_date);
  if (!scheduled) return 'NOT_PLANNED';

  const { start, end, today: t } = monthBounds(today);

  // Programada para un mes futuro → no entra en la evaluación del mes actual
  if (scheduled > end) return 'FUTURE';

  // Tiene fecha de notificación → cumplida (vino o no a tiempo, eso es otra métrica)
  const closed = parseLocalDate(ot.fecha_cierre);
  if (closed) return 'COMPLETED';

  // No tiene cierre. ¿Estamos dentro del mes Y la fecha programada sigue por venir?
  if (scheduled >= t && scheduled <= end) return 'IN_PROGRESS';

  // No cierre + scheduled_date pasó o es de meses anteriores
  return 'OVERDUE';
}

// ─── KPIs del mes ───────────────────────────────────────────────────────
// Considera "del mes" las OTs cuyo scheduled_date está dentro del mes corriente
// O arrastradas (scheduled_date en meses anteriores sin cierre).
export function computeKpis(rows, today = new Date()) {
  const { start, end } = monthBounds(today);

  let planificadas = 0;   // total a ejecutar este mes (current + arrastradas)
  let ejecutadas   = 0;   // de planificadas, las que tienen fecha_cierre
  let enProgreso   = 0;   // 🟨
  let vencidas     = 0;   // 🟥
  let cumplidas    = 0;   // 🟩 (sinónimo de ejecutadas, alias para claridad)

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
export const TABS = [
  { key: 'global',         label: 'Global',         match: () => true },
  { key: 'envasado',       label: 'Envasado',       match: (r) => r.section === 'envasado' },
  { key: 'medio_ambiente', label: 'Medio Ambiente', match: (r) => r.area === 'MEDIO AMBIENTE' },
  { key: 'suministros',    label: 'Suministros',    match: (r) => r.area === 'SUMINISTROS' },
  { key: 'elaboracion',    label: 'Elaboración',    match: (r) => r.area === 'ELABORACION' },
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