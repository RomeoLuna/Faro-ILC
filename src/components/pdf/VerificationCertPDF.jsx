/* eslint-disable react/no-unescaped-entities, jsx-a11y/alt-text */
// components/pdf/VerificationCertPDF.jsx
// =========================================================================
// CERTIFICADO DE VERIFICACIÓN — Documento vectorial con @react-pdf/renderer
// -------------------------------------------------------------------------
// Hermano de CertificatePDF.jsx (calibración de 9 puntos), pero para una
// VERIFICACIÓN: en vez de una grilla de 9 puntos de una sola variable, se
// listan N ≥ 3 elementos distintos del equipo, cada uno con su propio tipo
// de variable física y unidad (pueden ser todos distintos entre sí — ej.
// un elemento en °C, otro en PSI, otro en pH — a diferencia de calibración
// donde todo el certificado es de una sola variable).
//
// Reutiliza EXACTAMENTE la misma paleta/estilos que CertificatePDF.jsx
// para que ambos documentos se vean como parte de la misma familia.
// =========================================================================

import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';

const COLORS = {
  ink: '#0B0B0C', graphite: '#1A1A1D',
  amber: '#F2A900', amberSoft: '#FFF5DD',
  pass: '#059669', passSoft: '#D1FAE5',
  fail: '#DC2626', failSoft: '#FEE2E2',
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

  // Tabla de elementos verificados
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
  cElemento: { width: '28%', paddingLeft: 6 },
  cTipo:     { width: '20%' },
  cUnidad:   { width: '12%', textAlign: 'center' },
  cValor:    { width: '14%', textAlign: 'center', fontFamily: 'Helvetica-Bold' },
  cObs:      { width: '26%', paddingRight: 6 },

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
// Props:
//   position: { pos_mtto, equipment_name, description, area_name }
//   form:     { sap_wo, observations }
//   elements: [{ nombre, tipo, unidad, valor, observacion }, ...]  (≥3)
//   technician: { name, role }
//   supervisor: { name, role, signature }
//   performedAt: ISO string
// =========================================================================
export default function VerificationCertPDF({
  position, form, elements = [], technician, supervisor, performedAt,
}) {
  const fecha = fechaLarga(performedAt);
  const hora  = horaCorta(performedAt);

  return (
    <Document
      title={`Verificacion_${position.pos_mtto}`}
      author="AB InBev — LC Beer El Salvador"
      subject={`Verificación POS ${position.pos_mtto}`}
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
            <Text style={styles.certTitle}>Certificado de Verificación</Text>
            <Text style={styles.certMeta}>Fecha: {fecha} · {hora}</Text>
            <Text style={styles.certMeta}>OT SAP: {form.sap_wo || '—'}</Text>
          </View>
        </View>

        {/* BLOQUE 1: EQUIPO */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bloque 1 · Equipo</Text>
          <View style={styles.sectionBody}>
            <View style={styles.twoCol}>
              <View style={styles.col}>
                <Field label="POS MTTO"    value={position.pos_mtto} mono />
                <Field label="Equipo"      value={position.equipment_name} />
              </View>
              <View style={styles.colSpacer} />
              <View style={styles.col}>
                <Field label="Descripción" value={position.description || '—'} />
                <Field label="Área"        value={position.area_name || '—'} />
              </View>
            </View>
          </View>
        </View>

        {/* BLOQUE 2: ELEMENTOS VERIFICADOS */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bloque 2 · Elementos verificados</Text>
          <View style={styles.tableHeader}>
            <Text style={styles.cElemento}>Elemento</Text>
            <Text style={styles.cTipo}>Tipo</Text>
            <Text style={styles.cUnidad}>Unidad</Text>
            <Text style={styles.cValor}>Valor</Text>
            <Text style={styles.cObs}>Observación</Text>
          </View>
          {elements.map((el, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={styles.cElemento}>{el.nombre || '—'}</Text>
              <Text style={styles.cTipo}>{el.tipo || '—'}</Text>
              <Text style={styles.cUnidad}>{el.unidad || '—'}</Text>
              <Text style={styles.cValor}>
                {el.valor != null && el.valor !== '' ? el.valor : '—'}
              </Text>
              <Text style={styles.cObs}>{el.observacion || '—'}</Text>
            </View>
          ))}
        </View>

        {/* BLOQUE 3: COMENTARIO GENERAL */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bloque 3 · Comentario general de verificación</Text>
          <View style={styles.sectionBody}>
            <Text style={styles.obsBox}>
              {form.observations || 'Sin comentarios adicionales.'}
            </Text>
          </View>
        </View>

        {/* FIRMAS */}
        <View style={styles.signaturesRow}>
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

          <View style={styles.signatureBox}>
            <View style={styles.signatureSlot}>
              {supervisor?.signature ? (
                <Image src={supervisor.signature} alt="Firma del supervisor" style={styles.signatureImg} />
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
