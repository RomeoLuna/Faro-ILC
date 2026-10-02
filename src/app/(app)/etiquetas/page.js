// app/(app)/etiquetas/page.js
// =========================================================================
// ETIQUETAS DE CALIBRACIÓN — Server Component
// =========================================================================
// Carga las etiquetas desde Supabase y las pasa al client component.
// La tabla `calibration_labels` debe existir en Supabase.
//
// SQL para crear la tabla (ejecutar en Supabase SQL Editor):
// -----------------------------------------------------------------------
// CREATE TABLE public.calibration_labels (
//   id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
//   pos_id                UUID REFERENCES public.maintenance_positions(id) ON DELETE SET NULL,
//   pos_mtto              TEXT,
//   instrument_name       TEXT NOT NULL,
//   sensor_type           TEXT,
//   tag                   TEXT,
//   ubicacion             TEXT,
//   area                  TEXT,
//   section               TEXT,
//   last_calibration_date DATE,
//   next_calibration_date DATE,
//   technician_name       TEXT,
//   sap_wo                TEXT,
//   certificate_url       TEXT,
//   result                TEXT,
//   notes                 TEXT,
//   active                BOOLEAN DEFAULT true,
//   created_at            TIMESTAMPTZ DEFAULT now(),
//   updated_at            TIMESTAMPTZ DEFAULT now()
// );
// ALTER TABLE public.calibration_labels ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "public_read"  ON public.calibration_labels FOR SELECT USING (true);
// CREATE POLICY "all_write"    ON public.calibration_labels FOR ALL    USING (true) WITH CHECK (true);
// -----------------------------------------------------------------------

export const dynamic = 'force-dynamic';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import EtiquetasClient from '@/components/etiquetas/EtiquetasClient';

export default async function EtiquetasPage() {
  const supabase = createSupabaseServerClient();

  // Supabase devuelve como máximo 1000 filas por consulta (max-rows de
  // PostgREST). Al generar stickers desde el censo pueden ser más, así que
  // se lee en páginas para no perder filas en silencio.
  async function fetchAll(makeQuery, pageSize = 1000) {
    const rows = [];
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await makeQuery().range(from, from + pageSize - 1);
      if (error) return { data: null, error };
      rows.push(...(data || []));
      if (!data || data.length < pageSize) return { data: rows, error: null };
    }
  }

  const { data: labels, error } = await fetchAll(() =>
    supabase
      .from('calibration_labels')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
  );

  // POS activas del censo (IW37/IP24) — para el buscador "Vincular a POS",
  // para "Generar desde el censo SAP" y para mostrar el estado EN VIVO de
  // cada etiqueta vinculada (misma regla que el Faro, ver lib/posStatus.js).
  // Si falla, la página sigue funcionando en modo manual.
  let positions = [];
  if (!error) {
    const [posRes, extraRes] = await Promise.all([
      fetchAll(() =>
        supabase
          .from('maintenance_positions_view')
          .select(`
            id, pos_mtto, equipment_name, description,
            area, sub_area, section, sensor_type,
            frequency_months, status, days_remaining,
            last_noti_date, last_noti_wo, next_sap_date
          `)
          .eq('active', true)
          .order('pos_mtto', { ascending: true })
          .order('id', { ascending: true })
      ),
      // tag / ubicacion_tecnica no vienen en el view (columnas Sprint 50)
      fetchAll(() =>
        supabase
          .from('maintenance_positions')
          .select('id, tag, ubicacion_tecnica')
          .order('id', { ascending: true })
      ),
    ]);
    if (posRes.error)   console.error('[EtiquetasPage] error cargando POS:', posRes.error);
    if (extraRes.error) console.error('[EtiquetasPage] error cargando tag/ubicación:', extraRes.error);
    const extraById = new Map((extraRes.data || []).map((e) => [e.id, e]));
    positions = (posRes.data || []).map((p) => ({
      ...p,
      tag:               extraById.get(p.id)?.tag || null,
      ubicacion_tecnica: extraById.get(p.id)?.ubicacion_tecnica || null,
    }));
  }

  // Historial de calibraciones de los stickers (tabla del SQL
  // supabase/etiquetas_historial.sql). Si aún no se corrió ese SQL, la
  // página funciona igual y muestra un aviso para correrlo.
  let records = [];
  let historyReady = true;
  if (!error) {
    const recRes = await fetchAll(() =>
      supabase
        .from('calibration_label_records')
        .select('*')
        .order('performed_at', { ascending: false })
        .order('id', { ascending: true })
    );
    if (recRes.error) {
      console.error('[EtiquetasPage] historial:', recRes.error);
      historyReady = false;
    } else {
      records = recRes.data || [];
    }
  }

  // Último certificado emitido en Faro por cada POS (resultado, técnico,
  // enlace) — es la parte "Faro" que se compara con lo registrado a mano.
  const faroEvents = {};
  if (!error && positions.length > 0) {
    const evRes = await fetchAll(() =>
      supabase
        .from('calibration_events')
        .select('id, position_id, source, performed_at, result, technician_name, sap_wo, certificate_url, external_cert_pdf_url, external_provider')
        .order('performed_at', { ascending: false })
        .order('id', { ascending: true })
    );
    if (evRes.error) console.error('[EtiquetasPage] eventos:', evRes.error);
    for (const ev of evRes.data || []) {
      if (ev.position_id && !faroEvents[ev.position_id]) faroEvents[ev.position_id] = ev;
    }
  }

  if (error) {
    // Si la tabla todavía no existe, mostramos ayuda en vez de romper
    // 42P01 = Postgres "relation does not exist"; PGRST205 = PostgREST
    // "Could not find the table ... in the schema cache" (el que sale hoy).
    const tableNotFound =
      error.code === '42P01' ||
      error.code === 'PGRST205' ||
      error.message?.includes('does not exist') ||
      error.message?.includes('schema cache');

    return (
      <section className="p-7">
        <h1 className="text-2xl font-bold mb-4">Etiquetas de Calibración</h1>
        <div className="bg-brand-failSoft border border-brand-fail/30 text-brand-fail rounded-xl px-5 py-4 text-[13px]">
          {tableNotFound ? (
            <>
              <strong>La tabla calibration_labels aún no existe en Supabase.</strong>
              <p className="mt-2 text-neutral-700">
                Ejecuta el siguiente SQL en el editor de Supabase para crearla:
              </p>
              <pre className="mt-2 bg-neutral-900 text-green-400 text-[11px] rounded-lg p-4 overflow-x-auto whitespace-pre-wrap">
{`CREATE TABLE public.calibration_labels (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pos_id                UUID REFERENCES public.maintenance_positions(id) ON DELETE SET NULL,
  pos_mtto              TEXT,
  instrument_name       TEXT NOT NULL,
  sensor_type           TEXT,
  tag                   TEXT,
  ubicacion             TEXT,
  area                  TEXT,
  section               TEXT,
  last_calibration_date DATE,
  next_calibration_date DATE,
  technician_name       TEXT,
  sap_wo                TEXT,
  certificate_url       TEXT,
  result                TEXT,
  notes                 TEXT,
  active                BOOLEAN DEFAULT true,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.calibration_labels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read" ON public.calibration_labels FOR SELECT USING (true);
CREATE POLICY "all_write"   ON public.calibration_labels FOR ALL    USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS calibration_labels_pos_id_idx ON public.calibration_labels(pos_id);
NOTIFY pgrst, 'reload schema';`}
              </pre>
            </>
          ) : (
            <>Error cargando etiquetas: {error.message}</>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="p-7">
      <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <svg className="w-6 h-6 text-brand-amber" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
              <line x1="7" y1="7" x2="7.01" y2="7"/>
            </svg>
            Etiquetas de Calibración
          </h1>
          <p className="text-[13.5px] text-neutral-500 mt-1">
            Un sticker QR por sensor. Vincúlalo a su POS y el estado de calibración
            se lee en vivo del Faro — nunca hay que reimprimir.
          </p>
        </div>
      </div>

      <EtiquetasClient
        initialLabels={labels || []}
        positions={positions}
        initialRecords={records}
        faroEvents={faroEvents}
        historyReady={historyReady}
      />
    </section>
  );
}
