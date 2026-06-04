'use client';
// components/admin/UsersTable.jsx
// =========================================================================
// USERS TABLE — Client Component (Sprint 11)
// -------------------------------------------------------------------------
// Recibe el array completo de usuarios desde el Server Component (page.js)
// y se encarga de:
//   • Búsqueda case-insensitive en full_name + email.
//   • Render de filas con RoleSelector + badge del rol actual.
//
// El filtrado es 100% client-side: el listado completo viaja en el primer
// render (lista pequeña, decenas de usuarios) y filtramos en memoria.
//
// Props:
//   - users          (array)  rows de public.profiles ordenados por created_at
//   - currentUserId  (string) UUID del admin logueado (para flag isSelf)
// =========================================================================

import { useMemo, useState } from 'react';
import RoleSelector from './RoleSelector';

// ─── Helper: matching case-insensitive contra nombre + email ────────────
function matchesQuery(user, q) {
  if (!q) return true;
  const haystack = [user.full_name, user.email]
    .filter(Boolean)
    .map((s) => s.toString().toLowerCase())
    .join('   ');
  return haystack.includes(q);
}

// ─── Helper: formatear fecha de alta ────────────────────────────────────
function formatAlta(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-SV', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Badge del rol actual (read-only) ────────────────────────────────────
function RoleBadge({ role }) {
  const map = {
    admin:   { cls: 'bg-brand-amberSoft text-amber-700 border-amber-300',         label: 'Admin' },
    tecnico: { cls: 'bg-brand-passSoft text-brand-pass border-brand-pass/30',     label: 'Técnico' },
    viewer:  { cls: 'bg-brand-envSoft text-brand-env border-brand-env/30',        label: 'Viewer' },
  };
  const m = map[role] || { cls: 'bg-neutral-200 text-neutral-600 border-neutral-300', label: role || '—' };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold border ${m.cls}`}>
      {m.label}
    </span>
  );
}

// =========================================================================
export default function UsersTable({ users, currentUserId }) {
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLowerCase();

  // Filtrado en memoria
  const filtered = useMemo(() => {
    if (!normalized) return users;
    return users.filter((u) => matchesQuery(u, normalized));
  }, [users, normalized]);

  // Contadores (sobre el TOTAL, no sobre el filtrado, para que el footer
  // siga siendo informativo)
  const inactivos = users.filter((u) => u.active === false).length;

  return (
    <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-card">
      {/* Header: título + buscador + contador */}
      <div className="flex flex-col gap-3 px-5 py-3 border-b border-neutral-200 bg-neutral-50 md:flex-row md:items-center md:justify-between">
        <div className="text-[12px] uppercase tracking-wider text-neutral-600 font-bold">
          Usuarios registrados
        </div>

        <div className="flex items-center gap-3">
          {/* Buscador */}
          <div className="flex items-center bg-white border border-neutral-300 rounded-lg px-3 py-1.5 gap-2 min-w-[260px] focus-within:ring-2 focus-within:ring-brand-amber/40 focus-within:border-brand-amber">
            <svg className="w-4 h-4 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre o correo…"
              className="bg-transparent outline-none text-[13px] w-full"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                title="Limpiar"
                className="text-neutral-400 hover:text-neutral-900 text-[14px] leading-none px-1"
              >
                ×
              </button>
            )}
          </div>

          {/* Contador */}
          <div className="text-[11.5px] text-neutral-500 whitespace-nowrap">
            {normalized
              ? <>{filtered.length} de {users.length}</>
              : (
                <>
                  {users.length} usuario{users.length === 1 ? '' : 's'}
                  {inactivos > 0 && <> · {inactivos} inactivo{inactivos === 1 ? '' : 's'}</>}
                </>
              )}
          </div>
        </div>
      </div>

      {/* Tabla scrollable */}
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="bg-neutral-50 border-b-2 border-neutral-200">
            <tr className="text-left">
              <th className="px-4 py-3 font-bold text-[11px] uppercase tracking-wider text-neutral-700">Nombre</th>
              <th className="px-4 py-3 font-bold text-[11px] uppercase tracking-wider text-neutral-700">Correo</th>
              <th className="px-4 py-3 font-bold text-[11px] uppercase tracking-wider text-neutral-700">Rol actual</th>
              <th className="px-4 py-3 font-bold text-[11px] uppercase tracking-wider text-neutral-700">Cambiar rol</th>
              <th className="px-4 py-3 font-bold text-[11px] uppercase tracking-wider text-neutral-700">Alta</th>
              <th className="px-4 py-3 font-bold text-[11px] uppercase tracking-wider text-neutral-700">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {filtered.map((u) => {
              const isSelf = u.id === currentUserId;
              return (
                <tr key={u.id} className={`hover:bg-neutral-50 ${u.active === false ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-brand-ink text-brand-amber grid place-items-center font-bold text-[11px]">
                        {(u.full_name || u.email || 'NN').slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-semibold">{u.full_name || '—'}</div>
                        {isSelf && (
                          <div className="text-[10.5px] text-brand-env font-semibold uppercase tracking-wider">
                            tu cuenta
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-neutral-700">{u.email || '—'}</td>
                  <td className="px-4 py-3">
                    <RoleBadge role={u.role} />
                  </td>
                  <td className="px-4 py-3">
                    <RoleSelector
                      userId={u.id}
                      currentRole={u.role}
                      isSelf={isSelf}
                    />
                  </td>
                  <td className="px-4 py-3 text-neutral-600 text-[11.5px]">{formatAlta(u.created_at)}</td>
                  <td className="px-4 py-3">
                    {u.active === false ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-neutral-200 text-neutral-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-neutral-500"></span>
                        Inactivo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-brand-passSoft text-brand-pass">
                        <span className="w-1.5 h-1.5 rounded-full bg-brand-pass"></span>
                        Activo
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}

            {/* Estado vacío cuando el filtro no coincide */}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-neutral-500 text-[13px]">
                  <div className="font-semibold">Sin coincidencias para "{query}"</div>
                  <div className="text-[11.5px] text-neutral-400 mt-1">
                    Prueba con otra palabra o limpia el buscador.
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer informativo */}
      <div className="px-5 py-3 border-t border-neutral-200 bg-neutral-50 text-[11.5px] text-neutral-500 flex justify-between items-center flex-wrap gap-2">
        <span>
          La acción se guarda al instante; el badge "Rol actual" se actualiza tras refrescar.
        </span>
        <span>
          Cambios protegidos por RLS de Postgres + chequeo server-side.
        </span>
      </div>
    </div>
  );
}