'use client';
// components/modals/ExternalCertModal.jsx
// =========================================================================
// EXTERNAL CERT MODAL — Sprint 53 (OT SAP obligatoria)
// -------------------------------------------------------------------------
// Cambio respecto a Sprint 8:
//   • sap_wo ahora es OBLIGATORIO al registrar externos → mejor
//     trazabilidad OT ↔ certificado y elimina el matching "por proximidad
//     temporal" que hacía el dashboard de Certificados.
//   • Al abrir el modal, se auto-llena con position.sap_open_wo si viene.
// =========================================================================

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useCanSignCalibration } from '@/components/auth/UserProvider';
import { saveExternalCalibration } from './actions';

const INITIAL_FORM = {
  sap_wo:               '',   // Sprint 53: obligatoria
  external_provider:    '',
  external_cert_number: '',
  performed_at:         new Date().toISOString().split('T')[0],
  certificate_url:      '',
};

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
  const fileInputRef = useRef(null);

  const [open, setOpen]         = useState(false);
  const [position, setPosition] = useState(null);
  const [form, setForm]         = useState(INITIAL_FORM);
  const [file, setFile]         = useState(null);
  const [dragging, setDragging] = useState(false);
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
        // Sprint 53: auto-fill de la OT abierta actual
        sap_wo:       p.sap_open_wo || p.noti_wo || '',
      });
      setFile(null);
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

  function pickFile(f) {
    if (!f) { setFile(null); return; }
    const isPdf = f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) { setError('Sólo se aceptan archivos .pdf'); setFile(null); return; }
    if (f.size > 15 * 1024 * 1024) { setError('El PDF supera 15 MB.'); setFile(null); return; }
    setError(null);
    setFile(f);
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    pickFile(e.dataTransfer.files?.[0]);
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);

    // Sprint 53: OT SAP obligatoria
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
    if (!file && !trimmedUrl) {
      setError('Adjunta el PDF del certificado o pega el enlace de SharePoint.');
      return;
    }
    if (trimmedUrl && !isValidHttpUrl(trimmedUrl)) {
      setError('El enlace debe ser una URL HTTPS válida (https://…).');
      return;
    }

    const fd = new FormData();
    fd.append('position_id',          position.id);
    fd.append('pos_mtto',             position.pos_mtto || '');
    fd.append('sap_wo',               form.sap_wo.trim());   // Sprint 53
    fd.append('external_provider',    form.external_provider.trim());
    fd.append('external_cert_number', form.external_cert_number.trim());
    fd.append('performed_at',         form.performed_at);
    fd.append('certificate_url',      trimmedUrl);
    if (file) fd.append('pdf_file', file);

    setSaving(true);
    const res = await saveExternalCalibration(fd);
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
            <div className="text-[18px] font-bold mt-1">Subir certificado externo</div>
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
                <strong>Modo lectura:</strong> tu rol ({profile?.role}) no permite subir certificados.
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
              La <strong>OT SAP es obligatoria</strong> para trazabilidad — vincula el certificado a la orden exacta.
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <ReadField label="POS MTTO" value={position.pos_mtto} mono />
            <ReadField label="Equipo"   value={position.equipment_name} />
          </div>

          {/* Sprint 53: OT SAP obligatoria */}
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
              label="Enlace del Certificado (SharePoint)"
              type="url"
              value={form.certificate_url}
              onChange={(v) => setField('certificate_url', v)}
              placeholder="https://tuempresa.sharepoint.com/sites/.../certificado.pdf"
              disabled={!canSign}
            />
            <div className="text-[11px] text-neutral-500 mt-1">
              Opcional. Puedes adjuntar PDF, pegar enlace, o ambos — uno de los dos es obligatorio.
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-600 mb-1">
              Archivo PDF del certificado <span className="text-neutral-400">(opcional si pegas enlace)</span>
            </label>

            <label
              htmlFor="ext-cert-file"
              onDragOver={(e) => { e.preventDefault(); if (canSign) setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={canSign ? onDrop : undefined}
              className={`block border-2 border-dashed rounded-xl p-6 text-center transition cursor-pointer
                ${dragging
                  ? 'border-brand-amber bg-brand-amberSoft/40'
                  : 'border-neutral-300 bg-neutral-50 hover:border-brand-amber hover:bg-brand-amberSoft/30'}
                ${!canSign ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <svg className="w-10 h-10 mx-auto text-brand-amber" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
              </svg>
              <div className="mt-2 text-[14px] font-semibold text-neutral-800">
                {dragging ? 'Suelta el PDF aquí' : 'Arrastra el PDF o haz clic para seleccionar'}
              </div>
              <div className="text-[12px] text-neutral-500 mt-1">
                Sólo archivos .pdf · máx. 15 MB
              </div>
              <input
                ref={fileInputRef}
                id="ext-cert-file"
                type="file"
                accept="application/pdf,.pdf"
                disabled={!canSign}
                onChange={(e) => pickFile(e.target.files?.[0])}
                className="hidden"
              />
            </label>

            {file && (
              <div className="mt-2 flex items-center justify-between rounded-lg border border-brand-pass/30 bg-brand-passSoft/40 px-3 py-2">
                <div className="text-[12.5px] text-brand-pass">
                  <span className="font-bold">{file.name}</span>
                  <span className="text-neutral-500 ml-2">({(file.size / 1024).toFixed(1)} KB)</span>
                </div>
                <button
                  type="button"
                  onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                  className="text-neutral-400 hover:text-neutral-900 text-[14px] leading-none px-1"
                >
                  ×
                </button>
              </div>
            )}
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
                {saving ? 'Guardando…' : 'Guardar certificado'}
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