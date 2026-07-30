'use client';
// components/admin/PosManagerPanel.jsx
// =========================================================================
// GESTIÓN DE POS DE MANTENIMIENTO — Client Component (Sprint 50)
// -------------------------------------------------------------------------
// Formulario simplificado con solo 8 campos (los del CSV SAP):
//   1. Pos.mantenim.   2. TxtPosicManten   3. Denominación
//   4. Ubicac.técnica  5. Area             6. Sub-Area
//   7. TAG             8. Frecuencia en meses
//
// El area_id se infiere automáticamente en el server action al comparar
// el texto SAP con el catálogo public.areas.
// =========================================================================

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addPos, softDeletePos } from '@/app/(app)/admin/posActions';

const EMPTY_FORM = {
  pos_mtto:          '',
  equipment_name:    '',
  description:       '',
  ubicacion_tecnica: '',
  area:              '',
  sub_area:          '',
  tag:               '',
  frequency_months:  '',
};

export default function PosManagerPanel({ initialPositions }) {
  const router = useRouter();
  const [positions, setPositions] = useState(initialPositions);
  const [query, setQuery]         = useState('');
  const [showAdd, setShowAdd]     = useState(false);
  const [error, setError]         = useState(null);
  const [ok, setOk]               = useState(null);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [isPending, startTransition] = useTransition();

  function setField(k, v) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function askPassword(action) {
    const pw = window.prompt(`Ingresa la contraseña para ${action} una POS:`);
    if (pw == null) return null;
    if (!pw.trim()) { setError('Contraseña vacía.'); return null; }
    return pw;
  }

  async function handleAdd(e) {
    e.preventDefault();
    setError(null); setOk(null);

    // Sprint 51: los 8 campos son obligatorios (paridad con el CSV SAP)
    if (!form.pos_mtto.trim())          { setError('Pos.mantenim. es obligatorio.'); return; }
    if (!form.equipment_name.trim())    { setError('TxtPosicManten es obligatorio.'); return; }
    if (!form.description.trim())       { setError('Denominación es obligatoria.'); return; }
    if (!form.ubicacion_tecnica.trim()) { setError('Ubicac.técnica es obligatoria.'); return; }
    if (!form.area.trim())              { setError('Area es obligatoria.'); return; }
    if (!form.sub_area.trim())          { setError('Sub-Area es obligatoria.'); return; }
    if (!form.tag.trim())               { setError('TAG es obligatorio.'); return; }
    if (!String(form.frequency_months).trim()) { setError('Frecuencia en meses es obligatoria.'); return; }
    const freqNum = Number(form.frequency_months);
    if (!Number.isFinite(freqNum) || freqNum < 1) {
      setError('Frecuencia en meses debe ser un número ≥ 1.');
      return;
    }

    const password = askPassword('AGREGAR');
    if (!password) return;

    startTransition(async () => {
      const res = await addPos({ ...form, password });
      if (!res.ok) { setError(res.error); return; }

      setPositions((prev) => {
        const filtered = prev.filter((p) => p.id !== res.pos.id);
        return [res.pos, ...filtered]
          .sort((a, b) => (a.pos_mtto || '').localeCompare(b.pos_mtto || ''));
      });

      let msg = res.wasReactivated
        ? `POS ${res.pos.pos_mtto} reactivada correctamente.`
        : `POS ${res.pos.pos_mtto} creada correctamente.`;
      if (!res.areaMatched) {
        msg += ' ⚠ El área SAP no matcheó con el catálogo — la POS quedó sin sección hasta corregirlo.';
      }
      setOk(msg);
      setForm(EMPTY_FORM);
      setShowAdd(false);
      router.refresh();
    });
  }

  async function handleDelete(p) {
    setError(null); setOk(null);
    const confirmed = confirm(
      `¿Eliminar la POS ${p.pos_mtto} (${p.equipment_name})?\n\n` +
      `El registro se marcará como inactivo — el histórico de calibraciones se conserva.`
    );
    if (!confirmed) return;

    const password = askPassword('ELIMINAR');
    if (!password) return;

    startTransition(async () => {
      const res = await softDeletePos({ id: p.id, password });
      if (!res.ok) { setError(res.error); return; }
      setPositions((prev) => prev.filter((x) => x.id !== p.id));
      setOk(`POS ${p.pos_mtto} eliminada.`);
      router.refresh();
    });
  }

  const filtered = useMemo(() => {
    if (!query.trim()) return positions;
    const q = query.trim().toLowerCase();
    return positions.filter((p) =>
      String(p.pos_mtto).toLowerCase().includes(q)
      || (p.equipment_name    || '').toLowerCase().includes(q)
      || (p.description       || '').toLowerCase().includes(q)
      || (p.area              || '').toLowerCase().includes(q)
      || (p.sub_area          || '').toLowerCase().includes(q)
      || (p.tag               || '').toLowerCase().includes(q)
      || (p.ubicacion_tecnica || '').toLowerCase().includes(q)
    );
  }, [query, positions]);

  return (
    <div className="bg-white rounded-xl border border-neutral-200 shadow-card overflow-hidden mb-6">
      <div className="px-5 py-3 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-[12px] uppercase tracking-wider text-neutral-600 font-bold flex items-center gap-2">
            <svg className="w-4 h-4 text-brand-amber" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M9 9h6M9 13h6M9 17h4" />
            </svg>
            Gestión de POS de Mantenimiento
          </div>
          <div className="text-[11.5px] text-neutral-500 mt-0.5">
            {positions.length} POS activas · agregar/eliminar requiere contraseña
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-md bg-brand-amberSoft text-amber-700 text-[10.5px] font-bold uppercase tracking-wider">
            PIN-gated
          </span>
          <button
            onClick={() => { setShowAdd((v) => !v); setError(null); setOk(null); }}
            className="px-3 py-1.5 rounded-lg bg-brand-amber text-black text-[12.5px] font-bold hover:bg-brand-amberHover inline-flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {showAdd ? 'Cancelar' : 'Nueva POS'}
          </button>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Formulario SIMPLIFICADO — solo 8 campos del CSV SAP */}
        {showAdd && (
          <form
            onSubmit={handleAdd}
            className="rounded-xl border-2 border-dashed border-brand-amber/50 bg-brand-amberSoft/30 p-4"
          >
            <div className="text-[11.5px] font-bold uppercase tracking-wider text-brand-ink mb-3">
              Nueva POS · datos del CSV SAP
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Field label="Pos.mantenim. *" mono>
                <input
                  required
                  value={form.pos_mtto}
                  onChange={(e) => setField('pos_mtto', e.target.value)}
                  placeholder="Ej. 162030"
                  className={inputCls}
                />
              </Field>
              <Field label="TxtPosicManten *" wrapCls="md:col-span-2">
                <input
                  required
                  value={form.equipment_name}
                  onChange={(e) => setField('equipment_name', e.target.value)}
                  placeholder="Ej. SENSORES NH3 DE SEGURIDAD"
                  className={inputCls}
                />
              </Field>
              <Field label="TAG *">
                <input
                  required
                  value={form.tag}
                  onChange={(e) => setField('tag', e.target.value)}
                  placeholder="Ej. TIC-101"
                  className={inputCls}
                />
              </Field>

              <Field label="Denominación *" wrapCls="md:col-span-2">
                <input
                  required
                  value={form.description}
                  onChange={(e) => setField('description', e.target.value)}
                  placeholder="Ej. REFRIGERACION"
                  className={inputCls}
                />
              </Field>
              <Field label="Ubicac.técnica *" wrapCls="md:col-span-2">
                <input
                  required
                  value={form.ubicacion_tecnica}
                  onChange={(e) => setField('ubicacion_tecnica', e.target.value)}
                  placeholder="Ej. BS01-M1-SE1-SMA1-REFR"
                  className={inputCls}
                />
              </Field>

              <Field label="Area *">
                <input
                  required
                  value={form.area}
                  onChange={(e) => setField('area', e.target.value)}
                  placeholder="Ej. SUMINISTROS"
                  className={inputCls}
                />
              </Field>
              <Field label="Sub-Area *">
                <input
                  required
                  value={form.sub_area}
                  onChange={(e) => setField('sub_area', e.target.value)}
                  placeholder="Ej. REFRIGERACION"
                  className={inputCls}
                />
              </Field>
              <Field label="Frecuencia en meses *">
                <input
                  required
                  type="number"
                  min="1"
                  step="1"
                  value={form.frequency_months}
                  onChange={(e) => setField('frequency_months', e.target.value)}
                  placeholder="12"
                  className={inputCls}
                />
              </Field>
              <div className="hidden md:block" />
            </div>

            <div className="mt-2 text-[10.5px] text-neutral-500">
              Todos los campos marcados con <span className="text-brand-fail font-bold">*</span> son obligatorios.
            </div>

            <div className="mt-4 flex items-center justify-between gap-2 flex-wrap">
              <div className="text-[10.5px] text-neutral-600">
                El <strong>Area</strong> (texto SAP) se cruza con el catálogo para asignar la sección automáticamente.
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setForm(EMPTY_FORM); setShowAdd(false); }}
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
                  {isPending ? 'Guardando…' : 'Guardar POS'}
                </button>
              </div>
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

        {/* Buscador */}
        <div className="flex items-center gap-2 mb-2">
          <div className="flex items-center bg-white border border-neutral-300 rounded-lg px-3 py-1.5 gap-2 min-w-[240px] flex-1 focus-within:ring-2 focus-within:ring-brand-amber/40 focus-within:border-brand-amber">
            <svg className="w-4 h-4 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por POS, equipo, área, TAG, ubicación técnica…"
              className="bg-transparent outline-none text-[13px] w-full"
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-neutral-400 hover:text-neutral-900 text-[14px] leading-none px-1">×</button>
            )}
          </div>
          <div className="text-[11px] text-neutral-500 whitespace-nowrap">
            {filtered.length} de {positions.length}
          </div>
        </div>

        {/* Tabla */}
        <div className="overflow-x-auto rounded-lg border border-neutral-200">
          <table className="w-full text-[13px]">
            <thead className="bg-neutral-50 border-b border-neutral-200 text-left">
              <tr>
                <th className="px-3 py-2 font-bold text-[10.5px] uppercase tracking-wider text-neutral-600">Pos.mtto</th>
                <th className="px-3 py-2 font-bold text-[10.5px] uppercase tracking-wider text-neutral-600">TxtPosicManten / Denominación</th>
                <th className="px-3 py-2 font-bold text-[10.5px] uppercase tracking-wider text-neutral-600">TAG</th>
                <th className="px-3 py-2 font-bold text-[10.5px] uppercase tracking-wider text-neutral-600">Ubicac.técnica</th>
                <th className="px-3 py-2 font-bold text-[10.5px] uppercase tracking-wider text-neutral-600">Area / Sub-Area</th>
                <th className="px-3 py-2 font-bold text-[10.5px] uppercase tracking-wider text-neutral-600">Frec.</th>
                <th className="px-3 py-2 font-bold text-[10.5px] uppercase tracking-wider text-neutral-600 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center italic text-neutral-400 text-[12.5px]">
                    {query ? 'Sin coincidencias' : 'No hay POS activas'}
                  </td>
                </tr>
              ) : filtered.map((p) => (
                <tr key={p.id} className="hover:bg-neutral-50">
                  <td className="px-3 py-2.5 font-mono font-bold text-brand-ink">
                    {p.pos_mtto}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-semibold text-neutral-800 line-clamp-1">{p.equipment_name || '—'}</div>
                    {p.description && (
                      <div className="text-[11px] text-neutral-500 line-clamp-1">{p.description}</div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[12px]">
                    {p.tag || <span className="text-neutral-400 italic">—</span>}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[11.5px] text-neutral-600">
                    {p.ubicacion_tecnica || <span className="text-neutral-400 italic">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-semibold text-neutral-700">{p.area || '—'}</div>
                    {p.sub_area && <div className="text-[11px] text-neutral-500">{p.sub_area}</div>}
                  </td>
                  <td className="px-3 py-2.5 text-neutral-700">
                    {p.frequency_months != null ? `${p.frequency_months}M` : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      onClick={() => handleDelete(p)}
                      disabled={isPending}
                      className="px-2.5 py-1 rounded-md border border-brand-fail/40 text-brand-fail text-[11.5px] font-semibold hover:bg-brand-failSoft disabled:opacity-60"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="text-[11px] text-neutral-500">
          Eliminar es <strong>soft delete</strong>. El histórico de calibraciones queda intacto.
          Volver a agregar la misma <span className="font-mono">Pos.mantenim.</span> la reactiva automáticamente.
        </div>
      </div>
    </div>
  );
}


// ─── Sub-componentes ────────────────────────────────────────────────────
const inputCls =
  'w-full border-2 border-neutral-300 rounded-lg px-3 py-2 text-[13px] bg-white focus:ring-4 focus:ring-brand-amber/30 focus:border-brand-amber outline-none';

function Field({ label, children, wrapCls = '' }) {
  return (
    <div className={wrapCls}>
      <label className="block text-[10.5px] font-bold uppercase tracking-wider text-neutral-600 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}