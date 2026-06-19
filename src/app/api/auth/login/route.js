// app/api/auth/login/route.js
// =========================================================================
// LOGIN ROUTE HANDLER — Sprint 20 (bypass CSRF de Server Actions en Netlify)
// -------------------------------------------------------------------------
// Por qué existe este endpoint:
//   Los Server Actions de Next.js 14 validan CSRF comparando Origin contra
//   x-forwarded-host. En Netlify Edge ese header llega vacío o con un
//   valor interno, así que el check rebota con 403. Un Route Handler POST
//   convencional NO tiene esta validación — sigue el modelo "API endpoint"
//   y solo respeta lo que tú implementes.
//
// Modelo de cookies:
//   En un Route Handler PODEMOS escribir cookies via cookies() de
//   next/headers. La sesión Supabase la fija setAll() inmediatamente
//   sobre la response — el cliente la guarda y el middleware ya la ve
//   en el siguiente request.
//
// Seguridad mínima:
//   • Body como JSON (no FormData) → tipos estables.
//   • next valida que sea path interno (empieza con '/'), no URL absoluta,
//     para evitar open redirect via `?next=https://malicious.com`.
//   • Sin rate limiting aquí — confía en el rate limit de Supabase Auth.
// =========================================================================

import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Nunca cachear esta ruta: el cookie del usuario debe escribirse fresh
// en cada POST. force-dynamic es redundante para POST pero explícito > implícito.
export const dynamic = 'force-dynamic';

export async function POST(request) {
  // ── 1) Parsear body ────────────────────────────────────────────────────
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Cuerpo de la solicitud inválido.' },
      { status: 400 }
    );
  }

  const email    = (body?.email    || '').toString().trim();
  const password = (body?.password || '').toString();
  const nextRaw  = (body?.next     || '/envasado').toString();

  // ── 2) Validación básica ──────────────────────────────────────────────
  if (!email || !password) {
    return NextResponse.json(
      { ok: false, error: 'Ingresa correo y contraseña.' },
      { status: 400 }
    );
  }

  // Anti open-redirect: solo paths internos.
  const next = nextRaw.startsWith('/') && !nextRaw.startsWith('//')
    ? nextRaw
    : '/envasado';

  // ── 3) Cliente Supabase con cookies del request handler ───────────────
  const cookieStore = cookies();

  const supabase = createServerClient(
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
            // En un Route Handler POST esto sí funciona — el catch es
            // defensivo por si Next cambia el contrato a futuro.
          }
        },
      },
    }
  );

  // ── 4) Auth call ──────────────────────────────────────────────────────
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // 401 para credenciales inválidas; el cliente sabrá que es esperado.
    return NextResponse.json(
      { ok: false, error: error.message || 'No se pudo iniciar sesión.' },
      { status: 401 }
    );
  }

  // ── 5) Éxito — devolvemos redirect que el cliente debe seguir ─────────
  // No redirigimos desde el servidor porque el cliente necesita procesar
  // las cookies Set-Cookie ANTES de navegar (con fetch normal sería
  // transparente, pero con window.location.assign el browser asegura
  // que el cookie jar ya tiene los chunks .0/.1/.2 plantados).
  return NextResponse.json({
    ok: true,
    redirect: next,
    user: data.user ? { id: data.user.id, email: data.user.email } : null,
  });
}