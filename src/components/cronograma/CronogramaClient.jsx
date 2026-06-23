'use client';
// components/cronograma/CronogramaClient.jsx
// =========================================================================
// CRONOGRAMA CLIENT — Sprint 23 (selector de mes + modo histórico)
// -------------------------------------------------------------------------
// Cambios vs Sprint 22:
//   1) Prop nuevo `availableMonths` (lista de 'YYYY-MM' del histórico).
//   2) Estado `selectedMonth`: 'current' o 'YYYY-MM'.
//   3) Cuando se selecciona un mes histórico:
//        • Fetch a ot_snapshot_details + ot_kpi_history para ese mes
//        • Modo solo-lectura: sin DatePicker, sin inputs, sin barra de
//          cambios pendientes
//        • Dashboard usa los KPIs CONGELADOS (no recalcula desde rows)
//   4) Tabs siguen filtrando client-side (incluso en modo histórico).
//
// FLUJO DE DATOS (modo histórico):
//   selectedMonth = '2026-05'
//     → fetchHistorical('2026-05')
//         → setHistoricalRows([...]), setHistoricalKpis({...})
//     → visibleRows = historicalRows filtrado por tabKey
//     → CronogramaTable(readOnly=true)
//     → CronogramaDashboard(historicalKpis=...)
// =========================================================================

import { useState, useMemo, useCallback, useEffect } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { usePinGate } from '@/components/security/PinGate';
import { TABS, filterByTab, parseLocalDate } from '@/lib/cronograma';

import CronogramaTable from './CronogramaTable';
import CronogramaDashboard from './CronogramaDashboard';
import UnsavedChangesBar from './UnsavedChangesBar';
import MonthSelector from './MonthSelector';

export default function CronogramaClient({ initialRows, availableMonths }) {
  const { requestPin } = usePinGate();

  // ── Estado base ───────────────────────────────────────────────────────
  const [activeTab,      setActiveTab]      = useState('global');
  const [selectedMonth,  setSelectedMonth]  = useState('current'); // 'current' | 'YYYY-MM'

  // Edits SOLO aplican al modo en vivo
  const [edits,    setEdits]    = useState({});
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState(null);
  const [savedAt,  setSavedAt]  = useState(null);

  // Datos del modo histórico (lazy load)
  const [historicalRows,  setHistoricalRows]  = useState([]);
  const [historicalKpis,  setHistoricalKpis]  = useState([]);   // 5 rows: una por tab_key
  const [loadingHist,     setLoadingHist]     = useState(false);
  const [histError,       setHistError]       = useState(null);

  const isHistorical = selectedMonth !== 'current';

  // ── Ventana del mes seleccionado ──────────────────────────────────────
  // monthStart = primer día del mes (00:00 local)
  // monthEnd   = último día del mes (último instante local)
  // Se usan para:
  //   • Filtro estricto: ocultar OTs con proxima_sap > monthEnd (req. Sprint 24).
  //   • Coloring de la columna PRÓXIMA (SAP) en la tabla.
  const { monthStart, monthEnd } = useMemo(() => {
    const today = new Date();
    let y, m;
    if (selectedMonth === 'current') {
      y = today.getFullYear();
      m = today.getMonth(); // 0..11
    } else {
      const [yy, mm] = selectedMonth.split('-').map(Number);
      y = yy;
      m = mm - 1;
    }
    return {
      monthStart: new Date(y, m, 1),
      monthEnd:   new Date(y, m + 1, 0, 23, 59, 59),
    };
  }, [selectedMonth]);

  // ── Fetch histórico cuando cambia el mes ──────────────────────────────
  useEffect(() => {
    if (!isHistorical) {
      setHistoricalRows([]);
      setHistoricalKpis([]);
      setHistError(null);
      return;
    }

    let cancelled = false;
    setLoadingHist(true);
    setHistError(null);

    (async () => {
      const supabase = createSupabaseBrowserClient();
      const [{ data: rows, error: re }, { data: kpis, error: ke }] = await Promise.all([
        supabase.from('ot_snapshot_details')
          .select('*')
          .eq('mes_anio', selectedMonth)
          .order('wo_number', { ascending: false }),
        supabase.from('ot_kpi_history')
          .select('*')
          .eq('mes_anio', selectedMonth),
      ]);

      if (cancelled) return;

      if (re || ke) {
        setHistError((re || ke).message);
      } else {
        setHistoricalRows(rows || []);
        setHistoricalKpis(kpis || []);
      }
      setLoadingHist(false);
    })();

    return () => { cancelled = true; };
  }, [selectedMonth, isHistorical]);

  // ── Derivar mergedRows: solo aplica al live (modo histórico es immutable) ──
  const mergedRows = useMemo(() => {
    if (isHistorical) return historicalRows;
    if (!Object.keys(edits).length) return initialRows;
    return initialRows.map((r) => {
      const patch = edits[r.wo_number];
      return patch ? { ...r, ...patch } : r;
    });
  }, [isHistorical, initialRows, historicalRows, edits]);

  // ── Subset visible según tab activo + filtro estricto Sprint 24 ──────
  // Regla: NO mostrar OTs cuya proxima_sap es estrictamente > último día
  // del mes seleccionado. Esto trunca el "futuro" para enfocar al equipo
  // en el backlog + el mes corriente. La regla aplica en ambos modos:
  //   • Live: filtramos client-side aquí.
  //   • Histórico: el snapshot ya viene limpio (freeze_cronograma_month
  //     solo inserta scheduled_date < mes_end), pero re-filtramos
  //     proxima_sap como defensa por si el snapshot viejo trae algo raro.
  const visibleRows = useMemo(() => {
    // 1) Filtrar por tab
    let rows = isHistorical
      ? (activeTab === 'global' ? mergedRows : mergedRows.filter((r) => r.tab_key === activeTab))
      : filterByTab(mergedRows, activeTab);

    // 2) Filtro estricto de futuro (Sprint 24)
    rows = rows.filter((r) => {
      const sapRaw = r.proxima_sap || r.fe_planif || r.planned_date;
      if (!sapRaw) return true;                  // sin fecha SAP → la dejamos pasar
      const sapDate = parseLocalDate(sapRaw);
      if (!sapDate) return true;
      return sapDate <= monthEnd;                // estrictamente <= fin del mes
    });

    return rows;
  }, [mergedRows, activeTab, isHistorical, monthEnd]);

  // ── KPIs históricos del tab activo (para pasar al dashboard) ──────────
  const kpisForActiveTab = useMemo(() => {
    if (!isHistorical) return null;
    return historicalKpis.find((k) => k.tab_key === activeTab) || null;
  }, [historicalKpis, activeTab, isHistorical]);

  // ── Edit handler — solo modo en vivo ──────────────────────────────────
  const onCellEdit = useCallback((wo_number, field, value) => {
    if (isHistorical) return;
    setEdits((prev) => {
      const current = prev[wo_number] || {};
      const next = { ...current, [field]: value };
      const original = initialRows.find((r) => r.wo_number === wo_number);
      if (original &&
          (next.scheduled_date ?? null) === (original.scheduled_date ?? null) &&
          (next.comments       ?? null) === (original.comments       ?? null)) {
        const { [wo_number]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [wo_number]: next };
    });
  }, [initialRows, isHistorical]);

  // ── Flush — PIN + upsert ──────────────────────────────────────────────
  const onFlush = useCallback(async () => {
    if (!Object.keys(edits).length) return;

    const authorized = await requestPin('guardar cambios al cronograma');
    if (!authorized) {
      setError('Operación cancelada: PIN no proporcionado.');
      return;
    }

    setSaving(true);
    setError(null);

    const supabase = createSupabaseBrowserClient();
    const payload = Object.entries(edits).map(([wo_number, patch]) => ({
      wo_number,
      scheduled_date: patch.scheduled_date ?? null,
      comments:       patch.comments       ?? null,
    }));

    const { error: dbErr } = await supabase
      .from('ot_planning')
      .upsert(payload, { onConflict: 'wo_number' });

    setSaving(false);

    if (dbErr) {
      setError(`Error guardando: ${dbErr.message}`);
      return;
    }

    setEdits({});
    setSavedAt(new Date());
  }, [edits, requestPin]);

  const dirtyCount = Object.keys(edits).length;

  return (
    <>
      {/* Selector de mes (siempre visible, top right) */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="text-[12px] text-neutral-500">
          {isHistorical ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-env" />
              <strong className="text-brand-env">Modo histórico</strong> · solo lectura
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-pass animate-pulse" />
              <strong className="text-brand-pass">En vivo</strong> · editable
            </span>
          )}
        </div>
        <MonthSelector
          value={selectedMonth}
          onChange={setSelectedMonth}
          availableMonths={availableMonths}
        />
      </div>

      {/* Barra de cambios pendientes — solo en modo en vivo */}
      {!isHistorical && (
        <UnsavedChangesBar
          count={dirtyCount}
          saving={saving}
          error={error}
          savedAt={savedAt}
          onFlush={onFlush}
          onDiscard={() => { setEdits({}); setError(null); }}
        />
      )}

      {/* Error de carga histórica */}
      {histError && (
        <div className="mb-4 bg-brand-failSoft border border-brand-fail/30 text-brand-fail rounded-xl px-5 py-3 text-[13px]">
          Error cargando el histórico: {histError}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-neutral-200 mb-4 flex-wrap">
        {TABS.map((t) => {
          const active = t.key === activeTab;
          let count;
          if (isHistorical) {
            count = t.key === 'global'
              ? mergedRows.length
              : mergedRows.filter((r) => r.tab_key === t.key).length;
          } else {
            count = filterByTab(mergedRows, t.key).length;
          }
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={`px-4 py-2 text-[13px] font-semibold border-b-2 -mb-px transition ${
                active
                  ? 'border-brand-amber text-brand-ink'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800'
              }`}
            >
              {t.label}
              <span className={`ml-2 text-[10.5px] px-1.5 py-0.5 rounded-md ${
                active ? 'bg-brand-amber/20 text-amber-700' : 'bg-neutral-100 text-neutral-500'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Loader del histórico */}
      {loadingHist ? (
        <div className="bg-white border border-neutral-200 rounded-xl shadow-card p-10 text-center text-[13px] text-neutral-500">
          Cargando histórico de {selectedMonth}…
        </div>
      ) : (
        <>
          <CronogramaTable
            rows={visibleRows}
            onCellEdit={onCellEdit}
            readOnly={isHistorical}
            isHistorical={isHistorical}
            monthStart={monthStart}
            monthEnd={monthEnd}
          />

          <div className="mt-7">
            <CronogramaDashboard
              rows={visibleRows}
              isHistorical={isHistorical}
              historicalKpis={kpisForActiveTab}
              selectedMonth={selectedMonth}
            />
          </div>
        </>
      )}
    </>
  );
}