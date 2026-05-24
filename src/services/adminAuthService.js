import { supabaseClient } from './supabaseClient.js';

export async function signInAdmin({ email, password }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();

  if (!normalizedEmail || !password) {
    throw new Error('Ingresá email y contraseña admin.');
  }

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });

  if (error) {
    throw new Error(error.message || 'No se pudo iniciar sesión como admin.');
  }

  return data?.session || null;
}

export async function signOutAdmin() {
  const { error } = await supabaseClient.auth.signOut();
  if (error) throw error;
}

export async function isCurrentUserAdmin() {
  const { data, error } = await supabaseClient.rpc('is_wedding_admin');

  if (error) {
    throw new Error('No se pudo validar el permiso admin. Revisá el SQL de seguridad.');
  }

  return Boolean(data);
}
