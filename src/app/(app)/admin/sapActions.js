'use server';
// app/(app)/admin/sapActions.js
// =========================================================================
// SERVER ACTIONS — Sincronización SAP (PIN GATE - NO AUTH)
// =========================================================================

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const CHUNK_SIZE = 500;

const EXPECTED_COLUMNS = [
  'Grupo planif.', 'Pos.mantenim.', 'Orden', 'Clase de orden', 'Cl.actividad PM',
  'Fe.inic.extrema', 'Ubicac.técnica', 'Equipo', 'Denominación', 'Denominación.1',
  'Trabajo', 'Trabajo real', 'Texto breve', 'Status sistema', 'Indicador ABC',
  'Estado instal.', 'Pto.tbjo.op.', 'Cst.tot.reales',
  'Fe.planif.', 'Fecha de cierre'
];

const COLUMN_MAP = {
  pos_mtto:     'Pos.mantenim.',
  wo_number:    'Orden',
  planned_date: 'Fe.inic.extrema',
  status:       'Status sistema',
  short_text:   'Texto breve',
  fe_planif:    'Fe.planif.',
  fecha_cierre: 'Fecha de cierre',
};

function parseCsv(text) {
  const norm = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '');
  const rawLines = norm.split('\n');
  if (rawLines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line) => {
    const fields = [];
    let cur = '', inQuotes = false, i = 0;
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

function cleanText(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function cleanMixedDate(v) {
  const s = cleanText(v);
  if (!s) return null;
  
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s.split(' ')[0] + 'T00:00:00Z');
    if (!isNaN(d.getTime())) return s.split(' ')[0];
  }
  
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const parts = s.split('/');
    let m = parts[0].padStart(2, '0');
    let d = parts[1].padStart(2, '0');
    const y = parts[2];
    
    if (parseInt(m) > 12) {
      const temp = m; m = d; d = temp;
    }
    
    const isoStr = `${y}-${m}-${d}`;
    const testDate = new Date(isoStr + 'T00:00:00Z');
    if (!isNaN(testDate.getTime())) return isoStr;
  }
  return null;
}

export async function syncSapData(formData) {
  const file = formData.get('csv_file');
  if (!file || typeof file === 'string' || !(file instanceof File)) {
    return { ok: false, error: 'Archivo inválido.' };
  }
  if (file.size === 0) return { ok: false, error: 'El archivo está vacío.' };

  const text = await file.text();
  const { headers, rows } = parseCsv(text);
  
  const idx = {};
  for (const col of EXPECTED_COLUMNS) {
    const i = headers.indexOf(col);
    if (i === -1) {
      return { ok: false, error: `Falta la columna "${col}". Headers detectados: ${headers.join(', ')}` };
    }
    idx[col] = i;
  }

  const valid = [];
  const skipped_reasons = [];

  rows.forEach((cells, lineIndex) => {
    const lineNumber = lineIndex + 2;
    if (cells.length < EXPECTED_COLUMNS.length) {
      if (cells.every((c) => !c || !c.trim())) return;
      skipped_reasons.push({ line: lineNumber, reason: 'Columnas insuficientes' });
      return;
    }

    const pos_mtto     = cleanText(cells[idx[COLUMN_MAP.pos_mtto]]);
    const wo_number    = cleanText(cells[idx[COLUMN_MAP.wo_number]]);
    const planned_date = cleanMixedDate(cells[idx[COLUMN_MAP.planned_date]]); 
    const fe_planif    = cleanMixedDate(cells[idx[COLUMN_MAP.fe_planif]]);    
    const fecha_cierre = cleanMixedDate(cells[idx[COLUMN_MAP.fecha_cierre]]); 
    const status       = cleanText(cells[idx[COLUMN_MAP.status]]);
    const short_text   = cleanText(cells[idx[COLUMN_MAP.short_text]]);

    if (!pos_mtto || !wo_number) {
      skipped_reasons.push({ line: lineNumber, reason: 'pos_mtto o wo_number vacío' });
      return;
    }

    valid.push({ pos_mtto, wo_number, planned_date, fe_planif, fecha_cierre, status, short_text });
  });

  const dedupedMap = new Map();
  for (const row of valid) {
    dedupedMap.set(row.wo_number, row);
  }
  const deduped = Array.from(dedupedMap.values());

  const supabase = createSupabaseServerClient();
  let upserted = 0;
  let batches  = 0;

  for (let i = 0; i < deduped.length; i += CHUNK_SIZE) {
    const chunk = deduped.slice(i, i + CHUNK_SIZE);
    batches += 1;
    const { error } = await supabase.from('sap_work_orders').upsert(chunk, { onConflict: 'wo_number' });
    if (error) return { ok: false, error: `Error en chunk ${batches}: ${error.message}` };
    upserted += chunk.length;
  }

  revalidatePath('/admin');
  revalidatePath('/envasado');
  revalidatePath('/ingenieria');

  return { ok: true, total: rows.length, valid: valid.length, upserted, skipped: skipped_reasons.length, skipped_reasons: skipped_reasons.slice(0, 20), batches };
}