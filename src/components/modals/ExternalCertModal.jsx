'use client';
// components/modals/ExternalCertModal.jsx
// =========================================================================
// EXTERNAL CERT MODAL — Sprint 53 (OT SAP obligatoria) + simplificación
// -------------------------------------------------------------------------
// CAMBIO IMPORTANTE: se quitó por completo la opción de adjuntar el PDF
// como archivo. Antes se podía subir el PDF a un bucket de Supabase
// Storage, pero ese camino quedó bloqueado por un bug de la propia
// infraestructura de Supabase: su servicio de Storage no reconoce bien
// las políticas de RLS cuando el proyecto usa la llave nueva
// "sb_publishable_..." (aunque esa misma llave funciona perfecto para el
// resto de la base de datos) — reportado por otros desarrolladores con
// el mismo síntoma exacto. Arreglar eso requiere cambiar una variable de
// entorno en el panel de Netlify, algo que no está disponible ahora
// mismo. En vez de seguir peleando con eso, se decidió simplificar el
// flujo: el enlace de SharePoint pasa a ser la ÚNICA forma de referenciar
// el certificado, y es obligatorio. Esto evita el bucket de Storage por
// completo — solo se hace un insert a calibration_events, sin ningún
// archivo de por medio.
// =========================================================================

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useCanSignCalibration } from '@/components/auth/UserProvider';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

const INITIAL_FORM = {
  sap_wo:               '',   // Sprint 53: obligatoria
  external_provider:    '',
  external_cert_number: '',
  performed_at:         new Date().toISOString().split('T')[0],
  certificate_url:      '',
};

// Guarda directo desde el navegador (mismo cliente de Supabase que usa el
// resto de la app para leer datos) — sin pasar por Server Actions
// (ver nota en CalibrationModal.jsx sobre el 403 de Netlify con
// Server Actions) y sin tocar Storage (ver nota arriba).
async function saveExternalCalibrationClient({
  positionId, sapWo, provider, certNumber, performedAt, certificateUrl,
}) {
  const supabase = createSupabaseBrowserClient();

  const observations =
    `Certificado externo emitido por ${provider}` +
    (certNumber ? ` (N° ${certNumber})` : '') +
    ` · Fuente: enlace SharePoint`;

  const { data: event, error: insertError } = await supabase
    .from('calibration_events')
    .insert({
      position_id:           positionId,
      source:                'external',
      sap_wo:                sapWo,
      result:                'PASS',
      performed_at:          new Date(performedAt).toISOString(),
      performed_by:          null,
      external_provider:     provider,
      external_cert_number:  certNumber || null,
      external_cert_pdf_url: null,
      certificate_url:       certificateUrl,
      observations,
    })
    .select('id')
    .single();

  if (insertError) {
    console.error('[saveExternalCalibrationClient] insert error:', insertError);
    return { ok: false, error: insertError.message };
  }

  return { ok: true, event_id: event.id, certificate_url: certificateUrl };
}

function isValidHttpUrl(s) {
  if (!s) return false;
  try {
    const u = new URL(s.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export default function ExternalCertModal() {
  const router  = useRouter();

  const [open, setOpen]         = useState(false);
  const [position, setPosition] = useState(null);
  const [form, setForm]         = useState(INITIAL_FORM);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState(null);

  const canSign     = useCanSignCalibration();
  const { profile } = useUser() || {};

  useEffect(() => {
    function handler(e) {
      const p = e.detail;
      setPosition(p);
      setForm({
        ...INITIAL_FORM,
        performed_at: new Date().toISOString().split('T')[0],
        sap_wo:       p.sap_open_wo || p.noti_wo || '',
      });
      setError(null);
      setOpen(true);
    }
    window.addEventListener('open:external-cert', handler);
    return () => window.removeEventListener('open:external-cert', handler);
  }, []);

  if (!open || !position) return null;

  function setField(k, v) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!canSign) {
      setError('Tu rol no permite registrar certificados externos.');
      return;
    }
    if (!form.sap_wo.trim()) {
      setError('La OT SAP es obligatoria para vincular el certificado a la orden.');
      return;
    }
    if (!form.external_provider.trim()) {
      setError('Indica el proveedor que emitió el certificado.');
      return;
    }
    if (!form.performed_at) {
      setError('Indica la fecha de calibración.');
      return;
    }

    const trimmedUrl = form.certificate_url.trim();
    if (!trimmedUrl) {
      setError('Pega el enlace de SharePoint del certificado.');
      return;
    }
    if (!isValidHttpUrl(trimmedUrl)) {
      setError('El enlace debe ser una URL HTTPS válida (https://…).');
      return;
    }

    setSaving(true);
    let res;
    try {
      res = await saveExternalCalibrationClient({
        positionId:     position.id,
        sapWo:          form.sap_wo.trim(),
        provider:       form.external_provider.trim(),
        certNumber:     form.external_cert_number.trim(),
        performedAt:    form.performed_at,
        certificateUrl: trimmedUrl,
      });
    } catch (err) {
      console.error('[ExternalCertModal] error inesperado al guardar:', err);
      setSaving(false);
      setError('No se pudo guardar el certificado (problema de conexión). Intenta de nuevo.');
      return;
    }
    setSaving(false);

    if (!res.ok) {
      setError(res.error || 'Error al guardar el certificado externo.');
      return;
    }
    setOpen(false);
    window.dispatchEvent(new CustomEvent('toast:success', {
      detail: { message: 'Certificado guardado — actualizando lista de certificados…' },
    }));
    router.refresh();
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-6"
      onClick={(e) => { if (e.target === e.currentTarget && !saving) setOpen(false); }}
    >
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[94vh] overflow-hidden shadow-pop border-t-4 border-brand-amber flex flex-col">

        <div className="px-6 py-4 border-b border-neutral-200 flex items-start justify-between">
          <div>
            <span className="px-2 py-0.5 rounded-md bg-brand-amberSoft text-amber-700 text-[10.5px] font-bold uppercase tracking-wider">
              Proveedor externo
            </span>
            <div className="text-[18px] font-bold mt-1">Registrar certificado externo</div>
            <div className="text-[12.5px] text-neutral-500">
              POS <span className="font-mono">{position.pos_mtto}</span> · {position.equipment_name}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={saving}
            className="text-neutral-400 hover:text-neutral-900 text-xl px-2 py-1 rounded-md hover:bg-neutral-100 disabled:opacity-40"
          >
            ✕
          </button>
        </div>

        <form onSubmit={onSubmit} className="px-6 py-5 overflow-y-auto space-y-5 flex-1">

          {!canSign && (
            <div className="flex gap-3 p-3.5 rounded-lg bg-brand-warnSoft border-l-4 border-brand-warn">
              <svg className="w-5 h-5 mt-0.5 text-amber-700 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <div className="text-[12.5px] text-amber-900 leading-snug">
                <strong>Modo lectura:</strong> tu rol ({profile?.role}) no permite registrar certificados.
              </div>
            </div>
          )}

          <div className="flex gap-3 p-3.5 rounded-lg bg-brand-amberSoft border-l-4 border-brand-amber">
            <svg className="w-5 h-5 mt-0.5 text-amber-700 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <div className="text-[12.5px] text-amber-900 leading-snug">
              Use este flujo cuando un <strong>proveedor o laboratorio externo</strong> haya realizado la calibración.
              La <strong>OT SAP</strong> y el <strong>enlace de SharePoint</strong> son obligatorios — el certificado
              en sí queda guardado en SharePoint, aquí solo se confirma y vincula a la orden.
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <ReadField label="POS MTTO" value={position.pos_mtto} mono />
            <ReadField label="Equipo"   value={position.equipment_name} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <InputField
              label="OT SAP *"
              value={form.sap_wo}
              onChange={(v) => setField('sap_wo', v)}
              placeholder="Ej. 9126069"
              mono
              disabled={!canSign}
            />
            <InputField
              label="Fecha de calibración *"
              type="date"
              value={form.performed_at}
              onChange={(v) => setField('performed_at', v)}
              disabled={!canSign}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <InputField
              label="Proveedor / Laboratorio *"
              value={form.external_provider}
              onChange={(v) => setField('external_provider', v)}
              placeholder="Ej. Laboratorio Patrón S.A."
              disabled={!canSign}
            />
            <InputField
              label="N° de certificado"
              value={form.external_cert_number}
              onChange={(v) => setField('external_cert_number', v)}
              placeholder="Ej. CRT-2026-0428"
              disabled={!canSign}
            />
          </div>

          <div>
            <InputField
              label="Enlace del certificado (SharePoint) *"
              type="url"
              value={form.certificate_url}
              onChange={(v) => setField('certificate_url', v)}
              placeholder="https://tuempresa.sharepoint.com/sites/.../certificado.pdf"
              disabled={!canSign}
            />
            <div className="text-[11px] text-neutral-500 mt-1">
              Pega aquí el enlace directo al PDF ya guardado en SharePoint. Es obligatorio.
            </div>
          </div>

          {error && (
            <div className="text-[12.5px] text-brand-fail bg-brand-failSoft border border-brand-fail/30 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200">
            <button type="button" onClick={() => setOpen(false)} disabled={saving}
              className="px-4 py-2 rounded-lg border border-neutral-300 text-[13px] font-semibold hover:bg-neutral-100 disabled:opacity-60">
              {canSign ? 'Cancelar' : 'Cerrar'}
            </button>
            {canSign && (
              <button type="submit" disabled={saving}
                className="px-4 py-2 rounded-lg bg-brand-amber text-black text-[13px] font-bold hover:bg-brand-amberHover disabled:opacity-60 inline-flex items-center gap-2">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                {saving ? 'Guardando…' : 'Confirmar y guardar'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function ReadField({ label, value, mono = false }) {
  return (
    <div>
      <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-600 mb-1">{label}</label>
      <input readOnly value={value ?? ''}
        className={`w-full border border-neutral-300 rounded-lg px-3 py-2 text-[13px] bg-neutral-100 outline-none ${mono ? 'font-mono font-semibold' : ''}`} />
    </div>
  );
}

function InputField({ label, value, onChange, placeholder, disabled = false, type = 'text', mono = false }) {
  return (
    <div>
      <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-600 mb-1">{label}</label>
      <input type={type} value={value ?? ''} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} disabled={disabled}
        className={`w-full border border-neutral-300 rounded-lg px-3 py-2 text-[13px] bg-white focus:ring-2 focus:ring-brand-amber focus:border-brand-amber outline-none disabled:bg-neutral-100 ${mono ? 'font-mono font-semibold' : ''}`} />
    </div>
  );
}
