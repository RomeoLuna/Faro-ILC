// app/login/actions.js
'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function signInWithPassword(formData) {
  const email = (formData.get('email') || '').toString().trim();
  const password = (formData.get('password') || '').toString();
  const next = (formData.get('next') || '/envasado').toString();
  if (!email || !password) return { ok: false, error: 'Ingresa correo y contraseña.' };

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };

  revalidatePath('/', 'layout');
  redirect(next.startsWith('/') ? next : '/envasado');
}