'use client';
// components/modals/VerificationCertModal.jsx
// =========================================================================
// VERIFICATION CERT MODAL — tercer tipo de certificado, junto a
// "Calibración interna" y "Registrar externo".
// -------------------------------------------------------------------------
// A diferencia de la calibración (una sola variable, 9 puntos), aquí se
// verifican N ≥ 3 elementos DISTINTOS del equipo, cada uno con su propio
// tipo de variable física y unidad — pueden ser todas distintas entre sí
// (ej. un elemento en °C, otro en PSI, otro en pH).
//
// Reutiliza el mismo catálogo de supervisores + fallback de firma que
// CalibrationModal.jsx (ver comentario ahí sobre el bug de firmas
// faltantes en la tabla `supervisores`), para no reintroducir ese
// problema en un flujo nuevo.
// =========================================================================

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useCanSignCalibration } from '@/components/auth/UserProvider';
import { SENSOR_TYPES, getUnitsForSensor } from '@/lib/sensors';
import { SUPERVISORS as HARDCODED_SUPERVISORS } from '@/lib/supervisors';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { saveVerification } from './actions';
import { generateAndDownloadVerification } from '@/lib/pdf-download';

const MIN_ELEMENTS = 3;

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Mismo helper que CalibrationModal.jsx: la fecha elegida por el usuario
// (solo día) + la hora real del momento de generar el PDF.
function performedAtIso(dateOnlyStr) {
  const now = new Date();
  if (!dateOnlyStr) return now.toISOString();
  const [y, m, d] = dateOnlyStr.split('-').map(Number);
  if (!y || !m || !d) return now.toISOString();
  const combined = new Date(now);
  combined.setFullYear(y, m - 1, d);
  return combined.toISOString();
}

function emptyElement() {
  return { nombre: '', tipo: '', unidad: '', valor: '', observacion: '' };
}

export default function VerificationCertModal() {
  const router = useRouter();

  const [open, setOpen]         = useState(false);
  const [position, setPosition] = useState(null);
  const [sapWo, setSapWo]       = useState('');
  const [technicianName, setTechnicianName] = useState('');
  const [performedAt, setPerformedAt] = useState(todayIso());
  const [elements, setElements] = useState([emptyElement(), emptyElement(), emptyElement()]);
  const [comment, setComment]   = useState('');

  const [supervisorId, setSupervisorId] = useState('');
  const [supervisorsDB, setSupervisorsDB] = useState(HARDCODED_SUPERVISORS);

  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState(null);
  const [, startTransition]   = useTransition();

  const canSign     = useCanSignCalibration();
  const { profile } = useUser() || {};

  useEffect(() => {
    function handler(e) {
      const p = e.detail;
      setPosition(p);
      setSapWo(p.sap_open_wo || p.noti_wo || '');
      setTechnicianName('');
      setPerformedAt(todayIso());
      setElements([emptyElement(), emptyElement(), emptyElement()]);
      setComment('');
      setSupervisorId('');
      setError(null);
      setOpen(true);
    }
    window.addEventListener('open:verification-cert', handler);
    return () => window.removeEventListener('open:verification-cert', handler);
  }, []);

  // Mismo fetch + fallback de firma que CalibrationModal.jsx (ver ese
  // archivo para el detalle del bug que esto evita).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error: err } = await supabase
        .from('supervisores')
        .select('id, slug, name, role, signature')
        .eq('active', true)
        .order('name', { ascending: true });
      if (cancelled) return;
      if (err || !data || data.length === 0) {
        setSupervisorsDB(HARDCODED_SUPERVISORS);
      } else {
        const merged = data.map((row) => {
          if (row.signature) return row;
          const fallback =
            HARDCODED_SUPERVISORS.find((h) => h.id === row.slug) ||
            HARDCODED_SUPERVISORS.find((h) => h.name === row.name);
          return fallback ? { ...row, signature: fallback.signature } : row;
        });
        setSupervisorsDB(merged);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  if (!open || !position) return null;

  const supervisor = supervisorsDB.find((s) => s.id === supervisorId) || null;

  function updateElement(i, field, value) {
    setElements((prev) => {
      const next = [...prev];
      const row = { ...next[i], [field]: value };
      // Al cambiar el tipo de variable física, resetea la unidad si ya no
      // es válida para el nuevo tipo (igual que hace Calibración).
      if (field === 'tipo') {
        const validUnits = getUnitsForSensor(value);
        if (!validUnits.includes(row.unidad)) row.unidad = validUnits[0] || '';
      }
      next[i] = row;
      return next;
    });
  }

  function addElement() {
    setElements((prev) => [...prev, emptyElement()]);
  }

  function removeElement(i) {
    setElements((prev) => {
      if (prev.length <= MIN_ELEMENTS) return prev; // nunca bajar de 3
      return prev.filter((_, idx) => idx !== i);
    });
  }

  const completeCount = elements.filter(
    (e) => e.nombre.trim() && e.tipo && e.valor !== ''
  ).length;

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!technicianName.trim()) {
      setError('El nombre del técnico responsable es obligatorio.');
      return;
    }
    if (!supervisor) {
      setError('Selecciona un supervisor que apruebe.');
      return;
    }
    if (completeCount < MIN_ELEMENTS) {
      setError(`Completa al menos ${MIN_ELEMENTS} elementos (nombre, tipo y valor).`);
      return;
    }

    setSaving(true);
    try {
      const res = await saveVerification({
        position_id:          position.id,
        sap_wo:                sapWo || null,
        technician_name:       technicianName.trim(),
        supervisor_name:       supervisor.name,
        supervisor_role:       supervisor.role,
        supervisor_signature:  supervisor.signature,
        supervisor_id:         supervisor.id,
        performed_at:          performedAt,
        observations:          comment.trim() || null,
        elements,
      });

      if (!res.ok) {
        setError(res.error);
        setSaving(false);
        return;
      }

      await generateAndDownloadVerification({
        position: {
          pos_mtto:       position.pos_mtto,
          equipment_name: position.equipment_name,
          description:    position.description,
          area_name:      position.area_name,
        },
        form: { sap_wo: sapWo, observations: comment.trim() || null },
        elements: res.elements,
        technician: { name: technicianName.trim(), role: 'Técnico de Mantenimiento' },
        supervisor: { name: supervisor.name, role: supervisor.role, signature: supervisor.signature },
        performedAt: performedAtIso(performedAt),
      });

      setOpen(false);
      startTransition(() => router.refresh());
    } catch (err) {
      console.error('[VerificationCertModal] error:', err);
      setError('Ocurrió un error inesperado al guardar la verificación.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-6"
      onClick={(e) => { if (e.target === e.currentTarget && !saving) setOpen(false); }}
    >
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[94vh] overflow-hidden shadow-pop border-t-4 border-brand-amber flex flex-col">

        <div className="px-6 py-4 border-b border-neutral-200 flex items-start justify-between">
          <div>
            <span className="px-2 py-0.5 rounded-md bg-brand-amberSoft text-amber-700 text-[10.5px] font-bold uppercase tracking-wider">
              Verificación
            </span>
            <div className="text-[18px] font-bold mt-1">Certificado de verificación</div>
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
              <div className="text-[12.5px] text-amber-900 leading-snug">
                <strong>Modo lectura:</strong> tu rol ({profile?.role}) no permite registrar verificaciones.
              </div>
            </div>
          )}

          <div className="flex gap-3 p-3.5 rounded-lg bg-brand-amberSoft border-l-4 border-brand-amber">
            <div className="text-[12.5px] text-amber-900 leading-snug">
              Usa este flujo cuando se verifican <strong>varios elementos distintos del equipo</strong> (pueden
              ser de tipos de variable física diferentes) en vez de calibrar una sola variable con 9 puntos.
              Se necesitan al menos <strong>{MIN_ELEMENTS} elementos</strong> completos.
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-600 mb-1">
                Orden de trabajo (SAP)
              </label>
              <input value={sapWo} onChange={(e) => setSapWo(e.target.value)} disabled={!canSign}
                placeholder="Ej. 9436384"
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-brand-amber disabled:bg-neutral-100" />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-600 mb-1">
                Técnico responsable *
              </label>
              <input value={technicianName} onChange={(e) => setTechnicianName(e.target.value)} disabled={!canSign}
                placeholder="Nombre completo"
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-brand-amber disabled:bg-neutral-100" />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-600 mb-1">
                Fecha de verificación *
              </label>
              <input type="date" value={performedAt} max={todayIso()} disabled={!canSign}
                onChange={(e) => setPerformedAt(e.target.value)}
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-brand-amber disabled:bg-neutral-100" />
              <div className="mt-1 text-[10.5px] text-neutral-400">
                Auto-llenado con hoy. Editable si la verificación fue otro día.
              </div>
            </div>
          </div>

          {/* ── Elementos verificados ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-600">
                Elementos verificados * ({completeCount}/{elements.length} completos, mínimo {MIN_ELEMENTS})
              </label>
              <button type="button" onClick={addElement} disabled={!canSign}
                className="text-[11.5px] font-bold text-amber-700 hover:underline disabled:opacity-40">
                + Agregar elemento
              </button>
            </div>

            <div className="space-y-2">
              {elements.map((el, i) => {
                const units = getUnitsForSensor(el.tipo);
                return (
                  <div key={i} className="grid grid-cols-12 gap-2 items-start bg-neutral-50 border border-neutral-200 rounded-lg p-2.5">
                    <div className="col-span-3">
                      <input
                        value={el.nombre}
                        onChange={(e) => updateElement(i, 'nombre', e.target.value)}
                        placeholder="Elemento (ej. Manómetro línea 2)"
                        disabled={!canSign}
                        className="w-full border border-neutral-300 rounded-md px-2 py-1.5 text-[12.5px] outline-none focus:ring-2 focus:ring-brand-amber disabled:bg-neutral-100"
                      />
                    </div>
                    <div className="col-span-3">
                      <select
                        value={el.tipo}
                        onChange={(e) => updateElement(i, 'tipo', e.target.value)}
                        disabled={!canSign}
                        className="w-full border border-neutral-300 rounded-md px-2 py-1.5 text-[12.5px] outline-none focus:ring-2 focus:ring-brand-amber disabled:bg-neutral-100"
                      >
                        <option value="">— Tipo —</option>
                        {SENSOR_TYPES.map((s) => (
                          <option key={s.id} value={s.id}>{s.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <select
                        value={el.unidad}
                        onChange={(e) => updateElement(i, 'unidad', e.target.value)}
                        disabled={!canSign || !el.tipo}
                        className="w-full border border-neutral-300 rounded-md px-2 py-1.5 text-[12.5px] outline-none focus:ring-2 focus:ring-brand-amber disabled:bg-neutral-100"
                      >
                        {units.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <input
                        type="number"
                        step="0.001"
                        value={el.valor}
                        onChange={(e) => updateElement(i, 'valor', e.target.value)}
                        placeholder="Valor"
                        disabled={!canSign}
                        className="w-full border border-neutral-300 rounded-md px-2 py-1.5 text-[12.5px] outline-none focus:ring-2 focus:ring-brand-amber disabled:bg-neutral-100"
                      />
                    </div>
                    <div className="col-span-1">
                      <input
                        value={el.observacion}
                        onChange={(e) => updateElement(i, 'observacion', e.target.value)}
                        placeholder="Obs."
                        disabled={!canSign}
                        title={el.observacion}
                        className="w-full border border-neutral-300 rounded-md px-2 py-1.5 text-[12.5px] outline-none focus:ring-2 focus:ring-brand-amber disabled:bg-neutral-100"
                      />
                    </div>
                    <div className="col-span-1 flex justify-center pt-1.5">
                      {elements.length > MIN_ELEMENTS && (
                        <button type="button" onClick={() => removeElement(i)} disabled={!canSign}
                          className="text-neutral-400 hover:text-brand-fail text-[13px] disabled:opacity-30">
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-600 mb-1">
              Comentario general de verificación
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={!canSign}
              rows={3}
              placeholder="Notas generales sobre la verificación (opcional)"
              className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-brand-amber disabled:bg-neutral-100 resize-y"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-600 mb-1">
              Supervisor que aprueba *
            </label>
            <select
              value={supervisorId}
              onChange={(e) => setSupervisorId(e.target.value)}
              disabled={!canSign}
              className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-brand-amber disabled:bg-neutral-100"
            >
              <option value="">— Seleccionar supervisor —</option>
              {supervisorsDB.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {supervisor && (
              <div className="mt-2 border border-neutral-200 rounded-lg p-3 bg-neutral-50 text-center">
                {supervisor.signature ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={supervisor.signature} alt="Firma" className="h-12 mx-auto object-contain" />
                ) : (
                  <div className="text-[11px] text-brand-fail italic">Firma escaneada pendiente</div>
                )}
                <div className="text-[12.5px] font-bold mt-1">{supervisor.name}</div>
                <div className="text-[11px] text-neutral-500">{supervisor.role}</div>
              </div>
            )}
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-brand-failSoft text-brand-fail text-[12.5px] font-semibold">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
            <button type="button" onClick={() => setOpen(false)} disabled={saving}
              className="px-4 py-2 rounded-lg border border-neutral-300 text-[13px] font-semibold hover:bg-neutral-50 disabled:opacity-40">
              Cancelar
            </button>
            <button type="submit" disabled={saving || !canSign}
              className="px-4 py-2 rounded-lg bg-brand-ink text-brand-amber text-[13px] font-bold hover:bg-neutral-800 disabled:opacity-40">
              {saving ? 'Guardando…' : 'Guardar y descargar PDF'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
