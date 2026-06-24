'use client';
// components/modals/HistoryModal.jsx
// =========================================================================
// HISTORY MODAL — Sprint 7
// -------------------------------------------------------------------------
// Drawer lateral derecho (no full-screen, para que el usuario vea el faro
// detrás como referencia) que muestra el histórico de calibraciones de
// una POS MTTO específica.
//
// Se abre escuchando CustomEvent('open:history', { detail: position }).
// Carga los datos via la server action getCalibrationHistory(positionId).
//
// Por cada evento muestra una tarjeta con:
//   - Fecha + hora del performed_at
//   - Badge del resultado global (PASS / FAIL / PASS_LIMITE / PENDING)
//   - Técnico responsable + supervisor que aprobó
//   - Observaciones reales (sin la línea "Aprobado por:")
//   - Botón "Descargar PDF" → regenera el certificado al vuelo
//
// Para eventos externos (source='external') el botón cambia a
// "Ver PDF original" y abre el `external_cert_pdf_url` en una pestaña.
// =========================================================================

import { useEffect, useState } from 'react';
import { getCalibrationHistory } from './actions';
import {
  generateAndDownloadCertificate,
  inferModoFromPoints,
} from '@/lib/pdf-download';
import { SUPERVISORS } from '@/lib/supervisors';

export default function HistoryModal() {
  const [open, setOpen]         = useState(false);
  const [position, setPosition] = useState(null);
  const [events, setEvents]     = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  // Escuchar el evento global para abrir el drawer
  useEffect(() => {
    async function handler(e) {
      const p = e.detail;
      setPosition(p);
      setEvents([]);
      setError(null);
      setOpen(true);
      setLoading(true);
      const res = await getCalibrationHistory(p.id);
      setLoading(false);
      if (res.ok) {
        setEvents(res.events);
      } else {
        setError(res.error);
      }
    }
    window.addEventListener('open:history', handler);
    return () => window.removeEventListener('open:history', handler);
  }, []);

  if (!open || !position) return null;

  async function onDownload(ev) {
    // Externos: simplemente abrir el PDF que el proveedor subió
    if (ev.source === 'external') {
      if (ev.external_cert_pdf_url) {
        window.open(ev.external_cert_pdf_url, '_blank', 'noopener');
      }
      return;
    }

    // Internos: regenerar al vuelo con nuestro generador
    setDownloadingId(ev.id);
    try {
      // Lookup del supervisor en el catálogo para obtener su rol
      const supervisor = SUPERVISORS.find((s) => s.name === ev.supervisor_name);

      await generateAndDownloadCertificate({
        position: {
          pos_mtto: position.pos_mtto,
          equipment_name: position.equipment_name,
          description: position.description,
          area_name: position.area_name,
        },
        form: {
          sap_wo:         ev.sap_wo,
          instrument_tag: ev.instrument_tag,
          serial_number:  ev.serial_number,
          pattern_used:   ev.pattern_used,
          range_min:      ev.range_min,
          range_max:      ev.range_max,
          unit:           ev.unit,
          observations:   ev.observations_clean,
          modo:           inferModoFromPoints(ev.points),
        },
        grid: {
          points: ev.points,
          globalResult: ev.result,
        },
        technician: ev.technician,
        supervisor: {
          name: ev.supervisor_name || '—',
          role: ev.supervisor_role || 'Supervisor',
          // La firma viene en el evento mismo (la base64 que se guardó al firmar)
          signature: ev.supervisor_signature,
        },
        performedAt: ev.performed_at,
        tolerance:   ev.tolerance_pct ?? 0.5,
      });
    } catch (pdfError) {
      console.error('[HistoryModal] PDF regeneration failed:', pdfError);
      alert('No se pudo regenerar el PDF. Revisa la consola para más detalle.');
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      // Click fuera del drawer = cerrar
      onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
    >
      {/* Backdrop semi-transparente (no oscurece tanto como el modal grande) */}
      <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />

      {/* DRAWER lateral derecho */}
      <aside className="relative bg-white w-full max-w-xl h-full shadow-pop flex flex-col border-l-4 border-brand-amber animate-[slideIn_0.2s_ease-out]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-neutral-200 flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <span className="px-2 py-0.5 rounded-md bg-brand-ink text-brand-amber text-[10.5px] font-bold uppercase tracking-wider">
              Histórico de calibraciones
            </span>
            <div className="text-[17px] font-bold mt-1 truncate">
              {position.equipment_name}
            </div>
            <div className="text-[12px] text-neutral-500">
              POS <span className="font-mono">{position.pos_mtto}</span>
              {position.area_name && <> · {position.area_name}</>}
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="text-neutral-400 hover:text-neutral-900 text-xl px-2 py-1 rounded-md hover:bg-neutral-100 shrink-0"
          >
            ✕
          </button>
        </div>

        {/* Body — timeline scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-5">

          {/* Estados de carga / error / vacío */}
          {loading && (
            <div className="flex items-center justify-center py-12 text-neutral-500 text-[13px]">
              <svg className="w-4 h-4 mr-2 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/>
                <path d="M22 12a10 10 0 0 1-10 10"/>
              </svg>
              Cargando histórico…
            </div>
          )}

          {error && !loading && (
            <div className="rounded-lg bg-brand-failSoft border border-brand-fail/30 text-brand-fail text-[12.5px] px-3 py-3">
              Error cargando histórico: {error}
            </div>
          )}

          {!loading && !error && events.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <svg className="w-10 h-10 text-neutral-300 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <div className="text-[13px] font-semibold text-neutral-700">
                Aún no hay calibraciones registradas
              </div>
              <div className="text-[11.5px] text-neutral-500 mt-1">
                Cuando se firme una calibración aparecerá aquí.
              </div>
            </div>
          )}

          {/* TIMELINE de tarjetas */}
          {!loading && !error && events.length > 0 && (
            <ol className="relative border-l-2 border-neutral-200 ml-2 space-y-5">
              {events.map((ev) => (
                <EventCard
                  key={ev.id}
                  event={ev}
                  downloading={downloadingId === ev.id}
                  onDownload={() => onDownload(ev)}
                />
              ))}
            </ol>
          )}
        </div>

        {/* Footer simple con conteo */}
        <div className="px-5 py-3 border-t border-neutral-200 bg-neutral-50 text-[11.5px] text-neutral-500 flex justify-between">
          <span>
            {events.length} evento{events.length === 1 ? '' : 's'} registrado{events.length === 1 ? '' : 's'}
          </span>
          <span>Datos en vivo desde Supabase</span>
        </div>
      </aside>

      {/* keyframe inline */}
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0.4; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ─── Sub-componente: tarjeta de un evento ────────────────────────────────
function EventCard({ event, downloading, onDownload }) {
  const date = new Date(event.performed_at);
  const fecha = date.toLocaleDateString('es-SV', { day: '2-digit', month: 'short', year: 'numeric' });
  const hora  = date.toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit', hour12: false });
  const isExternal = event.source === 'external';

  return (
    <li className="ml-4">
      {/* Marcador del timeline (círculo en la línea) */}
      <span className={`absolute -left-[7px] w-3 h-3 rounded-full border-2 border-white ${
        event.result === 'PASS'        ? 'bg-brand-pass'
        : event.result === 'PASS_LIMITE' ? 'bg-brand-warn'
        : event.result === 'FAIL'      ? 'bg-brand-fail'
        : 'bg-neutral-400'
      }`}></span>

      <div className="rounded-xl border border-neutral-200 bg-white shadow-card p-4 hover:border-neutral-300 transition">
        {/* Header de la tarjeta: fecha + badge resultado */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="text-[12px] font-bold text-neutral-800">{fecha}</div>
            <div className="text-[10.5px] text-neutral-500">{hora} hrs</div>
          </div>
          <ResultBadge result={event.result} external={isExternal} />
        </div>

        {/* Datos compactos */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px] mb-3">
          {event.sap_wo && (
            <div>
              <span className="text-neutral-500 text-[10.5px] uppercase tracking-wider font-semibold">OT SAP</span>
              <div className="font-mono font-semibold">{event.sap_wo}</div>
            </div>
          )}
          {event.instrument_tag && (
            <div>
              <span className="text-neutral-500 text-[10.5px] uppercase tracking-wider font-semibold">Tag</span>
              <div className="font-mono">{event.instrument_tag}</div>
            </div>
          )}
          {event.pattern_used && (
            <div className="col-span-2">
              <span className="text-neutral-500 text-[10.5px] uppercase tracking-wider font-semibold">Patrón</span>
              <div>{event.pattern_used}</div>
            </div>
          )}
        </div>

        {/* Firmas (técnico + supervisor) */}
        <div className="flex items-center gap-4 mb-3 text-[11.5px]">
          <div className="flex-1">
            <span className="text-neutral-500 text-[10px] uppercase tracking-wider font-semibold">Técnico</span>
            <div className="font-semibold">{event.technician?.name || '—'}</div>
            <div className="text-[10.5px] text-neutral-500">{event.technician?.role}</div>
          </div>
          <div className="flex-1">
            <span className="text-neutral-500 text-[10px] uppercase tracking-wider font-semibold">Supervisor</span>
            <div className="font-semibold">{event.supervisor_name || '—'}</div>
            <div className="text-[10.5px] text-neutral-500">{event.supervisor_role}</div>
          </div>
        </div>

        {/* Observaciones */}
        {event.observations_clean && (
          <div className="rounded-md bg-neutral-50 border border-neutral-200 px-2.5 py-2 mb-3 text-[11.5px] text-neutral-700 italic">
            “{event.observations_clean}”
          </div>
        )}

        {/* Datos del evento externo (cuando aplica) */}
        {isExternal && (
          <div className="rounded-md bg-brand-amberSoft border border-brand-amber/40 px-2.5 py-2 mb-3 text-[11.5px]">
            <strong>Proveedor:</strong> {event.external_provider || '—'}
            {event.external_cert_number && <> · Cert. {event.external_cert_number}</>}
          </div>
        )}

        {/* Acciones — Sprint 28: cohabitan PDF interno y SharePoint link */}
        <div className="flex justify-end items-center gap-2 flex-wrap">

          {/* Botón SharePoint si hay certificate_url */}
          {event.certificate_url && (
            <a
              href={event.certificate_url}
              target="_blank"
              rel="noopener noreferrer"
              title={event.certificate_url}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-brand-env text-white text-[11.5px] font-semibold hover:bg-brand-env/80"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 3h7v7M10 14L21 3M21 14v7H3V3h7" />
              </svg>
              Ver Certificado
            </a>
          )}

          {/* Botón PDF — visible si hay PDF, o si es interno (lo genera al vuelo) */}
          {(!isExternal || event.external_cert_pdf_url) && (
            <button
              type="button"
              onClick={onDownload}
              disabled={downloading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-brand-ink text-white text-[11.5px] font-semibold hover:bg-brand-steel disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {downloading ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/>
                    <path d="M22 12a10 10 0 0 1-10 10"/>
                  </svg>
                  Generando…
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                  </svg>
                  {isExternal ? 'Ver PDF original' : 'Descargar PDF'}
                </>
              )}
            </button>
          )}

          {/* Caso extremo: externo sin PDF y sin URL — mensaje informativo */}
          {isExternal && !event.external_cert_pdf_url && !event.certificate_url && (
            <span className="text-[10.5px] text-neutral-400 italic">
              Sin certificado adjunto
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

// ─── Sub-componente: badge de resultado ──────────────────────────────────
function ResultBadge({ result, external }) {
  const map = {
    PASS:        { cls: 'bg-brand-passSoft text-brand-pass', label: 'PASS' },
    PASS_LIMITE: { cls: 'bg-brand-warnSoft text-amber-700',  label: 'LÍMITE' },
    FAIL:        { cls: 'bg-brand-failSoft text-brand-fail', label: 'FAIL' },
    PENDING:     { cls: 'bg-neutral-200 text-neutral-600',   label: 'PENDIENTE' },
  };
  const m = map[result] || map.PENDING;
  return (
    <div className="flex flex-col items-end gap-1">
      <span className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-extrabold ${m.cls}`}>
        {m.label}
      </span>
      {external && (
        <span className="px-2 py-0.5 rounded text-[9.5px] font-bold uppercase tracking-wider bg-neutral-200 text-neutral-600">
          Externo
        </span>
      )}
    </div>
  );
}