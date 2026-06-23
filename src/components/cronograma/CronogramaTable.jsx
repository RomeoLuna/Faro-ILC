'use client';
// components/cronograma/CronogramaTable.jsx
// =========================================================================
// CRONOGRAMA TABLE — Sprint 23 (PRÓXIMA SAP + modo histórico solo-lectura)
// -------------------------------------------------------------------------
// Columnas (8):
//   1. OT / POS Mtto
//   2. Equipo / Descripción
//   3. Área / Sub-área
//   4. PRÓXIMA (SAP)        ← Sprint 23: referencia de fecha base SAP
//   5. Fecha Programada     ← editable o read-only según modo
//   6. Notificación SAP
//   7. Estado
//   8. Comentarios          ← editable o read-only según modo
//
// Props:
//   readOnly      → boolean. true en modo histórico → no muestra inputs.
//   isHistorical  → boolean. true → muestra estado del snapshot (VERDE/ROJO).
// =========================================================================

import { categorizeOT, formatDate, parseLocalDate, STATUS_META } from '@/lib/cronograma';

// ─── Formato condicional para la columna PRÓXIMA (SAP) (Sprint 24) ──────
// Recibe la fecha SAP cruda (string) y la ventana del mes seleccionado.
// Devuelve { cellCls, textCls, tone } según la regla:
//   🟥 Rojo  → sap < monthStart   (backlog / arrastrada, vencida vs. mes)
//   🟨 Ámbar → sap dentro del mes (foco a liquidar)
//   ⚪ neutro → sin fecha
// (Los futuros se filtran upstream, no llegan aquí.)
function proximaSapStyle(sapRaw, monthStart, monthEnd) {
  if (!sapRaw || !monthStart || !monthEnd) {
    return { cellCls: 'bg-neutral-50/40', textCls: 'text-neutral-400', tone: 'neutral' };
  }
  const d = parseLocalDate(sapRaw);
  if (!d) return { cellCls: 'bg-neutral-50/40', textCls: 'text-neutral-400', tone: 'neutral' };

  if (d < monthStart) {
    // Vencida — mes anterior al seleccionado
    return {
      cellCls: 'bg-brand-failSoft/50 border-l-4 border-brand-fail',
      textCls: 'text-brand-fail font-bold',
      tone:    'fail',
    };
  }
  if (d <= monthEnd) {
    // Dentro del mes — foco a liquidar
    return {
      cellCls: 'bg-brand-warnSoft/50 border-l-4 border-brand-warn',
      textCls: 'text-amber-700 font-bold',
      tone:    'warn',
    };
  }
  // Futuro (no debería pasar tras el filtro, pero defensivo)
  return { cellCls: 'bg-neutral-50/40', textCls: 'text-neutral-500', tone: 'neutral' };
}

// Mapeo de estados del snapshot histórico al meta visual
const HIST_STATUS_META = {
  VERDE: { label: 'Cumplida', dot: 'bg-brand-pass', cls: 'bg-brand-passSoft text-brand-pass border-brand-pass/30' },
  ROJO:  { label: 'Incumplida', dot: 'bg-brand-fail', cls: 'bg-brand-failSoft text-brand-fail border-brand-fail/30' },
};

export default function CronogramaTable({
  rows, onCellEdit,
  readOnly = false, isHistorical = false,
  monthStart, monthEnd,    // Sprint 24: ventana del mes seleccionado
}) {
  if (!rows.length) {
    return (
      <div className="bg-white border border-neutral-200 rounded-xl shadow-card p-10 text-center">
        <div className="text-[13px] font-semibold text-neutral-700">
          {isHistorical ? 'Sin registros en este mes' : 'Sin OTs en este tab'}
        </div>
        <div className="text-[11.5px] text-neutral-500 mt-1">
          {isHistorical
            ? 'No hay snapshot guardado para esta combinación de mes/tab.'
            : 'Las OTs aparecen aquí cuando llegan vía sync IW37N o cuando asignas un área.'}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-neutral-200 rounded-xl shadow-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead className="bg-neutral-50 border-b-2 border-neutral-200">
            <tr className="text-left">
              <Th>OT / POS Mtto</Th>
              <Th>Equipo / Descripción</Th>
              <Th>Área</Th>
              <Th className="bg-neutral-100/60">Próxima (SAP)</Th>
              <Th className={readOnly ? '' : 'bg-brand-amberSoft/40'}>Fecha Programada</Th>
              <Th>Notificación (SAP)</Th>
              <Th>Estado</Th>
              <Th className={readOnly ? '' : 'bg-brand-amberSoft/40'}>Comentarios</Th>
            </tr>
          </thead>

          <tbody className="divide-y divide-neutral-100">
            {rows.map((row) => (
              <Row
                key={`${row.wo_number}-${row.mes_anio || 'live'}`}
                row={row}
                onCellEdit={onCellEdit}
                readOnly={readOnly}
                isHistorical={isHistorical}
                monthStart={monthStart}
                monthEnd={monthEnd}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, className = '' }) {
  return (
    <th className={`px-3 py-3 font-bold text-[10.5px] uppercase tracking-wider text-neutral-700 ${className}`}>
      {children}
    </th>
  );
}

// ─── Fila ───────────────────────────────────────────────────────────────
function Row({ row, onCellEdit, readOnly, isHistorical, monthStart, monthEnd }) {
  // Estado: en histórico viene del snapshot; en vivo se categoriza
  const meta = isHistorical
    ? (HIST_STATUS_META[row.estado_al_cierre_del_mes] || STATUS_META.NOT_PLANNED)
    : STATUS_META[categorizeOT(row)];

  const statusKey = isHistorical
    ? row.estado_al_cierre_del_mes
    : categorizeOT(row);

  // En el histórico no existen IN_PROGRESS — solo VERDE/ROJO
  const rowBg = isHistorical
    ? (statusKey === 'ROJO'
        ? 'hover:bg-brand-failSoft/30 bg-brand-failSoft/15'
        : 'hover:bg-neutral-50')
    : (statusKey === 'OVERDUE'
        ? 'hover:bg-brand-failSoft/40 bg-brand-failSoft/20'
        : statusKey === 'IN_PROGRESS'
          ? 'hover:bg-brand-warnSoft/40 bg-brand-warnSoft/15'
          : 'hover:bg-neutral-50');

  // En modo histórico, el comentario viene de comentario_historico
  const commentValue   = isHistorical ? (row.comentario_historico || '') : (row.comments || '');
  const scheduledValue = row.scheduled_date || '';
  // Sprint 24: el snapshot ahora también almacena proxima_sap (ver SQL).
  // Fallback a fe_planif/planned_date para retro-compat con snapshots viejos.
  const proximaSap     = row.proxima_sap || row.fe_planif || row.planned_date;
  const proxStyle      = proximaSapStyle(proximaSap, monthStart, monthEnd);

  return (
    <tr className={`transition ${rowBg}`}>
      {/* OT / POS Mtto */}
      <td className="px-3 py-3 font-mono">
        <div className="font-bold text-brand-ink">OT {row.wo_number}</div>
        <div className="text-[10.5px] text-neutral-500 mt-0.5">{row.pos_mtto || '—'}</div>
      </td>

      {/* Equipo / Descripción */}
      <td className="px-3 py-3">
        <div className="font-semibold line-clamp-1" title={row.equipment_name || row.short_text}>
          {row.equipment_name || row.short_text || '—'}
        </div>
        {row.description && !isHistorical && (
          <div className="text-[11px] text-neutral-500 line-clamp-1" title={row.description}>
            {row.description}
          </div>
        )}
      </td>

      {/* Área / Sub-área */}
      <td className="px-3 py-3">
        {row.area ? (
          <>
            <div className="font-semibold text-[11.5px]">{row.area}</div>
            {row.sub_area && (
              <div className="text-[10.5px] text-neutral-500">{row.sub_area}</div>
            )}
          </>
        ) : (
          <span className="text-neutral-400">—</span>
        )}
      </td>

      {/* PRÓXIMA (SAP) — Sprint 24: formato condicional rojo/ámbar */}
      <td className={`px-3 py-3 transition-colors ${proxStyle.cellCls}`}>
        {proximaSap ? (
          <div className={`font-mono text-[11.5px] ${proxStyle.textCls}`}>
            {formatDate(proximaSap)}
            {proxStyle.tone === 'fail' && (
              <div className="text-[9.5px] uppercase tracking-wider mt-0.5 not-italic">
                Backlog
              </div>
            )}
            {proxStyle.tone === 'warn' && (
              <div className="text-[9.5px] uppercase tracking-wider mt-0.5 not-italic">
                Foco del mes
              </div>
            )}
          </div>
        ) : (
          <span className="text-neutral-400">—</span>
        )}
        {!isHistorical && row.frequency_label && (
          <div className="text-[10px] text-neutral-500 mt-0.5">
            Frec. {row.frequency_label}
          </div>
        )}
      </td>

      {/* Fecha Programada — editable o read-only */}
      <td className={`px-3 py-3 ${readOnly ? '' : 'bg-brand-amberSoft/20'}`}>
        {readOnly ? (
          scheduledValue ? (
            <span className="font-mono text-[11.5px] font-semibold text-brand-ink">
              {formatDate(scheduledValue)}
            </span>
          ) : (
            <span className="text-neutral-400">—</span>
          )
        ) : (
          <input
            type="date"
            value={scheduledValue}
            onChange={(e) => onCellEdit(row.wo_number, 'scheduled_date', e.target.value || null)}
            className="bg-white border border-neutral-300 rounded-md px-2 py-1 text-[12px] font-mono w-[140px] focus:ring-2 focus:ring-brand-amber/40 focus:border-brand-amber outline-none"
          />
        )}
      </td>

      {/* Notificación SAP */}
      <td className="px-3 py-3 font-mono text-[11.5px]">
        {row.fecha_cierre ? (
          <span className="text-brand-pass font-semibold">{formatDate(row.fecha_cierre)}</span>
        ) : (
          <span className="text-neutral-400">—</span>
        )}
      </td>

      {/* Estado */}
      <td className="px-3 py-3">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-semibold border ${meta.cls}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
          {meta.label}
        </span>
      </td>

      {/* Comentarios — editable o read-only */}
      <td className={`px-3 py-3 min-w-[200px] ${readOnly ? '' : 'bg-brand-amberSoft/20'}`}>
        {readOnly ? (
          commentValue ? (
            <span className="text-[11.5px] text-neutral-700 italic">«{commentValue}»</span>
          ) : (
            <span className="text-neutral-400">—</span>
          )
        ) : (
          <input
            type="text"
            value={commentValue}
            onChange={(e) => onCellEdit(row.wo_number, 'comments', e.target.value)}
            placeholder="Notas, blockers…"
            className="bg-white border border-neutral-300 rounded-md px-2 py-1 text-[12px] w-full focus:ring-2 focus:ring-brand-amber/40 focus:border-brand-amber outline-none"
          />
        )}
      </td>
    </tr>
  );
}