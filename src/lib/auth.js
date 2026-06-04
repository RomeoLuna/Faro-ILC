// lib/auth.js
import { createSupabaseServerClient } from './supabase/server';

export async function getCurrentUserWithProfile() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, area_scope, active')
    .eq('id', user.id)
    .single();
  return { user, profile };
}

export const ROLES_QUE_FIRMAN = ['admin', 'tecnico'];
export function canSignCalibration(role) {
  return ROLES_QUE_FIRMAN.includes(role);
}