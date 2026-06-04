// components/pdf/CertificatePDF.jsx
// =========================================================================
// CERTIFICATE PDF — Documento vectorial con @react-pdf/renderer
// Layout A4 (595 × 842 pt) con 5 bloques:
//   1. Header   — Marca + título + fecha + OT SAP
//   2. Bloque 1 — Datos del instrumento
//   3. Bloque 2 — Patrón usado + tolerancia
//   4. Bloque 3 — Tabla con los 9 puntos de calibración
//   5. Bloque 4 — Veredicto global + observaciones
//   6. Bloque 5 — Firmas (técnico nombre/rol, supervisor con imagen base64)
//
// SIN 'use client' a propósito: este archivo nunca se renderiza como Server
// o Client Component. Se importa dinámicamente desde el modal SÓLO para
// generar el blob:
//
//   const { default: CertificatePDF } = await import('@/components/pdf/CertificatePDF');
//   const { pdf } = await import('@react-pdf/renderer');
//   const blob = await pdf(<CertificatePDF {...data} />).toBlob();
// =========================================================================

import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';

const COLORS = {
  ink: '#0B0B0C', graphite: '#1A1A1D',
  amber: '#F2A900', amberSoft: '#FFF5DD',
  pass: '#059669', passSoft: '#D1FAE5', passRowBg: '#F0FDF4',
  fail: '#DC2626', failSoft: '#FEE2E2', failRowBg: '#FEF2F2',
  warn: '#F59E0B', warnSoft: '#FEF3C7',
  border: '#D4D4D4', borderStrong: '#737373',
  textMuted: '#525252', textLight: '#A3A3A3',
  bg: '#FAFAFA',
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 28, paddingBottom: 36, paddingLeft: 30, paddingRight: 30,
    fontSize: 9, fontFamily: 'Helvetica', color: COLORS.ink,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingBottom: 8, marginBottom: 14,
    borderBottomWidth: 2, borderBottomColor: COLORS.amber, borderBottomStyle: 'solid',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center' },
  brandLogo: {
    width: 34, height: 34, backgroundColor: COLORS.amber, color: '#000',
    fontSize: 16, fontFamily: 'Helvetica-Bold', textAlign: 'center',
    paddingTop: 8, borderRadius: 4, marginRight: 8,
  },
  brandTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold' },
  brandSub:   { fontSize: 8,  color: COLORS.textMuted, marginTop: 1 },
  certTitle:  { fontSize: 12, fontFamily: 'Helvetica-Bold' },
  certMeta:   { fontSize: 8,  color: COLORS.textMuted, marginTop: 2 },

  section: {
    marginBottom: 9, borderWidth: 1, borderColor: COLORS.border,
    borderStyle: 'solid', borderRadius: 3,
  },
  sectionTitle: {
    fontSize: 8, fontFamily: 'Helvetica-Bold',
    backgroundColor: COLORS.ink, color: COLORS.amber,
    paddingTop: 4, paddingBottom: 4, paddingLeft: 8, paddingRight: 8,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  sectionBody: { padding: 8 },

  fieldRow: { flexDirection: 'row', marginBottom: 3 },
  fieldLabel: {
    width: 80, fontSize: 7.5, color: COLORS.textMuted,
    fontFamily: 'Helvetica-Bold', textTransform: 'uppercase',
  },
  fieldValue: { flex: 1, fontSize: 9 },
  fieldValueMono: { fontFamily: 'Courier-Bold' },

  twoCol: { flexDirection: 'row' },
  col: { flex: 1 },
  colSpacer: { width: 14 },

  // Tabla 9 puntos
  tableHeader: {
    flexDirection: 'row', backgroundColor: COLORS.ink, color: COLORS.amber,
    paddingTop: 4, paddingBottom: 4,
    fontFamily: 'Helvetica-Bold', fontSize: 7.5,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5, borderBottomColor: COLORS.border, borderBottomStyle: 'solid',
    paddingTop: 3, paddingBottom: 3, fontSize: 8,
  },
  tableRowPass: { backgroundColor: COLORS.passRowBg },
  tableRowFail: { backgroundColor: COLORS.failRowBg },
  // columnas (suman 100%)
  cFase:     { width: '14%', paddingLeft: 6 },
  cPunto:    { width: '8%',  textAlign: 'center' },
  cNominal:  { width: '14%', textAlign: 'center' },
  cEsperado: { width: '16%', textAlign: 'center' },
  cLectura:  { width: '16%', textAlign: 'center', fontFamily: 'Helvetica-Bold' },
  cError:    { width: '14%', textAlign: 'center' },
  cResult:   { width: '18%', textAlign: 'center', fontFamily: 'Helvetica-Bold' },

  verdict: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 6, paddingBottom: 6, paddingLeft: 12, paddingRight: 12,
    borderRadius: 4, marginBottom: 9, borderWidth: 1, borderStyle: 'solid',
  },
  verdictPass:    { backgroundColor: COLORS.passSoft, borderColor: COLORS.pass },
  verdictLimite:  { backgroundColor: COLORS.warnSoft, borderColor: COLORS.warn },
  verdictFail:    { backgroundColor: COLORS.failSoft, borderColor: COLORS.fail },
  verdictNeutral: { backgroundColor: COLORS.bg, borderColor: COLORS.border },
  verdictLabel: {
    fontSize: 8, fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase', marginRight: 10, color: COLORS.textMuted,
  },
  verdictValue: { fontSize: 13, fontFamily: 'Helvetica-Bold' },

  obsBox: { fontSize: 9, minHeight: 30, color: COLORS.ink },

  signaturesRow: { flexDirection: 'row', marginTop: 18 },
  signatureBox:  { flex: 1, alignItems: 'center' },
  signatureBoxSpacer: { width: 20 },
  signatureSlot: { width: '100%', height: 60, alignItems: 'center', justifyContent: 'flex-end' },
  signatureImg:  { maxHeight: 55, objectFit: 'contain' },
  signaturePlaceholder: { fontSize: 8, color: COLORS.textLight, fontStyle: 'italic' },
  signatureLine: {
    width: '100%',
    borderTopWidth: 1, borderTopColor: COLORS.ink, borderTopStyle: 'solid',
    marginTop: 4, paddingTop: 4,
  },
  signatureName: { fontSize: 9, fontFamily: 'Helvetica-Bold', textAlign: 'center' },
  signatureRole: { fontSize: 8, color: COLORS.textMuted, textAlign: 'center' },

  footer: {
    position: 'absolute', bottom: 18, left: 30, right: 30,
    fontSize: 7, color: COLORS.textMuted, textAlign: 'center',
    borderTopWidth: 0.5, borderTopColor: COLORS.border, borderTopStyle: 'solid',
    paddingTop: 4,
  },
});

// ── Helpers de formato ─────────────────────────────────────────────────
function fmt(n, dec = 2) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toFixed(dec);
}
function fechaLarga(iso) {
  return new Date(iso).toLocaleDateString('es-SV', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}
function horaCorta(iso) {
  return new Date(iso).toLocaleTimeString('es-SV', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}
function veredictoLabel(g) {
  return { PASS: 'APROBADO (PASS)', PASS_LIMITE: 'APROBADO EN LÍMITE',
           FAIL: 'NO CONFORME (FAIL)' }[g] || 'PENDIENTE';
}
function veredictoStyle(g) {
  return { PASS: styles.verdictPass, PASS_LIMITE: styles.verdictLimite,
           FAIL: styles.verdictFail }[g] || styles.verdictNeutral;
}
function veredictoColor(g) {
  return { PASS: COLORS.pass, PASS_LIMITE: '#92400E',
           FAIL: COLORS.fail }[g] || COLORS.textMuted;
}

function Field({ label, value, mono = false }) {
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={[styles.fieldValue, mono && styles.fieldValueMono]}>
        {value ?? '—'}
      </Text>
    </View>
  );
}

// =========================================================================
export default function CertificatePDF({
  position, form, grid, technician, supervisor,
  performedAt, tolerance = 0.5,
}) {
  const fecha = fechaLarga(performedAt);
  const hora  = horaCorta(performedAt);
  const unit  = form.unit || '';
  const modo  = form.modo || 'mA';
  const lecturaHeader = modo === 'mA' ? 'Lectura mA' : `Lectura ${unit || 'físico'}`;

  return (
    <Document
      title={`Certificado_${position.pos_mtto}`}
      author="AB InBev — LC Beer El Salvador"
      subject={`Calibración POS ${position.pos_mtto}`}
      creator="Sistema de Calibraciones v2"
    >
      <Page size="A4" style={styles.page}>

        {/* HEADER */}
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <Text style={styles.brandLogo}>AB</Text>
            <View>
              <Text style={styles.brandTitle}>AB InBev — LC Beer El Salvador</Text>
              <Text style={styles.brandSub}>Mantenimiento de Instrumentación</Text>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.certTitle}>Certificado de Calibración</Text>
            <Text style={styles.certMeta}>Fecha: {fecha} · {hora}</Text>
            <Text style={styles.certMeta}>OT SAP: {form.sap_wo || '—'}</Text>
          </View>
        </View>

        {/* BLOQUE 1: INSTRUMENTO */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bloque 1 · Instrumento</Text>
          <View style={styles.sectionBody}>
            <View style={styles.twoCol}>
              <View style={styles.col}>
                <Field label="POS MTTO"    value={position.pos_mtto} mono />
                <Field label="Equipo"      value={position.equipment_name} />
                <Field label="Descripción" value={position.description || '—'} />
                <Field label="Área"        value={position.area_name || '—'} />
              </View>
              <View style={styles.colSpacer} />
              <View style={styles.col}>
                <Field label="Tag"     value={form.instrument_tag || '—'} />
                <Field label="N° Serie" value={form.serial_number || '—'} />
                <Field label="Rango"   value={`${fmt(form.range_min)} — ${fmt(form.range_max)} ${unit}`.trim()} />
                <Field label="Unidad"  value={unit || '—'} />
              </View>
            </View>
          </View>
        </View>

        {/* BLOQUE 2: PATRÓN */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bloque 2 · Patrón de referencia</Text>
          <View style={styles.sectionBody}>
            <View style={styles.twoCol}>
              <View style={styles.col}>
                <Field label="Patrón usado" value={form.pattern_used || '—'} />
              </View>
              <View style={styles.colSpacer} />
              <View style={styles.col}>
                <Field label="Tolerancia"   value={`± ${tolerance}%`} />
                <Field label="Modo entrada" value={modo === 'mA' ? 'Lectura mA' : 'Unidad física'} />
              </View>
            </View>
          </View>
        </View>

        {/* BLOQUE 3: TABLA DE 9 PUNTOS */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bloque 3 · Puntos de calibración (4-20 mA)</Text>
          <View>
            <View style={styles.tableHeader}>
              <Text style={styles.cFase}>Fase</Text>
              <Text style={styles.cPunto}>%</Text>
              <Text style={styles.cNominal}>Nominal mA</Text>
              <Text style={styles.cEsperado}>Esperado {unit}</Text>
              <Text style={styles.cLectura}>{lecturaHeader}</Text>
              <Text style={styles.cError}>Error %</Text>
              <Text style={styles.cResult}>Resultado</Text>
            </View>
            {(grid.points || []).map((p, i) => {
              const rowStyle =
                p.result === 'PASS' ? styles.tableRowPass
                : p.result === 'FAIL' ? styles.tableRowFail : null;
              const reading = modo === 'mA' ? p.reading_ma : p.reading_value;
              const errColor =
                p.result === 'PASS' ? COLORS.pass
                : p.result === 'FAIL' ? COLORS.fail : COLORS.textMuted;
              return (
                <View key={i} style={[styles.tableRow, rowStyle]}>
                  <Text style={styles.cFase}>{p.phase}</Text>
                  <Text style={styles.cPunto}>{p.pct}%</Text>
                  <Text style={styles.cNominal}>{fmt(p.nominal_ma, 2)}</Text>
                  <Text style={styles.cEsperado}>{fmt(p.expected_value, 2)}</Text>
                  <Text style={styles.cLectura}>{fmt(reading, 3)}</Text>
                  <Text style={[styles.cError, { color: errColor }]}>
                    {p.error_pct != null ? `${fmt(p.error_pct, 2)}%` : '—'}
                  </Text>
                  <Text style={[styles.cResult, { color: errColor }]}>
                    {p.result || 'P/F'}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* VEREDICTO GLOBAL */}
        <View style={[styles.verdict, veredictoStyle(grid.globalResult)]}>
          <Text style={styles.verdictLabel}>Resultado global:</Text>
          <Text style={[styles.verdictValue, { color: veredictoColor(grid.globalResult) }]}>
            {veredictoLabel(grid.globalResult)}
          </Text>
        </View>

        {/* BLOQUE 4: OBSERVACIONES */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bloque 4 · Observaciones y ajustes</Text>
          <View style={styles.sectionBody}>
            <Text style={styles.obsBox}>
              {form.observations || 'Sin observaciones registradas.'}
            </Text>
          </View>
        </View>

        {/* BLOQUE 5: FIRMAS */}
        <View style={styles.signaturesRow}>
          {/* TÉCNICO: registro digital (sin imagen) */}
          <View style={styles.signatureBox}>
            <View style={styles.signatureSlot}>
              <Text style={styles.signaturePlaceholder}>Registrado digitalmente</Text>
            </View>
            <View style={styles.signatureLine}>
              <Text style={styles.signatureName}>{technician?.name || '—'}</Text>
              <Text style={styles.signatureRole}>{technician?.role || 'Técnico'}</Text>
            </View>
          </View>

          <View style={styles.signatureBoxSpacer} />

          {/* SUPERVISOR: imagen base64 escaneada */}
          <View style={styles.signatureBox}>
            <View style={styles.signatureSlot}>
              {supervisor?.signature ? (
                <Image src={supervisor.signature} style={styles.signatureImg} />
              ) : (
                <Text style={styles.signaturePlaceholder}>Sin firma de supervisor</Text>
              )}
            </View>
            <View style={styles.signatureLine}>
              <Text style={styles.signatureName}>{supervisor?.name || '—'}</Text>
              <Text style={styles.signatureRole}>{supervisor?.role || 'Supervisor'}</Text>
            </View>
          </View>
        </View>

        {/* FOOTER */}
        <Text style={styles.footer} fixed>
          Documento generado el {fecha} {hora} — Sistema de Calibraciones v2 · AB InBev LC Beer El Salvador
        </Text>
      </Page>
    </Document>
  );
}