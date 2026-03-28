import { CONFIG } from '../config/constants.js';
import { supabaseClient } from './supabaseClient.js';
import { ensureAnonymousSession, getCurrentUser } from './authService.js';
import { resolveFileExtension, validateImageFile } from '../utils/fileHelpers.js';

function mapStorageUploadError(error) {
  const message = String(error?.message || '').toLowerCase();

  if (message.includes('row-level security') || message.includes('permission')) {
    return 'No tenés permisos para subir imágenes. Revisá las policies de Storage.';
  }

  if (message.includes('bucket')) {
    return 'No se encontró el bucket de imágenes configurado en Supabase.';
  }

  if (message.includes('duplicate')) {
    return 'La imagen no pudo subirse porque ya existe un archivo con ese nombre.';
  }

  if (message.includes('jwt') || message.includes('auth') || message.includes('session')) {
    return 'Tu sesión ya no es válida. Volvé a verificarte e intentá otra vez.';
  }

  if (message.includes('network') || message.includes('fetch')) {
    return 'Hubo un problema de conexión al subir la imagen. Probá nuevamente.';
  }

  return error?.message || 'No se pudo subir la imagen.';
}

function mapMemoryInsertError(error) {
  const message = String(error?.message || '').toLowerCase();

  if (message.includes('duplicate key')) {
    return 'Ese nombre ya está en uso para este evento. Elegí otro.';
  }

  if (message.includes('check constraint') || message.includes('violates check constraint')) {
    return 'Los datos del recuerdo no cumplen las validaciones configuradas.';
  }

  if (message.includes('row-level security') || message.includes('permission')) {
    return 'No tenés permisos para guardar este recuerdo.';
  }

  return error?.message || 'No se pudo guardar el recuerdo.';
}

export async function uploadImage(file) {
  if (!file) return null;

  const fileValidation = validateImageFile(file);
  if (!fileValidation.ok) {
    throw new Error(fileValidation.message);
  }

  await ensureAnonymousSession();
  const user = await getCurrentUser();

  const safeExtension = resolveFileExtension(file);
  const fileName = `${crypto.randomUUID()}.${safeExtension}`;
  const filePath = `${CONFIG.eventSlug}/${user.id}/${fileName}`;

  const { error } = await supabaseClient.storage
    .from(CONFIG.storageBucket)
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    });

  if (error) {
    throw new Error(mapStorageUploadError(error));
  }

  return filePath;
}

export async function createMemory({ guestId, message, imagePath }) {
  const normalizedMessage = String(message || '').trim();

  if (normalizedMessage.length > CONFIG.maxMessageLength) {
    throw new Error(`El mensaje no puede superar los ${CONFIG.maxMessageLength} caracteres.`);
  }

  const { data, error } = await supabaseClient
    .from('memories')
    .insert({
      guest_id: guestId,
      event_slug: CONFIG.eventSlug,
      message: normalizedMessage || null,
      image_path: imagePath || null,
    })
    .select()
    .single();

  if (error) {
    throw new Error(mapMemoryInsertError(error));
  }

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