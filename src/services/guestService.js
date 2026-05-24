import { CONFIG } from '../config/constants.js';
import { supabaseClient } from './supabaseClient.js';
import { ensureAnonymousSession, getCurrentUser } from './authService.js';

const INVISIBLE_NAME_CHARS = ['\u2060', '\u2061', '\u2062', '\u2063'];

function hasDuplicateNameError(error) {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();
  return code === '23505' || message.includes('duplicate key') || message.includes('unique');
}

function buildInvisibleSuffix() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (byte) => INVISIBLE_NAME_CHARS[byte % INVISIBLE_NAME_CHARS.length]).join('');
}

function withInvisibleUniqueSuffix(displayName) {
  const suffix = buildInvisibleSuffix();
  const maxBaseLength = Math.max(CONFIG.minNameLength, CONFIG.maxNameLength - suffix.length);
  return `${String(displayName || '').trim().slice(0, maxBaseLength)}${suffix}`;
}

export function getPublicDisplayName(displayName) {
  return String(displayName || '').replace(/[\u200B-\u200D\u2060-\u2063\uFEFF]/g, '').trim();
}

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

export async function createGuest(displayName, authUserId) {
  const payload = {
    auth_user_id: authUserId,
    event_slug: CONFIG.eventSlug,
    display_name: displayName,
  };

  const { data, error } = await supabaseClient
    .from('guests')
    .insert(payload)
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

  try {
    return await createGuest(displayName, user.id);
  } catch (error) {
    if (!hasDuplicateNameError(error)) {
      throw error;
    }

    // Si la base tiene una constraint única por nombre, reintentamos con un sufijo invisible.
    // En UI se limpia para que invitados con el mismo nombre se vean igual.
    return createGuest(withInvisibleUniqueSuffix(displayName), user.id);
  }
}
