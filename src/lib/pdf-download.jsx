// lib/pdf-download.jsx
// =========================================================================
// HELPER COMPARTIDO — Generación y descarga del certificado PDF
// -------------------------------------------------------------------------
// Extraído del CalibrationModal en Sprint 7 para que múltiples lugares de
// la app puedan disparar la descarga del PDF:
//
//   - CalibrationModal: tras un save exitoso (flujo Sprint 6)
//   - HistoryModal:     re-descarga "al vuelo" de un evento pasado
//
// Por qué `dynamic import`:
//   @react-pdf/renderer pesa ~700 KB. Mantenerlo fuera del bundle inicial
//   ahorra ese peso a todos los usuarios que no calibran.
//
// Cómo construir el `data` para una RE-descarga desde el historial:
//   const data = {
//     position: { pos_mtto, equipment_name, description, area_name },
//     form: {
//       sap_wo, instrument_tag, serial_number, pattern_used,
//       range_min, range_max, unit,
//       observations,
//       modo: inferModoFromPoints(points),   // 'mA' | 'fisico'
//     },
//     grid: { points, globalResult },
//     technician: { name, role },
//     supervisor: { name, role, signature },
//     performedAt: ISO string,
//     tolerance: number,
//   };
// =========================================================================

export async function generateAndDownloadCertificate(data) {
  // Cargar la librería + el componente PDF sólo cuando se necesite
  const [{ pdf }, { default: CertificatePDF }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('@/components/pdf/CertificatePDF'),
  ]);

  // Generar el blob del documento
  const doc  = <CertificatePDF {...data} />;
  const blob = await pdf(doc).toBlob();

  // Nombre del archivo: Certificado_<POS>_<YYYY-MM-DD>.pdf
  const dateIso  = new Date(data.performedAt).toISOString().split('T')[0];
  const filename = `Certificado_${data.position.pos_mtto}_${dateIso}.pdf`;

  // Forzar descarga en el navegador (sin servidor de por medio)
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href     = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Liberar memoria del blob (delay para asegurar que el download arrancó)
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/**
 * Infiere el modo de entrada ('mA' o 'fisico') a partir de los puntos.
 * Útil cuando reconstruimos el `form` desde un evento histórico de la BD,
 * porque no guardamos el modo explícitamente — sólo guardamos los campos
 * `reading_ma` o `reading_value` dependiendo de cómo se ingresó.
 */
export function inferModoFromPoints(points) {
  if (!points || points.length === 0) return 'mA';
  const tieneMa     = points.some((p) => p.reading_ma     != null);
  const tieneFisico = points.some((p) => p.reading_value  != null);
  // Si sólo hay reading_value (físico), el modo fue 'fisico'.
  // En cualquier otro caso (incluyendo mezcla), asumimos 'mA'.
  if (tieneFisico && !tieneMa) return 'fisico';
  return 'mA';
}

/** Etiqueta amigable para el rol del técnico (mismo mapping que el modal). */
export function roleLabel(role) {
  return { admin: 'Admin', tecnico: 'Técnico', viewer: 'Viewer' }[role] || 'Técnico';
}