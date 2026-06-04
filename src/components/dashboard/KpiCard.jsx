// components/dashboard/KpiCard.jsx
// =========================================================================
// KPI CARD (Server Component, sin estado)
// -------------------------------------------------------------------------
// Tarjeta KPI individual del dashboard. El prop `tone` controla:
//   - El color del borde superior (border-t-4)
//   - El color del valor principal (text-3xl)
//
// Tones disponibles: amber | warn | fail | env | eng
// =========================================================================

const TONE_TOP = {
  amber: 'border-t-brand-amber',
  warn:  'border-t-brand-warn',
  fail:  'border-t-brand-fail',
  env:   'border-t-brand-env',
  eng:   'border-t-brand-eng',
};

const TONE_VALUE = {
  amber: '',
  warn:  'text-brand-warn',
  fail:  'text-brand-fail',
  env:   'text-brand-env',
  eng:   'text-brand-eng',
};

export default function KpiCard({ label, value, foot, tone = 'amber' }) {
  return (
    <div
      className={`bg-white rounded-xl border border-neutral-200 border-t-4 ${TONE_TOP[tone]} p-4 shadow-card`}
    >
      <div className="text-[11px] uppercase tracking-wide text-neutral-500 font-semibold">
        {label}
      </div>
      <div className={`text-3xl font-bold mt-1 ${TONE_VALUE[tone]}`}>{value}</div>
      {foot && <div className="text-[11.5px] text-neutral-500 mt-1">{foot}</div>}
    </div>
  );
}
