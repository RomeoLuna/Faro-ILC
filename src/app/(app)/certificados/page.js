// app/(app)/certificados/page.js
// =========================================================================
// DASHBOARD DE CERTIFICADOS — Server Component (Sprint 52b & 52c)
// -------------------------------------------------------------------------
// Regla de negocio (revisada):
//   • Universo = POS activas cuya ÚLTIMA NOTI (last_noti_date del view)
//     es posterior o igual al 1 de mayo de 2026.
//   • "Con certificado" = existe un calibration_event cuyo sap_wo matchea
//     el last_noti_wo de la POS (misma NOTI, misma calibración).
//   • "Sin certificado" = el resto. Necesitan que se emita el certificado
//     de la calibración que SAP ya notificó.
//
// El client component se encarga del diseño en cards.
// =========================================================================

export const dynamic = 'force-dynamic';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import CertificadosClient from '@/components/certificados/CertificadosClient';

const CUTOFF = '2026-05-01';

export default async function CertificadosPage() {
  const supabase = createSupabaseServerClient();

  // 1) POS activas con última NOTI dentro del período
  //    NOTA: el view no incluye tag/ubicacion_tecnica (columnas Sprint 50).
  //    Las traemos por separado con una segunda query y mergeamos por id.
  const { data: positions, error: errPos } = await supabase
    .from('maintenance_positions_view')
    .select(`
      id, pos_mtto, equipment_name, description,
      area, sub_area, area_name, section,
      sensor_type,
      frequency_label, frequency_months, tolerance_pct,
      range_min, range_max, unit,
      status,
      last_noti_wo, last_noti_date,
      last_sap_status, last_sap_date_extrema, last_sap_fecha_cierre,
      next_sap_date, sap_open_wo, sap_open_status
    `)
    .eq('active', true)
    .not('last_noti_date', 'is', null)
    .gte('last_noti_date', CUTOFF)
    .order('last_noti_date', { ascending: false });

  if (errPos) {
    return (
      <section className="p-7">
        <div className="bg-brand-failSoft border border-brand-fail/30 text-brand-fail rounded-xl px-5 py-3 text-[13px]">
          Error cargando POS: {errPos.message}
        </div>
      </section>
    );
  }

  // 1b) Info extra que no viene en el view (tag, ubicacion_tecnica)
  const posIds = (positions || []).map((p) => p.id);
  const posExtraByMtto = new Map();
  if (posIds.length > 0) {
    const { data: extras } = await supabase
      .from('maintenance_positions')
      .select('id, tag, ubicacion_tecnica')
      .in('id', posIds);
    for (const e of extras || []) posExtraByMtto.set(e.id, e);
  }

  // 2a) Eventos con sap_wo (match estricto por OT)
  const woList = (positions || []).map((p) => p.last_noti_wo).filter(Boolean);
  let events = [];
  if (woList.length > 0) {
    const { data } = await supabase
      .from('calibration_events')
      .select('id, sap_wo, position_id, source, performed_at, result, external_provider, external_cert_number, external_cert_pdf_url, certificate_url, pattern_cert_id, technician_name')
      .in('sap_wo', woList);
    events = data || [];
  }

  const eventByWo = new Map();
  for (const e of events) {
    const prev = eventByWo.get(e.sap_wo);
    if (!prev || new Date(e.performed_at) > new Date(prev.performed_at)) {
      eventByWo.set(e.sap_wo, e);
    }
  }

  // 2b) Sprint 52c — Eventos EXTERNOS por position_id.
  // Los certificados externos suelen no traer sap_wo (los emite el proveedor
  // sin referencia a la OT), pero SÍ los queremos considerar como cubierta si
  // el proveedor emitió cerca de la fecha de la NOTI de esa POS.
  const posIds2 = (positions || []).map((p) => p.id);
  let externalEvents = [];
  if (posIds2.length > 0) {
    const { data } = await supabase
      .from('calibration_events')
      .select('id, sap_wo, position_id, source, performed_at, result, external_provider, external_cert_number, external_cert_pdf_url, certificate_url, technician_name')
      .in('position_id', posIds2)
      .eq('source', 'external');
    externalEvents = data || [];
  }

  // Mapa: posId → evento externo MÁS RECIENTE
  const externalByPos = new Map();
  for (const e of externalEvents) {
    const prev = externalByPos.get(e.position_id);
    if (!prev || new Date(e.performed_at) > new Date(prev.performed_at)) {
      externalByPos.set(e.position_id, e);
    }
  }
  
  // 3) Merge
  const rows = (positions || []).map((p) => {
    // Match preferente por WO exacto
    let event = p.last_noti_wo ? eventByWo.get(p.last_noti_wo) : null;

    // Sprint 52c: si NO hubo match por WO, aceptamos un evento externo
    // reciente para esa POS como certificado cubriendo la NOTI actual.
    // Ventana: hasta 90 días DESPUÉS de la NOTI (proveedor demora en emitir)
    // y hasta 30 días ANTES (a veces se emite antes de que SAP notifique).
    if (!event) {
      const ext = externalByPos.get(p.id);
      if (ext && p.last_noti_date) {
        const notiT = new Date(p.last_noti_date).getTime();
        const extT  = new Date(ext.performed_at).getTime();
        const diffDays = (extT - notiT) / 86400000;
        if (diffDays >= -30 && diffDays <= 90) {
          event = ext;
        }
      }
    }

    const extras = posExtraByMtto.get(p.id) || {};
    return {
      // POS
      id:              p.id,
      pos_mtto:        p.pos_mtto,
      equipment_name:  p.equipment_name,
      description:     p.description,
      area:            p.area,
      sub_area:        p.sub_area,
      area_name:       p.area_name,
      section:         p.section,
      sensor_type:     p.sensor_type,
      tag:             extras.tag             || null,
      ubicacion_tecnica: extras.ubicacion_tecnica || null,
      frequency_label:  p.frequency_label,
      frequency_months: p.frequency_months,
      range_min:       p.range_min,
      range_max:       p.range_max,
      unit:            p.unit,
      status:          p.status,
      // NOTI
      noti_wo:         p.last_noti_wo,
      noti_date:       p.last_noti_date,
      // last_noti_status no existe en la vista — mostramos el status
      // completo del último cierre técnico (que contiene NOTI por regla del view)
      noti_status:     p.last_sap_status,
      // Cierre técnico (más info si aplica)
      last_sap_date:   p.last_sap_fecha_cierre || p.last_sap_date_extrema,
      // Próxima
      next_sap_date:   p.next_sap_date,
      // Certificado
      hasCert:         !!event,
      event,
    };
  });

  // 4) KPIs
  const total = rows.length;
  const conCert = rows.filter((r) => r.hasCert).length;
  const sinCert = total - conCert;
  const coverage = total > 0 ? Math.round((conCert / total) * 100) : 0;

  return (
    <section className="p-7">
      <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <svg className="w-6 h-6 text-brand-amber" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8"  y2="13"/>
              <line x1="16" y1="17" x2="8"  y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
            Certificados
          </h1>
          <p className="text-[13.5px] text-neutral-500 mt-1">
            Cobertura de certificados para POS cuya última notificación en SAP fue el <strong>{new Date(CUTOFF).toLocaleDateString('es-SV', { day: '2-digit', month: 'long', year: 'numeric' })}</strong> en adelante.
            Cada POS notificada requiere su certificado — este panel te dice cuáles ya se emitieron y cuáles faltan.
          </p>
        </div>
      </div>

      <CertificadosClient rows={rows} kpis={{ total, conCert, sinCert, coverage }} cutoff={CUTOFF} />
    </section>
  );
}