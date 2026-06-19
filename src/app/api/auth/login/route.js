// app/api/auth/login/route.js
// =========================================================================
// LOGIN ROUTE HANDLER — Sprint 20.1 (fix de cookies en Netlify)
// -------------------------------------------------------------------------
// CAMBIO vs. Sprint 20:
//   • Eliminado `cookies()` de `next/headers`. Esa API tiene un bug
//     conocido en Route Handlers + Next 14.2: los Set-Cookie set vía
//     `cookieStore.set()` no se attachean al `NextResponse.json()` que
//     retornas — quedan en un response stream "mágico" interno que
//     Netlify Edge no propaga al cliente.
//   • Ahora leo cookies desde `request.cookies` (NextRequest) y escribo
//     a `response.cookies` (NextResponse) — la propagación es directa
//     y determinista, sin magia de Next.
//   • `setAll` ahora bufferiza en un array y APLICAMOS las cookies al
//     final, sobre el response que efectivamente devolvemos.
//   • `export const runtime = 'nodejs'` fija el runtime — Netlify
//     puede empujar Route Handlers a Edge por default, donde
//     @supabase/ssr tiene edge-cases con el chunking de cookies.
//
// El frontend NO cambia — sigue mandando JSON al mismo endpoint.
// =========================================================================

import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export const runtime = 'nodejs';        // sin esto Netlify puede usar Edge
export const dynamic = 'force-dynamic'; // nunca cachear

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

  // ── 2) Buffer de cookies que Supabase va a pedir setear ───────────────
  // No las aplicamos directamente porque el response final aún no existe.
  // Cuando termine signInWithPassword construiremos el response y le
  // copiaremos estas cookies. Así garantizamos que el Set-Cookie viaja
  // en el response que efectivamente devolvemos.
  const cookiesToApply = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        // Leemos las cookies que el cliente envió (incluye chunks .0/.1/.2
        // si hubiera una sesión previa). NextRequest.cookies.getAll() es la
        // fuente directa, sin pasar por next/headers.
        getAll() {
          return request.cookies.getAll();
        },
        // Buffer en vez de set directo. Es CRÍTICO: Supabase puede invocar
        // setAll varias veces durante un mismo flow (rotación de refresh
        // token + access token + code verifier en PKCE), así acumulamos
        // todas las llamadas y las aplicamos juntas al final.
        setAll(cookiesList) {
          cookiesToApply.push(...cookiesList);
        },
      },
    }
  );

  // ── 3) Auth call ──────────────────────────────────────────────────────
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  // ── 4) Construir response (éxito o error) ─────────────────────────────
  // En ambos casos aplicamos las cookies que Supabase pidió — si hubo
  // error, el buffer estará vacío (no se planta nada), así que es
  // seguro hacerlo incondicional.
  const response = error
    ? NextResponse.json(
        { ok: false, error: error.message || 'No se pudo iniciar sesión.' },
        { status: 401 }
      )
    : NextResponse.json({
        ok: true,
        redirect: next,
        user: data.user
          ? { id: data.user.id, email: data.user.email }
          : null,
      });

  // ── 5) Aplicar las cookies sobre el response real ─────────────────────
  for (const { name, value, options } of cookiesToApply) {
    response.cookies.set(name, value, options);
  }

  return response;
}