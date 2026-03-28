import { CONFIG } from '../config/constants.js';
import { supabaseClient } from './supabaseClient.js';
import { resolveFileExtension } from '../utils/fileHelpers.js';

export async function uploadImage(file, authUserId) {
  if (!file) return null;

  const safeExtension = resolveFileExtension(file);
  const fileName = `${crypto.randomUUID()}.${safeExtension}`;
  const filePath = `${CONFIG.eventSlug}/${authUserId}/${fileName}`;

  const { error } = await supabaseClient.storage
    .from(CONFIG.storageBucket)
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    });

  if (error) throw error;
  return filePath;
}

export async function createMemory({ guestId, message, imagePath }) {
  const { data, error } = await supabaseClient
    .from('memories')
    .insert({
      guest_id: guestId,
      event_slug: CONFIG.eventSlug,
      message: message || null,
      image_path: imagePath || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getImageUrl(path) {
  if (!path) return null;

  const { data } = supabaseClient.storage
    .from(CONFIG.storageBucket)
    .getPublicUrl(path);

  return data?.publicUrl || null;
}

export async function fetchLatestMemories(limit) {
  const { data, error } = await supabaseClient
    .from('memories')
    .select(`
      id,
      message,
      image_path,
      created_at,
      guests (
        display_name
      )
    `)
    .eq('event_slug', CONFIG.eventSlug)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}
