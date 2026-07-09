'use client';
// components/catalogos/CatalogoPatronesClient.jsx
// =========================================================================
// CATÁLOGO DE PATRONES — Client Component (Sprint 35)
// -------------------------------------------------------------------------
// Vista y CRUD del catálogo. Cada patrón tiene:
//   • nombre
//   • URL del certificado (opcional)
//
// Los cambios se reflejan en el modal de calibración interna en la próxima
// apertura (fetch on modal open).
//
// UX:
//   - Tabla con filas editables inline (nombre + URL).
//   - Botón "+ Añadir patrón" abre una fila nueva al tope.
//   - Botón "Eliminar" hace soft delete con confirm().
//   - Estado optimistic + revalidatePath del server action refresca positions.
// =========================================================================

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addPatron, updatePatron, deletePatron } from '../../app/(app)/catalogos/actions';

export default function CatalogoPatronesClient({ initialPatrones }) {
  const router = useRouter();
  const [patrones, setPatrones] = useState(initialPatrones);
  const [isPending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState(null);

  // Formulario de "nuevo patrón"
  const [newNombre, setNewNombre] = useState('');
  const [newUrl, setNewUrl] = useState('');

  // Estado de edición inline por fila (id → { nombre, certificate_url })
  const [editing, setEditing] = useState({});

  function beginEdit(p) {
    setEditing((prev) => ({
      ...prev,
      [p.id]: { nombre: p.nombre, certificate_url: p.certificate_url || '' },
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
    startTransition(async () => {
      const res = await addPatron({
        nombre:          newNombre.trim(),
        certificate_url: newUrl.trim() || null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Optimistic: agregar al estado local
      setPatrones((prev) =>
        [...prev, res.patron].sort((a, b) => a.nombre.localeCompare(b.nombre))
      );
      setNewNombre('');
      setNewUrl('');
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
    startTransition(async () => {
      const res = await updatePatron({
        id,
        nombre:          draft.nombre.trim(),
        certificate_url: draft.certificate_url.trim() || null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setPatrones((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...res.patron } : p))
      );
      cancelEdit(id);
      router.refresh();
    });
  }

  async function handleDelete(p) {
    if (!confirm(`¿Eliminar "${p.nombre}" del catálogo?\n\nEl patrón dejará de aparecer en el dropdown del modal de calibración. Las calibraciones históricas no se ven afectadas.`)) {
      return;
    }
    startTransition(async () => {
      const res = await deletePatron({ id: p.id });
      if (!res.ok) {
        setError(res.error);
        return;
      }
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

      {/* Formulario "nuevo patrón" */}
      {showAdd && (
        <form
          onSubmit={handleAdd}
          className="rounded-xl border-2 border-dashed border-brand-amber/50 bg-brand-amberSoft/40 p-4 grid grid-cols-1 md:grid-cols-[1.2fr_2fr_auto] gap-3 items-end"
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
              URL del certificado (opcional)
            </label>
            <input
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://sharepoint.com/…/patron-cert.pdf"
              className="w-full border-2 border-neutral-300 rounded-lg px-3 py-2 text-[12.5px] font-mono focus:ring-4 focus:ring-brand-amber/30 focus:border-brand-amber outline-none bg-white"
            />
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="px-4 py-2 rounded-lg bg-brand-ink text-brand-amber text-[12.5px] font-bold hover:bg-neutral-800 disabled:opacity-60 inline-flex items-center gap-2 h-fit"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            {isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </form>
      )}

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-card overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-neutral-50 border-b border-neutral-200">
            <tr>
              <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider font-bold text-neutral-600">
                Nombre del patrón
              </th>
              <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider font-bold text-neutral-600">
                Certificado (URL al PDF)
              </th>
              <th className="text-right px-4 py-3 text-[11px] uppercase tracking-wider font-bold text-neutral-600 w-40">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody>
            {patrones.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-[13px] italic text-neutral-400">
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
                          {p.certificate_url}
                        </a>
                      ) : (
                        <span className="italic text-neutral-400 text-[12px]">Sin certificado registrado</span>
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
          <strong>Calibración interna</strong>. Cuando el técnico selecciona uno, la URL
          del certificado se copia al registro de la calibración y se anexa al PDF final.
          La opción <strong>"Otro"</strong> del modal permite ingresar patrones no listados
          aquí de forma puntual.
        </div>
      </div>
    </div>
  );
}