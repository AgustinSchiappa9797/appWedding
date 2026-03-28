import { CONFIG } from '../config/constants.js';
import { supabaseClient } from './supabaseClient.js';
import { ensureAnonymousSession, getCurrentUser } from './authService.js';

export async function findGuestByAuthUserId(authUserId) {
  const { data, error } = await supabaseClient
    .from('guests')
    .select('id, auth_user_id, display_name, event_slug')
    .eq('auth_user_id', authUserId)
    .eq('event_slug', CONFIG.eventSlug)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function isNameTaken(displayName) {
  const { data, error } = await supabaseClient
    .from('guests')
    .select('id')
    .eq('event_slug', CONFIG.eventSlug)
    .ilike('display_name', displayName)
    .limit(1);

  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}

export async function createGuest(displayName, authUserId) {
  const { data, error } = await supabaseClient
    .from('guests')
    .insert({
      auth_user_id: authUserId,
      event_slug: CONFIG.eventSlug,
      display_name: displayName,
    })
    .select('id, auth_user_id, display_name, event_slug')
    .single();

  if (error) throw error;
  return data;
}

export async function ensureGuest(displayName) {
  await ensureAnonymousSession();
  const user = await getCurrentUser();

  const existingGuest = await findGuestByAuthUserId(user.id);
  if (existingGuest) return existingGuest;

  const taken = await isNameTaken(displayName);
  if (taken) {
    throw new Error('Ese nombre ya está en uso para este evento. Elegí otro.');
  }

  return createGuest(displayName, user.id);
}
