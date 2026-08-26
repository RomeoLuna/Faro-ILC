// app/(app)/admin/sapActions.js
// =========================================================================
// SERVER ACTIONS — Sincronización SAP (IW37N) — Sprint 38 (diff-and-sync)
// -------------------------------------------------------------------------
// syncSapData(formData)
//   1. Auth (sólo admin)
//   2. Lee y valida el archivo .csv subido
//   3. Parsea el CSV con un mini-parser RFC 4180
//   4. Mapea columnas SAP → schema sap_work_orders
//   5. Upsert masivo por chunks de 500 filas (onConflict: wo_number)
//   6. Sprint 38 — DIFF-AND-SYNC: borra OTs huérfanas del rango del CSV
//      cuando las POS vienen en el CSV pero el wo_number ya no. Esto
//      elimina las "OTs pegadas" (fantasma) automáticamente al subir
//      el CSV. Ver detalles en el paso 6.5 abajo.
//   7. Devuelve métricas: total leídos, válidos, upserted, borrados, skipped
// =========================================================================

'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentUserWithProfile } from '@/lib/auth';

const CHUNK_SIZE = 500;

// Columnas exactas (en orden) tal como vienen del CSV exportado de SAP.
// Si SAP cambia el header, cambiar SOLO este array.
const EXPECTED_COLUMNS = [
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

// Mapping CSV → schema sap_work_orders
const COLUMN_MAP = {
  pos_mtto:     'Pos.mantenim.',
  wo_number:    'Orden',
  planned_date: 'Fe.inic.extrema',
  status:       'Status sistema',
  short_text:   'Texto breve',
};

// ─── Mini-parser CSV (RFC 4180 simplificado) ────────────────────────────
// Soporta:
//   • Campos separados por coma
//   • Campos entre comillas dobles que permiten comas internas
//   • Comillas dobles escapadas como "" dentro de campos entrecomillados
//   • Saltos de línea \r\n o \n
// No soporta:
//   • Saltos de línea DENTRO de campos (el CSV de SAP no los genera)
function parseCsv(text) {
  // Normalizar EOL
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
function cleanText(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

// Acepta YYYY-MM-DD (ISO) o null
function cleanIsoDate(v) {
  const s = cleanText(v);
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  // Sanity: que sea fecha válida
  const d = new Date(s + 'T00:00:00Z');
  if (isNaN(d.getTime())) return null;
  return s;
}

// =========================================================================
/**
 * @param {FormData} formData
 * @returns {Promise<{
 *   ok: true,
 *   total: number,
 *   valid: number,
 *   upserted: number,
 *   skipped: number,
 *   skipped_reasons: Array<{ line: number, reason: string }>,
 *   batches: number,
 * } | { ok: false, error: string }>}
 */
export async function syncSapData(formData) {
  // ── 1) Auth + autorización ──────────────────────────────────────────────
  const session = await getCurrentUserWithProfile();
  if (!session)                              return { ok: false, error: 'No autenticado.' };
  if (session.profile?.role !== 'admin')     return { ok: false, error: 'Solo admin puede sincronizar SAP.' };

  // ── 2) Extraer y validar archivo ────────────────────────────────────────
  const file = formData.get('csv_file');
  if (!file || typeof file === 'string') {
    return { ok: false, error: 'Adjunta el archivo CSV.' };
  }
  if (!(file instanceof File)) {
    return { ok: false, error: 'Archivo inválido.' };
  }
  if (file.size === 0)               return { ok: false, error: 'El archivo está vacío.' };
  if (file.size > 25 * 1024 * 1024)  return { ok: false, error: 'El CSV supera 25 MB.' };

  const isCsv = file.type === 'text/csv'
    || file.type === 'application/vnd.ms-excel'
    || file.name.toLowerCase().endsWith('.csv');
  if (!isCsv) return { ok: false, error: 'Sólo se aceptan archivos .csv.' };

  // ── 3) Leer y parsear ───────────────────────────────────────────────────
  let text;
  try {
    text = await file.text();
  } catch (e) {
    return { ok: false, error: `No se pudo leer el archivo: ${e.message}` };
  }

  const { headers, rows } = parseCsv(text);
  if (rows.length === 0) {
    return { ok: false, error: 'El CSV no contiene filas de datos.' };
  }

  // Construir mapa header → índice (case-sensitive, exact match)
  const idx = {};
  for (const col of EXPECTED_COLUMNS) {
    const i = headers.indexOf(col);
    if (i === -1) {
      return {
        ok: false,
        error: `Falta la columna requerida "${col}" en el CSV. ` +
               `Headers detectados: ${headers.join(', ')}`,
      };
    }
    idx[col] = i;
  }

  // ── 4) Map + validate por fila ─────────────────────────────────────────
  const valid = [];
  const skipped_reasons = [];

  rows.forEach((cells, lineIndex) => {
    const lineNumber = lineIndex + 2; // 1-indexed + header
    // Si la fila quedó con menos columnas (línea vacía o corrupta), saltamos
    if (cells.length < EXPECTED_COLUMNS.length) {
      // Permitimos líneas completamente vacías sin ruido
      if (cells.every((c) => !c || !c.trim())) return;
      skipped_reasons.push({
        line: lineNumber,
        reason: `Columnas insuficientes (${cells.length} vs ${EXPECTED_COLUMNS.length})`,
      });
      return;
    }

    const pos_mtto    = cleanText(cells[idx[COLUMN_MAP.pos_mtto]]);
    const wo_number   = cleanText(cells[idx[COLUMN_MAP.wo_number]]);
    const planned_date = cleanIsoDate(cells[idx[COLUMN_MAP.planned_date]]);
    const status      = cleanText(cells[idx[COLUMN_MAP.status]]);
    const short_text  = cleanText(cells[idx[COLUMN_MAP.short_text]]);

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
    });
  });

  // ── 5) Deduplicar por wo_number en memoria ──────────────────────────────
  // (Si el CSV trae duplicados, nos quedamos con el último — el más reciente.)
  const dedupedMap = new Map();
  for (const row of valid) {
    dedupedMap.set(row.wo_number, row);
  }
  const deduped = Array.from(dedupedMap.values());

  // ── 6) Upsert por chunks ────────────────────────────────────────────────
  const supabase = createSupabaseServerClient();
  let upserted = 0;
  let batches  = 0;

  for (let i = 0; i < deduped.length; i += CHUNK_SIZE) {
    const chunk = deduped.slice(i, i + CHUNK_SIZE);
    batches += 1;
    const { error } = await supabase
      .from('sap_work_orders')
      .upsert(chunk, { onConflict: 'wo_number' });

    if (error) {
      console.error('[syncSapData] upsert error:', error);
      return {
        ok: false,
        error: `Error en el chunk ${batches} (filas ${i + 1}-${i + chunk.length}): ${error.message}`,
      };
    }
    upserted += chunk.length;
  }

  // ── 6.5) DIFF-AND-SYNC (Sprint 38) — borrar OTs huérfanas del rango ────
  // Objetivo: eliminar automáticamente las OTs que quedaron "pegadas" en la
  // BD porque SAP dejó de incluirlas en el CSV (típicamente cuando SAP las
  // cerró y ya no las trae, pero el sync original solo hacía UPSERT).
  //
  // Regla conservadora:
  //   • Sólo consideramos POS presentes en el CSV (SAP la conoce)
  //   • Sólo consideramos OTs con planned_date DENTRO del rango temporal
  //     del CSV (protegemos histórico fuera del rango)
  //   • De ese subset, borramos las que NO están en el wo_number set del CSV
  //
  // Esto es idempotente: correr el mismo CSV dos veces borra las mismas
  // OTs la primera vez, y no borra nada la segunda.
  let deleted_orphans = 0;
  let diff_range = null;

  try {
    // Rango temporal del CSV — solo consideramos filas con planned_date
    const plannedDates = deduped
      .map((r) => r.planned_date)
      .filter(Boolean)
      .sort();

    if (plannedDates.length > 0) {
      const csvMinDate = plannedDates[0];
      const csvMaxDate = plannedDates[plannedDates.length - 1];
      diff_range = { min: csvMinDate, max: csvMaxDate };

      const posInCsv     = [...new Set(deduped.map((r) => r.pos_mtto))];
      const woInCsvSet   = new Set(deduped.map((r) => r.wo_number));

      // Chunk las POS para evitar límites de Supabase (usa .in())
      const POS_CHUNK    = 300;
      const orphanWoList = [];

      for (let i = 0; i < posInCsv.length; i += POS_CHUNK) {
        const posChunk = posInCsv.slice(i, i + POS_CHUNK);
        const { data: bdOts, error: qErr } = await supabase
          .from('sap_work_orders')
          .select('wo_number')
          .in('pos_mtto', posChunk)
          .gte('planned_date', csvMinDate)
          .lte('planned_date', csvMaxDate);

        if (qErr) {
          console.warn('[syncSapData] diff query error:', qErr.message);
          break;
        }
        for (const o of bdOts || []) {
          if (!woInCsvSet.has(o.wo_number)) orphanWoList.push(o.wo_number);
        }
      }

      // Borrar en chunks (delete .in() también tiene límite)
      const DEL_CHUNK = 200;
      for (let i = 0; i < orphanWoList.length; i += DEL_CHUNK) {
        const delChunk = orphanWoList.slice(i, i + DEL_CHUNK);
        const { error: dErr } = await supabase
          .from('sap_work_orders')
          .delete()
          .in('wo_number', delChunk);
        if (dErr) {
          console.warn('[syncSapData] diff delete error:', dErr.message);
          break;
        }
        deleted_orphans += delChunk.length;
      }
    }
  } catch (e) {
    // Nunca falla el sync por el diff — solo lo reportamos
    console.warn('[syncSapData] diff-and-sync excepción:', e.message);
  }

  // ── 7) Invalidar caché del faro ─────────────────────────────────────────
  revalidatePath('/admin');
  revalidatePath('/envasado');
  revalidatePath('/ingenieria');
  revalidatePath('/calidad');   // Sprint 36

  return {
    ok: true,
    total: rows.length,
    valid: valid.length,
    upserted,
    deleted_orphans,             // Sprint 38 — nuevas métricas
    diff_range,                  // Sprint 38 — rango temporal usado para el diff
    skipped: skipped_reasons.length,
    skipped_reasons: skipped_reasons.slice(0, 20),
    batches,
  };
}