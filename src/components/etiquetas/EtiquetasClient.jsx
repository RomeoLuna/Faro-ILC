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

import { useState, useMemo, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { usePinGate } from '@/components/security/PinGate';
import { SENSOR_TYPES } from '@/lib/sensors';
import { describePosStatus, STATUS_TONE_CLASSES } from '@/lib/posStatus';
import { effectiveRecord, latestRecord, RESULT_OPTIONS, MODE_OPTIONS, SORT_OPTIONS, sortLabels } from '@/lib/labelRecord';
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

export default function EtiquetasClient({ initialLabels, positions = [], initialRecords = [], faroEvents = {}, historyReady = true }) {
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
  const [calModalId, setCalModalId] = useState(null); // id del sticker abierto en "Calibración"
  const [reviewFilter, setReviewFilter] = useState(''); // '' | 'review' | 'oos'
  const [records, setRecords] = useState(initialRecords);
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


  // Cuántas etiquetas tiene cada POS (sin filtro) — para "Sensor 2 de 3"
  const countByPos = useMemo(() => {
    const m = new Map();
    for (const l of labels) if (l.pos_id) m.set(l.pos_id, (m.get(l.pos_id) || 0) + 1);
    return m;
  }, [labels]);

  // Historial agrupado por sticker
  const recordsByLabel = useMemo(() => {
    const m = new Map();
    for (const r of records) {
      if (!m.has(r.label_id)) m.set(r.label_id, []);
      m.get(r.label_id).push(r);
    }
    return m;
  }, [records]);

  // Lo que muestra cada QR (mismas reglas que /qr/[id], ver lib/labelRecord.js)
  const recById = useMemo(() => {
    const m = new Map();
    for (const l of labels) {
      m.set(l.id, effectiveRecord(l, {
        pos:          l.pos_id ? posById.get(l.pos_id) : null,
        lastEvent:    l.pos_id ? faroEvents[l.pos_id] : null,
        records:      recordsByLabel.get(l.id) || [],
        sensorsInPos: l.pos_id ? countByPos.get(l.pos_id) || 1 : 1,
      }));
    }
    return m;
  }, [labels, posById, faroEvents, recordsByLabel, countByPos]);
  const recOf = (l) => recById.get(l.id);
  const reviewCount = labels.filter((l) => recById.get(l.id)?.needsReview && !l.out_of_service).length;
  const oosCount = labels.filter((l) => l.out_of_service).length;

  // Lista final en pantalla = búsqueda + sección + filtro "Revisar"
  const visible = useMemo(() => {
    if (!reviewFilter) return filtered;
    return filtered.filter((l) =>
      reviewFilter === 'oos' ? l.out_of_service : (recById.get(l.id)?.needsReview && !l.out_of_service)
    );
  }, [filtered, reviewFilter, recById]);

  // Agrupar por POS (las sin POS van al final en su propio grupo)
  const groups = useMemo(() => {
    const map = new Map();
    for (const l of visible) {
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
  }, [visible, posById]);

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

  const allVisibleSelected = visible.length > 0 && visible.every((l) => selected.has(l.id));

  // Arma la hoja: ordena, repite copias y manda a imprimir
  function runPrint(list, { sortKey, copies, skip }) {
    if (!list || list.length === 0) return;
    const sorted = sortLabels(list, sortKey, posById, recOf);
    const items = [];
    for (const l of sorted) for (let c = 0; c < copies; c++) items.push(l);
    setPrintDialog(null);
    setPrintJob({ items, skip });
  }

  // ── Calibración del sensor (historial, modo, fuera de servicio) ─────
  async function openCal(label) {
    const ok = await requestPin('gestionar la calibración');
    if (!ok) return;
    setCalModalId(label.id);
  }

  // Inserta registros nuevos en el historial (uno por sticker elegido)
  async function insertRecords(rows) {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.from('calibration_label_records').insert(rows).select();
    if (error) throw new Error(error.message);
    setRecords((prev) => [...(data || []), ...prev]);
  }

  // Edita / anula un registro del historial
  async function updateRecord(id, patch) {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.from('calibration_label_records').update(patch).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    setRecords((prev) => prev.map((r) => (r.id === id ? data : r)));
  }

  // Cambia modo de visualización / fuera de servicio del sticker
  async function updateLabel(id, patch) {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase
      .from('calibration_labels')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id).select().single();
    if (error) throw new Error(error.message);
    setLabels((prev) => prev.map((l) => (l.id === id ? data : l)));
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

        <select
          value={reviewFilter}
          onChange={(e) => setReviewFilter(e.target.value)}
          className={`border rounded-lg px-2.5 py-2 text-[12.5px] font-semibold focus:outline-none focus:ring-2 focus:ring-brand-amber/40 ${reviewFilter ? 'bg-brand-warnSoft border-brand-warn text-amber-800' : 'bg-white border-neutral-300'}`}
        >
          <option value="">Todos los estados</option>
          <option value="review">⚠ Revisar: vencidos, sin registro, por confirmar ({reviewCount})</option>
          <option value="oos">⛔ Fuera de servicio ({oosCount})</option>
        </select>

        <span className="text-[12px] text-neutral-500 whitespace-nowrap">
          <strong>{visible.length}</strong> sticker{visible.length !== 1 ? 's' : ''}
        </span>

        <label className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-neutral-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={(e) => setManySelected(visible.map((l) => l.id), e.target.checked)}
            disabled={visible.length === 0}
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

      {!historyReady && (
        <div className="mb-5 p-3.5 rounded-xl bg-brand-warnSoft border-2 border-brand-warn/50 text-[12.5px] text-amber-900">
          <strong>Falta un paso en Supabase:</strong> corre el archivo <code className="font-mono">supabase/etiquetas_historial.sql</code> en
          el SQL Editor. Hasta entonces no se puede registrar calibraciones ni ver el historial (lo demás funciona).
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
      {visible.length === 0 ? (
        <EmptyState onNew={() => handleNew()} hasQuery={!!query || !!sectionFilter || !!reviewFilter} onClear={() => { setQuery(''); setSectionFilter(''); setReviewFilter(''); }}
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
              onRecord={openCal}
              recOf={recOf}
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
          filteredLabels={visible}
          allLabels={labels}
          onPrint={runPrint}
          baseUrl={appUrl}
          onClose={() => setPrintDialog(null)}
        />
      )}

      {calModalId && labels.some((l) => l.id === calModalId) && (() => {
        const label = labels.find((l) => l.id === calModalId);
        const pos = label.pos_id ? posById.get(label.pos_id) : null;
        return (
          <CalibrationModal
            label={label}
            pos={pos}
            rec={recById.get(label.id)}
            history={recordsByLabel.get(label.id) || []}
            siblings={label.pos_id ? labels.filter((l) => l.pos_id === label.pos_id && l.id !== label.id) : []}
            historyReady={historyReady}
            onInsert={insertRecords}
            onUpdateRecord={updateRecord}
            onUpdateLabel={updateLabel}
            onClose={() => setCalModalId(null)}
          />
        );
      })()}

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
          /* Fuera de pantalla pero con layout real: el ajuste automático de
             texto necesita medir los stickers antes de imprimir. */
          #print-area { position: fixed; left: -10000px; top: 0; }
        }
        @media print {
          @page { size: letter; margin: 10mm; }
          body > *:not(#print-area) { display: none !important; }
          #print-area { display: block !important; position: static !important; }
        }
      `}</style>
    </>
  );
}


// ═════════════════════════════════════════════════════════════════════════
// GRUPO DE UNA POS
// ═════════════════════════════════════════════════════════════════════════
function PosGroup({ group, appUrl, selected, onToggle, onToggleGroup, onRecord, recOf, onAddSensor, onPrintGroup, onEdit, onDelete, onPrintOne }) {
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
            rec={recOf(label)}
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
function LabelCard({ label, rec, appUrl, checked, onToggle, onEdit, onRecord, onDelete, onPrint }) {
  const qrUrl = appUrl ? `${appUrl}/qr/${label.id}` : `/qr/${label.id}`;
  const tone = STATUS_TONE_CLASSES[rec.banner.tone];
  const sh = rec.shown;
  const originChip = !sh ? null : (
    <span className={`text-[8.5px] font-bold px-1 rounded ${sh.origin === 'manual' ? 'bg-neutral-200 text-neutral-700' : 'bg-brand-envSoft text-brand-env'}`}
      title={rec.why}>
      {sh.origin === 'manual' ? 'APP' : sh.origin === 'merged' ? 'SAP + APP' : 'SAP/FARO'}
    </span>
  );

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
          {rec.banner.sub && <span className="text-[10.5px] font-semibold truncate" title={rec.banner.sub}>{rec.banner.sub}</span>}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
          <div className="min-w-0">
            <div className="text-[9px] uppercase tracking-wider text-neutral-400 font-bold">Realizado</div>
            <div className="font-bold text-neutral-800">{sh?.performedAt ? formatDateObj(sh.performedAt) : '—'}</div>
          </div>
          <div className="min-w-0">
            <div className="text-[9px] uppercase tracking-wider text-neutral-400 font-bold">Próxima</div>
            <div className="font-bold text-neutral-800">{sh?.nextDate ? formatDateObj(sh.nextDate) : '—'}</div>
          </div>
          <div className="col-span-2 min-w-0 truncate text-neutral-600 flex items-center gap-1.5">
            <span className="text-neutral-400">Por:</span>
            <strong className="truncate">{sh?.performedBy || '—'}</strong>
            {originChip}
            {rec.mode !== 'auto' && (
              <span className="text-[8.5px] font-bold px-1 rounded bg-brand-ink text-brand-amber" title="Modo fijado a mano">
                {rec.mode === 'manual' ? 'SOLO MANUAL' : 'SOLO FARO'}
              </span>
            )}
          </div>
        </div>
        {rec.alerts.length > 0 && !label.out_of_service && (
          <div className="mt-2 space-y-1">
            {rec.alerts.map((a, i) => (
              <div key={i} className="text-[10.5px] font-semibold text-amber-800 bg-brand-warnSoft border border-brand-warn/40 rounded px-1.5 py-1 leading-snug">
                ⚠ {a.text}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-auto border-t border-neutral-100 px-3 py-1.5 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onRecord}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-brand-pass text-white text-[11px] font-bold hover:bg-emerald-700"
          title="Registrar, confirmar SAP, ver historial (requiere PIN)"
        >
          ✓ Calibración
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
  const sheetRef = useRef(null);

  // AJUSTE AUTOMÁTICO DE TEXTO: en cada sticker se va reduciendo la escala
  // de letra (--k) hasta que TODO el texto quepa en su espacio, sin cortes.
  // Nombres cortos salen grandes; nombres largos de SAP salen más chicos
  // pero completos. Corre antes de que se abra el diálogo de impresión.
  useLayoutEffect(() => {
    const root = sheetRef.current;
    if (!root) return;
    root.querySelectorAll('[data-fit]').forEach((box) => {
      let k = 1;
      box.style.setProperty('--k', String(k));
      while (k > 0.45 && (box.scrollHeight > box.clientHeight + 0.5 || box.scrollWidth > box.clientWidth + 0.5)) {
        k = Math.round((k - 0.04) * 100) / 100;
        box.style.setProperty('--k', String(k));
      }
    });
  }, [items, skip]);

  const fs = (pt) => `calc(var(--k, 1) * ${pt}pt)`;

  return (
    <div id="print-area" ref={sheetRef}>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 63mm)', gap: '3mm', fontFamily: 'Arial, Helvetica, sans-serif', color: '#111',
        // Chrome omite fondos al imprimir salvo que se pida explícitamente
        WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact',
      }}>
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
              border: '0.3mm solid #111', borderRadius: '2mm', padding: '1.8mm',
              display: 'flex', gap: '1.8mm', breakInside: 'avoid', pageBreakInside: 'avoid', overflow: 'hidden',
            }}>
              <div style={{ width: '23mm', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <QRCodeSVG value={`${base}/qr/${l.id}`} size={96} level="M" style={{ width: '23mm', height: '23mm' }} />
                <div style={{ fontSize: '5pt', marginTop: '0.8mm', textAlign: 'center', lineHeight: 1.1 }}>
                  Escanee para ver<br />estado de calibración
                </div>
              </div>
              <div data-fit="" style={{
                flex: 1, minWidth: 0, height: '100%', overflow: 'hidden',
                display: 'flex', flexDirection: 'column', gap: '0.7mm',
                overflowWrap: 'anywhere', wordBreak: 'break-word', hyphens: 'auto',
              }}>
                <div style={{ background: '#111', color: '#f5b800', fontSize: fs(5.2), fontWeight: 700, letterSpacing: '0.3pt', padding: '0.5mm 1.1mm', borderRadius: '1mm', alignSelf: 'flex-start', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  CALIBRACIÓN · QR
                </div>
                <div style={{ fontSize: fs(9), fontWeight: 700, lineHeight: 1.12, flexShrink: 0 }}>
                  {l.instrument_name}
                </div>
                {l.tag && (
                  <div style={{ fontSize: fs(9), fontWeight: 700, fontFamily: 'Consolas, monospace', lineHeight: 1.1, flexShrink: 0 }}>
                    {l.tag}
                  </div>
                )}
                <div style={{ fontSize: fs(6.8), marginTop: 'auto', lineHeight: 1.2, flexShrink: 0 }}>
                  {posMtto && <div><strong>POS</strong> {posMtto}</div>}
                  {l.ubicacion && <div>{l.ubicacion}</div>}
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

          <div className="flex gap-2 p-3 rounded-lg bg-brand-passSoft/50 border border-brand-pass/30 text-[12px] text-emerald-900">
            <span className="font-bold">✓</span>
            <span>
              Resultado, responsable, fechas, certificado e historial se manejan desde el botón
              <strong> ✓ Calibración</strong> de cada sticker.
            </span>
          </div>

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
// CALIBRACIÓN DEL SENSOR — comparación SAP vs app, modo, historial,
// confirmar SAP para los sensores que sí se calibraron, fuera de servicio
// ═════════════════════════════════════════════════════════════════════════
function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dateIso(d) {
  return d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '';
}

// Nombre de quien registra: se recuerda en este navegador (comodidad, no
// seguridad — la app no tiene usuarios, solo PIN).
const WHO_KEY = 'faro.etiquetas.registradoPor';
function rememberedName() {
  try { return window.localStorage.getItem(WHO_KEY) || ''; } catch { return ''; }
}
function rememberName(n) {
  try { window.localStorage.setItem(WHO_KEY, n); } catch { /* sin almacenamiento: no pasa nada */ }
}

const EMPTY_REC = { result: '', performed_by: '', performed_at: '', next_date: '', sap_wo: '', certificate_url: '', notes: '' };

function RecordFields({ form, setField, setForm, pos, lockSap = false }) {
  const freq = pos?.frequency_months ? Number(pos.frequency_months) : null;
  const quick = [...new Set([freq, 3, 6, 12].filter(Boolean))];

  function addMonthsToNext(m) {
    const base = form.performed_at || todayIso();
    setForm((prev) => ({ ...prev, performed_at: prev.performed_at || base, next_date: addMonths(base, m) }));
  }

  const urlLooksBad = form.certificate_url && !/^https?:\/\//i.test(form.certificate_url.trim());

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-600 mb-1">Resultado *</label>
        <div className="grid grid-cols-3 gap-2">
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
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <FormField label="Realizado por *" value={form.performed_by}
          onChange={(v) => setField('performed_by', v)} placeholder="Técnico o proveedor" />
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-600 mb-1">Fecha realizada *</label>
          <input type="date" value={form.performed_at || ''} max={todayIso()} disabled={lockSap}
            onChange={(e) => setField('performed_at', e.target.value)}
            className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-brand-amber disabled:bg-neutral-100" />
          {lockSap && <div className="mt-1 text-[10px] text-neutral-500">Fecha de la notificación SAP</div>}
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-600 mb-1">Próxima fecha</label>
          <input type="date" value={form.next_date || ''}
            onChange={(e) => setField('next_date', e.target.value)}
            className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-brand-amber" />
          <div className="mt-1.5 flex gap-1 flex-wrap">
            {quick.map((m) => (
              <button key={m} type="button" onClick={() => addMonthsToNext(m)}
                title={m === freq ? 'Frecuencia de la POS' : undefined}
                className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${m === freq ? 'border-brand-amber bg-brand-amberSoft text-amber-800' : 'border-neutral-300 text-neutral-600 hover:bg-brand-amberSoft hover:border-brand-amber'}`}>
                +{m}m{m === freq ? ' (POS)' : ''}
              </button>
            ))}
          </div>
          {!form.next_date && freq && (
            <div className="mt-1 text-[10px] text-neutral-500">Vacío = fecha realizada + {freq} meses</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <FormField label="OT SAP" value={form.sap_wo}
            onChange={(v) => !lockSap && setField('sap_wo', v)} placeholder="Ej. 9436384" mono />
        </div>
        <div className="sm:col-span-2">
          <FormField label="Enlace al certificado (SharePoint)" value={form.certificate_url}
            onChange={(v) => setField('certificate_url', v)} placeholder="https://… (opcional)" />
          {urlLooksBad && <div className="mt-1 text-[10.5px] text-amber-700">El enlace debe empezar con https://</div>}
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-600 mb-1">
          Observaciones {form.result === 'FAIL' && <span className="text-brand-fail">* (obligatorio si es rechazado)</span>}
        </label>
        <textarea value={form.notes || ''} onChange={(e) => setField('notes', e.target.value)} rows={2}
          placeholder={form.result === 'FAIL' ? '¿Qué se hizo? (ajuste, reemplazo, enviado a reparar…)' : 'Opcional'}
          className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-brand-amber resize-y" />
      </div>
    </div>
  );
}

function SourceColumn({ title, subtitle, rec, active, empty, children }) {
  const r = rec?.result ? RESULT_OPTIONS.find((o) => o.value === rec.result) : null;
  return (
    <div className={`rounded-xl border-2 p-3 ${active ? 'border-brand-pass bg-brand-passSoft/30' : 'border-neutral-200 bg-white'}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="text-[12.5px] font-extrabold text-neutral-800">{title}</div>
          <div className="text-[10.5px] text-neutral-500">{subtitle}</div>
        </div>
        {active && <span className="text-[9.5px] font-extrabold uppercase tracking-wider text-white bg-brand-pass px-1.5 py-0.5 rounded shrink-0">★ En el QR</span>}
      </div>
      {!rec ? (
        <div className="text-[12px] text-neutral-400 italic py-2">{empty}</div>
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11.5px]">
          <dt className="text-neutral-400">Fecha</dt><dd className="font-bold">{formatDateObj(rec.performedAt)}</dd>
          <dt className="text-neutral-400">Resultado</dt>
          <dd className={`font-bold ${r ? { pass: 'text-brand-pass', warn: 'text-amber-700', fail: 'text-brand-fail' }[r.tone] : 'text-amber-700 italic'}`}>{r ? r.label : 'sin dato'}</dd>
          <dt className="text-neutral-400">Por</dt><dd className={rec.performedBy ? 'font-semibold' : 'text-amber-700 italic'}>{rec.performedBy || 'sin dato'}</dd>
          <dt className="text-neutral-400">Próxima</dt><dd className="font-semibold">{rec.nextDate ? formatDateObj(rec.nextDate) : '—'}</dd>
          <dt className="text-neutral-400">OT</dt><dd className="font-mono">{rec.sapWo || '—'}</dd>
          <dt className="text-neutral-400">Cert.</dt>
          <dd>{rec.certUrl ? <a href={rec.certUrl} target="_blank" rel="noopener noreferrer" className="text-brand-env font-bold hover:underline">Abrir ↗</a> : '—'}</dd>
        </dl>
      )}
      {children}
    </div>
  );
}

function CalibrationModal({ label, pos, rec, history, siblings, historyReady, onInsert, onUpdateRecord, onUpdateLabel, onClose }) {
  const [view, setView]       = useState('summary'); // 'summary' | 'form'
  const [form, setForm]       = useState(EMPTY_REC);
  const [formKind, setKind]   = useState('manual');  // 'manual' | 'sap' | 'edit'
  const [editingId, setEditingId] = useState(null);
  const [who, setWho]         = useState('');
  const [alsoIds, setAlsoIds] = useState(() => new Set());
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState(null);
  const [oosReason, setOosReason] = useState(label.oos_reason || '');

  useEffect(() => { setWho(rememberedName()); }, []);

  const faro = rec.faro;
  const man  = rec.manual;
  const shownOrigin = rec.shown?.origin;
  const canConfirmSap = !!faro && (!man || rec.faroNewer);

  function setField(k, v) { setForm((prev) => ({ ...prev, [k]: v })); }

  function startNew() {
    setKind('manual'); setEditingId(null);
    setForm({ ...EMPTY_REC, performed_at: todayIso() });
    setAlsoIds(new Set()); setError(null); setView('form');
  }

  function startConfirmSap() {
    setKind('sap'); setEditingId(null);
    setForm({
      ...EMPTY_REC,
      performed_at:    dateIso(faro.performedAt),
      sap_wo:          (faro.sapWo || '').split(',')[0].trim(),
      result:          faro.result || '',
      performed_by:    faro.performedBy || '',
      certificate_url: faro.certUrl || '',
      next_date:       faro.nextDate ? dateIso(faro.nextDate) : '',
    });
    setAlsoIds(new Set()); setError(null); setView('form');
  }

  function startEdit(r) {
    setKind('edit'); setEditingId(r.id);
    setForm({
      result: r.result || '', performed_by: r.performed_by || '', performed_at: r.performed_at || '',
      next_date: r.next_date || '', sap_wo: r.sap_wo || '', certificate_url: r.certificate_url || '', notes: r.notes || '',
    });
    setError(null); setView('form');
  }

  function validate() {
    if (!who.trim()) return 'Escribe tu nombre en "Registrado por".';
    if (!form.result) return 'Elige el resultado.';
    if (!form.performed_by.trim()) return 'Indica quién realizó la calibración.';
    if (!form.performed_at) return 'Indica la fecha en que se realizó.';
    if (form.next_date && form.next_date < form.performed_at) return 'La próxima fecha no puede ser anterior a la fecha realizada.';
    if (form.result === 'FAIL' && !form.notes.trim()) return 'Si el resultado es rechazado, explica en observaciones qué se hizo.';
    return null;
  }

  async function save() {
    const err = validate();
    if (err) { setError(err); return; }
    setBusy(true); setError(null);
    rememberName(who.trim());
    const base = {
      result:          form.result,
      performed_by:    form.performed_by.trim(),
      performed_at:    form.performed_at,
      next_date:       form.next_date || null,
      sap_wo:          form.sap_wo?.trim() || null,
      certificate_url: form.certificate_url?.trim() || null,
      notes:           form.notes?.trim() || null,
    };
    try {
      if (formKind === 'edit') {
        await onUpdateRecord(editingId, { ...base, edited_by: who.trim(), edited_at: new Date().toISOString() });
      } else {
        const ids = [label.id, ...alsoIds];
        await onInsert(ids.map((id) => ({ ...base, label_id: id, source: formKind, registered_by: who.trim() })));
      }
      setView('summary');
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function voidRecord(r) {
    const name = who.trim() || prompt('¿Quién anula este registro? (tu nombre)') || '';
    if (!name.trim()) return;
    const reason = prompt('Motivo de la anulación (queda en el historial):');
    if (!reason || !reason.trim()) return;
    setBusy(true); setError(null);
    try {
      rememberName(name.trim()); setWho(name.trim());
      await onUpdateRecord(r.id, { voided: true, voided_by: name.trim(), voided_at: new Date().toISOString(), void_reason: reason.trim() });
    } catch (e) { setError(e.message || String(e)); } finally { setBusy(false); }
  }

  async function setMode(m) {
    setBusy(true); setError(null);
    try { await onUpdateLabel(label.id, { display_mode: m }); }
    catch (e) { setError(e.message || String(e)); } finally { setBusy(false); }
  }

  async function toggleOos(on) {
    if (on && !oosReason.trim()) { setError('Escribe el motivo de "fuera de servicio".'); return; }
    if (!who.trim()) { setError('Escribe tu nombre en "Registrado por".'); return; }
    setBusy(true); setError(null);
    rememberName(who.trim());
    try {
      await onUpdateLabel(label.id, on
        ? { out_of_service: true, oos_reason: oosReason.trim(), oos_since: todayIso(), oos_by: who.trim() }
        : { out_of_service: false, oos_reason: null, oos_since: null, oos_by: null });
    } catch (e) { setError(e.message || String(e)); } finally { setBusy(false); }
  }

  const sorted = [...history].sort((a, b) =>
    String(b.performed_at).localeCompare(String(a.performed_at)) || String(b.registered_at).localeCompare(String(a.registered_at)));
  const current = latestRecord(history);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[94vh] overflow-hidden shadow-pop border-t-4 border-brand-pass flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-200 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="text-[10.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-brand-pass text-white">Calibración del sensor</span>
            <div className="text-[17px] font-bold mt-1 truncate">{label.instrument_name}</div>
            <div className="text-[12px] text-neutral-500 truncate">
              {[pos ? `POS ${pos.pos_mtto}` : label.pos_mtto, label.tag, label.ubicacion].filter(Boolean).join(' · ')}
              {rec.multi && <> · <strong>{siblings.length + 1} sensores en la POS</strong></>}
            </div>
          </div>
          <button onClick={onClose} disabled={busy}
            className="text-neutral-400 hover:text-neutral-900 text-xl px-2 py-1 rounded-md hover:bg-neutral-100 disabled:opacity-40">✕</button>
        </div>

        <div className="px-6 py-5 overflow-y-auto space-y-5 flex-1">
          {!historyReady && (
            <div className="p-3 rounded-lg bg-brand-warnSoft border border-brand-warn/50 text-[12.5px] text-amber-900">
              Falta correr <code className="font-mono">supabase/etiquetas_historial.sql</code> en Supabase para poder registrar.
            </div>
          )}

          {/* Registrado por */}
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-600">Registrado por *</label>
            <input value={who} onChange={(e) => setWho(e.target.value)} placeholder="Tu nombre (queda en el historial)"
              className="flex-1 min-w-[200px] border border-neutral-300 rounded-lg px-3 py-1.5 text-[13px] outline-none focus:ring-2 focus:ring-brand-amber" />
          </div>

          {view === 'summary' ? (
            <>
              {/* Lo que ve quien escanea */}
              <div className={`rounded-xl border-2 px-4 py-3 ${STATUS_TONE_CLASSES[rec.banner.tone].chip}`}>
                <div className="text-[10px] uppercase tracking-wider font-bold opacity-70">Al escanear se ve</div>
                <div className="text-[20px] font-extrabold leading-tight">{rec.banner.title}</div>
                {rec.banner.sub && <div className="text-[12px] font-semibold">{rec.banner.sub}</div>}
                <div className="text-[11px] mt-1 opacity-80">Fuente: {rec.why || '—'}</div>
              </div>

              {rec.alerts.length > 0 && !label.out_of_service && (
                <div className="space-y-1.5">
                  {rec.alerts.map((a, i) => (
                    <div key={i} className="text-[12px] font-semibold text-amber-900 bg-brand-warnSoft border border-brand-warn/50 rounded-lg px-3 py-2">⚠ {a.text}</div>
                  ))}
                </div>
              )}

              {/* Lado a lado */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <SourceColumn
                  title="SAP / Faro" subtitle={pos ? 'Última notificación de la POS' : 'Sin POS vinculada'}
                  rec={faro} active={shownOrigin === 'faro' || shownOrigin === 'merged'}
                  empty={pos ? 'SAP aún no notifica esta POS' : 'Este sticker no está vinculado a una POS'}>
                  {canConfirmSap && historyReady && (
                    <button type="button" onClick={startConfirmSap}
                      className="mt-3 w-full px-3 py-2 rounded-lg bg-brand-env text-white text-[12px] font-bold hover:bg-blue-700">
                      {rec.multi ? 'Confirmar que este sensor se calibró' : 'Completar datos de esta calibración'}
                    </button>
                  )}
                </SourceColumn>
                <SourceColumn
                  title="Registrado en la app" subtitle={man ? `por ${current?.registered_by || '—'}` : 'Historial del sticker'}
                  rec={man} active={shownOrigin === 'manual' || shownOrigin === 'merged'}
                  empty="Aún no hay registros">
                  {historyReady && (
                    <button type="button" onClick={startNew}
                      className="mt-3 w-full px-3 py-2 rounded-lg bg-brand-pass text-white text-[12px] font-bold hover:bg-emerald-700">
                      + Registrar calibración nueva
                    </button>
                  )}
                </SourceColumn>
              </div>

              {/* Modo */}
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-1.5">¿Qué mostrar en el QR?</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {MODE_OPTIONS.map((m) => {
                    const on = (label.display_mode || 'auto') === m.value;
                    return (
                      <button key={m.value} type="button" disabled={busy || on} onClick={() => setMode(m.value)}
                        className={`text-left px-3 py-2 rounded-lg border-2 transition ${on ? 'border-brand-ink bg-brand-ink text-white' : 'border-neutral-200 hover:border-neutral-400'}`}>
                        <div className="text-[12.5px] font-bold">{on ? '● ' : '○ '}{m.label}{m.value === 'auto' ? ' (recomendado)' : ''}</div>
                        <div className={`text-[10.5px] ${on ? 'text-neutral-300' : 'text-neutral-500'}`}>{m.hint}</div>
                      </button>
                    );
                  })}
                </div>
                {rec.multi && (label.display_mode || 'auto') === 'auto' && (
                  <div className="mt-1.5 text-[11px] text-neutral-500">
                    Esta POS tiene varios sensores: una notificación SAP nueva no se aplica sola a este sensor hasta que la confirmes.
                  </div>
                )}
              </div>

              {/* Historial */}
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-1.5">Historial de este sensor ({sorted.filter((r) => !r.voided).length})</div>
                {sorted.length === 0 ? (
                  <div className="text-[12px] text-neutral-400 italic">Sin registros todavía.</div>
                ) : (
                  <div className="border border-neutral-200 rounded-lg divide-y divide-neutral-100 max-h-64 overflow-y-auto">
                    {sorted.map((r) => {
                      const ri = RESULT_OPTIONS.find((o) => o.value === r.result);
                      return (
                        <div key={r.id} className={`px-3 py-2 text-[12px] flex items-start gap-3 ${r.voided ? 'opacity-50' : ''}`}>
                          <div className="w-24 shrink-0 font-bold">{formatDate(r.performed_at)}</div>
                          <div className="min-w-0 flex-1">
                            <div className={r.voided ? 'line-through' : ''}>
                              <span className={`font-bold ${ri ? { pass: 'text-brand-pass', warn: 'text-amber-700', fail: 'text-brand-fail' }[ri.tone] : ''}`}>{ri?.label || '—'}</span>
                              {' · '}{r.performed_by || '—'}
                              {r.sap_wo && <span className="font-mono text-neutral-500"> · OT {r.sap_wo}</span>}
                              {r.source === 'sap' && <span className="ml-1 text-[9px] font-bold bg-brand-envSoft text-brand-env px-1 rounded">CONFIRMA SAP</span>}
                              {r.certificate_url && <a href={r.certificate_url} target="_blank" rel="noopener noreferrer" className="ml-1 text-brand-env font-bold hover:underline">cert ↗</a>}
                            </div>
                            {r.notes && <div className="text-[11px] text-neutral-600">{r.notes}</div>}
                            <div className="text-[10.5px] text-neutral-400">
                              Registró {r.registered_by} · {r.registered_at ? new Date(r.registered_at).toLocaleString('es-SV', { dateStyle: 'short', timeStyle: 'short' }) : ''}
                              {r.edited_by && <> · editado por {r.edited_by}</>}
                              {r.voided && <> · <strong>ANULADO</strong> por {r.voided_by}: {r.void_reason}</>}
                            </div>
                          </div>
                          {!r.voided && (
                            <div className="flex gap-2 shrink-0 text-[11px]">
                              <button type="button" onClick={() => startEdit(r)} className="font-bold text-brand-ink hover:underline">Editar</button>
                              <button type="button" onClick={() => voidRecord(r)} disabled={busy} className="font-bold text-brand-fail hover:underline">Anular</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Fuera de servicio */}
              <div className={`rounded-xl border-2 p-3 ${label.out_of_service ? 'border-brand-fail bg-brand-failSoft/50' : 'border-neutral-200'}`}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="text-[12.5px] font-extrabold">⛔ Fuera de servicio</div>
                    <div className="text-[11px] text-neutral-500">
                      {label.out_of_service
                        ? `Desde ${formatDate(label.oos_since)} · marcado por ${label.oos_by || '—'}. El QR dice "NO USAR".`
                        : 'Dañado, en reparación o retirado: el QR mostrará "NO USAR" sin importar la calibración.'}
                    </div>
                  </div>
                  {label.out_of_service ? (
                    <button type="button" onClick={() => toggleOos(false)} disabled={busy}
                      className="px-3 py-1.5 rounded-lg border-2 border-brand-pass text-brand-pass text-[12px] font-bold hover:bg-brand-passSoft">
                      Volver a servicio
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 flex-wrap">
                      <input value={oosReason} onChange={(e) => setOosReason(e.target.value)} placeholder="Motivo (ej. en reparación)"
                        className="border border-neutral-300 rounded-lg px-2.5 py-1.5 text-[12.5px] outline-none focus:ring-2 focus:ring-brand-fail/40 w-52" />
                      <button type="button" onClick={() => toggleOos(true)} disabled={busy}
                        className="px-3 py-1.5 rounded-lg bg-brand-fail text-white text-[12px] font-bold hover:bg-red-700">
                        Marcar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <div className="text-[14px] font-extrabold">
                  {formKind === 'sap' ? (rec.multi ? 'Confirmar calibración SAP para este sensor' : 'Completar calibración notificada en SAP')
                    : formKind === 'edit' ? 'Editar registro' : 'Registrar calibración nueva'}
                </div>
                <button type="button" onClick={() => setView('summary')} className="text-[12px] font-semibold text-neutral-500 hover:text-neutral-900 underline">← Volver</button>
              </div>
              {formKind === 'sap' && (
                <div className="text-[12px] text-neutral-600 bg-brand-envSoft/50 border border-brand-env/20 rounded-lg px-3 py-2">
                  Fecha y OT vienen de SAP. Completa lo que falte (resultado, quién lo hizo, certificado).
                </div>
              )}

              <RecordFields form={form} setField={setField} setForm={setForm} pos={pos} lockSap={formKind === 'sap'} />

              {formKind !== 'edit' && siblings.length > 0 && (
                <div className="rounded-lg border border-neutral-200 p-3">
                  <div className="text-[12px] font-bold mb-1">¿Qué otros sensores de esta POS se calibraron igual?</div>
                  <div className="text-[11px] text-neutral-500 mb-2">Marca solo los que sí se calibraron — se les guarda el mismo registro.</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {siblings.map((sb) => (
                      <label key={sb.id} className="flex items-start gap-2 text-[12px] cursor-pointer">
                        <input type="checkbox" checked={alsoIds.has(sb.id)} className="mt-0.5 w-4 h-4 accent-amber-500"
                          onChange={(e) => setAlsoIds((prev) => { const n = new Set(prev); if (e.target.checked) n.add(sb.id); else n.delete(sb.id); return n; })} />
                        <span className="min-w-0">
                          <span className="font-semibold block truncate">{sb.instrument_name}</span>
                          <span className="text-[10.5px] text-neutral-500 block truncate">{[sb.tag, sb.ubicacion].filter(Boolean).join(' · ') || '—'}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {error && (
            <div className="text-[12.5px] text-brand-fail bg-brand-failSoft border border-brand-fail/30 rounded-md px-3 py-2">{error}</div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-neutral-200 flex justify-end gap-2">
          {view === 'form' ? (
            <>
              <button onClick={() => setView('summary')} disabled={busy}
                className="px-4 py-2 rounded-lg border border-neutral-300 text-[13px] font-semibold hover:bg-neutral-50 disabled:opacity-40">Cancelar</button>
              <button onClick={save} disabled={busy}
                className="px-4 py-2 rounded-lg bg-brand-pass text-white text-[13px] font-bold hover:bg-emerald-700 disabled:opacity-40">
                {busy ? 'Guardando…' : formKind === 'edit' ? 'Guardar cambios' : alsoIds.size > 0 ? `Guardar en ${alsoIds.size + 1} sensores` : 'Guardar registro'}
              </button>
            </>
          ) : (
            <button onClick={onClose} disabled={busy}
              className="px-4 py-2 rounded-lg bg-brand-ink text-brand-amber text-[13px] font-bold hover:bg-neutral-800 disabled:opacity-40">Listo</button>
          )}
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
