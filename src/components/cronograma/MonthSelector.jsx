'use client';
// components/cronograma/MonthSelector.jsx
// =========================================================================
// MONTH SELECTOR — Sprint 24 (lista explícita con "(Actual)")
// -------------------------------------------------------------------------
// Genera dinámicamente la lista de meses desde Enero del año actual hasta
// el mes corriente. El mes corriente:
//   • se etiqueta "<Mes> <Año> (Actual)"
//   • usa value='current' (modo live, lee de ot_cronograma_view)
//
// Los meses anteriores usan value='YYYY-MM' y leen de las tablas snapshot.
// Si availableMonths del histórico tiene meses de años anteriores (cruce
// de año, backfills viejos), se agregan al final del dropdown.
//
// Si un mes histórico NO tiene snapshot, sigue listado — la UI mostrará
// estado vacío al seleccionarlo (no se ocultan opciones).
// =========================================================================

const MES_LARGO = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
];

// ─── Generador de opciones ──────────────────────────────────────────────
function buildOptions(availableMonths = []) {
  const now           = new Date();
  const currentYear   = now.getFullYear();
  const currentMonth  = now.getMonth() + 1; // 1..12

  const options = [];

  // 1) Meses del año actual: Enero → mes corriente (cronológico)
  for (let m = 1; m <= currentMonth; m++) {
    const ym       = `${currentYear}-${String(m).padStart(2, '0')}`;
    const monthLbl = MES_LARGO[m - 1];
    const isCurrent = m === currentMonth;

    options.push({
      value: isCurrent ? 'current' : ym,
      label: `${monthLbl} ${currentYear}${isCurrent ? ' (Actual)' : ''}`,
      isCurrent,
    });
  }

  // 2) Meses de años anteriores que tengan snapshot
  //    (útil si el cron lleva varios años de historia)
  const olderFromSnapshots = (availableMonths || [])
    .filter((ym) => {
      const [y] = ym.split('-').map(Number);
      return y < currentYear;
    })
    .sort()                 // ASC
    .reverse();             // DESC (más recientes primero al final)

  for (const ym of olderFromSnapshots) {
    const [y, m] = ym.split('-').map(Number);
    options.unshift({       // se insertan al principio para quedar cronológicas
      value: ym,
      label: `${MES_LARGO[m - 1]} ${y}`,
      isCurrent: false,
    });
  }

  return options;
}

// ─── Componente ─────────────────────────────────────────────────────────
export default function MonthSelector({ value, onChange, availableMonths }) {
  const options = buildOptions(availableMonths);

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="month-selector"
             className="text-[11.5px] uppercase tracking-wider font-bold text-neutral-600">
        Periodo
      </label>
      <select
        id="month-selector"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-white border border-neutral-300 rounded-lg px-3 py-2 text-[13px] font-semibold focus:outline-none focus:ring-2 focus:ring-brand-amber/40 focus:border-brand-amber min-w-[220px]"
      >
        {options.map((opt) => (
          <option
            key={opt.value}
            value={opt.value}
            className={opt.isCurrent ? 'font-bold' : ''}
          >
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}