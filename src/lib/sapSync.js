// lib/sapSync.js
// =========================================================================
// SAP CSV PARSER + VALIDADOR — Sprint 55 (detección de formato a NIVEL ARCHIVO)
// -------------------------------------------------------------------------
// FIX Sprint 55:
//   El parser de fecha antes decidía EU vs US fila-a-fila. Con fechas
//   ambiguas (día 1..12) elegía mal la mitad del archivo y las OTs se
//   "reabrían" con mes y día invertidos (bug reportado en cargas de
//   compañeros que exportan el CSV en formato EU dd/mm/yyyy vs el
//   default US mm/dd/yyyy del planner original).
//
//   AHORA: antes de parsear las filas, se escanean TODAS las fechas y
//   se detecta si el archivo es EU o US con evidencia fuerte:
//     • Al menos una fecha con primer número > 12 → archivo es EU
//     • Al menos una fecha con segundo número > 12 → archivo es US
//   Si hay evidencia mixta (poco probable) gana el que tenga más votos.
//   Si no hay evidencia (todas las fechas ambiguas), default US.
//
//   Ese formato detectado se pasa como hint a cleanIsoDate para TODAS
//   las filas del archivo, eliminando el bug de días 1..12.
//
// CAMBIOS vs. Sprint 27:
//   1) Nueva función detectDateFormat(rows, headers) → 'EU' | 'US'
//   2) cleanIsoDate acepta 2do parámetro opcional dateFormatHint
//   3) validateAndMap detecta el formato ANTES de iterar filas
//   4) Retorno de validateAndMap incluye dateFormat detectado (para UI)
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
// Sprint 45c: acepta un separador opcional (default coma). SAP puede
// exportar con ";" (formato europeo) o "," (US) — el caller detecta
// cuál viene y lo pasa.
export function parseCsv(text, separator = ',') {
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
        if (c === separator) { fields.push(cur); cur = ''; i++; continue; }
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

// Sprint 45c: auto-detección del separador. Cuenta ocurrencias de "," vs ";"
// en la primera línea (ignora las que están dentro de comillas).
// Devuelve el que más aparece; empate va a "," (default).
export function detectSeparator(text) {
  const firstLine = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0] || '';
  let commas = 0, semis = 0;
  let inQuotes = false;
  for (let i = 0; i < firstLine.length; i++) {
    const c = firstLine[i];
    if (c === '"') { inQuotes = !inQuotes; continue; }
    if (inQuotes) continue;
    if (c === ',') commas++;
    else if (c === ';') semis++;
  }
  return semis > commas ? ';' : ',';
}

// ─── Validadores de tipo ────────────────────────────────────────────────
export function cleanText(v) {
  if (v == null) return null;
  // Sprint 39: FIX — solo eliminar caracteres INVISIBLES que SAP inyecta
  // (zero-width space U+200B, ZWNJ U+200C, ZWJ U+200D, BOM U+FEFF).
  // NO eliminar el espacio normal: el status SAP viene como "CTEC NOTI
  // DMNV KKMP" y necesitamos preservar los espacios para extraer el
  // primer token correctamente en el frontend.
  const s = String(v).replace(/[\u200B\u200C\u200D\uFEFF]/g, '').trim();
  return s === '' ? null : s;
}

// Sprint 55: parser robusto que acepta 4 formatos de entrada:
//   1) YYYY-MM-DD              (ISO estricto)
//   2) M/D/YY[YY] o D/M/YY[YY] (SAP US o EU con slashes)
//   3) N serial Excel          (número de días desde 1900-01-01)
//                              Ej: 46267 = 2026-09-11
//                              Aparece en CSVs cruzados con IP24
//   4) cualquier otro → null (no fallar, solo no parsear)
//
// Segundo parámetro (Sprint 55): dateFormatHint = 'US' | 'EU'
//   Se usa SOLO cuando la fecha es ambigua (ambos números ≤ 12).
//   Si el archivo fue analizado con detectDateFormat, el hint viene
//   determinado por el archivo completo y no por la fila.
export function cleanIsoDate(v, dateFormatHint = 'US') {
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
      // Primer número > 12 → es día → formato D/M (EU forzado por evidencia)
      day = a; month = b;
    } else if (b > 12 && a <= 12) {
      // Segundo número > 12 → es día → formato M/D (US forzado por evidencia)
      month = a; day = b;
    } else if (a <= 12 && b <= 12) {
      // Ambiguo → respetar el hint del archivo (Sprint 55)
      if (dateFormatHint === 'EU') {
        day = a; month = b;
      } else {
        month = a; day = b;
      }
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

  // ── Formato 3: Excel serial number (Sprint 39) ────────────────────────
  // Excel guarda fechas como número de días desde 1900-01-01.
  // Conversión a Unix ms: (serial - 25569) * 86400000
  //   • 25569 = días entre 1900-01-01 y 1970-01-01
  //   • 86400000 = milisegundos en un día
  // Rango razonable: 20000 (=1954) a 60000 (=2064) para descartar números
  // que no son fechas (ej. wo_number, códigos de área).
  if (/^\d+$/.test(s)) {
    const serial = parseInt(s, 10);
    if (serial >= 20000 && serial <= 60000) {
      const unixMs = (serial - 25569) * 86400000;
      const d = new Date(unixMs);
      if (isNaN(d.getTime())) return null;
      const y  = d.getUTCFullYear();
      const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(d.getUTCDate()).padStart(2, '0');
      return `${y}-${mo}-${dd}`;
    }
  }

  // Cualquier otro formato → null (no fallar, simplemente no parsear)
  return null;
}

// ─── Detección de formato de fecha a NIVEL ARCHIVO (Sprint 55) ─────────
// Escanea TODAS las celdas de fecha del CSV y decide si el archivo es EU
// (dd/mm/yyyy) o US (mm/dd/yyyy) con evidencia dura:
//   • Primer número > 12 → tiene que ser día → cuenta como voto EU
//   • Segundo número > 12 → tiene que ser día → cuenta como voto US
//   • Ambos ≤ 12 → ambiguo, no aporta evidencia
//
// El formato ganador se aplica a TODAS las filas del archivo — así se
// elimina el bug donde una misma carga tenía la mitad de fechas bien
// y la otra mitad invertidas (día 1..12 quedaba mal interpretado).
export function detectDateFormat(rows, dateColumnIndices) {
  const idxs = Array.isArray(dateColumnIndices) ? dateColumnIndices : [dateColumnIndices];
  let euVotes = 0;
  let usVotes = 0;

  for (const cells of rows) {
    if (!Array.isArray(cells)) continue;
    for (const idx of idxs) {
      if (idx == null || idx < 0) continue;
      const raw = cells[idx];
      if (!raw) continue;
      const s = String(raw).trim();
      const m = s.match(/^(\d{1,2})\/(\d{1,2})\/\d{2,4}$/);
      if (!m) continue;
      const a = Number(m[1]);
      const b = Number(m[2]);
      if (a > 12 && b <= 12) euVotes++;
      else if (b > 12 && a <= 12) usVotes++;
      // ambos ≤ 12 → ambiguo, no cuenta
      // ambos > 12 → dato basura, no cuenta
    }
  }

  if (euVotes > usVotes) return 'EU';
  if (usVotes > euVotes) return 'US';
  return 'US'; // empate o sin evidencia → default US (histórico)
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

  // 3) Sprint 55: detectar formato de fecha analizando TODAS las columnas
  //    de fecha del CSV completo (planned_date, fe_planif, fecha_cierre).
  const dateColIdxs = [
    idx[COLUMN_MAP.planned_date],
    idx[COLUMN_MAP.fe_planif],
    idx[COLUMN_MAP.fecha_cierre],
  ].filter((i) => i !== undefined);
  const dateFormat = detectDateFormat(rows, dateColIdxs);

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
    const planned_date = cleanIsoDate(cells[idx[COLUMN_MAP.planned_date]], dateFormat);
    const status       = cleanText  (cells[idx[COLUMN_MAP.status]]);
    const short_text   = cleanText  (cells[idx[COLUMN_MAP.short_text]]);

    // Opcionales — solo si la columna existe en el CSV
    const fe_planif    = idx[COLUMN_MAP.fe_planif] !== undefined
      ? cleanIsoDate(cells[idx[COLUMN_MAP.fe_planif]], dateFormat)
      : null;
    const fecha_cierre = idx[COLUMN_MAP.fecha_cierre] !== undefined
      ? cleanIsoDate(cells[idx[COLUMN_MAP.fecha_cierre]], dateFormat)
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

  // Sprint 55: exportar el formato detectado para que la UI lo muestre
  return { valid, skipped_reasons, dateFormat };
}

// ─── Dedup por wo_number (último gana) ──────────────────────────────────
export function dedupeByWoNumber(rows) {
  const map = new Map();
  for (const row of rows) {
    map.set(row.wo_number, row);
  }
  return Array.from(map.values());
}