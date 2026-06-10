// lib/supabase/server.js
// =========================================================================
// CLIENTE SUPABASE — SERVER (Server Components + Server Actions)
// -------------------------------------------------------------------------
// Sprint 19: migrado a la API getAll/setAll para evitar el bug de chunking
// de cookies grandes (sb-xxx-auth-token.0/.1/.2 quedando huérfanos).
//
// Contexto: este cliente se crea DENTRO del scope de una request (no en
// top-level). Las escrituras (set/remove) sólo funcionan en Server Actions
// y Route Handlers. En Server Components puros, cookieStore.set lanza
// excepción — la atrapamos silenciosamente porque el middleware ya hizo
// el refresh en el request anterior.
// =========================================================================

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function createSupabaseServerClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Components puros no pueden escribir cookies — el
            // middleware se encargó de la rotación en este mismo request.
            // Server Actions y Route Handlers SÍ pueden escribir aquí.
          }
        },
      },
    }
  );
}