'use client';
import { useState, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import { signInWithPassword } from './actions';

export default function LoginPage() {
  const next = useSearchParams().get('next') || '/envasado';
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set('next', next);
    startTransition(async () => {
      const res = await signInWithPassword(fd);
      if (res && !res.ok) setError(res.error);
    });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-ink to-brand-graphite p-6">
      <div className="bg-white rounded-2xl shadow-pop w-full max-w-md p-9 border-t-4 border-brand-amber">
        <div className="w-14 h-14 rounded-xl bg-brand-amber text-black grid place-items-center font-extrabold text-2xl mx-auto mb-4">AB</div>
        <h1 className="text-center text-2xl font-bold">Sistema de Calibraciones</h1>
        <p className="text-center text-neutral-500 text-sm mt-1 mb-6">LC Beer El Salvador — Mantenimiento de Instrumentación</p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-[12px] font-semibold text-neutral-700 mb-1">Correo electrónico</label>
            <input type="email" name="email" required placeholder="tu.correo@ab-inbev.com"
              className="w-full border border-neutral-300 rounded-lg px-3 py-2.5 text-[14px] focus:ring-2 focus:ring-brand-amber focus:border-brand-amber outline-none" />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-neutral-700 mb-1">Contraseña</label>
            <input type="password" name="password" required placeholder="••••••••"
              className="w-full border border-neutral-300 rounded-lg px-3 py-2.5 text-[14px] focus:ring-2 focus:ring-brand-amber focus:border-brand-amber outline-none" />
          </div>
          {error && (
            <div className="text-[12.5px] text-brand-fail bg-brand-failSoft border border-brand-fail/30 rounded-md px-3 py-2">{error}</div>
          )}
          <button type="submit" disabled={pending}
            className="w-full py-3 rounded-lg bg-brand-ink text-white font-bold text-[14px] hover:bg-brand-steel disabled:opacity-60 transition">
            {pending ? 'Validando…' : 'Iniciar sesión'}
          </button>
        </form>
        <p className="text-center text-[11.5px] text-neutral-400 mt-6">¿Olvidaste tu contraseña? Contacta a Automatización.</p>
      </div>
    </div>
  );
}