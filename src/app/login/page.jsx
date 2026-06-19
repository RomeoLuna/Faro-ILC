'use client';
// app/login/page.jsx
// =========================================================================
// LOGIN PAGE — Sprint 20 (Client Component puro vía /api/auth/login)
// -------------------------------------------------------------------------
// Refactor sobre Sprint 19:
//   • Ya NO importa Server Actions (signInWithPassword sigue existiendo
//     en ./actions pero queda huérfano — bórralo cuando estés tranquilo).
//   • onSubmit dispara fetch('/api/auth/login') con JSON body.
//   • Tras 200 OK usamos window.location.assign(redirect) — reload duro
//     garantiza que la cookie recién plantada (chunks .0/.1/.2) viaje al
//     primer GET de la página destino, y que el middleware corra con la
//     sesión ya válida. router.push() + router.refresh() funciona en local
//     pero en Netlify puede racear con el SW/edge cache.
//
// Estilo y layout: idénticos al Sprint 19. No tocas tu UI.
// =========================================================================

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function LoginForm() {
  const next = useSearchParams().get('next') || '/envasado';
  const [error, setError]     = useState(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const fd       = new FormData(e.currentTarget);
    const email    = (fd.get('email')    || '').toString();
    const password = (fd.get('password') || '').toString();

    try {
      const res = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password, next }),
        // No-cache defensivo (no debería pasar con POST, pero por si acaso)
        cache:   'no-store',
      });

      // Parsear con guardia: si el server devolvió HTML por algún error
      // raro, no rompemos la página.
      let payload;
      try {
        payload = await res.json();
      } catch {
        setError('Respuesta inválida del servidor. Intenta de nuevo.');
        setPending(false);
        return;
      }

      if (!res.ok || !payload?.ok) {
        // Mapeo de mensajes Supabase → español cuando aplica
        const raw = payload?.error || 'Error desconocido.';
        const friendly = raw.match(/invalid login credentials/i)
          ? 'Credenciales inválidas. Verifica correo y contraseña.'
          : raw;
        setError(friendly);
        setPending(false);
        return;
      }

      // Redirect duro — la cookie ya se plantó en la response del POST,
      // el browser la incluirá en el GET siguiente.
      const target = payload.redirect || next;
      window.location.assign(target);
    } catch (err) {
      // Errores de red puros (DNS, sin conexión, etc.)
      setError('No se pudo contactar el servidor. Revisa tu conexión.');
      setPending(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-ink to-brand-graphite p-6">
      <div className="bg-white rounded-2xl shadow-pop w-full max-w-md p-9 border-t-4 border-brand-amber">
        <div className="w-14 h-14 rounded-xl bg-brand-amber text-black grid place-items-center font-extrabold text-2xl mx-auto mb-4">AB</div>
        <h1 className="text-center text-2xl font-bold">Sistema de Calibraciones</h1>
        <p className="text-center text-neutral-500 text-sm mt-1 mb-6">
          LC Beer El Salvador — Mantenimiento de Instrumentación
        </p>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div>
            <label className="block text-[12px] font-semibold text-neutral-700 mb-1">
              Correo electrónico
            </label>
            <input
              type="email"
              name="email"
              required
              autoComplete="username"
              placeholder="tu.correo@ab-inbev.com"
              disabled={pending}
              className="w-full border border-neutral-300 rounded-lg px-3 py-2.5 text-[14px] focus:ring-2 focus:ring-brand-amber focus:border-brand-amber outline-none disabled:bg-neutral-50"
            />
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-neutral-700 mb-1">
              Contraseña
            </label>
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              disabled={pending}
              className="w-full border border-neutral-300 rounded-lg px-3 py-2.5 text-[14px] focus:ring-2 focus:ring-brand-amber focus:border-brand-amber outline-none disabled:bg-neutral-50"
            />
          </div>

          {error && (
            <div
              role="alert"
              aria-live="polite"
              className="text-[12.5px] text-brand-fail bg-brand-failSoft border border-brand-fail/30 rounded-md px-3 py-2"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full py-3 rounded-lg bg-brand-ink text-white font-bold text-[14px] hover:bg-brand-steel disabled:opacity-60 transition"
          >
            {pending ? 'Validando…' : 'Iniciar sesión'}
          </button>
        </form>

        <p className="text-center text-[11.5px] text-neutral-400 mt-6">
          ¿Olvidaste tu contraseña? Contacta a Automatización.
        </p>
      </div>
    </div>
  );
}

// ─── Envoltorio Suspense (requerido por useSearchParams en build prod) ───
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-brand-ink text-brand-amber font-bold text-sm tracking-widest uppercase">
          Cargando sistema...
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}