// lib/sapSync.js
// =========================================================================
// SAP CSV PARSER + VALIDADOR — Sprint 27 (fix dates + Fe.planif + Fecha cierre)
// -------------------------------------------------------------------------
// CAMBIOS vs. Sprint 25:
//   1) cleanIsoDate ahora acepta TRES formatos:
//        • YYYY-MM-DD          (ISO estricto — backward compat)
//        • MM/DD/YY o MM/DD/YYYY (US — formato observado en producción)
//        • DD/MM/YY o DD/MM/YYYY (EU — heurística de disambiguación)
//      Auto-detecta cuál es M y cuál es D usando límites de mes:
//        • Si primer número > 12 → es día → D/M
//        • Si segundo número > 12 → es día → M/D
//        • Si ambos ≤ 12 (ambiguo) → asume M/D (default SAP US)
//      Año de 2 dígitos se expande a 20XX.
//
//   2) Mapeo COLUMN_MAP extendido con dos campos del cruce IP24:
//        • Fe.planif.      → fe_planif      (fecha planificada IP24)
//        • Fecha de cierre → fecha_cierre   (fecha real de cierre IP24)
//      Son OPCIONALES (no rompen si el CSV viene sin ellas — backward
//      compat con plantas que aún no hicieron el cruce IP24).
//
// IMPACTO:
//   Tras este fix + re-sync del CSV, las OTs cerradas con CTEC NOTI van
//   a poblar correctamente fecha_cierre, y la regla del faro (Sprint 26b)
//   las reconocerá como la última cierre real en ÚLTIMA(SAP).
// =========================================================================

export const CHUNK_SIZE = 500;

// Columnas REQUERIDAS — el CSV debe traer estas o el sync rebota
export const EXPECTED_COLUMNS = [
  'Grupo planif.',
  'Pos.mantenim.',
  'Orden',
  'Clase de orden',
  'Cl.actividad PM',
  'Fe.inic.extrema',
  'Ubicac.técnica',
  'Equipo',
  'Denominación',
  'Denominación.1',
  'Trabajo',
  'Trabajo real',
  'Texto breve',
  'Status sistema',
  'Indicador ABC',
  'Estado instal.',
  'Pto.tbjo.op.',
  'Cst.tot.reales',
];

// Columnas OPCIONALES — si vienen, se parsean; si no, se ignoran sin error
export const OPTIONAL_COLUMNS = [
  'Fe.planif.',         // viene del cruce con IP24
  'Fecha de cierre',    // viene del cruce con IP24
];

// Mapping CSV header → schema field de sap_work_orders
export const COLUMN_MAP = {
  pos_mtto:     'Pos.mantenim.',
  wo_number:    'Orden',
  planned_date: 'Fe.inic.extrema',
  status:       'Status sistema',
  short_text:   'Texto breve',
  fe_planif:    'Fe.planif.',
  fecha_cierre: 'Fecha de cierre',
};

// ─── Mini-parser CSV (RFC 4180 simplificado) ────────────────────────────
export function parseCsv(text) {
  const norm = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '');
  const rawLines = norm.split('\n');
  if (rawLines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line) => {
    const fields = [];
    let cur = '';
    let inQuotes = false;
    let i = 0;
    while (i < line.length) {
      const c = line[i];
      if (inQuotes) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i += 2; continue; }
        if (c === '"') { inQuotes = false; i++; continue; }
        cur += c; i++;
      } else {
        if (c === '"') { inQuotes = true; i++; continue; }
        if (c === ',') { fields.push(cur); cur = ''; i++; continue; }
        cur += c; i++;
      }
    }
    fields.push(cur);
    return fields;
  };

  const headers = parseLine(rawLines[0]).map((h) => h.trim());
  const rows    = rawLines.slice(1).map(parseLine);
  return { headers, rows };
}

// ─── Validadores de tipo ────────────────────────────────────────────────
export function cleanText(v) {
  if (v == null) return null;
  // Limpia espacios + caracteres invisibles que SAP a veces inyecta
  const s = String(v).replace(/[ ​﻿]/g, '').trim();
  return s === '' ? null : s;
}

// Sprint 27: parser robusto que acepta YYYY-MM-DD, M/D/YY[YY], D/M/YY[YY]
export function cleanIsoDate(v) {
  const s = cleanText(v);
  if (!s) return null;

  // ── Formato 1: YYYY-MM-DD (ISO estricto, backward compat) ─────────────
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s + 'T00:00:00Z');
    return isNaN(d.getTime()) ? null : s;
  }

  // ── Formato 2: con slashes M/D/YY[YY] o D/M/YY[YY] ────────────────────
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    let year = Number(m[3]);

    // Expandir año de 2 dígitos: 00..99 → 2000..2099
    if (year < 100) year += 2000;

    let month, day;
    if (a > 12 && b <= 12) {
      // Primer número > 12 → es día → formato D/M
      day = a; month = b;
    } else if (b > 12 && a <= 12) {
      // Segundo número > 12 → es día → formato M/D
      month = a; day = b;
    } else if (a <= 12 && b <= 12) {
      // Ambiguo (ambos válidos) → asumir M/D (default SAP US)
      month = a; day = b;
    } else {
      // Ambos > 12 → fecha inválida
      return null;
    }

    if (month < 1 || month > 12) return null;
    if (day   < 1 || day   > 31) return null;

    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const d = new Date(iso + 'T00:00:00Z');
    return isNaN(d.getTime()) ? null : iso;
  }

  // Cualquier otro formato → null (no fallar, simplemente no parsear)
  return null;
}

// ─── Validación + mapeo del set completo ────────────────────────────────
export function validateAndMap(rows, headers) {
  const idx = {};

  // 1) Columnas requeridas — error si falta alguna
  for (const col of EXPECTED_COLUMNS) {
    const i = headers.indexOf(col);
    if (i === -1) {
      return {
        error: `Falta la columna requerida "${col}" en el CSV. ` +
               `Headers detectados: ${headers.join(', ')}`,
      };
    }
    idx[col] = i;
  }

  // 2) Columnas opcionales — si están las indexamos, si no quedan undefined
  for (const col of OPTIONAL_COLUMNS) {
    const i = headers.indexOf(col);
    if (i !== -1) idx[col] = i;
  }

  const valid = [];
  const skipped_reasons = [];

  rows.forEach((cells, lineIndex) => {
    const lineNumber = lineIndex + 2;
    if (cells.length < EXPECTED_COLUMNS.length) {
      if (cells.every((c) => !c || !c.trim())) return;
      skipped_reasons.push({
        line: lineNumber,
        reason: `Columnas insuficientes (${cells.length} vs ${EXPECTED_COLUMNS.length})`,
      });
      return;
    }

    const pos_mtto     = cleanText  (cells[idx[COLUMN_MAP.pos_mtto]]);
    const wo_number    = cleanText  (cells[idx[COLUMN_MAP.wo_number]]);
    const planned_date = cleanIsoDate(cells[idx[COLUMN_MAP.planned_date]]);
    const status       = cleanText  (cells[idx[COLUMN_MAP.status]]);
    const short_text   = cleanText  (cells[idx[COLUMN_MAP.short_text]]);

    // Opcionales — solo si la columna existe en el CSV
    const fe_planif    = idx[COLUMN_MAP.fe_planif] !== undefined
      ? cleanIsoDate(cells[idx[COLUMN_MAP.fe_planif]])
      : null;
    const fecha_cierre = idx[COLUMN_MAP.fecha_cierre] !== undefined
      ? cleanIsoDate(cells[idx[COLUMN_MAP.fecha_cierre]])
      : null;

    if (!pos_mtto || !wo_number) {
      skipped_reasons.push({
        line: lineNumber,
        reason: !pos_mtto ? 'pos_mtto vacío' : 'wo_number vacío',
      });
      return;
    }

    valid.push({
      pos_mtto,
      wo_number,
      planned_date,
      status,
      short_text,
      fe_planif,
      fecha_cierre,
    });
  });

  return { valid, skipped_reasons };
}

// ─── Dedup por wo_number (último gana) ──────────────────────────────────
export function dedupeByWoNumber(rows) {
  const map = new Map();
  for (const row of rows) {
    map.set(row.wo_number, row);
  }
  return Array.from(map.values());
}