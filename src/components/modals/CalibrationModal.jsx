'use client';
// components/modals/CalibrationModal.jsx
// =========================================================================
// CALIBRATION MODAL — Sprint 5 (sin Signature Pad)
// -------------------------------------------------------------------------
// Cambios respecto al Sprint 4:
//   ❌  Quitado el <SignaturePad /> por completo (canvas era ineficiente
//       y la planta no firma así en producción).
//   ✅  Añadido un dropdown nativo <select> "Supervisor que aprueba" con
//       lista estática (Henry, Romeo, Adán, Marcela).
//   ✅  Al elegir un supervisor se renderiza al instante su firma escaneada
//       (base64 PNG extraída del v4) más su nombre y cargo.
//   ✅  La firma del técnico ya NO se captura. El registro del técnico
//       responsable se hace por el usuario autenticado (auth.uid()) que
//       quedó como performed_by en calibration_events.
//
// Validaciones pre-submit:
//   - rango mín/máx presentes
//   - 9 puntos con lectura
//   - supervisor seleccionado (obligatorio para aprobar el certificado)
//
// Esta misma vista previa de la firma del supervisor se inyectará tal cual
// en el PDF descargable que arma el siguiente sprint.
// =========================================================================

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useCanSignCalibration } from '@/components/auth/UserProvider';
import CalibrationGrid from './CalibrationGrid';
import { saveCalibrationEvent } from './actions';
import { SUPERVISORS, getSupervisorById } from '@/lib/supervisors';

const INITIAL_FORM = {
  sap_wo: '',
  instrument_tag: '',
  serial_number: '',
  pattern_used: '',
  range_min: '',
  range_max: '',
  unit: '',
  observations: '',
  modo: 'mA', // 'mA' | 'fisico'
  supervisor_id: '', // ← elegido del dropdown
};

export default function CalibrationModal() {
  const router = useRouter();

  const [open, setOpen]                   = useState(false);
  const [position, setPosition]           = useState(null);
  const [form, setForm]                   = useState(INITIAL_FORM);
  const [grid, setGrid]                   = useState({ points: [], globalResult: 'PENDING' });
  const [saving, setSaving]               = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [error, setError]                 = useState(null);

  const canSign     = useCanSignCalibration();
  const { profile } = useUser() || {};

  // Supervisor seleccionado (lookup directo en el array)
  const supervisor = getSupervisorById(form.supervisor_id);

  // Escuchar el evento global para abrir el modal y precargar la posición
  useEffect(() => {
    function handler(e) {
      const p = e.detail;
      setPosition(p);
      setForm({
        ...INITIAL_FORM,
        sap_wo:       p.sap_open_wo || '',
        pattern_used: p.default_pattern || '',
        range_min:    p.range_min ?? '',
        range_max:    p.range_max ?? '',
        unit:         p.unit || '',
      });
      setGrid({ points: [], globalResult: 'PENDING' });
      setError(null);
      setOpen(true);
    }
    window.addEventListener('open:calibration', handler);
    return () => window.removeEventListener('open:calibration', handler);
  }, []);

  if (!open || !position) return null;

  function setField(k, v) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);

    // ── Validaciones pre-submit ───────────────────────────────────────────
    if (!form.range_min || !form.range_max) {
      setError('Falta el rango mín/máx del instrumento.');
      return;
    }
    if (!grid.points || grid.points.length !== 9) {
      setError('Faltan los 9 puntos de calibración.');
      return;
    }
    const conLectura = grid.points.filter(
      (p) => p.reading_ma != null || p.reading_value != null
    ).length;
    if (conLectura < 9) {
      setError(`Faltan ${9 - conLectura} lecturas en la tabla de puntos.`);
      return;
    }
    if (!supervisor) {
      setError('Selecciona el supervisor que aprueba la calibración.');
      return;
    }

    // ── Payload para el server action ─────────────────────────────────────
    const payload = {
      position_id:    position.id,
      sap_wo:         form.sap_wo || null,
      instrument_tag: form.instrument_tag || null,
      serial_number:  form.serial_number || null,
      pattern_used:   form.pattern_used || null,
      range_min:      Number(form.range_min),
      range_max:      Number(form.range_max),
      unit:           form.unit || null,
      tolerance_pct:  position.tolerance_pct ?? 0.5,
      sensor_type:    position.sensor_type || null,
      observations:   form.observations || null,
      // ─ Supervisor (reemplaza a las firmas digitales) ────────────────────
      supervisor_name:      supervisor.name,
      supervisor_signature: supervisor.signature, // base64 PNG → certificado PDF
      // performed_by lo asigna el RPC con auth.uid() (técnico = usuario logueado)
      result: grid.globalResult,
      points: grid.points,
    };

    setSaving(true);
    const res = await saveCalibrationEvent(payload);
    setSaving(false);

    if (!res.ok) {
      setError(res.error || 'Error al guardar la calibración.');
      return;
    }

    // ── 🆕 SPRINT 6: Generar y descargar el certificado PDF ─────────────────
    // El evento ya está persistido en Supabase. La descarga del PDF es un
    // post-step "best effort": si falla por algún motivo del navegador, no
    // bloqueamos al usuario — el certificado siempre se puede re-generar
    // desde la vista de detalle del evento (sprint posterior).
    setGeneratingPdf(true);
    try {
      await generateAndDownloadCertificate({
        position,
        form,
        grid,
        technician: {
          name: profile?.full_name || profile?.email || 'Técnico',
          role: roleLabel(profile?.role),
        },
        supervisor: {
          name: supervisor.name,
          role: supervisor.role,
          signature: supervisor.signature,
        },
        performedAt: new Date().toISOString(),
        tolerance: position.tolerance_pct ?? 0.5,
      });
    } catch (pdfError) {
      console.error('[CalibrationModal] PDF generation failed:', pdfError);
      // No mostramos error fatal — el save ya fue exitoso.
      // Sólo dejamos rastro en console para diagnóstico.
    } finally {
      setGeneratingPdf(false);
    }

    setOpen(false);
    router.refresh();
  }

  const tolerance = position.tolerance_pct ?? 0.5;

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) setOpen(false);
      }}
    >
      <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[94vh] overflow-hidden shadow-pop border-t-4 border-brand-ink flex flex-col">

        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="px-6 py-4 border-b border-neutral-200 flex items-start justify-between">
          <div>
            <span className="px-2 py-0.5 rounded-md bg-brand-ink text-brand-amber text-[10.5px] font-bold uppercase tracking-wider">
              Calibración interna
            </span>
            <div className="text-[18px] font-bold mt-1">
              CALIBRACIÓN — {position.equipment_name}
            </div>
            <div className="text-[12.5px] text-neutral-500">
              POS <span className="font-mono">{position.pos_mtto}</span> · {position.description || 'Sin descripción'}
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            disabled={saving}
            className="text-neutral-400 hover:text-neutral-900 text-xl px-2 py-1 rounded-md hover:bg-neutral-100 disabled:opacity-40"
          >
            ✕
          </button>
        </div>

        {/* ── Body scroll ───────────────────────────────────────────────── */}
        <form onSubmit={onSubmit} className="px-6 py-5 overflow-y-auto space-y-5 flex-1">

          {/* Banner viewer */}
          {!canSign && (
            <div className="flex gap-3 p-3.5 rounded-lg bg-brand-warnSoft border-l-4 border-brand-warn">
              <svg className="w-5 h-5 mt-0.5 text-amber-700 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <div className="text-[12.5px] text-amber-900 leading-snug">
                <strong>Modo lectura:</strong> tu rol ({profile?.role}) no permite firmar
                calibraciones. Solicita a Automatización el permiso &quot;{Técnico}&quot; o &quot;{Admin}&quot;
                para guardar registros.
              </div>
            </div>
          )}

          {/* Datos de la POS (siempre visibles, no editables) */}
          <div className="grid grid-cols-3 gap-3">
            <ReadField label="POS MTTO" value={position.pos_mtto} mono />
            <ReadField label="Área"     value={position.area_name || '—'} />
            <ReadField label="Plan MTTO" value={position.maintenance_plan || '—'} />
          </div>

          {/* Datos OT */}
<div className="grid grid-cols-3 gap-3">
  <div>
    <InputField label="Orden de Trabajo (SAP)" value={form.sap_wo}
      onChange={(v) => setField('sap_wo', v)} placeholder="Ej. 10058493" disabled={!canSign} />
    {/* Sprint 13: hint visible cuando la OT vino auto-llenada desde la vista
        (sap_open_wo). El técnico puede sobreescribirla si SAP abrió otra. */}
    {form.sap_wo && position.sap_open_wo && form.sap_wo === position.sap_open_wo && (
      <div className="mt-1 flex items-center gap-1 text-[10.5px] text-brand-env">
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        Auto-llenado desde IW37N (puedes sobrescribir)
      </div>
    )}
  </div>
  <InputField label="Tag instrumento" value={form.instrument_tag}
    onChange={(v) => setField('instrument_tag', v)} placeholder="Ej. PT-101" disabled={!canSign} />
  <InputField label="N° serie (DUT)" value={form.serial_number}
    onChange={(v) => setField('serial_number', v)} placeholder="S/N transmisor" disabled={!canSign} />
</div>

          {/* Patrón usado */}
          <div className="rounded-xl border border-neutral-200 bg-gradient-to-br from-neutral-50 to-white p-4">
            <label className="text-[12px] font-bold text-neutral-800 uppercase tracking-wider flex items-center gap-2 mb-2">
              <svg className="w-4 h-4 text-brand-amber" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2l2.4 7.4H22l-6.2 4.5L18.2 22 12 17.3 5.8 22l2.4-8.1L2 9.4h7.6L12 2z" />
              </svg>
              Patrón usado
            </label>
            <select
              value={form.pattern_used}
              onChange={(e) => setField('pattern_used', e.target.value)}
              disabled={!canSign}
              className="w-full bg-white border-2 border-neutral-300 rounded-lg px-3 py-3 text-[13.5px] font-semibold focus:ring-4 focus:ring-brand-amber/30 focus:border-brand-amber outline-none cursor-pointer disabled:bg-neutral-100"
            >
              <option value="">— Seleccionar patrón —</option>
              <option>Calibrador Multifunción Fluke 754</option>
              <option>Calibrador Fluke 789 ProcessMeter</option>
              <option>Pozo Seco Fluke 9100S</option>
              <option>Patrón de pH Hanna HI98191</option>
              <option>Calibrador de Presión Druck DPI 612</option>
              <option>Microcalibrador Omega CL3515R</option>
            </select>
            <div className="mt-3 flex items-start gap-2.5 p-3 rounded-lg bg-brand-amberSoft/60 border border-brand-amber/40">
              <svg className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <div className="text-[12.5px] text-amber-900">
                <strong>Trazabilidad automática:</strong> el certificado del patrón
                seleccionado se adjuntará al PDF final como anexo.
              </div>
            </div>
          </div>

          {/* Configuración del lazo */}
          <div className="grid grid-cols-4 gap-3 items-end">
            <InputField label="Rango mín (4 mA)" type="number" value={form.range_min}
              onChange={(v) => setField('range_min', v)} placeholder="0" disabled={!canSign} />
            <InputField label="Rango máx (20 mA)" type="number" value={form.range_max}
              onChange={(v) => setField('range_max', v)} placeholder="10" disabled={!canSign} />
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-600 mb-1">Unidad</label>
              <select value={form.unit} onChange={(e) => setField('unit', e.target.value)}
                disabled={!canSign}
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-[13px] bg-white focus:ring-2 focus:ring-brand-amber focus:border-brand-amber outline-none disabled:bg-neutral-100"
              >
                <option value="">—</option>
                <option>bar</option><option>PSI</option><option>mbar</option>
                <option>°C</option><option>°F</option>
                <option>pH</option>
                <option>µS</option><option>mS</option>
                <option>EBC</option><option>ppm</option><option>°Plato</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-600 mb-1">Modo de entrada</label>
              <div className="flex border-2 border-neutral-300 rounded-lg overflow-hidden text-[12px] font-bold">
                <button type="button" onClick={() => canSign && setField('modo', 'mA')} disabled={!canSign}
                  className={`flex-1 py-2 ${form.modo === 'mA' ? 'bg-brand-ink text-brand-amber' : 'bg-white hover:bg-neutral-50'}`}>
                  mA
                </button>
                <button type="button" onClick={() => canSign && setField('modo', 'fisico')} disabled={!canSign}
                  className={`flex-1 py-2 ${form.modo === 'fisico' ? 'bg-brand-ink text-brand-amber' : 'bg-white hover:bg-neutral-50'}`}>
                  Físico
                </button>
              </div>
            </div>
          </div>

          {/* ⭐ GRID DE 9 PUNTOS ⭐ */}
          <CalibrationGrid
            rangeMin={form.range_min}
            rangeMax={form.range_max}
            unit={form.unit}
            tolerance={tolerance}
            modo={form.modo}
            readOnly={!canSign}
            onChange={setGrid}
          />

          {/* ⭐ TÉCNICO + SUPERVISOR (sin canvas) ⭐ */}
          <div className="grid grid-cols-2 gap-4">
            {/* Técnico = usuario autenticado (no firma — sólo se muestra) */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-600 mb-1">
                Técnico responsable
              </label>
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-brand-ink text-brand-amber grid place-items-center font-bold text-sm">
                  {(profile?.full_name || profile?.email || 'NN').slice(0, 2).toUpperCase()}
                </div>
                <div className="leading-tight">
                  <div className="text-[13px] font-bold">{profile?.full_name || profile?.email}</div>
                  <div className="text-[11.5px] text-neutral-500 capitalize">
                    {profile?.role} · queda registrado automáticamente
                  </div>
                </div>
              </div>
            </div>

            {/* Supervisor = dropdown + preview INSTANTÁNEO */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-600 mb-1">
                Supervisor que aprueba <span className="text-brand-fail">*</span>
              </label>
              <select
                value={form.supervisor_id}
                onChange={(e) => setField('supervisor_id', e.target.value)}
                disabled={!canSign}
                className="w-full border-2 border-neutral-300 rounded-lg px-3 py-2.5 text-[13.5px] font-semibold focus:ring-4 focus:ring-brand-amber/30 focus:border-brand-amber outline-none cursor-pointer bg-white disabled:bg-neutral-100"
              >
                <option value="">— Seleccionar supervisor —</option>
                {SUPERVISORS.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>

              {/* Preview inmediato de la firma (mismo bloque que irá al PDF) */}
              <SupervisorSignaturePreview supervisor={supervisor} />
            </div>
          </div>

          {/* Observaciones */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-600 mb-1">
              Observaciones y ajustes
            </label>
            <textarea
              value={form.observations}
              onChange={(e) => setField('observations', e.target.value)}
              disabled={!canSign}
              rows={2}
              placeholder="Ajustes de cero/span, cambio de sellos, etc."
              className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-[13px] focus:ring-2 focus:ring-brand-amber focus:border-brand-amber outline-none resize-y disabled:bg-neutral-100"
            />
          </div>

          {/* Error banner */}
          {error && (
            <div className="text-[12.5px] text-brand-fail bg-brand-failSoft border border-brand-fail/30 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          {/* Banner mientras se genera el PDF (post-save) */}
          {generatingPdf && (
            <div className="text-[12.5px] text-brand-env bg-brand-envSoft border border-brand-env/30 rounded-md px-3 py-2 flex items-center gap-2">
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/>
                <path d="M22 12a10 10 0 0 1-10 10"/>
              </svg>
              Generando certificado PDF… la descarga inicia en un momento.
            </div>
          )}

          {/* Footer */}
          <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200">
            <button type="button" onClick={() => setOpen(false)} disabled={saving || generatingPdf}
              className="px-4 py-2 rounded-lg border border-neutral-300 text-[13px] font-semibold hover:bg-neutral-100 disabled:opacity-60">
              {canSign ? 'Cancelar' : 'Cerrar'}
            </button>
            {canSign && (
              <button type="submit" disabled={saving || generatingPdf}
                className="px-4 py-2 rounded-lg bg-brand-amber text-black text-[13px] font-bold hover:bg-brand-amberHover disabled:opacity-60 inline-flex items-center gap-2">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                {saving ? 'Guardando…' : generatingPdf ? 'Generando PDF…' : 'Guardar y descargar PDF'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Helper: descargar el certificado PDF ────────────────────────────────
// Importa @react-pdf/renderer Y el componente CertificatePDF de forma
// DINÁMICA para que ninguno de los dos esté en el bundle inicial — el peso
// se carga sólo cuando el usuario realmente guarda una calibración.
async function generateAndDownloadCertificate(data) {
  const [{ pdf }, { default: CertificatePDF }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('@/components/pdf/CertificatePDF'),
  ]);

  // Generar el blob del documento
  const doc = <CertificatePDF {...data} />;
  const blob = await pdf(doc).toBlob();

  // Construir nombre del archivo: Certificado_<POS>_<YYYY-MM-DD>.pdf
  const dateIso = new Date(data.performedAt).toISOString().split('T')[0];
  const filename = `Certificado_${data.position.pos_mtto}_${dateIso}.pdf`;

  // Forzar descarga en el navegador (sin servidor de por medio)
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Liberar memoria del blob (delay para asegurar que el download arrancó)
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// Mapea los rol-keys de Supabase a etiquetas visibles para el PDF
function roleLabel(role) {
  return { admin: 'Admin', tecnico: 'Técnico', viewer: 'Viewer' }[role] || 'Técnico';
}

// ─── Sub-componente: Preview de la firma del supervisor ──────────────────
// Cuando hay supervisor seleccionado muestra: imagen + nombre + cargo.
// Cuando no, muestra placeholder. ESTE MISMO bloque se reutiliza en el
// componente <CertificatePDF>.
function SupervisorSignaturePreview({ supervisor }) {
  if (!supervisor) {
    return (
      <div className="mt-2 rounded-lg border-2 border-dashed border-neutral-300 bg-neutral-50 h-28 grid place-items-center text-[12px] text-neutral-400">
        Elige un supervisor para mostrar su firma
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-neutral-300 bg-white p-3 flex flex-col items-center">
      {/* Firma escaneada (base64 PNG embebido) */}
      <img
        src={supervisor.signature}
        alt={`Firma de ${supervisor.name}`}
        className="max-h-16 object-contain"
      />
      {/* Línea horizontal + nombre + cargo (formato sello/firma de planta) */}
      <div className="w-full border-t border-neutral-400 mt-1 pt-1 text-center">
        <div className="text-[13px] font-bold leading-tight">{supervisor.name}</div>
        <div className="text-[11px] text-neutral-500 leading-tight">{supervisor.role}</div>
      </div>
    </div>
  );
}

// ─── Sub-componentes de formulario ───────────────────────────────────────
function ReadField({ label, value, mono = false }) {
  return (
    <div>
      <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-600 mb-1">
        {label}
      </label>
      <input readOnly value={value ?? ''}
        className={`w-full border border-neutral-300 rounded-lg px-3 py-2 text-[13px] bg-neutral-100 outline-none ${mono ? 'font-mono font-semibold' : ''}`} />
    </div>
  );
}

function InputField({ label, value, onChange, placeholder, disabled = false, type = 'text' }) {
  return (
    <div>
      <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-600 mb-1">
        {label}
      </label>
      <input type={type} value={value ?? ''} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} disabled={disabled}
        className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-[13px] bg-white focus:ring-2 focus:ring-brand-amber focus:border-brand-amber outline-none disabled:bg-neutral-100" />
    </div>
  );
}
