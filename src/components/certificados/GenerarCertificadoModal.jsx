'use client';
// components/certificados/GenerarCertificadoModal.jsx
// =========================================================================
// GENERAR CERTIFICADO (botón general) — Corrección solicitada
// -------------------------------------------------------------------------
// A diferencia de las tarjetas de "Sin certificado" (limitadas al universo
// filtrado por fecha de corte), este modal deja elegir CUALQUIER equipo
// activo y generar un certificado para él — interno o externo — usando
// los mismos formularios globales que ya existen (CalibrationModal /
// ExternalCertModal), vía los mismos eventos que ya disparaba PendingFooter.
// =========================================================================

import { useMemo, useState } from 'react';

export default function GenerarCertificadoModal({ positions, onClose }) {
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return positions.slice(0, 30);
    return positions
      .filter((p) =>
        String(p.pos_mtto).toLowerCase().includes(q)
        || (p.equipment_name || '').toLowerCase().includes(q)
        || (p.description    || '').toLowerCase().includes(q)
        || (p.area           || '').toLowerCase().includes(q)
        || (p.tag            || '').toLowerCase().includes(q)
      )
      .slice(0, 30);
  }, [positions, query]);

  function openInterno(p) {
    window.dispatchEvent(new CustomEvent('open:calibration', {
      detail: {
        id: p.id,
        pos_mtto: p.pos_mtto,
        equipment_name: p.equipment_name,
        description: p.description,
        area: p.area,
        sub_area: p.sub_area,
        area_name: p.area_name,
        sensor_type: p.sensor_type,
        sap_open_wo: p.sap_open_wo || p.last_noti_wo,
        frequency_months: p.frequency_months,
        tag: p.tag,
        range_min: p.range_min,
        range_max: p.range_max,
        unit: p.unit,
        tolerance_pct: p.tolerance_pct,
      },
    }));
    onClose();
  }

  function openExterno(p) {
    window.dispatchEvent(new CustomEvent('open:external-cert', {
      detail: {
        id: p.id,
        pos_mtto: p.pos_mtto,
        equipment_name: p.equipment_name,
        sap_open_wo: p.sap_open_wo || p.last_noti_wo,
      },
    }));
    onClose();
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-pop border-t-4 border-brand-amber flex flex-col">

        <div className="px-6 py-4 border-b border-neutral-200 flex items-start justify-between">
          <div>
            <div className="text-[18px] font-bold">Generar certificado</div>
            <div className="text-[12.5px] text-neutral-500">
              Busca cualquier equipo activo, sin importar si aparece arriba en la lista.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-900 text-xl px-2 py-1 rounded-md hover:bg-neutral-100"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-3 border-b border-neutral-200">
          <div className="flex items-center bg-neutral-50 border border-neutral-300 rounded-lg px-3 py-2 gap-2 focus-within:ring-2 focus-within:ring-brand-amber/40 focus-within:border-brand-amber">
            <svg className="w-4 h-4 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar POS, equipo, área, TAG…"
              className="bg-transparent outline-none text-[13px] w-full"
            />
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-3 space-y-2">
          {results.length === 0 && (
            <div className="text-center text-[13px] text-neutral-500 py-10">
              Sin resultados para “{query}”.
            </div>
          )}

          {results.map((p) => (
            <div
              key={p.id}
              className="border border-neutral-200 rounded-lg px-4 py-3 flex items-center justify-between gap-3 hover:border-brand-amber/50 transition"
            >
              <div className="min-w-0">
                <div className="text-[13.5px] font-bold text-neutral-800 truncate">
                  {p.equipment_name || '—'}
                </div>
                <div className="text-[11.5px] text-neutral-500 truncate">
                  POS <span className="font-mono">{p.pos_mtto}</span>
                  {p.area ? ` · ${p.area}` : ''}
                  {p.tag ? ` · TAG ${p.tag}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => openInterno(p)}
                  className="px-2.5 py-1.5 rounded-lg bg-brand-ink text-brand-amber text-[11.5px] font-bold hover:bg-neutral-800 transition whitespace-nowrap"
                >
                  Calibración interna
                </button>
                <button
                  type="button"
                  onClick={() => openExterno(p)}
                  className="px-2.5 py-1.5 rounded-lg border-2 border-brand-amber text-brand-ink text-[11.5px] font-bold hover:bg-brand-amberSoft transition whitespace-nowrap"
                >
                  Registrar externo
                </button>
              </div>
            </div>
          ))}

          {!query && positions.length > 30 && (
            <div className="text-center text-[11.5px] text-neutral-400 pt-2">
              Mostrando los primeros 30 — escribe para buscar entre los {positions.length} equipos activos.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
