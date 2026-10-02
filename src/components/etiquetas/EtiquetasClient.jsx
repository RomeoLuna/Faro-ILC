'use client';
// components/etiquetas/EtiquetasClient.jsx
// =========================================================================
// ETIQUETAS QR — Client Component
// =========================================================================
// Modelo (decidido oct-2026):
//   • UN STICKER POR SENSOR FÍSICO. Cada etiqueta = un sensor con su propio
//     TAG y su ubicación física (dónde se pega el sticker).
//   • VARIAS ETIQUETAS PUEDEN APUNTAR A LA MISMA POS (pos_id). Es el caso
//     real de planta: una POS cuyos sensores están en lugares distintos.
//   • Si la etiqueta está vinculada a una POS, el estado de calibración NO
//     se escribe a mano: /qr/[id] lo lee en vivo del Faro (misma regla de
//     vigencia que la tabla, ver lib/posStatus.js) + el último certificado.
//   • Etiquetas SIN POS siguen funcionando en modo manual (fechas a mano),
//     para instrumentos que no están en el censo SAP.
//
// Generar desde el censo SAP: crea de una vez un sticker por cada POS
// activa (IW37/IP24) que aún no tenga ninguno, con los datos que ya trae
// el censo (equipo, tipo, TAG, ubicación técnica). Luego se editan uno a
// uno y se agregan los sensores extra de las POS con varios puntos.
//
// Registro de calibración (por sticker, editable): resultado, quién lo
// hizo, fecha, próxima fecha, OT y enlace al certificado (SharePoint —
// sin subir archivos, ver nota de Storage en ExternalCertModal.jsx). Lo
// que se escribe aquí es lo que muestra el QR; si queda vacío y hay POS,
// el QR completa con el dato en vivo del Faro (lib/labelRecord.js).
//
// Impresión: ventana "Imprimir stickers" → qué (uno / seleccionados /
// filtrados / todos / una POS), orden, copias y en qué posición de la hoja
// empezar (para aprovechar hojas de stickers ya usadas). Genera un
// #print-area con stickers de 63×38 mm, 3×6 = 18 por hoja carta.
// =========================================================================

import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { usePinGate } from '@/components/security/PinGate';
import { SENSOR_TYPES } from '@/lib/sensors';
import { describePosStatus, STATUS_TONE_CLASSES } from '@/lib/posStatus';
import { effectiveRecord, RESULT_OPTIONS, SORT_OPTIONS, sortLabels } from '@/lib/labelRecord';
import { qrBaseUrl, isLocalOnlyUrl } from '@/lib/publicUrl';

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function formatDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return String(iso);
  return `${String(d).padStart(2,'0')} ${MESES[m - 1]} ${y}`;
}

function formatDateObj(d) {
  if (!d) return '—';
  return `${String(d.getDate()).padStart(2,'0')} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

function addMonths(isoDate, months) {
  if (!isoDate || !months) return '';
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(y, m - 1 + Number(months), d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

// Nombre por defecto de un sensor creado desde el censo
function defaultSensorName(p) {
  const name = (p.equipment_name || p.description || `POS ${p.pos_mtto}`).trim();
  return name.slice(0, 120);
}

function sectionLabel(s) {
  return { envasado: 'Envasado', ingenieria: 'Ingeniería', calidad: 'Calidad' }[s] || null;
}

const EMPTY_FORM = {
  pos_id:                null,
  pos_mtto:              '',
  instrument_name:       '',
  sensor_type:           '',
  tag:                   '',
  ubicacion:             '',
  area:                  '',
  section:               '',
  last_calibration_date: '',
  next_calibration_date: '',
  technician_name:       '',
  sap_wo:                '',
  certificate_url:       '',
  result:                '',
  notes:                 '',
};

const MANUAL_GROUP = '__manual';

export default function EtiquetasClient({ initialLabels, positions = [] }) {
  const { requestPin } = usePinGate();

  const [labels, setLabels]       = useState(initialLabels);
  const [query, setQuery]         = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [modal, setModal]         = useState(null); // null | { mode: 'create'|'edit', data: {} }
  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState(null);
  const [appUrl, setAppUrl]       = useState('');
  const [selected, setSelected]   = useState(() => new Set());
  const [printJob, setPrintJob]   = useState(null); // { items, skip } | null
  const [printDialog, setPrintDialog] = useState(null); // { scope, one?, group? } | null
  const [recordModal, setRecordModal] = useState(null); // label | null
  const [genOpen, setGenOpen]     = useState(false);

  const posById = useMemo(() => {
    const m = new Map();
    for (const p of positions) m.set(p.id, p);
    return m;
  }, [positions]);

  useEffect(() => {
    setAppUrl(qrBaseUrl());
  }, []);

  // Al terminar el diálogo de impresión, desmontar la hoja de stickers.
  useEffect(() => {
    function done() { setPrintJob(null); }
    window.addEventListener('afterprint', done);
    return () => window.removeEventListener('afterprint', done);
  }, []);

  // Cuando la hoja de stickers ya está montada, abrir el diálogo.
  useEffect(() => {
    if (!printJob) return;
    const t = setTimeout(() => window.print(), 150);
    return () => clearTimeout(t);
  }, [printJob]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return labels.filter((l) => {
      const pos = l.pos_id ? posById.get(l.pos_id) : null;
      if (sectionFilter && (pos?.section || l.section) !== sectionFilter) return false;
      if (!q) return true;
      return [
        l.instrument_name, l.pos_mtto, l.tag, l.area, l.ubicacion,
        l.sensor_type, l.technician_name,
        pos?.pos_mtto, pos?.equipment_name, pos?.area, pos?.sub_area,
      ].some((v) => (v || '').toString().toLowerCase().includes(q));
    });
  }, [labels, query, sectionFilter, posById]);

  // Agrupar por POS (las sin POS van al final en su propio grupo)
  const groups = useMemo(() => {
    const map = new Map();
    for (const l of filtered) {
      const key = l.pos_id || MANUAL_GROUP;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(l);
    }
    const arr = [...map.entries()].map(([key, items]) => ({
      key,
      pos: key === MANUAL_GROUP ? null : posById.get(key) || null,
      items: sortLabels(items, 'ubicacion', posById),
    }));
    arr.sort((a, b) => {
      if (a.key === MANUAL_GROUP) return 1;
      if (b.key === MANUAL_GROUP) return -1;
      const am = a.pos?.pos_mtto || a.items[0]?.pos_mtto || '';
      const bm = b.pos?.pos_mtto || b.items[0]?.pos_mtto || '';
      return String(am).localeCompare(String(bm), 'es', { numeric: true });
    });
    return arr;
  }, [filtered, posById]);

  // Cuántas etiquetas tiene cada POS (sin filtro) — para "Sensor 2 de 3"
  const countByPos = useMemo(() => {
    const m = new Map();
    for (const l of labels) if (l.pos_id) m.set(l.pos_id, (m.get(l.pos_id) || 0) + 1);
    return m;
  }, [labels]);

  // POS del censo que todavía no tienen ningún sticker
  const missingPositions = useMemo(
    () => positions.filter((p) => !countByPos.has(p.id)),
    [positions, countByPos]
  );

  async function openGenerate() {
    const ok = await requestPin('generar stickers desde el censo SAP');
    if (!ok) return;
    setGenOpen(true);
  }

  // Inserta en lotes; devuelve cuántos se crearon o lanza el error
  async function generateFromCensus(list, { useUbicacionTecnica }) {
    const supabase = createSupabaseBrowserClient();
    const now = new Date().toISOString();
    const rows = list.map((p) => ({
      pos_id:          p.id,
      pos_mtto:        p.pos_mtto,
      instrument_name: defaultSensorName(p),
      sensor_type:     p.sensor_type || null,
      tag:             p.tag || null,
      ubicacion:       useUbicacionTecnica ? (p.ubicacion_tecnica || null) : null,
      area:            p.area || null,
      section:         p.section || null,
      active:          true,
      updated_at:      now,
    }));
    const created = [];
    for (let i = 0; i < rows.length; i += 200) {
      const { data, error } = await supabase
        .from('calibration_labels')
        .insert(rows.slice(i, i + 200))
        .select();
      if (error) {
        // Lo que ya se creó se queda: se muestra y el resto se puede reintentar
        if (created.length) setLabels((prev) => [...created, ...prev]);
        throw new Error(`${error.message} (se crearon ${created.length} de ${rows.length})`);
      }
      created.push(...(data || []));
    }
    setLabels((prev) => [...created, ...prev]);
    return created.length;
  }

  // ── Selección para imprimir ──────────────────────────────────────────
  function toggleSelected(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function setManySelected(ids, on) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) { if (on) next.add(id); else next.delete(id); }
      return next;
    });
  }

  const allVisibleSelected = filtered.length > 0 && filtered.every((l) => selected.has(l.id));

  // Arma la hoja: ordena, repite copias y manda a imprimir
  function runPrint(list, { sortKey, copies, skip }) {
    if (!list || list.length === 0) return;
    const sorted = sortLabels(list, sortKey, posById);
    const items = [];
    for (const l of sorted) for (let c = 0; c < copies; c++) items.push(l);
    setPrintDialog(null);
    setPrintJob({ items, skip });
  }

  // ── Registro de calibración (rápido, sin abrir todo el formulario) ───
  async function openRecord(label) {
    const ok = await requestPin('registrar calibración');
    if (!ok) return;
    setRecordModal(label);
  }

  async function saveRecord(ids, record) {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase
      .from('calibration_labels')
      .update({ ...record, updated_at: new Date().toISOString() })
      .in('id', ids)
      .select();
    if (error) throw new Error(error.message);
    const byId = new Map((data || []).map((d) => [d.id, d]));
    setLabels((prev) => prev.map((l) => byId.get(l.id) || l));
  }

  // ── Crear / editar ───────────────────────────────────────────────────
  async function handleNew(prefillPos = null) {
    const ok = await requestPin('crear etiqueta QR');
    if (!ok) return;
    setFormError(null);
    const data = { ...EMPTY_FORM };
    if (prefillPos) {
      data.pos_id      = prefillPos.id;
      data.sensor_type = prefillPos.sensor_type || '';
    }
    setModal({ mode: 'create', data });
  }

  async function handleEdit(label) {
    const ok = await requestPin('editar etiqueta QR');
    if (!ok) return;
    setFormError(null);
    // null → '' para que los inputs controlados no se quejen
    const data = { ...EMPTY_FORM };
    for (const k of Object.keys(label)) data[k] = label[k] ?? (k === 'pos_id' ? null : '');
    setModal({ mode: 'edit', data });
  }

  async function handleDelete(label) {
    const ok = await requestPin('eliminar esta etiqueta');
    if (!ok) return;

    const confirmed = confirm(
      `¿Eliminar la etiqueta "${label.instrument_name}"?\n\nEl QR pegado en el sensor dejará de funcionar.`
    );
    if (!confirmed) return;

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase
      .from('calibration_labels')
      .update({ active: false })
      .eq('id', label.id);

    if (error) {
      alert('No se pudo eliminar: ' + error.message);
      return;
    }
    setLabels((prev) => prev.filter((l) => l.id !== label.id));
    setSelected((prev) => { const n = new Set(prev); n.delete(label.id); return n; });
  }

  async function handleSave(formData) {
    setFormError(null);
    if (!formData.instrument_name?.trim()) {
      setFormError('El nombre del sensor es obligatorio.');
      return;
    }
    const pos = formData.pos_id ? posById.get(formData.pos_id) : null;
    if (formData.pos_id && !pos) {
      setFormError('La POS vinculada ya no está activa en el censo. Quita el vínculo o elige otra.');
      return;
    }

    setSaving(true);
    const supabase = createSupabaseBrowserClient();

    // Datos del sensor — siempre se guardan
    const payload = {
      pos_id:          pos ? pos.id : null,
      instrument_name: formData.instrument_name.trim(),
      sensor_type:     formData.sensor_type || null,
      tag:             formData.tag?.trim()       || null,
      ubicacion:       formData.ubicacion?.trim() || null,
      notes:           formData.notes?.trim()     || null,
      updated_at:      new Date().toISOString(),
    };

    // Registro de calibración — se guarda siempre (vinculada o no)
    Object.assign(payload, recordPayload(formData));

    if (pos) {
      // Vinculada: POS/área/sección vienen del censo
      payload.pos_mtto = pos.pos_mtto;
      payload.area     = pos.area || null;
      payload.section  = pos.section || null;
    } else {
      payload.pos_mtto = formData.pos_mtto?.trim() || null;
      payload.area     = formData.area?.trim()     || null;
      payload.section  = formData.section          || null;
    }

    if (modal.mode === 'create') {
      const { data, error } = await supabase
        .from('calibration_labels')
        .insert({ ...payload, active: true })
        .select()
        .single();

      if (error) { setFormError(error.message); setSaving(false); return; }
      setLabels((prev) => [data, ...prev]);
    } else {
      const { data, error } = await supabase
        .from('calibration_labels')
        .update(payload)
        .eq('id', formData.id)
        .select()
        .single();

      if (error) { setFormError(error.message); setSaving(false); return; }
      setLabels((prev) => prev.map((l) => (l.id === data.id ? data : l)));
    }

    setSaving(false);
    setModal(null);
  }


  return (
    <>
      {/* ── Barra de acciones ─────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="flex items-center bg-neutral-50 border border-neutral-300 rounded-lg px-3 py-2 gap-2 flex-1 min-w-[220px] focus-within:ring-2 focus-within:ring-brand-amber/40 focus-within:border-brand-amber">
          <svg className="w-4 h-4 text-neutral-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar sensor, POS, equipo, TAG, ubicación…"
            className="bg-transparent outline-none text-[13px] w-full"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-neutral-400 hover:text-neutral-900 text-sm px-1">×</button>
          )}
        </div>

        <select
          value={sectionFilter}
          onChange={(e) => setSectionFilter(e.target.value)}
          className="bg-white border border-neutral-300 rounded-lg px-2.5 py-2 text-[12.5px] font-semibold focus:outline-none focus:ring-2 focus:ring-brand-amber/40"
        >
          <option value="">Todas las secciones</option>
          <option value="envasado">Envasado</option>
          <option value="ingenieria">Ingeniería</option>
          <option value="calidad">Calidad</option>
        </select>

        <span className="text-[12px] text-neutral-500 whitespace-nowrap">
          <strong>{filtered.length}</strong> sticker{filtered.length !== 1 ? 's' : ''}
        </span>

        <label className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-neutral-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={(e) => setManySelected(filtered.map((l) => l.id), e.target.checked)}
            disabled={filtered.length === 0}
            className="w-4 h-4 accent-amber-500"
          />
          Seleccionar visibles
        </label>

        {selected.size > 0 && (
          <button
            onClick={() => setSelected(new Set())}
            className="text-[12px] font-semibold text-neutral-500 hover:text-neutral-900 underline"
          >
            Quitar selección ({selected.size})
          </button>
        )}

        <button
          onClick={() => setPrintDialog({ scope: selected.size > 0 ? 'selected' : 'filtered' })}
          disabled={labels.length === 0}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-neutral-300 text-[13px] font-semibold hover:bg-neutral-50 transition disabled:opacity-40"
        >
          <PrinterIcon />
          Imprimir…
        </button>

        <button
          onClick={() => handleNew()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-amber text-black text-[13px] font-bold hover:bg-brand-amberHover transition"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Nuevo sticker
        </button>
      </div>

      {/* ── Aviso: QR apuntando a la compu ───────────────────────────── */}
      {appUrl && isLocalOnlyUrl(appUrl) && (
        <div className="mb-5 flex gap-3 p-3.5 rounded-xl bg-brand-failSoft border-2 border-brand-fail/40 text-[12.5px] text-red-900">
          <svg className="w-5 h-5 mt-0.5 shrink-0 text-brand-fail" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span>
            <strong>Estos QR no van a funcionar al escanearlos:</strong> apuntan a <code className="font-mono">{appUrl}</code>,
            que solo existe en esta computadora. Revisa la variable <code className="font-mono">NEXT_PUBLIC_APP_URL</code> en
            <code className="font-mono"> .env.local</code> (debe ser la dirección de Netlify) y reinicia <code className="font-mono">npm run dev</code>.
          </span>
        </div>
      )}

      {/* ── Info banner ───────────────────────────────────────────────── */}
      <div className="mb-5 flex gap-3 p-3.5 rounded-xl bg-brand-amberSoft/60 border border-brand-amber/40 text-[12.5px] text-amber-900">
        <svg className="w-4 h-4 mt-0.5 shrink-0 text-amber-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span>
          Crea <strong>un sticker por cada sensor</strong> y pégalo junto a él. Si una POS tiene sensores en
          lugares distintos, agrega un sticker por cada uno con <strong>+ Agregar sensor</strong>. El QR impreso
          nunca cambia: al escanearlo se ve el estado de calibración actual de la POS.
        </span>
      </div>

      {/* ── POS del censo sin sticker ─────────────────────────────────── */}
      {missingPositions.length > 0 && (
        <div className="mb-5 flex items-center gap-3 p-3.5 rounded-xl bg-white border border-neutral-200 shadow-card flex-wrap">
          <div className="w-9 h-9 rounded-lg bg-brand-ink text-brand-amber grid place-items-center shrink-0 font-extrabold text-[13px]">
            SAP
          </div>
          <div className="min-w-0 flex-1 text-[12.5px] text-neutral-700">
            <strong className="text-neutral-900">{missingPositions.length}</strong> posicion{missingPositions.length !== 1 ? 'es' : ''} del
            censo (IW37/IP24) todavía no tiene{missingPositions.length !== 1 ? 'n' : ''} sticker. Créalos de una vez con los
            datos de SAP y después ajusta lo que haga falta.
          </div>
          <button
            onClick={openGenerate}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-ink text-brand-amber text-[13px] font-bold hover:bg-neutral-800"
          >
            Generar desde el censo SAP
          </button>
        </div>
      )}

      {/* ── Grupos por POS ───────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <EmptyState onNew={() => handleNew()} hasQuery={!!query || !!sectionFilter} onClear={() => { setQuery(''); setSectionFilter(''); }}
          onGenerate={missingPositions.length > 0 ? openGenerate : null} />
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <PosGroup
              key={g.key}
              group={g}
              appUrl={appUrl}
              selected={selected}
              onToggle={toggleSelected}
              onToggleGroup={(on) => setManySelected(g.items.map((l) => l.id), on)}
              onRecord={openRecord}
              onAddSensor={() => handleNew(g.pos)}
              onPrintGroup={() => setPrintDialog({
                scope: 'group',
                group: { label: g.pos ? `POS ${g.pos.pos_mtto}` : 'Etiquetas manuales', items: g.items },
              })}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onPrintOne={(l) => setPrintDialog({ scope: 'one', one: l })}
            />
          ))}
        </div>
      )}

      {/* ── Modal de crear / editar ────────────────────────────────────── */}
      {modal && (
        <LabelFormModal
          mode={modal.mode}
          initialData={modal.data}
          positions={positions}
          posById={posById}
          countByPos={countByPos}
          onSave={handleSave}
          onClose={() => setModal(null)}
          saving={saving}
          error={formError}
        />
      )}

      {printDialog && (
        <PrintDialog
          initial={printDialog}
          selectedLabels={labels.filter((l) => selected.has(l.id))}
          filteredLabels={filtered}
          allLabels={labels}
          onPrint={runPrint}
          baseUrl={appUrl}
          onClose={() => setPrintDialog(null)}
        />
      )}

      {recordModal && (
        <RecordModal
          label={recordModal}
          pos={recordModal.pos_id ? posById.get(recordModal.pos_id) : null}
          siblings={recordModal.pos_id ? labels.filter((l) => l.pos_id === recordModal.pos_id && l.id !== recordModal.id) : []}
          onSave={saveRecord}
          onClose={() => setRecordModal(null)}
        />
      )}

      {genOpen && (
        <GenerateModal
          missing={missingPositions}
          onGenerate={generateFromCensus}
          onClose={() => setGenOpen(false)}
        />
      )}

      {/* ── Hoja de stickers para imprimir ───────────────────────────── */}
      {printJob && typeof document !== 'undefined' && createPortal(
        <PrintSheet items={printJob.items} skip={printJob.skip} posById={posById} appUrl={appUrl} />,
        document.body
      )}

      <style jsx global>{`
        @media screen {
          #print-area { display: none; }
        }
        @media print {
          @page { size: letter; margin: 10mm; }
          body > *:not(#print-area) { display: none !important; }
          #print-area { display: block !important; }
        }
      `}</style>
    </>
  );
}


// ═════════════════════════════════════════════════════════════════════════
// GRUPO DE UNA POS
// ═════════════════════════════════════════════════════════════════════════
function PosGroup({ group, appUrl, selected, onToggle, onToggleGroup, onRecord, onAddSensor, onPrintGroup, onEdit, onDelete, onPrintOne }) {
  const { pos, items, key } = group;
  const isManual = key === MANUAL_GROUP;
  const st = pos ? describePosStatus(pos) : null;
  const tone = st ? STATUS_TONE_CLASSES[st.tone] : null;
  const orphan = !isManual && !pos; // vinculada a una POS que ya no está activa
  const groupChecked = items.length > 0 && items.every((l) => selected.has(l.id));

  return (
    <section className="bg-white rounded-xl border border-neutral-200 shadow-card overflow-hidden">
      <header className="px-5 py-3 border-b border-neutral-200 bg-neutral-50 flex items-center gap-3 flex-wrap">
        <input
          type="checkbox"
          checked={groupChecked}
          onChange={(e) => onToggleGroup(e.target.checked)}
          title="Seleccionar todos los stickers de este grupo"
          className="w-4 h-4 accent-amber-500 shrink-0"
        />
        <div className="min-w-0 flex-1">
          {isManual ? (
            <>
              <div className="text-[9.5px] uppercase tracking-wider text-neutral-500 font-bold">Sin POS vinculada</div>
              <div className="text-[14px] font-bold text-neutral-800">Etiquetas manuales</div>
            </>
          ) : orphan ? (
            <>
              <div className="text-[9.5px] uppercase tracking-wider text-brand-fail font-bold">POS no encontrada en el censo activo</div>
              <div className="font-mono text-[14px] font-extrabold text-neutral-800">{items[0]?.pos_mtto || '—'}</div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-[14px] font-extrabold text-brand-ink">POS {pos.pos_mtto}</span>
                {st && (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10.5px] font-bold uppercase tracking-wider ${tone.chip}`} title={st.hint || ''}>
                    <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
                    {st.label}
                  </span>
                )}
                {sectionLabel(pos.section) && (
                  <span className="text-[10.5px] font-semibold text-neutral-600 bg-white border border-neutral-200 px-1.5 py-0.5 rounded-md">
                    {sectionLabel(pos.section)}
                  </span>
                )}
              </div>
              <div className="text-[13px] font-semibold text-neutral-800 truncate" title={pos.equipment_name}>
                {pos.equipment_name || '—'}
                {pos.area && <span className="font-normal text-neutral-500"> · {pos.area}{pos.sub_area ? ` / ${pos.sub_area}` : ''}</span>}
              </div>
            </>
          )}
        </div>

        <span className="text-[11px] text-neutral-500 whitespace-nowrap">
          {items.length} sticker{items.length !== 1 ? 's' : ''}
        </span>

        <button
          onClick={onPrintGroup}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-neutral-300 bg-white text-[12px] font-semibold hover:bg-neutral-50"
        >
          <PrinterIcon className="w-3.5 h-3.5" />
          Imprimir {isManual ? 'grupo' : 'POS'}
        </button>

        {pos && (
          <button
            onClick={onAddSensor}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-brand-ink text-brand-amber text-[12px] font-bold hover:bg-neutral-800"
          >
            + Agregar sensor
          </button>
        )}
      </header>

      <div className="p-4 grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((label) => (
          <LabelCard
            key={label.id}
            label={label}
            pos={pos}
            appUrl={appUrl}
            checked={selected.has(label.id)}
            onToggle={() => onToggle(label.id)}
            onEdit={() => onEdit(label)}
            onRecord={() => onRecord(label)}
            onDelete={() => onDelete(label)}
            onPrint={() => onPrintOne(label)}
          />
        ))}
      </div>
    </section>
  );
}


// ═════════════════════════════════════════════════════════════════════════
// CARD DE UN STICKER (un sensor)
// ═════════════════════════════════════════════════════════════════════════
function LabelCard({ label, pos, appUrl, checked, onToggle, onEdit, onRecord, onDelete, onPrint }) {
  const qrUrl = appUrl ? `${appUrl}/qr/${label.id}` : `/qr/${label.id}`;
  const rec = effectiveRecord(label, pos);
  const tone = STATUS_TONE_CLASSES[rec.banner.tone];
  const faroTag = (k) => rec.fromFaro[k]
    ? <span className="ml-1 text-[8.5px] font-bold text-brand-env bg-brand-envSoft px-1 rounded" title="Dato del Faro (no escrito en el sticker)">FARO</span>
    : null;

  return (
    <div className={`rounded-lg border bg-white transition flex flex-col ${checked ? 'border-brand-amber ring-2 ring-brand-amber/40' : 'border-neutral-200 hover:border-neutral-300'}`}>
      <div className="p-3 flex items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          title="Seleccionar para imprimir"
          className="mt-1 w-4 h-4 accent-amber-500 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-bold text-neutral-900 leading-tight line-clamp-2">
            {label.instrument_name}
          </div>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {label.sensor_type && (
              <span className="text-[10px] font-bold uppercase tracking-wider bg-brand-ink text-brand-amber px-1.5 py-0.5 rounded">
                {label.sensor_type}
              </span>
            )}
            {label.tag && (
              <span className="text-[10px] font-mono font-bold bg-brand-envSoft text-brand-env px-1.5 py-0.5 rounded border border-brand-env/30">
                {label.tag}
              </span>
            )}
          </div>
          <div className={`mt-1.5 text-[11.5px] ${label.ubicacion ? 'text-neutral-600' : 'text-amber-700 italic'}`}>
            📍 {label.ubicacion || 'Falta ubicación física'}
          </div>
        </div>
        <div className="shrink-0 p-1 bg-white border border-neutral-200 rounded-md">
          <QRCodeSVG value={qrUrl} size={64} level="M" />
        </div>
      </div>

      {/* Lo que se ve al escanear */}
      <div className="px-3 pb-3">
        <div className={`rounded-md border px-2.5 py-1.5 flex items-center justify-between gap-2 ${tone.chip}`}>
          <span className="text-[11.5px] font-extrabold tracking-wide inline-flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${tone.dot}`} />
            {rec.banner.title}
          </span>
          {rec.banner.sub && <span className="text-[10.5px] font-semibold truncate">{rec.banner.sub}</span>}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
          <div className="min-w-0">
            <div className="text-[9px] uppercase tracking-wider text-neutral-400 font-bold">Realizado {faroTag('performedAt')}</div>
            <div className="font-bold text-neutral-800">{rec.performedAt ? formatDateObj(rec.performedAt) : '—'}</div>
          </div>
          <div className="min-w-0">
            <div className="text-[9px] uppercase tracking-wider text-neutral-400 font-bold">Próxima {faroTag('nextDate')}</div>
            <div className="font-bold text-neutral-800">{rec.nextDate ? formatDateObj(rec.nextDate) : '—'}</div>
          </div>
          <div className="col-span-2 min-w-0 truncate text-neutral-600">
            <span className="text-neutral-400">Por: </span>
            <strong>{rec.performedBy || '—'}</strong>{faroTag('performedBy')}
            {rec.certUrl && (
              <a href={rec.certUrl} target="_blank" rel="noopener noreferrer" className="ml-2 font-bold text-brand-env hover:underline">
                Certificado ↗
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="mt-auto border-t border-neutral-100 px-3 py-1.5 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onRecord}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-brand-pass text-white text-[11px] font-bold hover:bg-emerald-700"
          title="Registrar resultado, responsable y fechas (requiere PIN)"
        >
          ✓ Registrar calibración
        </button>
        <div className="flex items-center gap-0.5 shrink-0">
          <a href={qrUrl} target="_blank" rel="noopener noreferrer" title="Ver lo que se muestra al escanear"
            className="p-1.5 rounded-md text-neutral-400 hover:text-brand-ink hover:bg-neutral-100 text-[12px] leading-none">↗</a>
          <IconBtn title="Imprimir este sticker" onClick={onPrint}><PrinterIcon className="w-3.5 h-3.5" /></IconBtn>
          <IconBtn title="Editar sticker (requiere PIN)" onClick={onEdit}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </IconBtn>
          <IconBtn title="Eliminar (requiere PIN)" onClick={onDelete} danger>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6M14 11v6"/>
            </svg>
          </IconBtn>
        </div>
      </div>
    </div>
  );
}

function IconBtn({ children, title, onClick, danger = false }) {
  return (
    <button
      type="button" title={title} onClick={onClick}
      className={`p-1.5 rounded-md text-neutral-400 transition ${danger ? 'hover:text-brand-fail hover:bg-brand-failSoft' : 'hover:text-brand-ink hover:bg-neutral-100'}`}
    >
      {children}
    </button>
  );
}

function PrinterIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="6 9 6 2 18 2 18 9"/>
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
      <rect x="6" y="14" width="12" height="8"/>
    </svg>
  );
}


// ═════════════════════════════════════════════════════════════════════════
// HOJA DE IMPRESIÓN — stickers 63×38 mm, 3 por fila (carta)
// -------------------------------------------------------------------------
// A propósito NO lleva fechas ni resultado: el sticker es permanente y
// lo que cambia se ve al escanear. Lleva lo que identifica al sensor.
// Estilos inline en mm para que no dependan de Tailwind en impresión.
// ═════════════════════════════════════════════════════════════════════════
function PrintSheet({ items, skip = 0, posById, appUrl }) {
  const base = appUrl || qrBaseUrl();
  return (
    <div id="print-area">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 63mm)', gap: '3mm', fontFamily: 'Arial, Helvetica, sans-serif', color: '#111' }}>
        {Array.from({ length: skip }, (_, i) => (
          // Posiciones ya usadas de la hoja: espacio en blanco del mismo tamaño
          <div key={`skip-${i}`} style={{ width: '63mm', height: '38mm' }} />
        ))}
        {items.map((l, idx) => {
          const pos = l.pos_id ? posById.get(l.pos_id) : null;
          const posMtto = pos?.pos_mtto || l.pos_mtto;
          return (
            <div key={`${l.id}-${idx}`} style={{
              width: '63mm', height: '38mm', boxSizing: 'border-box',
              border: '0.3mm solid #111', borderRadius: '2mm', padding: '2mm',
              display: 'flex', gap: '2mm', breakInside: 'avoid', pageBreakInside: 'avoid', overflow: 'hidden',
            }}>
              <div style={{ width: '26mm', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <QRCodeSVG value={`${base}/qr/${l.id}`} size={96} level="M" style={{ width: '26mm', height: '26mm' }} />
                <div style={{ fontSize: '5.5pt', marginTop: '0.8mm', textAlign: 'center', lineHeight: 1.1 }}>
                  Escanee para ver<br />estado de calibración
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <div style={{ background: '#111', color: '#f5b800', fontSize: '5.5pt', fontWeight: 700, letterSpacing: '0.3pt', padding: '0.6mm 1.2mm', borderRadius: '1mm', alignSelf: 'flex-start', whiteSpace: 'nowrap' }}>
                  CALIBRACIÓN · QR
                </div>
                <div style={{ fontSize: '8.5pt', fontWeight: 700, lineHeight: 1.15, marginTop: '1.2mm', maxHeight: '7.4mm', overflow: 'hidden' }}>
                  {l.instrument_name}
                </div>
                {l.tag && (
                  <div style={{ fontSize: '9pt', fontWeight: 700, fontFamily: 'Consolas, monospace', marginTop: '0.8mm' }}>
                    {l.tag}
                  </div>
                )}
                <div style={{ fontSize: '6.5pt', marginTop: 'auto', lineHeight: 1.25 }}>
                  {posMtto && <div><strong>POS</strong> {posMtto}</div>}
                  {l.ubicacion && <div style={{ maxHeight: '5.2mm', overflow: 'hidden' }}>{l.ubicacion}</div>}
                  <div style={{ color: '#555' }}>LC Beer El Salvador · Faro</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ═════════════════════════════════════════════════════════════════════════
// MODAL DE FORMULARIO (CREAR / EDITAR)
// ═════════════════════════════════════════════════════════════════════════
function LabelFormModal({ mode, initialData, positions, posById, countByPos, onSave, onClose, saving, error }) {
  const [form, setForm] = useState({ ...initialData });
  const [picking, setPicking] = useState(!initialData.pos_id && mode === 'create');

  function setField(k, v) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function linkPos(p) {
    // Si es el PRIMER sticker de la POS, se rellena con los datos del censo
    // (nombre, TAG, ubicación técnica). Si la POS ya tiene stickers, este es
    // otro sensor: solo se sugiere el tipo, el resto es distinto por sensor.
    const isFirst = !countByPos.get(p.id);
    setForm((prev) => ({
      ...prev,
      pos_id:          p.id,
      sensor_type:     prev.sensor_type || p.sensor_type || '',
      instrument_name: prev.instrument_name || (isFirst ? defaultSensorName(p) : ''),
      tag:             prev.tag || (isFirst ? p.tag || '' : ''),
      ubicacion:       prev.ubicacion || (isFirst ? p.ubicacion_tecnica || '' : ''),
    }));
    setPicking(false);
  }

  function unlinkPos() {
    setForm((prev) => ({ ...prev, pos_id: null }));
    setPicking(false);
  }

  const isEdit = mode === 'edit';
  const pos = form.pos_id ? posById.get(form.pos_id) : null;
  const linked = !!form.pos_id;
  const existing = pos ? (countByPos.get(pos.id) || 0) - (isEdit && initialData.pos_id === pos.id ? 1 : 0) : 0;

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
    >
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[94vh] overflow-hidden shadow-pop border-t-4 border-brand-ink flex flex-col">

        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
          <div>
            <span className="text-[10.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-brand-ink text-brand-amber">
              {isEdit ? 'Editar sticker' : 'Nuevo sticker'}
            </span>
            <div className="text-[17px] font-bold mt-1">
              {isEdit ? form.instrument_name || 'Editar' : 'Sticker QR para un sensor'}
            </div>
          </div>
          <button onClick={onClose} disabled={saving}
            className="text-neutral-400 hover:text-neutral-900 text-xl px-2 py-1 rounded-md hover:bg-neutral-100 disabled:opacity-40">
            ✕
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto space-y-5 flex-1">

          {/* 1) POS */}
          <fieldset className="space-y-2">
            <legend className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-2">
              1 · Posición de mantenimiento
            </legend>

            {picking ? (
              <PosPicker positions={positions} onPick={linkPos} onManual={unlinkPos} />
            ) : pos ? (
              <div className="flex items-start gap-3 p-3 rounded-lg border border-brand-pass/40 bg-brand-passSoft/30">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-extrabold text-[14px]">POS {pos.pos_mtto}</span>
                    <StatusChip pos={pos} />
                  </div>
                  <div className="text-[12.5px] font-semibold text-neutral-800">{pos.equipment_name}</div>
                  <div className="text-[11.5px] text-neutral-500">
                    {[pos.area, pos.sub_area, sectionLabel(pos.section)].filter(Boolean).join(' · ')}
                  </div>
                  <div className="text-[11.5px] text-neutral-600 mt-1">
                    {existing > 0
                      ? <>Esta POS ya tiene <strong>{existing}</strong> sticker{existing !== 1 ? 's' : ''}. Este será otro sensor de la misma POS.</>
                      : 'Primer sticker de esta POS.'}
                  </div>
                </div>
                <button type="button" onClick={() => setPicking(true)}
                  className="text-[12px] font-bold text-brand-ink underline shrink-0">
                  Cambiar
                </button>
              </div>
            ) : linked ? (
              <div className="p-3 rounded-lg bg-brand-failSoft text-brand-fail text-[12.5px] flex items-center justify-between gap-2">
                La POS vinculada ya no está activa en el censo.
                <button type="button" onClick={() => setPicking(true)} className="font-bold underline">Elegir otra</button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2 p-3 rounded-lg border border-neutral-200 bg-neutral-50 text-[12.5px] text-neutral-600">
                <span>Sin POS — los datos de calibración se escriben a mano.</span>
                <button type="button" onClick={() => setPicking(true)} className="font-bold text-brand-ink underline shrink-0">
                  Vincular a una POS
                </button>
              </div>
            )}
          </fieldset>

          {/* 2) Sensor */}
          <fieldset className="space-y-3 pt-3 border-t border-neutral-100">
            <legend className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-2">
              2 · Este sensor
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField label="Nombre del sensor *" value={form.instrument_name}
                onChange={(v) => setField('instrument_name', v)}
                placeholder={pos ? `Ej. Presión salida — ${pos.equipment_name || ''}`.slice(0, 60) : 'Ej. Manómetro línea 2'} />
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-600 mb-1">
                  Tipo de sensor
                </label>
                <select value={form.sensor_type || ''} onChange={(e) => setField('sensor_type', e.target.value)}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-[13px] bg-white outline-none focus:ring-2 focus:ring-brand-amber">
                  <option value="">— Seleccionar —</option>
                  {SENSOR_TYPES.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField label="TAG / ID del sensor" value={form.tag}
                onChange={(v) => setField('tag', v)} placeholder="Ej. PT-101" mono />
              <FormField label="Ubicación física (dónde va el sticker)" value={form.ubicacion}
                onChange={(v) => setField('ubicacion', v)} placeholder="Ej. Llenadora L2 — salida de producto" />
            </div>
            {linked && (
              <p className="text-[11px] text-neutral-500">
                La ubicación es lo que distingue a los sensores de una misma POS cuando están en lugares
                distintos — sale impresa en el sticker.
              </p>
            )}
          </fieldset>

          {/* Identificación cuando NO hay POS */}
          {!linked && (
            <fieldset className="space-y-3 pt-3 border-t border-neutral-100">
              <legend className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-2">
                Identificación (sin POS del censo)
              </legend>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <FormField label="POS MTTO (texto)" value={form.pos_mtto}
                  onChange={(v) => setField('pos_mtto', v)} placeholder="Opcional" mono />
                <FormField label="Área" value={form.area}
                  onChange={(v) => setField('area', v)} placeholder="Ej. ENVASADO" />
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-600 mb-1">Sección</label>
                  <select value={form.section || ''} onChange={(e) => setField('section', e.target.value)}
                    className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-[13px] bg-white outline-none focus:ring-2 focus:ring-brand-amber">
                    <option value="">— Seleccionar —</option>
                    <option value="envasado">Envasado</option>
                    <option value="ingenieria">Ingeniería</option>
                    <option value="calidad">Calidad</option>
                  </select>
                </div>
              </div>
            </fieldset>
          )}

          {/* 3) Registro de calibración — lo que muestra el QR */}
          <fieldset className="space-y-3 pt-3 border-t border-neutral-100">
            <legend className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-2">
              3 · Registro de calibración (lo que se ve al escanear)
            </legend>
            <RecordFields form={form} setField={setField} setForm={setForm} pos={pos} />
          </fieldset>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-600 mb-1">
              Notas (se muestran al escanear)
            </label>
            <textarea value={form.notes || ''} onChange={(e) => setField('notes', e.target.value)}
              rows={2} placeholder="Opcional"
              className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-brand-amber resize-y" />
          </div>

          {error && (
            <div className="text-[12.5px] text-brand-fail bg-brand-failSoft border border-brand-fail/30 rounded-md px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-neutral-200 flex justify-end gap-2">
          <button onClick={onClose} disabled={saving}
            className="px-4 py-2 rounded-lg border border-neutral-300 text-[13px] font-semibold hover:bg-neutral-50 disabled:opacity-40">
            Cancelar
          </button>
          <button onClick={() => onSave(form)} disabled={saving || picking}
            className="px-4 py-2 rounded-lg bg-brand-amber text-black text-[13px] font-bold hover:bg-brand-amberHover disabled:opacity-40 inline-flex items-center gap-2">
            {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear sticker'}
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── Buscador de POS ─────────────────────────────────────────────────────
function PosPicker({ positions, onPick, onManual }) {
  const [q, setQ] = useState('');
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return positions.filter((p) =>
      [p.pos_mtto, p.equipment_name, p.description, p.area, p.sub_area]
        .some((v) => (v || '').toString().toLowerCase().includes(s))
    ).slice(0, 8);
  }, [q, positions]);

  return (
    <div>
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar POS por número, equipo o área…"
        className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-brand-amber"
      />
      {q.trim() && (
        <div className="mt-1 border border-neutral-200 rounded-lg divide-y divide-neutral-100 max-h-64 overflow-y-auto">
          {results.length === 0 ? (
            <div className="px-3 py-2 text-[12px] text-neutral-500">Sin coincidencias en el censo activo.</div>
          ) : results.map((p) => (
            <button key={p.id} type="button" onClick={() => onPick(p)}
              className="w-full text-left px-3 py-2 hover:bg-brand-amberSoft/50 flex items-center gap-3">
              <span className="font-mono font-bold text-[12.5px] w-24 shrink-0">{p.pos_mtto}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-semibold text-neutral-800 truncate">{p.equipment_name}</span>
                <span className="block text-[11px] text-neutral-500 truncate">{[p.area, p.sub_area].filter(Boolean).join(' · ')}</span>
              </span>
              <StatusChip pos={p} />
            </button>
          ))}
        </div>
      )}
      <button type="button" onClick={onManual} className="mt-2 text-[11.5px] text-neutral-500 hover:text-neutral-900 underline">
        Este instrumento no está en el censo — llenar a mano
      </button>
    </div>
  );
}

function StatusChip({ pos }) {
  const st = describePosStatus(pos);
  const tone = STATUS_TONE_CLASSES[st.tone];
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider shrink-0 ${tone.chip}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
      {st.label}
    </span>
  );
}


// ═════════════════════════════════════════════════════════════════════════
// GENERAR DESDE EL CENSO SAP
// ═════════════════════════════════════════════════════════════════════════
function GenerateModal({ missing, onGenerate, onClose }) {
  const [section, setSection] = useState('');
  const [area, setArea]       = useState('');
  const [useUT, setUseUT]     = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError]     = useState(null);
  const [done, setDone]       = useState(null);

  const bySection = useMemo(
    () => missing.filter((p) => !section || p.section === section),
    [missing, section]
  );
  const areas = useMemo(
    () => [...new Set(bySection.map((p) => p.area).filter(Boolean))].sort(),
    [bySection]
  );
  const list = useMemo(
    () => bySection.filter((p) => !area || p.area === area),
    [bySection, area]
  );

  const sinTag = list.filter((p) => !p.tag).length;
  const sinUT  = list.filter((p) => !p.ubicacion_tecnica).length;

  async function run() {
    if (list.length === 0) return;
    if (!confirm(`Se van a crear ${list.length} sticker${list.length !== 1 ? 's' : ''} (uno por POS). ¿Continuar?`)) return;
    setRunning(true);
    setError(null);
    try {
      const n = await onGenerate(list, { useUbicacionTecnica: useUT });
      setDone(n);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !running) onClose(); }}
    >
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[94vh] overflow-hidden shadow-pop border-t-4 border-brand-ink flex flex-col">
        <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
          <div>
            <span className="text-[10.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-brand-ink text-brand-amber">
              Censo SAP · IW37 / IP24
            </span>
            <div className="text-[17px] font-bold mt-1">Generar stickers desde el censo</div>
          </div>
          <button onClick={onClose} disabled={running}
            className="text-neutral-400 hover:text-neutral-900 text-xl px-2 py-1 rounded-md hover:bg-neutral-100 disabled:opacity-40">
            ✕
          </button>
        </div>

        {done != null ? (
          <div className="px-6 py-10 text-center">
            <div className="w-14 h-14 rounded-full mx-auto mb-3 bg-brand-passSoft text-brand-pass grid place-items-center text-2xl font-bold">✓</div>
            <div className="text-[16px] font-bold">Se crearon {done} sticker{done !== 1 ? 's' : ''}</div>
            <p className="text-[12.5px] text-neutral-500 mt-1 max-w-md mx-auto">
              Revisa los que digan <em>“Falta ubicación física”</em> y, en las POS con sensores en lugares
              distintos, usa <strong>+ Agregar sensor</strong> para crear los que falten.
            </p>
            <button onClick={onClose}
              className="mt-5 px-5 py-2 rounded-lg bg-brand-amber text-black text-[13px] font-bold hover:bg-brand-amberHover">
              Listo
            </button>
          </div>
        ) : (
          <>
            <div className="px-6 py-5 overflow-y-auto space-y-4 flex-1">
              <p className="text-[12.5px] text-neutral-600">
                Se crea <strong>un sticker por cada POS que todavía no tiene</strong>, ya vinculado y con los datos
                del censo. Las POS que ya tienen sticker no se tocan, así que puedes correrlo de nuevo cuando
                entren posiciones nuevas.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-600 mb-1">Sección</label>
                  <select value={section} onChange={(e) => { setSection(e.target.value); setArea(''); }}
                    className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-[13px] bg-white outline-none focus:ring-2 focus:ring-brand-amber">
                    <option value="">Todas</option>
                    <option value="envasado">Envasado</option>
                    <option value="ingenieria">Ingeniería</option>
                    <option value="calidad">Calidad</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-600 mb-1">Área</label>
                  <select value={area} onChange={(e) => setArea(e.target.value)}
                    className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-[13px] bg-white outline-none focus:ring-2 focus:ring-brand-amber">
                    <option value="">Todas</option>
                    {areas.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
              </div>

              <label className="flex items-start gap-2 text-[12.5px] text-neutral-700 cursor-pointer">
                <input type="checkbox" checked={useUT} onChange={(e) => setUseUT(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-amber-500" />
                <span>
                  Usar la <strong>ubicación técnica de SAP</strong> como ubicación del sticker
                  <span className="block text-[11px] text-neutral-500">Después se puede cambiar por una descripción del lugar exacto.</span>
                </span>
              </label>

              <div className="rounded-lg border border-neutral-200 overflow-hidden">
                <div className="px-3 py-2 bg-neutral-50 border-b border-neutral-200 text-[12px] flex items-center gap-3 flex-wrap">
                  <span><strong>{list.length}</strong> sticker{list.length !== 1 ? 's' : ''} por crear</span>
                  {sinTag > 0 && <span className="text-amber-700">· {sinTag} sin TAG en SAP</span>}
                  {useUT && sinUT > 0 && <span className="text-amber-700">· {sinUT} sin ubicación técnica</span>}
                </div>
                <div className="max-h-64 overflow-y-auto divide-y divide-neutral-100">
                  {list.length === 0 ? (
                    <div className="px-3 py-4 text-[12px] text-neutral-500 text-center">
                      Todas las POS de este filtro ya tienen sticker.
                    </div>
                  ) : list.slice(0, 200).map((p) => (
                    <div key={p.id} className="px-3 py-1.5 flex items-center gap-3 text-[12px]">
                      <span className="font-mono font-bold w-24 shrink-0">{p.pos_mtto}</span>
                      <span className="min-w-0 flex-1 truncate" title={defaultSensorName(p)}>{defaultSensorName(p)}</span>
                      <span className="font-mono text-[11px] text-neutral-500 w-20 truncate shrink-0">{p.tag || '—'}</span>
                    </div>
                  ))}
                  {list.length > 200 && (
                    <div className="px-3 py-1.5 text-[11px] text-neutral-500">…y {list.length - 200} más</div>
                  )}
                </div>
              </div>

              {error && (
                <div className="text-[12.5px] text-brand-fail bg-brand-failSoft border border-brand-fail/30 rounded-md px-3 py-2">
                  No se pudo terminar: {error}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-neutral-200 flex justify-end gap-2">
              <button onClick={onClose} disabled={running}
                className="px-4 py-2 rounded-lg border border-neutral-300 text-[13px] font-semibold hover:bg-neutral-50 disabled:opacity-40">
                Cancelar
              </button>
              <button onClick={run} disabled={running || list.length === 0}
                className="px-4 py-2 rounded-lg bg-brand-ink text-brand-amber text-[13px] font-bold hover:bg-neutral-800 disabled:opacity-40">
                {running ? 'Creando…' : `Crear ${list.length} sticker${list.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}


// ═════════════════════════════════════════════════════════════════════════
// REGISTRO DE CALIBRACIÓN — campos reutilizables + ventana rápida
// ═════════════════════════════════════════════════════════════════════════
const RECORD_KEYS = ['result', 'technician_name', 'last_calibration_date', 'next_calibration_date', 'sap_wo', 'certificate_url'];

function recordPayload(f) {
  return {
    result:                f.result                     || null,
    technician_name:       f.technician_name?.trim()    || null,
    last_calibration_date: f.last_calibration_date      || null,
    next_calibration_date: f.next_calibration_date      || null,
    sap_wo:                f.sap_wo?.trim()             || null,
    certificate_url:       f.certificate_url?.trim()    || null,
  };
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function RecordFields({ form, setField, setForm, pos }) {
  const freq = pos?.frequency_months ? Number(pos.frequency_months) : null;
  const quick = [...new Set([freq, 3, 6, 12].filter(Boolean))];

  function addMonthsToNext(m) {
    const base = form.last_calibration_date || todayIso();
    setForm((prev) => ({
      ...prev,
      last_calibration_date: prev.last_calibration_date || base,
      next_calibration_date: addMonths(base, m),
    }));
  }

  function fromFaro() {
    if (!pos) return;
    const last = pos.last_noti_date ? String(pos.last_noti_date).slice(0, 10) : '';
    setForm((prev) => ({
      ...prev,
      last_calibration_date: last || prev.last_calibration_date,
      next_calibration_date: last && freq ? addMonths(last, freq) : prev.next_calibration_date,
      sap_wo: pos.last_noti_wo || prev.sap_wo,
    }));
  }

  function clearRecord() {
    setForm((prev) => {
      const next = { ...prev };
      for (const k of RECORD_KEYS) next[k] = '';
      return next;
    });
  }

  const urlLooksBad = form.certificate_url && !/^https?:\/\//i.test(form.certificate_url.trim());

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-600 mb-1">Resultado</label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {RESULT_OPTIONS.map((r) => {
            const on = form.result === r.value;
            const cls = {
              pass: on ? 'bg-brand-pass text-white border-brand-pass' : 'border-brand-pass/40 text-brand-pass hover:bg-brand-passSoft',
              warn: on ? 'bg-brand-warn text-black border-brand-warn' : 'border-brand-warn/50 text-amber-700 hover:bg-brand-warnSoft',
              fail: on ? 'bg-brand-fail text-white border-brand-fail' : 'border-brand-fail/40 text-brand-fail hover:bg-brand-failSoft',
            }[r.tone];
            return (
              <button key={r.value} type="button" onClick={() => setField('result', on ? '' : r.value)}
                className={`px-2 py-2 rounded-lg border-2 text-[12px] font-bold transition ${cls}`}>
                {r.tone === 'pass' ? '✓ ' : r.tone === 'fail' ? '✗ ' : '⚠ '}{r.label}
              </button>
            );
          })}
          <button type="button" onClick={() => setField('result', '')}
            className={`px-2 py-2 rounded-lg border-2 text-[12px] font-semibold transition ${!form.result ? 'border-neutral-400 bg-neutral-100 text-neutral-700' : 'border-neutral-200 text-neutral-500 hover:bg-neutral-50'}`}>
            Sin registrar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <FormField label="Realizado por" value={form.technician_name}
          onChange={(v) => setField('technician_name', v)} placeholder="Técnico o proveedor" />
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-600 mb-1">Fecha realizada</label>
          <input type="date" value={form.last_calibration_date || ''} max={todayIso()}
            onChange={(e) => setField('last_calibration_date', e.target.value)}
            className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-brand-amber" />
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-600 mb-1">Próxima fecha</label>
          <input type="date" value={form.next_calibration_date || ''}
            onChange={(e) => setField('next_calibration_date', e.target.value)}
            className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-brand-amber" />
          <div className="mt-1.5 flex gap-1 flex-wrap">
            <span className="text-[10px] text-neutral-400 self-center">Sumar:</span>
            {quick.map((m) => (
              <button key={m} type="button" onClick={() => addMonthsToNext(m)}
                title={m === freq ? 'Frecuencia de la POS' : undefined}
                className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${m === freq ? 'border-brand-amber bg-brand-amberSoft text-amber-800' : 'border-neutral-300 text-neutral-600 hover:bg-brand-amberSoft hover:border-brand-amber'}`}>
                +{m}m{m === freq ? ' (POS)' : ''}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <FormField label="OT SAP" value={form.sap_wo}
          onChange={(v) => setField('sap_wo', v)} placeholder="Ej. 9436384" mono />
        <div className="sm:col-span-2">
          <FormField label="Enlace al certificado (SharePoint)" value={form.certificate_url}
            onChange={(v) => setField('certificate_url', v)} placeholder="https://… (opcional)" />
          {urlLooksBad && (
            <div className="mt-1 text-[10.5px] text-amber-700">El enlace debe empezar con https://</div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-[11.5px]">
        {pos && (
          <button type="button" onClick={fromFaro}
            className="font-bold text-brand-env hover:underline">
            ↺ Traer fechas y OT del Faro (última NOTI {formatDate(pos.last_noti_date)})
          </button>
        )}
        <button type="button" onClick={clearRecord} className="text-neutral-500 hover:text-neutral-900 underline">
          Vaciar registro
        </button>
        <span className="text-neutral-400">
          {pos ? 'Los campos vacíos se completan con el dato en vivo del Faro.' : 'Lo que escribas aquí es lo que verá quien escanee.'}
        </span>
      </div>
    </div>
  );
}

function RecordModal({ label, pos, siblings, onSave, onClose }) {
  const [form, setForm] = useState(() => {
    const f = {};
    for (const k of RECORD_KEYS) f[k] = label[k] ?? '';
    // Atajo: si es un registro nuevo, arrancar con "hoy"
    if (!f.last_calibration_date && !f.result) f.last_calibration_date = todayIso();
    return f;
  });
  const [applyAll, setApplyAll] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function setField(k, v) { setForm((prev) => ({ ...prev, [k]: v })); }

  async function save() {
    setError(null);
    if (form.next_calibration_date && form.last_calibration_date && form.next_calibration_date < form.last_calibration_date) {
      setError('La próxima fecha no puede ser anterior a la fecha realizada.');
      return;
    }
    setSaving(true);
    try {
      const ids = [label.id, ...(applyAll ? siblings.map((s) => s.id) : [])];
      await onSave(ids, recordPayload(form));
      onClose();
    } catch (e) {
      setError(e.message || String(e));
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[94vh] overflow-hidden shadow-pop border-t-4 border-brand-pass flex flex-col">
        <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
          <div className="min-w-0">
            <span className="text-[10.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-brand-pass text-white">
              Registrar calibración
            </span>
            <div className="text-[17px] font-bold mt-1 truncate">{label.instrument_name}</div>
            <div className="text-[12px] text-neutral-500">
              {[pos ? `POS ${pos.pos_mtto}` : label.pos_mtto, label.tag, label.ubicacion].filter(Boolean).join(' · ')}
            </div>
          </div>
          <button onClick={onClose} disabled={saving}
            className="text-neutral-400 hover:text-neutral-900 text-xl px-2 py-1 rounded-md hover:bg-neutral-100 disabled:opacity-40">
            ✕
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto space-y-4 flex-1">
          <RecordFields form={form} setField={setField} setForm={setForm} pos={pos} />

          {siblings.length > 0 && (
            <label className="flex items-start gap-2 p-3 rounded-lg border border-neutral-200 bg-neutral-50 text-[12.5px] cursor-pointer">
              <input type="checkbox" checked={applyAll} onChange={(e) => setApplyAll(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-amber-500" />
              <span>
                Aplicar el mismo registro a los otros <strong>{siblings.length}</strong> sensor{siblings.length !== 1 ? 'es' : ''} de esta POS
                <span className="block text-[11px] text-neutral-500 truncate">
                  {siblings.map((s) => s.instrument_name).join(' · ')}
                </span>
              </span>
            </label>
          )}

          {error && (
            <div className="text-[12.5px] text-brand-fail bg-brand-failSoft border border-brand-fail/30 rounded-md px-3 py-2">{error}</div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-neutral-200 flex justify-end gap-2">
          <button onClick={onClose} disabled={saving}
            className="px-4 py-2 rounded-lg border border-neutral-300 text-[13px] font-semibold hover:bg-neutral-50 disabled:opacity-40">
            Cancelar
          </button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 rounded-lg bg-brand-pass text-white text-[13px] font-bold hover:bg-emerald-700 disabled:opacity-40">
            {saving ? 'Guardando…' : applyAll ? `Guardar en ${siblings.length + 1} stickers` : 'Guardar registro'}
          </button>
        </div>
      </div>
    </div>
  );
}


// ═════════════════════════════════════════════════════════════════════════
// VENTANA DE IMPRESIÓN
// ═════════════════════════════════════════════════════════════════════════
const PER_SHEET = 18; // 3 columnas × 6 filas en carta

function PrintDialog({ initial, selectedLabels, filteredLabels, allLabels, onPrint, onClose, baseUrl }) {
  const scopes = [
    initial.one   && { value: 'one',      label: 'Solo este sticker', hint: initial.one.instrument_name, list: [initial.one] },
    initial.group && { value: 'group',    label: `Solo ${initial.group.label}`, hint: `${initial.group.items.length} sticker(s)`, list: initial.group.items },
    { value: 'selected', label: 'Seleccionados', hint: selectedLabels.length ? `${selectedLabels.length} marcados` : 'Marca stickers con la casilla', list: selectedLabels },
    { value: 'filtered', label: 'Lo que estoy viendo', hint: 'Según búsqueda y sección', list: filteredLabels },
    { value: 'all',      label: 'Todos', hint: 'Sin filtros', list: allLabels },
  ].filter(Boolean);

  const [scope, setScope]   = useState(initial.scope);
  const [sortKey, setSort]  = useState('pos');
  const [copies, setCopies] = useState(1);
  const [skip, setSkip]     = useState(0);

  const list  = scopes.find((s) => s.value === scope)?.list || [];
  const total = list.length * copies;
  const pages = total ? Math.ceil((skip + total) / PER_SHEET) : 0;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-xl max-h-[94vh] overflow-hidden shadow-pop border-t-4 border-brand-ink flex flex-col">
        <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
          <div className="text-[17px] font-bold flex items-center gap-2"><PrinterIcon /> Imprimir stickers</div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-900 text-xl px-2 py-1 rounded-md hover:bg-neutral-100">✕</button>
        </div>

        <div className="px-6 py-5 overflow-y-auto space-y-5 flex-1">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-2">¿Qué imprimir?</div>
            <div className="space-y-1.5">
              {scopes.map((s) => (
                <label key={s.value}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer ${scope === s.value ? 'border-brand-amber bg-brand-amberSoft/40' : 'border-neutral-200 hover:bg-neutral-50'} ${s.list.length === 0 ? 'opacity-50' : ''}`}>
                  <input type="radio" name="scope" checked={scope === s.value} disabled={s.list.length === 0}
                    onChange={() => setScope(s.value)} className="accent-amber-500" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-semibold">{s.label}</span>
                    <span className="block text-[11px] text-neutral-500 truncate">{s.hint}</span>
                  </span>
                  <span className="text-[12px] font-bold text-neutral-700">{s.list.length}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-600 mb-1">Ordenar por</label>
              <select value={sortKey} onChange={(e) => setSort(e.target.value)}
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-[13px] bg-white outline-none focus:ring-2 focus:ring-brand-amber">
                {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-600 mb-1">Copias c/u</label>
              <select value={copies} onChange={(e) => setCopies(Number(e.target.value))}
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-[13px] bg-white outline-none focus:ring-2 focus:ring-brand-amber">
                {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-600 mb-1">Empezar en</label>
              <select value={skip} onChange={(e) => setSkip(Number(e.target.value))}
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-[13px] bg-white outline-none focus:ring-2 focus:ring-brand-amber">
                {Array.from({ length: PER_SHEET }, (_, i) => (
                  <option key={i} value={i}>Posición {i + 1}{i === 0 ? ' (hoja nueva)' : ''}</option>
                ))}
              </select>
            </div>
          </div>

          <div className={`text-[11.5px] rounded-lg px-3 py-2 border ${isLocalOnlyUrl(baseUrl) ? 'bg-brand-failSoft border-brand-fail/40 text-red-900' : 'bg-neutral-50 border-neutral-200 text-neutral-600'}`}>
            Los QR abrirán: <span className="font-mono font-bold break-all">{baseUrl}/qr/…</span>
            {isLocalOnlyUrl(baseUrl) && (
              <div className="mt-0.5 font-semibold">⚠ Esa dirección solo funciona en esta computadora — el celular no la puede abrir.</div>
            )}
          </div>

          {/* Mini-mapa de la primera hoja */}
          <div className="flex items-start gap-4">
            <div className="grid grid-cols-3 gap-0.5 p-1.5 bg-neutral-100 rounded-md border border-neutral-200 shrink-0">
              {Array.from({ length: PER_SHEET }, (_, i) => (
                <div key={i} className={`w-6 h-4 rounded-[2px] ${
                  i < skip ? 'bg-neutral-300' : i < skip + total ? 'bg-brand-amber' : 'bg-white border border-neutral-200'
                }`} />
              ))}
            </div>
            <div className="text-[12px] text-neutral-600 leading-relaxed">
              <strong>{total}</strong> sticker{total !== 1 ? 's' : ''} · {pages} hoja{pages !== 1 ? 's' : ''} carta
              <div className="text-[11px] text-neutral-500">
                Gris = posiciones ya usadas de la hoja. Stickers de 63×38 mm, 18 por hoja.
                En el diálogo de impresión deja la escala en 100%.
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-neutral-200 flex justify-end gap-2">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg border border-neutral-300 text-[13px] font-semibold hover:bg-neutral-50">
            Cancelar
          </button>
          <button onClick={() => onPrint(list, { sortKey, copies, skip })} disabled={total === 0}
            className="px-4 py-2 rounded-lg bg-brand-amber text-black text-[13px] font-bold hover:bg-brand-amberHover disabled:opacity-40 inline-flex items-center gap-2">
            <PrinterIcon /> Imprimir {total}
          </button>
        </div>
      </div>
    </div>
  );
}


// ═════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTES
// ═════════════════════════════════════════════════════════════════════════
function FormField({ label, value, onChange, placeholder, mono = false, type = 'text' }) {
  return (
    <div>
      <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-600 mb-1">
        {label}
      </label>
      <input
        type={type}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full border border-neutral-300 rounded-lg px-3 py-2 text-[13px] bg-white outline-none focus:ring-2 focus:ring-brand-amber focus:border-brand-amber ${mono ? 'font-mono' : ''}`}
      />
    </div>
  );
}

function EmptyState({ onNew, hasQuery, onClear, onGenerate }) {
  return (
    <div className="bg-white rounded-xl border border-neutral-200 shadow-card p-12 text-center">
      <div className="w-16 h-16 rounded-full mx-auto mb-3 bg-neutral-100 text-neutral-400 grid place-items-center">
        <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
          <line x1="7" y1="7" x2="7.01" y2="7"/>
        </svg>
      </div>
      <div className="text-[15px] font-bold text-neutral-800">
        {hasQuery ? 'Sin resultados' : 'Aún no hay stickers'}
      </div>
      <div className="text-[13px] text-neutral-500 mt-1 max-w-md mx-auto">
        {hasQuery
          ? 'No hay stickers que coincidan con tu búsqueda.'
          : 'Crea el primero: elige la POS, describe el sensor y dónde va pegado.'}
      </div>
      <div className="mt-4 flex justify-center gap-2">
        {hasQuery && (
          <button onClick={onClear}
            className="px-4 py-2 rounded-lg border border-neutral-300 text-[12.5px] font-semibold hover:bg-neutral-50">
            Limpiar búsqueda
          </button>
        )}
        {onGenerate && !hasQuery && (
          <button onClick={onGenerate}
            className="px-4 py-2 rounded-lg bg-brand-ink text-brand-amber text-[12.5px] font-bold hover:bg-neutral-800">
            Generar desde el censo SAP
          </button>
        )}
        <button onClick={onNew}
          className="px-4 py-2 rounded-lg bg-brand-amber text-black text-[12.5px] font-bold hover:bg-brand-amberHover">
          + Nuevo sticker
        </button>
      </div>
    </div>
  );
}
