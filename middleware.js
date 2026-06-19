// middleware.js  (raíz del proyecto Next.js)
// =========================================================================
// MIDDLEWARE GLOBAL — Sprint 19 (refactor a API getAll/setAll)
// -------------------------------------------------------------------------
// Responsabilidades:
//   1. Refrescar el token de Supabase en cada request (cookie rotation).
//   2. Proteger las rutas: sin sesión + ruta privada → /login.
//   3. Con sesión + /login → /envasado.
//
// POR QUÉ MIGRAR A getAll/setAll
//   La API vieja (`cookies.get / set / remove`) tiene un bug con cookies
//   grandes: cuando el JWT de sesión supera ~4KB (RLS + claims + role +
//   profile), Supabase lo parte en chunks numerados:
//
//       sb-xxx-auth-token.0
//       sb-xxx-auth-token.1
//       sb-xxx-auth-token.2
//
//   El triplete viejo lee/escribe UN cookie a la vez y puede dejar chunks
//   huérfanos → la sesión queda corrupta y se pierde aleatoriamente.
//   `getAll`/`setAll` opera sobre el conjunto completo, evita ese race
//   y es la API recomendada desde @supabase/ssr 0.5.0.
//
// IMPORTANTE: el `await supabase.auth.getUser()` DEBE ser lo siguiente
// que se ejecute después de crear el cliente. No metas otras awaits ni
// lógica entre createServerClient y getUser — el refresh de cookies
// depende de que ese await dispare la rotación de inmediato.
// =========================================================================

import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

// Rutas que NO requieren sesión activa.
//   /login            → la página del formulario
//   /auth             → callbacks de Supabase (callback OAuth, signout, etc.)
//   /api/auth         → Route Handlers POST de login/logout (Sprint 20).
//                       Sin este prefix, el middleware redirige el POST a
//                       /login (307), y Netlify Edge convierte ese redirect
//                       en 403 Forbidden por su política anti-amplification.
const PUBLIC_PATHS = ['/login', '/auth', '/api/auth'];

export async function middleware(request) {
  // Sprint 19 — Fix CSRF en Netlify:
  // Usar `request: { headers: request.headers }` (NO el shorthand
  // `{ request }`) garantiza que x-forwarded-host, x-forwarded-proto y
  // origin se propaguen al handler downstream. Sin esto, el CSRF check
  // de Server Actions ve `host` interno de la Netlify Function en vez
  // del dominio público → 403 Forbidden.
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        // Lee TODAS las cookies de la request (incluye los chunks .0/.1/.2).
        getAll() {
          return request.cookies.getAll();
        },
        // Escribe el conjunto completo de cookies que Supabase pide rotar.
        // Primero las propagamos a la request (para que getUser las vea)
        // y luego al response (para que el browser las reciba).
        //
        // Options viene con: name, value, path, sameSite, secure, httpOnly,
        // maxAge. @supabase/ssr ya las llena con los defaults correctos
        // (sameSite: 'lax', secure: true en prod, httpOnly: true, path: '/').
        // NO los sobrescribas a mano — eso rompería la lógica de chunking.
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          // Mantenemos `request: { headers: request.headers }` aquí también
          // para que el response regenerado siga conservando los headers.
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // ⚠️ getUser() (NO getSession) — hace round-trip a Supabase para validar
  // el JWT y rotar tokens si están cerca del TTL. getSession solo lee la
  // cookie local, no verifica firma contra el servidor.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  // Sin sesión y en ruta privada → /login (preservando el destino)
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // Con sesión y en /login → /envasado
  if (user && pathname.startsWith('/login')) {
    const url = request.nextUrl.clone();
    url.pathname = '/envasado';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Aplica el middleware a todas las rutas EXCEPTO:
     *   - _next/static (archivos estáticos)
     *   - _next/image  (optimización de imágenes)
     *   - favicon.ico / imágenes públicas
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};