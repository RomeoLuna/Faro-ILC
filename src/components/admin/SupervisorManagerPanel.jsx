'use client';
// components/admin/SupervisorManagerPanel.jsx
// =========================================================================
// GESTIÓN DE SUPERVISORES — Client Component (Sprint 54)
// -------------------------------------------------------------------------
// Permite al admin agregar, editar y eliminar supervisores desde /admin,
// incluyendo el upload de la firma escaneada como PNG/JPG.
//
// Password: 150202 (misma que gestión de POS).
// =========================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addSupervisor, updateSupervisor, softDeleteSupervisor } from '@/app/(app)/admin/supervisorActions';

const EMPTY_FORM = { name: '', role: '', slug: '', signature: null };

export default function SupervisorManagerPanel({ initialSupervisors }) {
  const router = useRouter();
  const [supers, setSupers]     = useState(initialSupervisors);
  const [showAdd, setShowAdd]   = useState(false);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [error, setError]       = useState(null);
  const [ok, setOk]             = useState(null);
  const [isPending, startTransition] = useTransition();

  function askPassword(action) {
    const pw = window.prompt(`Ingresa la contraseña para ${action} un supervisor:`);
    if (pw == null) return null;
    if (!pw.trim()) { setError('Contraseña vacía.'); return null; }
    return pw;
  }

  // Convertir File → data URL base64
  async function fileToDataUrl(file) {
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
      reader.readAsDataURL(file);
    });
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const ok = ['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)
      || /\.(png|jpe?g)$/i.test(file.name);
    if (!ok) { setError('La firma debe ser PNG o JPG.'); return; }
    if (file.size > 800 * 1024) { setError('La firma supera 800 KB. Recomprimí la imagen.'); return; }
    setError(null);
    try {
      const dataUrl = await fileToDataUrl(file);
      setForm((prev) => ({ ...prev, signature: dataUrl }));
    } catch (err) {
      setError(err.message);
    }
  }

  function beginEdit(s) {
    setEditingId(s.id);
    setForm({
      name:      s.name || '',
      role:      s.role || '',
      slug:      s.slug || '',
      signature: s.signature || null,
    });
    setShowAdd(true);
    setError(null); setOk(null);
  }

  function cancel() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowAdd(false);
    setError(null); setOk(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null); setOk(null);

    if (!form.name.trim()) { setError('El nombre es obligatorio.'); return; }
    if (!form.role.trim()) { setError('El rol/puesto es obligatorio.'); return; }

    const action = editingId ? 'EDITAR' : 'AGREGAR';
    const password = askPassword(action);
    if (!password) return;

    startTransition(async () => {
      const res = editingId
        ? await updateSupervisor({ ...form, id: editingId, password })
        : await addSupervisor({ ...form, password });

      if (!res.ok) { setError(res.error); return; }

      setSupers((prev) => {
        const withoutOld = prev.filter((x) => x.id !== res.supervisor.id);
        return [...withoutOld, res.supervisor].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      });
      setOk(editingId ? `Supervisor ${res.supervisor.name} actualizado.` : `Supervisor ${res.supervisor.name} creado.`);
      cancel();
      router.refresh();
    });
  }

  async function handleDelete(s) {
    setError(null); setOk(null);
    if (!confirm(`¿Eliminar al supervisor "${s.name}"?\n\nDejará de aparecer en el modal de calibración. Las calibraciones históricas conservan su nombre y firma.`)) return;
    const password = askPassword('ELIMINAR');
    if (!password) return;

    startTransition(async () => {
      const res = await softDeleteSupervisor({ id: s.id, password });
      if (!res.ok) { setError(res.error); return; }
      setSupers((prev) => prev.filter((x) => x.id !== s.id));
      setOk(`${s.name} eliminado.`);
      router.refresh();
    });
  }

  return (
    <div className="bg-white rounded-xl border border-neutral-200 shadow-card overflow-hidden mb-6">
      <div className="px-5 py-3 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-[12px] uppercase tracking-wider text-neutral-600 font-bold flex items-center gap-2">
            <svg className="w-4 h-4 text-brand-amber" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            Gestión de Supervisores
          </div>
          <div className="text-[11.5px] text-neutral-500 mt-0.5">
            {supers.length} supervisores activos · aparecen en el modal de calibración interna
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-md bg-brand-amberSoft text-amber-700 text-[10.5px] font-bold uppercase tracking-wider">
            PIN-gated
          </span>
          {!showAdd && (
            <button
              onClick={() => { setShowAdd(true); setEditingId(null); setForm(EMPTY_FORM); }}
              className="px-3 py-1.5 rounded-lg bg-brand-amber text-black text-[12.5px] font-bold hover:bg-brand-amberHover inline-flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Nuevo supervisor
            </button>
          )}
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Formulario */}
        {showAdd && (
          <form
            onSubmit={handleSubmit}
            className="rounded-xl border-2 border-dashed border-brand-amber/50 bg-brand-amberSoft/30 p-4"
          >
            <div className="text-[11.5px] font-bold uppercase tracking-wider text-brand-ink mb-3">
              {editingId ? `Editando supervisor` : 'Nuevo supervisor'}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
              <Field label="Nombre completo *">
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ej. Juan Pérez"
                  className={inputCls}
                />
              </Field>
              <Field label="Rol / Puesto *">
                <input
                  required
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  placeholder="Ej. Supervisor de Mantenimiento"
                  className={inputCls}
                />
              </Field>
              <Field label="Slug (opcional)">
                <input
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  placeholder="juan"
                  className={inputCls + ' font-mono'}
                />
              </Field>
            </div>

            {/* Upload de firma */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
              <div>
                <label className="block text-[10.5px] font-bold uppercase tracking-wider text-neutral-600 mb-1">
                  Firma escaneada (PNG o JPG, opcional)
                </label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,.png,.jpg,.jpeg"
                  onChange={handleFileChange}
                  className="block w-full text-[12px] file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-[12px] file:font-bold file:bg-brand-ink file:text-brand-amber hover:file:bg-neutral-800 cursor-pointer"
                />
                <div className="mt-1 text-[10.5px] text-neutral-500">
                  Recomendado: PNG con fondo transparente. Máx 800 KB.
                </div>
                {editingId && !form.signature && (
                  <div className="mt-1 text-[10.5px] italic text-neutral-400">
                    Este supervisor no tiene firma cargada.
                  </div>
                )}
              </div>

              {/* Preview */}
              <div>
                <div className="text-[10.5px] font-bold uppercase tracking-wider text-neutral-600 mb-1">
                  Vista previa
                </div>
                <div className="rounded-lg border-2 border-dashed border-neutral-300 bg-white p-3 grid place-items-center min-h-[100px]">
                  {form.signature ? (
                    <img src={form.signature} alt="Firma" className="max-h-20 object-contain" />
                  ) : (
                    <span className="text-[11px] italic text-neutral-400">
                      Sin firma cargada
                    </span>
                  )}
                </div>
                {form.signature && (
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, signature: null })}
                    className="mt-1 text-[10.5px] text-brand-fail hover:underline"
                  >
                    Quitar firma
                  </button>
                )}
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={cancel}
                className="px-3 py-2 rounded-lg border border-neutral-300 text-[12.5px] font-semibold hover:bg-neutral-100"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="px-4 py-2 rounded-lg bg-brand-ink text-brand-amber text-[12.5px] font-bold hover:bg-neutral-800 disabled:opacity-60 inline-flex items-center gap-2"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                {isPending ? 'Guardando…' : (editingId ? 'Guardar cambios' : 'Crear supervisor')}
              </button>
            </div>
          </form>
        )}

        {/* Banners */}
        {error && (
          <div className="text-[12.5px] text-brand-fail bg-brand-failSoft border border-brand-fail/30 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        {ok && (
          <div className="text-[12.5px] text-brand-pass bg-brand-passSoft border border-brand-pass/30 rounded-lg px-3 py-2">
            {ok}
          </div>
        )}

        {/* Grid de supervisores actuales */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {supers.length === 0 ? (
            <div className="col-span-full text-center italic text-neutral-400 text-[13px] py-8">
              No hay supervisores activos.
            </div>
          ) : supers.map((s) => (
            <div key={s.id} className="rounded-xl border border-neutral-200 bg-white p-3 hover:shadow-card transition">
              <div className="flex items-start gap-3">
                {/* Preview firma */}
                <div className="w-20 h-16 rounded-md border border-neutral-200 bg-neutral-50 grid place-items-center shrink-0 overflow-hidden">
                  {s.signature ? (
                    <img src={s.signature} alt={`Firma ${s.name}`} className="max-h-14 object-contain" />
                  ) : (
                    <span className="text-[9px] italic text-neutral-400 text-center px-1">
                      Sin firma
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="font-bold text-[13.5px] text-neutral-900 leading-tight">
                    {s.name}
                  </div>
                  <div className="text-[11.5px] text-neutral-500 leading-tight mt-0.5">
                    {s.role}
                  </div>
                  {s.slug && (
                    <div className="text-[10px] font-mono text-neutral-400 mt-1">
                      {s.slug}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-3 flex items-center justify-end gap-1">
                <button
                  onClick={() => beginEdit(s)}
                  className="px-2 py-1 rounded-md border border-neutral-300 text-[11px] font-semibold hover:bg-neutral-100"
                >
                  Editar
                </button>
                <button
                  onClick={() => handleDelete(s)}
                  disabled={isPending}
                  className="px-2 py-1 rounded-md border border-brand-fail/40 text-brand-fail text-[11px] font-semibold hover:bg-brand-failSoft disabled:opacity-60"
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="text-[11px] text-neutral-500">
          Eliminar es <strong>soft delete</strong> — el supervisor desaparece del dropdown del modal
          pero las calibraciones ya firmadas conservan su nombre y firma en el PDF histórico.
        </div>
      </div>
    </div>
  );
}


// ─── Sub-componentes ────────────────────────────────────────────────────
const inputCls =
  'w-full border-2 border-neutral-300 rounded-lg px-3 py-2 text-[13px] bg-white focus:ring-4 focus:ring-brand-amber/30 focus:border-brand-amber outline-none';

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-[10.5px] font-bold uppercase tracking-wider text-neutral-600 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}