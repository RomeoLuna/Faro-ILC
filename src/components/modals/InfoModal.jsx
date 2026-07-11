'use client';
// components/modals/InfoModal.jsx
// =========================================================================
// INFO MODAL — Sprint 40b (detalle completo de POS)
// -------------------------------------------------------------------------
// Modal read-only con toda la información de una POS. Se abre desde el
// botón "Info" de la card mobile (o desde donde quieras vía el evento
// global 'open:position-info').
//
// Full-screen en mobile, contenido en desktop.
// =========================================================================

import { useEffect, useState } from 'react';

// Helper local: formateo de fecha ISO → "DD Mes YYYY"
function formatDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return String(iso);
  const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return `${String(d).padStart(2, '0')} ${MESES[m - 1]} ${y}`;
}

function primaryToken(status) {
  if (!status) return null;
  return String(status).trim().slice(0, 4).replace(/\.$/, '');
}

export default function InfoModal() {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);

  useEffect(() => {
    function handler(e) {
      setPosition(e.detail);
      setOpen(true);
    }
    window.addEventListener('open:position-info', handler);
    return () => window.removeEventListener('open:position-info', handler);
  }, []);

  if (!open || !position) return null;

  const p = position;

  // Semáforo de estado
  const statusMeta = {
    VENCIDO:         { label: 'Vencido',            cls: 'bg-brand-failSoft text-brand-fail border-brand-fail/30' },
    PROXIMO_7:       { label: 'Próximo a vencer',   cls: 'bg-brand-warnSoft text-amber-700 border-brand-warn/30' },
    VIGENTE:         { label: 'Vigente',            cls: 'bg-brand-passSoft text-brand-pass border-brand-pass/30' },
    NUNCA_CALIBRADO: { label: 'Nunca calibrado',    cls: 'bg-neutral-200 text-neutral-700 border-neutral-300' },
  }[p.status] || { label: p.status || '—', cls: 'bg-neutral-100 text-neutral-700 border-neutral-300' };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-0 md:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="bg-white w-full h-full md:h-auto md:rounded-2xl md:max-w-2xl md:max-h-[94vh] overflow-hidden shadow-pop border-t-4 border-brand-ink flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-neutral-200 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10.5px] uppercase tracking-wider text-neutral-500 font-bold mb-0.5">
              Detalle de posición
            </div>
            <div className="text-[16px] font-bold text-neutral-900 break-words">
              {p.equipment_name || '—'}
            </div>
            <div className="text-[12.5px] text-neutral-500 mt-0.5 break-words">
              POS <span className="font-mono font-semibold text-neutral-700">{p.pos_mtto}</span>
              {p.description && <> · {p.description}</>}
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="shrink-0 text-neutral-400 hover:text-neutral-900 text-xl px-2 py-1 rounded-md hover:bg-neutral-100"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* Cuerpo scrolleable */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          {/* Chip de estado grande */}
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-bold border ${statusMeta.cls}`}>
              <span className={`w-2 h-2 rounded-full ${
                p.status === 'VENCIDO' ? 'bg-brand-fail'
                : p.status === 'PROXIMO_7' ? 'bg-brand-warn'
                : p.status === 'VIGENTE' ? 'bg-brand-pass'
                : 'bg-neutral-500'
              }`}></span>
              {statusMeta.label}
            </span>
            {p.days_remaining != null && (
              <span className="text-[11.5px] text-neutral-500">
                {p.days_remaining >= 0
                  ? `Vence en ${p.days_remaining} d`
                  : `Atraso: ${Math.abs(p.days_remaining)} d`}
              </span>
            )}
          </div>

          {/* Sección: Ubicación y plan */}
          <Section title="Ubicación y plan">
            <FieldGrid>
              <Field label="Área"          value={p.area || '—'} />
              <Field label="Sub-área"      value={p.sub_area || '—'} />
              <Field label="Plan MTTO"     value={p.maintenance_plan || '—'} />
              <Field label="Frecuencia"    value={p.frequency_label || '—'} />
              <Field label="Tipo sensor"   value={p.sensor_type || '—'} />
              <Field label="Tolerancia"    value={p.tolerance_pct != null ? `±${p.tolerance_pct}%` : '—'} />
            </FieldGrid>
          </Section>

          {/* Sección: Rango */}
          {(p.range_min != null || p.range_max != null || p.unit) && (
            <Section title="Rango del instrumento">
              <FieldGrid>
                <Field label="Rango mín" value={p.range_min != null ? `${p.range_min} ${p.unit || ''}` : '—'} />
                <Field label="Rango máx" value={p.range_max != null ? `${p.range_max} ${p.unit || ''}` : '—'} />
                <Field label="Unidad"    value={p.unit || '—'} />
              </FieldGrid>
            </Section>
          )}

          {/* Sección: Última calibración */}
          <Section title="Última calibración en SAP">
            <div className="space-y-2">
              <SapRow
                label="Última (Inicio Ext.)"
                dateIso={p.last_sap_date_extrema}
                woNumber={p.last_closed_wo}
                sapStatus={p.last_sap_status}
              />
              <SapRow
                label="Última (Cierre)"
                dateIso={p.last_sap_fecha_cierre}
                woNumber={p.last_closed_wo}
                sapStatus={p.last_sap_status}
              />
              <SapRow
                label="Última (NOTI)"
                dateIso={p.last_noti_date}
                woNumber={p.last_noti_wo}
                sapStatus={p.last_noti_status}
              />
            </div>
          </Section>

          {/* Sección: Próxima calibración */}
          <Section title="Próxima calibración (SAP)">
            <div className={`rounded-lg border-2 p-3 ${
              p.status === 'VENCIDO'
                ? 'border-brand-fail/40 bg-brand-failSoft/30'
                : p.status === 'PROXIMO_7'
                ? 'border-brand-warn/40 bg-brand-warnSoft/40'
                : 'border-brand-pass/40 bg-brand-passSoft/30'
            }`}>
              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <div className="text-[10.5px] uppercase tracking-wider font-bold text-neutral-600 mb-0.5">
                    Próxima planificada
                  </div>
                  <div className="text-[18px] font-bold text-neutral-900">
                    {formatDate(p.next_sap_date)}
                  </div>
                </div>
                {p.sap_open_wo && (
                  <div className="text-right">
                    <div className="text-[10.5px] text-neutral-500 uppercase tracking-wider font-bold mb-0.5">
                      OT
                    </div>
                    <div className="text-[12px] font-mono font-semibold text-neutral-800">
                      {p.sap_open_wo}
                    </div>
                    {p.sap_open_status && (
                      <span
                        title={p.sap_open_status}
                        className="mt-1 inline-block px-1.5 py-0.5 rounded bg-brand-ink text-brand-amber font-bold tracking-wider text-[10.5px]"
                      >
                        {primaryToken(p.sap_open_status)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Section>

          {/* Sección: Serie / Tag */}
          {(p.serial_number || p.instrument_tag) && (
            <Section title="Identificación">
              <FieldGrid>
                <Field label="Tag / ID"   value={p.instrument_tag || '—'} />
                <Field label="N° Serie"   value={p.serial_number  || '—'} />
              </FieldGrid>
            </Section>
          )}
        </div>

        {/* Footer con cerrar */}
        <div className="px-5 py-3 border-t border-neutral-200 flex justify-end">
          <button
            onClick={() => setOpen(false)}
            className="px-4 py-2 rounded-lg border border-neutral-300 text-[13px] font-semibold hover:bg-neutral-100"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-componentes ──────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-wider text-neutral-500 font-bold mb-2">
        {title}
      </div>
      {children}
    </div>
  );
}

function FieldGrid({ children }) {
  return (
    <div className="grid grid-cols-2 gap-2">{children}</div>
  );
}

function Field({ label, value }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50/40 px-3 py-2">
      <div className="text-[9.5px] uppercase tracking-wider text-neutral-500 font-bold mb-0.5">
        {label}
      </div>
      <div className="text-[13px] font-semibold text-neutral-800 break-words">
        {value}
      </div>
    </div>
  );
}

function SapRow({ label, dateIso, woNumber, sapStatus }) {
  if (!dateIso && !woNumber) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-neutral-50/40 px-3 py-2">
        <span className="text-[11px] uppercase tracking-wider font-bold text-neutral-500">
          {label}
        </span>
        <span className="text-neutral-400 text-[13px]">—</span>
      </div>
    );
  }

  const code = primaryToken(sapStatus);

  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[10.5px] uppercase tracking-wider font-bold text-neutral-500">
          {label}
        </span>
        {code && (
          <span
            title={sapStatus}
            className="px-1.5 py-[1px] rounded bg-brand-ink text-brand-amber font-bold tracking-wider text-[10.5px]"
          >
            {code}
          </span>
        )}
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[14px] font-bold text-neutral-800">
          {formatDate(dateIso)}
        </span>
        {woNumber && (
          <span className="text-[11.5px] font-mono text-neutral-500">
            OT {woNumber}
          </span>
        )}
      </div>
    </div>
  );
} 