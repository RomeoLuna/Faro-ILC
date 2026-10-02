// app/qr/[id]/page.js
// =========================================================================
// PÁGINA PÚBLICA DEL QR — Sin auth, sin sidebar
// =========================================================================
// Se abre al escanear el sticker pegado junto a un sensor.
//
// Dos modos según la etiqueta (calibration_labels):
//   • VINCULADA A POS (pos_id): todo el estado se lee EN VIVO —
//       - estado vigente/vencido: maintenance_positions_view + misma regla
//         de frecuencia que el Faro (lib/posStatus.js)
//       - última calibración + certificado: último calibration_event de la POS
//       - otros sensores de la misma POS: demás etiquetas con ese pos_id
//   • MANUAL (sin pos_id): muestra las fechas escritas a mano, como antes.
//
// La ruta está FUERA del grupo (app) para no usar el layout con sidebar.
// =========================================================================

export const dynamic = 'force-dynamic';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { parseLocalDate } from '@/lib/posStatus';
import { effectiveRecord } from '@/lib/labelRecord';

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function formatDate(value) {
  const d = value instanceof Date ? value : parseLocalDate(value ? String(value).slice(0, 10) : null);
  if (!d) return null;
  return `${String(d.getDate()).padStart(2,'0')} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

const TONE = {
  pass:    { bg: 'bg-emerald-50', border: 'border-emerald-400', soft: 'border-emerald-200', text: 'text-emerald-700', icon: '✓' },
  warn:    { bg: 'bg-amber-50',   border: 'border-amber-400',   soft: 'border-amber-200',   text: 'text-amber-700',   icon: '⚠' },
  fail:    { bg: 'bg-red-50',     border: 'border-red-400',     soft: 'border-red-200',     text: 'text-red-700',     icon: '✗' },
  neutral: { bg: 'bg-neutral-50', border: 'border-neutral-300', soft: 'border-neutral-200', text: 'text-neutral-600', icon: '•' },
};

export async function generateMetadata() {
  return {
    title: 'Estado de calibración | LC Beer El Salvador',
    description: 'Información de calibración del instrumento',
  };
}

export default async function QrPage({ params }) {
  const { id } = params;
  const supabase = createSupabaseServerClient();

  const { data: label, error } = await supabase
    .from('calibration_labels')
    .select('*')
    .eq('id', id)
    .eq('active', true)
    .maybeSingle();

  if (error || !label) notFound();

  // ── Datos en vivo de la POS (si está vinculada) ──────────────────────
  let pos = null;
  let lastEvent = null;
  let siblings = [];

  // Historial propio del sticker (tabla de supabase/etiquetas_historial.sql).
  // Si la tabla aún no existe, la página sigue funcionando con datos del Faro.
  const { data: recData, error: recErr } = await supabase
    .from('calibration_label_records')
    .select('*')
    .eq('label_id', label.id)
    .order('performed_at', { ascending: false })
    .limit(50);
  if (recErr) console.error('[QrPage] historial:', recErr);
  const records = recData || [];

  if (label.pos_id) {
    const [posRes, evRes, sibRes] = await Promise.all([
      supabase
        .from('maintenance_positions_view')
        .select('id, pos_mtto, equipment_name, description, area, sub_area, section, sensor_type, frequency_label, frequency_months, status, days_remaining, last_noti_date, last_noti_wo, next_sap_date')
        .eq('id', label.pos_id)
        .maybeSingle(),
      supabase
        .from('calibration_events')
        .select('id, source, performed_at, result, technician_name, sap_wo, certificate_url, external_cert_pdf_url, external_provider, external_cert_number')
        .eq('position_id', label.pos_id)
        .order('performed_at', { ascending: false })
        .limit(1),
      supabase
        .from('calibration_labels')
        .select('id, instrument_name, tag, ubicacion, sensor_type')
        .eq('pos_id', label.pos_id)
        .eq('active', true)
        .neq('id', label.id)
        .order('instrument_name', { ascending: true }),
    ]);
    if (posRes.error) console.error('[QrPage] POS:', posRes.error);
    if (evRes.error)  console.error('[QrPage] eventos:', evRes.error);
    pos       = posRes.data || null;
    lastEvent = evRes.data?.[0] || null;
    siblings  = sibRes.data || [];
  }

  const live = !!pos;

  // Mismas reglas que la app (lib/labelRecord.js)
  const rec  = effectiveRecord(label, { pos, lastEvent, records, sensorsInPos: siblings.length + 1 });
  const sh   = rec.shown;
  const tone = TONE[rec.banner.tone] || TONE.neutral;
  const history = records.filter((r) => !r.voided).slice(0, 6);
  const RESULT_LABEL = { PASS: 'Aprobado', PASS_LIMITE: 'Aprobado al límite', FAIL: 'Rechazado' };
  const area = live ? [pos.area, pos.sub_area].filter(Boolean).join(' · ') : label.area;
  const certLabel = 'Ver certificado de calibración';

  return (
    <div className="min-h-screen bg-neutral-100 flex flex-col items-center justify-start py-8 px-4">

      {/* Header de marca */}
      <div className="w-full max-w-sm mb-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-neutral-900 text-yellow-400 grid place-items-center font-extrabold text-lg shrink-0">
          AB
        </div>
        <div>
          <div className="text-[13px] font-bold tracking-wide text-neutral-800 leading-tight">CALIBRACIONES</div>
          <div className="text-[11px] text-neutral-500">LC Beer El Salvador</div>
        </div>
      </div>

      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg overflow-hidden border border-neutral-200">

        {/* Este sensor */}
        <div className="bg-neutral-900 px-5 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-widest text-yellow-400 font-bold mb-0.5">
                Este sensor
              </div>
              <div className="text-white font-bold text-[17px] leading-tight">{label.instrument_name}</div>
            </div>
            {label.sensor_type && (
              <span className="text-[10px] font-bold uppercase tracking-wider bg-yellow-400 text-neutral-900 px-2 py-1 rounded-lg shrink-0">
                {label.sensor_type}
              </span>
            )}
          </div>
          {(label.tag || label.ubicacion) && (
            <div className="mt-2 text-[12px] text-neutral-300 space-y-0.5">
              {label.tag && <div><span className="text-neutral-500">TAG </span><span className="font-mono font-bold text-white">{label.tag}</span></div>}
              {label.ubicacion && <div>📍 {label.ubicacion}</div>}
            </div>
          )}
        </div>

        {/* Estado — lo primero que se ve */}
        <div className={`mx-5 mt-4 rounded-xl border-2 ${tone.bg} ${tone.border} px-4 py-4 text-center`}>
          <div className={`text-[30px] leading-none font-extrabold tracking-wide ${tone.text}`}>
            {tone.icon} {rec.banner.title}
          </div>
          {rec.banner.sub && (
            <div className={`mt-1.5 text-[13px] font-semibold ${tone.text}`}>{rec.banner.sub}</div>
          )}
        </div>

        {/* POS */}
        <div className="px-5 pt-4 pb-1">
          <div className="grid grid-cols-2 gap-3 text-[12.5px]">
            {(pos?.pos_mtto || label.pos_mtto) && (
              <InfoItem label="POS MTTO" value={pos?.pos_mtto || label.pos_mtto} mono />
            )}
            {area && <InfoItem label="Área" value={area} />}
            {live && pos.equipment_name && (
              <div className="col-span-2"><InfoItem label="Equipo" value={pos.equipment_name} /></div>
            )}
            {live && pos.frequency_months && (
              <InfoItem label="Frecuencia" value={`Cada ${pos.frequency_months} ${Number(pos.frequency_months) === 1 ? 'mes' : 'meses'}`} />
            )}
          </div>
        </div>

        {/* Quién / cuándo / próxima */}
        <div className="px-5 py-4 space-y-3">
          <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
            <div className="text-[10px] uppercase tracking-wider text-neutral-400 font-bold mb-1">Última calibración</div>
            <div className="text-[20px] font-extrabold text-neutral-900">{formatDate(sh?.performedAt) || '—'}</div>
            <div className="mt-2 space-y-0.5">
              <div className="text-[12.5px] text-neutral-600">
                <span className="text-neutral-400">Realizada por: </span>
                <strong>{sh?.performedBy || 'sin dato'}</strong>
              </div>
              {rec.resultInfo && (
                <div className="text-[12.5px] text-neutral-600">
                  <span className="text-neutral-400">Resultado: </span>
                  <strong className={TONE[rec.resultInfo.tone].text}>{rec.resultInfo.label}</strong>
                </div>
              )}
              {sh?.sapWo && (
                <div className="text-[12px] text-neutral-600">
                  <span className="text-neutral-400">OT SAP: </span>
                  <span className="font-mono font-bold">{sh.sapWo}</span>
                </div>
              )}
              {sh?.notes && (
                <div className="text-[12px] text-neutral-600">
                  <span className="text-neutral-400">Obs.: </span>{sh.notes}
                </div>
              )}
              {sh?.registeredBy && (
                <div className="text-[10.5px] text-neutral-400 pt-1">
                  Registrado en el sistema por {sh.registeredBy}
                </div>
              )}
            </div>
          </div>

          <div className={`border rounded-xl p-4 ${TONE[rec.vigencia?.tone || 'neutral'].bg} ${TONE[rec.vigencia?.tone || 'neutral'].soft}`}>
            <div className="text-[10px] uppercase tracking-wider text-neutral-400 font-bold mb-1">Próxima calibración</div>
            <div className={`text-[20px] font-extrabold ${TONE[rec.vigencia?.tone || 'neutral'].text}`}>
              {formatDate(sh?.nextDate) || '—'}
            </div>
            {rec.vigencia?.hint && (
              <div className={`mt-0.5 text-[12px] font-semibold ${TONE[rec.vigencia.tone].text}`}>{rec.vigencia.hint}</div>
            )}
          </div>
        </div>

        {/* Certificado */}
        {sh?.certUrl && (
          <div className="px-5 pb-4">
            <a href={sh.certUrl} target="_blank" rel="noopener noreferrer"
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-neutral-900 text-yellow-400 font-bold text-[14px] hover:bg-neutral-800 transition">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <polyline points="9 15 11 17 15 13"/>
              </svg>
              {certLabel}
            </a>
            {/sharepoint\.com/i.test(sh.certUrl) && (
              <div className="mt-1.5 text-[11px] text-neutral-500 text-center">
                Se abre en SharePoint: requiere iniciar sesión con cuenta de la empresa.
              </div>
            )}
          </div>
        )}

        {/* Historial */}
        {history.length > 1 && (
          <div className="px-5 pb-4">
            <div className="text-[10px] uppercase tracking-wider text-neutral-400 font-bold mb-1.5">Calibraciones anteriores</div>
            <div className="border border-neutral-200 rounded-xl divide-y divide-neutral-100 overflow-hidden">
              {history.slice(1).map((r) => (
                <div key={r.id} className="px-3 py-2 text-[12px] flex items-center justify-between gap-2">
                  <span className="font-semibold">{formatDate(r.performed_at)}</span>
                  <span className="text-neutral-600 truncate">{RESULT_LABEL[r.result] || '—'} · {r.performed_by || '—'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notas */}
        {label.notes && (
          <div className="px-5 pb-4">
            <div className="bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-3">
              <div className="text-[10px] uppercase tracking-wider text-neutral-400 font-bold mb-1">Observaciones</div>
              <p className="text-[12.5px] text-neutral-700 leading-relaxed whitespace-pre-line">{label.notes}</p>
            </div>
          </div>
        )}

        {/* Otros sensores de la misma POS */}
        {siblings.length > 0 && (
          <div className="px-5 pb-4">
            <div className="text-[10px] uppercase tracking-wider text-neutral-400 font-bold mb-1.5">
              Otros sensores de esta POS ({siblings.length})
            </div>
            <div className="border border-neutral-200 rounded-xl divide-y divide-neutral-100 overflow-hidden">
              {siblings.map((s) => (
                <a key={s.id} href={`/qr/${s.id}`} className="flex items-center gap-2 px-3 py-2 hover:bg-neutral-50">
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-semibold text-neutral-800 truncate">{s.instrument_name}</div>
                    <div className="text-[11px] text-neutral-500 truncate">
                      {[s.tag, s.ubicacion].filter(Boolean).join(' · ') || s.sensor_type || '—'}
                    </div>
                  </div>
                  <span className="text-neutral-300">›</span>
                </a>
              ))}
            </div>
            <div className="mt-1 text-[10.5px] text-neutral-400">
              Cada sensor tiene su propio registro de calibración.
            </div>
          </div>
        )}

        <div className="px-5 py-3 border-t border-neutral-100 bg-neutral-50 flex items-center justify-between">
          <div className="text-[10px] text-neutral-400">
            Consultado: {new Date().toLocaleDateString('es-SV', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/El_Salvador' })}
          </div>
          <div className="text-[10px] text-neutral-400 font-mono">{label.id.slice(0, 8)}…</div>
        </div>
      </div>

      <p className="mt-6 text-[11px] text-neutral-400 text-center max-w-xs">
        {live
          ? 'Esta información se lee en tiempo real del sistema de calibraciones de LC Beer El Salvador.'
          : 'Información registrada manualmente en el sistema de calibraciones de LC Beer El Salvador.'}
      </p>
    </div>
  );
}

function InfoItem({ label, value, mono = false }) {
  return (
    <div>
      <div className="text-[9.5px] uppercase tracking-wider text-neutral-400 font-bold mb-0.5">{label}</div>
      <div className={`text-[13px] font-bold text-neutral-800 ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}
