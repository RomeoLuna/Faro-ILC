'use client';
// components/modals/CalibrationModal.jsx
// =========================================================================
// CALIBRATION MODAL — Sprint 29 (paridad con HTML 8-jun-2026)
// -------------------------------------------------------------------------
// Cambios vs Sprint 5:
//   ✅ Técnico responsable ahora es INPUT de texto editable (sin auth, cada
//      técnico escribe su nombre — sustituye al chip read-only del usuario
//      autenticado que ya no existe tras Sprint 21).
//   ✅ Tipo de sensor / medidor como pestañas con 9 opciones del HTML
//      (Temperatura, Presión, Conductividad, Oxígeno, Turbidez, CO2, Alcohol,
//      pH/ORP, Medidor de Flujo). Cambia las unidades dinámicamente.
//   ✅ Supervisores incluyen 6 personas (4 existentes + Roberto, Dubla).
//   ✅ Nuevo campo "Certificado de Patrón" (mapea a pattern_cert_id ya
//      existente en schema).
//   ✅ Mantenido: dropdown de patrones (no se convierte a texto libre).
//
// Validaciones pre-submit:
//   - Tipo de sensor obligatorio
//   - Técnico responsable obligatorio
//   - Supervisor obligatorio
//   - Rango mín/máx + 9 puntos
// =========================================================================

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useCanSignCalibration } from '@/components/auth/UserProvider';
import CalibrationGrid from './CalibrationGrid';
import { saveCalibrationEvent } from './actions';
import { SUPERVISORS, getSupervisorById } from '@/lib/supervisors';
import { SENSOR_TYPES, getUnitsForSensor } from '@/lib/sensors';
import { generateAndDownloadCertificate, roleLabel } from '@/lib/pdf-download';

const INITIAL_FORM = {
  sap_wo:          '',
  instrument_tag:  '',
  serial_number:   '',
  pattern_used:    '',
  pattern_cert_id: '',          // Sprint 29: Certificado de Patrón
  sensor_type:     'Temperatura', // Sprint 29: tipo sensor con default
  range_min:       '',
  range_max:       '',
  unit:            '',
  observations:    '',
  modo:            'mA',
  supervisor_id:   '',
  technician_name: '',          // Sprint 29: técnico editable
};

const PATRONES_DISPONIBLES = [
  'Calibrador Multifunción Fluke 754',
  'Calibrador Fluke 789 ProcessMeter',
  'Pozo Seco Fluke 9100S',
  'Patrón de pH Hanna HI98191',
  'Calibrador de Presión Druck DPI 612',
  'Microcalibrador Omega CL3515R',
];

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

  const supervisor   = getSupervisorById(form.supervisor_id);
  const unidadesValidas = useMemo(() => getUnitsForSensor(form.sensor_type), [form.sensor_type]);

  useEffect(() => {
    function handler(e) {
      const p = e.detail;
      setPosition(p);
      setForm({
        ...INITIAL_FORM,
        sap_wo:       p.sap_open_wo || '',
        pattern_used: p.default_pattern || '',
        sensor_type:  p.sensor_type || 'Temperatura',
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

  // Sprint 29: al cambiar de sensor, si la unidad actual ya no aplica → reset
  function setSensorType(newSensor) {
    setForm((prev) => {
      const allowed = getUnitsForSensor(newSensor);
      const keepUnit = allowed.includes(prev.unit) ? prev.unit : '';
      return { ...prev, sensor_type: newSensor, unit: keepUnit };
    });
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);

    // ── Validaciones pre-submit ───────────────────────────────────────────
    if (!form.sensor_type) {
      setError('Selecciona el tipo de sensor.');
      return;
    }
    if (!form.technician_name.trim()) {
      setError('Ingresa el nombre del técnico responsable.');
      return;
    }
    if (!form.range_min || !form.range_max) {
      setError('Falta el rango mín/máx del instrumento.');
      return;
    }
    // Sprint 32: ya no exigimos las 9 lecturas. Algunas calibraciones
    // se hacen solo en 3 o 5 puntos según el procedimiento del equipo.
    // Solo verificamos que el grid haya emitido la estructura base.
    if (!grid.points || grid.points.length !== 9) {
      setError('Error interno: la tabla de puntos no se inicializó correctamente.');
      return;
    }
    if (!supervisor) {
      setError('Selecciona el supervisor que aprueba la calibración.');
      return;
    }

    // ── Payload para el server action ─────────────────────────────────────
    const payload = {
      position_id:     position.id,
      sap_wo:          form.sap_wo || null,
      instrument_tag:  form.instrument_tag || null,
      serial_number:   form.serial_number || null,
      pattern_used:    form.pattern_used || null,
      pattern_cert_id: form.pattern_cert_id || null,    // Sprint 29
      sensor_type:     form.sensor_type || null,        // Sprint 29 (ya soportado)
      technician_name: form.technician_name.trim(),     // Sprint 29
      range_min:       Number(form.range_min),
      range_max:       Number(form.range_max),
      unit:            form.unit || null,
      tolerance_pct:   position.tolerance_pct ?? 0.5,
      observations:    form.observations || null,
      supervisor_name:      supervisor.name,
      supervisor_signature: supervisor.signature, // puede ser null para Roberto/Dubla
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

    // ── Generar PDF post-save ─────────────────────────────────────────────
    setGeneratingPdf(true);
    try {
      await generateAndDownloadCertificate({
        position,
        form,
        grid,
        technician: {
          name: form.technician_name.trim(),
          role: 'Técnico de Mantenimiento',
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

        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-200 flex items-start justify-between">
          <div>
            <span className="px-2 py-0.5 rounded-md bg-brand-ink text-brand-amber text-[10.5px] font-bold uppercase tracking-wider">
              Calibración interna
            </span>
            <div className="text-[18px] font-bold mt-1">
              CALIBRACIÓN DE {form.sensor_type.toUpperCase()} — {position.equipment_name}
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
                <strong>Modo lectura:</strong> tu rol ({profile?.role}) no permite firmar calibraciones.
              </div>
            </div>
          )}

          {/* POS (read-only) */}
          <div className="grid grid-cols-3 gap-3">
            <ReadField label="POS MTTO"  value={position.pos_mtto} mono />
            <ReadField label="Área"      value={position.area_name || '—'} />
            <ReadField label="Plan MTTO" value={position.maintenance_plan || '—'} />
          </div>

          {/* Selector de tipo de sensor (pestañas) — Sprint 29 */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-600 mb-2">
              Tipo de sensor / medidor <span className="text-brand-fail">*</span>
            </label>
            <div className="flex flex-wrap gap-1 border border-neutral-200 rounded-lg p-1 bg-neutral-50">
              {SENSOR_TYPES.map((s) => {
                const active = form.sensor_type === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => canSign && setSensorType(s.id)}
                    disabled={!canSign}
                    className={`px-3 py-1.5 rounded-md text-[12px] font-semibold transition ${
                      active
                        ? 'bg-brand-ink text-brand-amber shadow-sm'
                        : 'bg-white text-neutral-600 hover:bg-neutral-100'
                    } disabled:opacity-50`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* OT + Tag + Serie */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <InputField label="Orden de Trabajo (SAP)" value={form.sap_wo}
                onChange={(v) => setField('sap_wo', v)} placeholder="Ej. 10058493" disabled={!canSign} />
              {form.sap_wo && position.sap_open_wo && form.sap_wo === position.sap_open_wo && (
                <div className="mt-1 flex items-center gap-1 text-[10.5px] text-brand-env">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  Auto-llenado desde IW37N (puedes sobrescribir)
                </div>
              )}
            </div>
            <InputField label="Tag / ID Instrumento" value={form.instrument_tag}
              onChange={(v) => setField('instrument_tag', v)} placeholder="Ej. PT-101" disabled={!canSign} />
            <InputField label="N° de Serie (DUT)" value={form.serial_number}
              onChange={(v) => setField('serial_number', v)} placeholder="S/N transmisor" disabled={!canSign} />
          </div>

          {/* Patrón usado — dropdown + Certificado de Patrón */}
          <div className="rounded-xl border border-neutral-200 bg-gradient-to-br from-neutral-50 to-white p-4">
            <label className="text-[12px] font-bold text-neutral-800 uppercase tracking-wider flex items-center gap-2 mb-3">
              <svg className="w-4 h-4 text-brand-amber" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2l2.4 7.4H22l-6.2 4.5L18.2 22 12 17.3 5.8 22l2.4-8.1L2 9.4h7.6L12 2z" />
              </svg>
              Patrón Utilizado
            </label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-600 mb-1">
                  Equipo Patrón
                </label>
                <select
                  value={form.pattern_used}
                  onChange={(e) => setField('pattern_used', e.target.value)}
                  disabled={!canSign}
                  className="w-full bg-white border-2 border-neutral-300 rounded-lg px-3 py-2.5 text-[13px] font-semibold focus:ring-4 focus:ring-brand-amber/30 focus:border-brand-amber outline-none cursor-pointer disabled:bg-neutral-100"
                >
                  <option value="">— Seleccionar patrón —</option>
                  {PATRONES_DISPONIBLES.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              <InputField
                label="Certificado de Patrón"
                value={form.pattern_cert_id}
                onChange={(v) => setField('pattern_cert_id', v)}
                placeholder="N° Certificado Patrón"
                disabled={!canSign}
              />
            </div>

            <div className="mt-3 flex items-start gap-2.5 p-3 rounded-lg bg-brand-amberSoft/60 border border-brand-amber/40">
              <svg className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <div className="text-[12.5px] text-amber-900">
                <strong>Trazabilidad automática:</strong> el certificado del patrón quedará registrado y se anexa al PDF final.
              </div>
            </div>
          </div>

          {/* Configuración del lazo (con unidades dinámicas según sensor) */}
          <div className="grid grid-cols-4 gap-3 items-end">
            <InputField label="Rango mín (4 mA)" type="number" value={form.range_min}
              onChange={(v) => setField('range_min', v)} placeholder="0" disabled={!canSign} />
            <InputField label="Rango máx (20 mA)" type="number" value={form.range_max}
              onChange={(v) => setField('range_max', v)} placeholder="10" disabled={!canSign} />
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-600 mb-1">
                Unidad <span className="text-[10px] text-neutral-400 normal-case">(según {form.sensor_type})</span>
              </label>
              <select value={form.unit} onChange={(e) => setField('unit', e.target.value)}
                disabled={!canSign}
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-[13px] bg-white focus:ring-2 focus:ring-brand-amber focus:border-brand-amber outline-none disabled:bg-neutral-100"
              >
                <option value="">—</option>
                {unidadesValidas.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
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

          {/* Grid de 9 puntos */}
          <CalibrationGrid
            rangeMin={form.range_min}
            rangeMax={form.range_max}
            unit={form.unit}
            tolerance={tolerance}
            modo={form.modo}
            readOnly={!canSign}
            onChange={setGrid}
          />

          {/* Técnico + Supervisor — Sprint 29: ambos editables */}
          <div className="grid grid-cols-2 gap-4">
            {/* Técnico = INPUT editable (cambio Sprint 29) */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-600 mb-1">
                Técnico Responsable <span className="text-brand-fail">*</span>
              </label>
              <input
                type="text"
                value={form.technician_name}
                onChange={(e) => setField('technician_name', e.target.value)}
                disabled={!canSign}
                placeholder="Nombre completo del técnico"
                className="w-full border-2 border-neutral-300 rounded-lg px-3 py-2.5 text-[13.5px] font-semibold focus:ring-4 focus:ring-brand-amber/30 focus:border-brand-amber outline-none disabled:bg-neutral-100"
              />
              <div className="mt-1.5 text-[10.5px] text-neutral-500">
                Quien ejecutó la calibración en planta — queda en el registro.
              </div>
            </div>

            {/* Supervisor = dropdown + preview firma */}
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
              placeholder="Detallar intervenciones, ajustes de cero/span, cambio de sellos, etc."
              className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-[13px] focus:ring-2 focus:ring-brand-amber focus:border-brand-amber outline-none resize-y disabled:bg-neutral-100"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="text-[12.5px] text-brand-fail bg-brand-failSoft border border-brand-fail/30 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          {/* PDF spinner */}
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

// ─── Preview firma del supervisor ────────────────────────────────────────
function SupervisorSignaturePreview({ supervisor }) {
  if (!supervisor) {
    return (
      <div className="mt-2 rounded-lg border-2 border-dashed border-neutral-300 bg-neutral-50 h-28 grid place-items-center text-[12px] text-neutral-400">
        Elige un supervisor para mostrar su firma
      </div>
    );
  }

  // Sprint 29: si supervisor existe pero sin firma escaneada (Roberto/Dubla),
  // mostramos placeholder con su nombre + nota
  if (!supervisor.signature) {
    return (
      <div className="mt-2 rounded-lg border border-amber-400 bg-brand-warnSoft/40 p-3 flex flex-col items-center">
        <div className="text-[11px] text-amber-700 italic mb-1">
          Firma escaneada pendiente
        </div>
        <div className="w-full border-t border-neutral-400 mt-1 pt-1 text-center">
          <div className="text-[13px] font-bold leading-tight">{supervisor.name}</div>
          <div className="text-[11px] text-neutral-500 leading-tight">{supervisor.role}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-neutral-300 bg-white p-3 flex flex-col items-center">
      <img
        src={supervisor.signature}
        alt={`Firma de ${supervisor.name}`}
        className="max-h-16 object-contain"
      />
      <div className="w-full border-t border-neutral-400 mt-1 pt-1 text-center">
        <div className="text-[13px] font-bold leading-tight">{supervisor.name}</div>
        <div className="text-[11px] text-neutral-500 leading-tight">{supervisor.role}</div>
      </div>
    </div>
  );
}

// ─── Sub-componentes form ────────────────────────────────────────────────
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
