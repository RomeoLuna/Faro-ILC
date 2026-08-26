'use client';
// components/catalogos/CatalogoPatronesClient.jsx
// =========================================================================
// CATÁLOGO DE PATRONES — Client Component (Sprint 43)
// -------------------------------------------------------------------------
// Cambios respecto a Sprint 42:
//   • Nuevo campo N° de certificado (cert_number) por patrón.
//   • Add/Update/Delete piden contraseña antes de ejecutar el server action.
//     La contraseña se pasa al server; el server la valida por seguridad.
// =========================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addPatron, updatePatron, deletePatron } from './actions';

export default function CatalogoPatronesClient({ initialPatrones }) {
  const router = useRouter();
  const [patrones, setPatrones] = useState(initialPatrones);
  const [isPending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState(null);

  // Formulario "nuevo patrón" (Sprint 43: + cert_number)
  const [newNombre, setNewNombre]   = useState('');
  const [newUrl, setNewUrl]         = useState('');
  const [newPos, setNewPos]         = useState('');
  const [newCertNum, setNewCertNum] = useState('');

  // Estado de edición inline por fila
  const [editing, setEditing] = useState({});

  // Sprint 43: prompt de contraseña delante de cualquier mutación
  function askPassword(action) {
    const pw = window.prompt(`Ingresa la contraseña para ${action} un patrón:`);
    if (pw == null) return null;   // cancelar
    if (!pw.trim()) {
      setError('Contraseña vacía.');
      return null;
    }
    return pw;
  }

  function beginEdit(p) {
    setEditing((prev) => ({
      ...prev,
      [p.id]: {
        nombre:          p.nombre,
        certificate_url: p.certificate_url || '',
        pos_mtto:        p.pos_mtto        || '',
        cert_number:     p.cert_number     || '',   // Sprint 43
      },
    }));
  }

  function cancelEdit(id) {
    setEditing((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function setEditField(id, k, v) {
    setEditing((prev) => ({ ...prev, [id]: { ...prev[id], [k]: v } }));
  }

  async function handleAdd(e) {
    e.preventDefault();
    setError(null);
    if (!newNombre.trim()) {
      setError('El nombre del patrón es obligatorio.');
      return;
    }
    const password = askPassword('AÑADIR');
    if (!password) return;

    startTransition(async () => {
      const res = await addPatron({
        nombre:          newNombre.trim(),
        certificate_url: newUrl.trim()     || null,
        pos_mtto:        newPos.trim()     || null,
        cert_number:     newCertNum.trim() || null,
        password,
      });
      if (!res.ok) { setError(res.error); return; }
      setPatrones((prev) =>
        [...prev, res.patron].sort((a, b) => a.nombre.localeCompare(b.nombre))
      );
      setNewNombre('');
      setNewUrl('');
      setNewPos('');
      setNewCertNum('');
      setShowAdd(false);
      router.refresh();
    });
  }

  async function handleSave(id) {
    setError(null);
    const draft = editing[id];
    if (!draft) return;
    if (!draft.nombre.trim()) {
      setError('El nombre del patrón es obligatorio.');
      return;
    }
    const password = askPassword('EDITAR');
    if (!password) return;

    startTransition(async () => {
      const res = await updatePatron({
        id,
        nombre:          draft.nombre.trim(),
        certificate_url: draft.certificate_url.trim() || null,
        pos_mtto:        (draft.pos_mtto || '').trim() || null,
        cert_number:     (draft.cert_number || '').trim() || null,
        password,
      });
      if (!res.ok) { setError(res.error); return; }
      setPatrones((prev) => prev.map((p) => (p.id === id ? { ...p, ...res.patron } : p)));
      cancelEdit(id);
      router.refresh();
    });
  }

  async function handleDelete(p) {
    if (!confirm(`¿Eliminar "${p.nombre}" del catálogo?\n\nEl patrón dejará de aparecer en el dropdown del modal de calibración. Las calibraciones históricas no se ven afectadas.`)) return;

    const password = askPassword('ELIMINAR');
    if (!password) return;

    startTransition(async () => {
      const res = await deletePatron({ id: p.id, password });
      if (!res.ok) { setError(res.error); return; }
      setPatrones((prev) => prev.filter((x) => x.id !== p.id));
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <div className="text-[12.5px] text-neutral-500">
          <strong className="text-neutral-800">{patrones.length}</strong> patrón{patrones.length === 1 ? '' : 'es'} activos
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="px-3.5 py-2 rounded-lg bg-brand-amber text-black text-[12.5px] font-bold hover:bg-brand-amberHover inline-flex items-center gap-2"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          {showAdd ? 'Cancelar' : 'Añadir patrón'}
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="text-[12.5px] text-brand-fail bg-brand-failSoft border border-brand-fail/30 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {/* Formulario nuevo patrón — Sprint 43 incluye N° cert */}
      {showAdd && (
        <form
          onSubmit={handleAdd}
          className="rounded-xl border-2 border-dashed border-brand-amber/50 bg-brand-amberSoft/40 p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-end"
        >
          <div>
            <label className="block text-[10.5px] font-bold uppercase tracking-wider text-neutral-600 mb-1">
              Nombre del patrón <span className="text-brand-fail">*</span>
            </label>
            <input
              value={newNombre}
              onChange={(e) => setNewNombre(e.target.value)}
              placeholder="Ej. Fluke 754"
              className="w-full border-2 border-neutral-300 rounded-lg px-3 py-2 text-[13px] font-semibold focus:ring-4 focus:ring-brand-amber/30 focus:border-brand-amber outline-none bg-white"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-[10.5px] font-bold uppercase tracking-wider text-neutral-600 mb-1">
              POS Mtto (opcional)
            </label>
            <input
              value={newPos}
              onChange={(e) => setNewPos(e.target.value)}
              placeholder="Ej. 127949"
              className="w-full border-2 border-neutral-300 rounded-lg px-3 py-2 text-[13px] font-mono focus:ring-4 focus:ring-brand-amber/30 focus:border-brand-amber outline-none bg-white"
            />
          </div>
          <div>
            <label className="block text-[10.5px] font-bold uppercase tracking-wider text-neutral-600 mb-1">
              N° Certificado (opcional)
            </label>
            <input
              value={newCertNum}
              onChange={(e) => setNewCertNum(e.target.value)}
              placeholder="Ej. CERT-2026-001"
              className="w-full border-2 border-neutral-300 rounded-lg px-3 py-2 text-[13px] font-mono focus:ring-4 focus:ring-brand-amber/30 focus:border-brand-amber outline-none bg-white"
            />
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="block text-[10.5px] font-bold uppercase tracking-wider text-neutral-600 mb-1">
                URL certificado (opcional)
              </label>
              <input
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://…/patron-cert.pdf"
                className="w-full border-2 border-neutral-300 rounded-lg px-3 py-2 text-[12.5px] font-mono focus:ring-4 focus:ring-brand-amber/30 focus:border-brand-amber outline-none bg-white"
              />
            </div>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 rounded-lg bg-brand-ink text-brand-amber text-[12.5px] font-bold hover:bg-neutral-800 disabled:opacity-60 inline-flex items-center gap-2 h-fit shrink-0"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              {isPending ? '…' : 'Guardar'}
            </button>
          </div>
        </form>
      )}

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-card overflow-x-auto">
        <table className="w-full text-[13px] min-w-[720px]">
          <thead className="bg-neutral-50 border-b border-neutral-200">
            <tr>
              <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider font-bold text-neutral-600">
                Nombre del patrón
              </th>
              <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider font-bold text-neutral-600 w-32">
                POS Mtto
              </th>
              <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider font-bold text-neutral-600 w-40">
                N° Certificado
              </th>
              <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider font-bold text-neutral-600">
                URL Certificado
              </th>
              <th className="text-right px-4 py-3 text-[11px] uppercase tracking-wider font-bold text-neutral-600 w-40">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody>
            {patrones.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-[13px] italic text-neutral-400">
                  No hay patrones registrados. Añade el primero con el botón arriba.
                </td>
              </tr>
            ) : (
              patrones.map((p) => {
                const draft = editing[p.id];
                const isEditing = !!draft;

                if (isEditing) {
                  return (
                    <tr key={p.id} className="border-b border-neutral-100 bg-brand-amberSoft/30">
                      <td className="px-4 py-3">
                        <input
                          value={draft.nombre}
                          onChange={(e) => setEditField(p.id, 'nombre', e.target.value)}
                          className="w-full border-2 border-brand-amber rounded-md px-2 py-1.5 text-[13px] font-semibold focus:outline-none bg-white"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          value={draft.pos_mtto}
                          onChange={(e) => setEditField(p.id, 'pos_mtto', e.target.value)}
                          placeholder="Opcional"
                          className="w-full border-2 border-brand-amber rounded-md px-2 py-1.5 text-[12px] font-mono focus:outline-none bg-white"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          value={draft.cert_number}
                          onChange={(e) => setEditField(p.id, 'cert_number', e.target.value)}
                          placeholder="Opcional"
                          className="w-full border-2 border-brand-amber rounded-md px-2 py-1.5 text-[12px] font-mono focus:outline-none bg-white"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          value={draft.certificate_url}
                          onChange={(e) => setEditField(p.id, 'certificate_url', e.target.value)}
                          placeholder="https://…"
                          className="w-full border-2 border-brand-amber rounded-md px-2 py-1.5 text-[12px] font-mono focus:outline-none bg-white"
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex gap-1">
                          <button
                            onClick={() => handleSave(p.id)}
                            disabled={isPending}
                            className="px-2.5 py-1.5 rounded-md bg-brand-pass text-white text-[11.5px] font-bold hover:bg-emerald-700 disabled:opacity-60"
                          >
                            Guardar
                          </button>
                          <button
                            onClick={() => cancelEdit(p.id)}
                            disabled={isPending}
                            className="px-2.5 py-1.5 rounded-md border border-neutral-300 text-[11.5px] font-semibold hover:bg-neutral-100 disabled:opacity-60"
                          >
                            Cancelar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={p.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                    <td className="px-4 py-3 font-semibold text-neutral-800">
                      {p.nombre}
                    </td>
                    <td className="px-4 py-3 font-mono text-[12px]">
                      {p.pos_mtto ? (
                        <span className="inline-flex items-center gap-1 text-brand-env">
                          <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                            <path d="M9 9h6M9 13h6M9 17h4" />
                          </svg>
                          {p.pos_mtto}
                        </span>
                      ) : (
                        <span className="text-neutral-400 italic text-[11.5px]">Sin vincular</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-[12px]">
                      {p.cert_number ? (
                        <span className="inline-flex items-center gap-1 text-neutral-700 font-semibold">
                          {p.cert_number}
                        </span>
                      ) : (
                        <span className="text-neutral-400 italic text-[11.5px]">Sin N°</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {p.certificate_url ? (
                        <a
                          href={p.certificate_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand-env hover:underline font-mono text-[12px] break-all inline-flex items-center gap-1"
                        >
                          <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                          </svg>
                          {p.certificate_url.length > 40 ? `${p.certificate_url.slice(0, 40)}…` : p.certificate_url}
                        </a>
                      ) : (
                        <span className="italic text-neutral-400 text-[12px]">Sin URL</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-1">
                        <button
                          onClick={() => beginEdit(p)}
                          className="px-2.5 py-1.5 rounded-md border border-neutral-300 text-[11.5px] font-semibold hover:bg-neutral-100"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleDelete(p)}
                          disabled={isPending}
                          className="px-2.5 py-1.5 rounded-md border border-brand-fail/40 text-brand-fail text-[11.5px] font-semibold hover:bg-brand-failSoft disabled:opacity-60"
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Info footer */}
      <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-brand-envSoft/40 border border-brand-env/30 text-[12px] text-neutral-700">
        <svg className="w-4 h-4 text-brand-env mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        <div>
          Los patrones activos aparecen automáticamente en el dropdown del modal de{' '}
          <strong>Calibración interna</strong>. Al elegir uno, se copian al certificado:
          el nombre, la URL del PDF y el <strong>N° de Certificado</strong>. Añadir, editar
          y eliminar patrones requiere contraseña.
        </div>
      </div>
    </div>
  );
}