'use client';
import { useMemo } from 'react'; // Eliminamos useState

// ... (deja los helpers parseLocalDate y periodRange iguales)

export default function CompactComplianceChart({ positions, period, setPeriod }) {
  
  const stats = useMemo(() => {
    const [start, end] = periodRange(period);
    let vencidas = 0;
    let vigentes = 0;

    for (const p of positions) {
      const date = p.next_sap_date ? parseLocalDate(p.next_sap_date) : null;
      if (period !== 'all' && date && (date < start || date >= end)) continue;

      if (p.status === 'VENCIDO') vencidas++;
      else vigentes++;
    }

    const total = vencidas + vigentes;
    return { 
      vencidas, vigentes, total,
      pctRojo: total ? (vencidas / total) * 100 : 0,
      pctVerde: total ? (vigentes / total) * 100 : 0 
    };
  }, [positions, period]);

  return (
    <div className="bg-white rounded-xl border border-neutral-200 shadow-card mb-6">
      <div className="px-5 py-3 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between">
        <div className="text-[12px] uppercase tracking-wider text-neutral-600 font-bold">
          Cumplimiento General (SAP)
        </div>
        <select 
          value={period} 
          onChange={(e) => setPeriod(e.target.value)} 
          className="text-[11px] font-semibold border rounded-lg px-2 py-1 bg-white focus:ring-1 focus:ring-brand-amber outline-none"
        >
          {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </div>
      
      {/* ... (el resto del JSX de las barras sigue igual) */}
    </div>
  );
}