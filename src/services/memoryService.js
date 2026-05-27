import { CONFIG } from '../config/constants.js';
import { supabaseClient } from './supabaseClient.js';
import { ensureAnonymousSession, getCurrentUser } from './authService.js';
import { resolveFileExtension, validateMediaFile } from '../utils/fileHelpers.js';

function mapStorageUploadError(error) {
  const message = String(error?.message || '').toLowerCase();

  if (message.includes('row-level security') || message.includes('permission')) {
    return 'No tenés permisos para subir archivos.';
  }

  if (message.includes('bucket')) {
    return 'No se encontró el bucket de archivos configurado en Supabase.';
  }

  if (message.includes('duplicate')) {
    return 'El archivo no pudo subirse porque ya existe otro con ese nombre.';
  }

  if (message.includes('jwt') || message.includes('auth') || message.includes('session')) {
    return 'Tu sesión ya no es válida. Volvé a verificarte e intentá otra vez.';
  }

  if (message.includes('network') || message.includes('fetch')) {
    return 'Hubo un problema de conexión al subir el archivo. Probá nuevamente.';
  }

  return error?.message || 'No se pudo subir el archivo.';
}

function mapMemoryInsertError(error) {
  const message = String(error?.message || '').toLowerCase();

  if (message.includes('duplicate key')) {
    return 'No se pudo guardar por una restricción de duplicados en la base.';
  }

  if (message.includes('check constraint') || message.includes('violates check constraint')) {
    return 'Hay algún dato que no parece correcto. Revisalo y probá otra vez.';
  }

  if (message.includes('row-level security') || message.includes('permission')) {
    return 'No tenés permisos para publicar este recuerdo.';
  }

  return error?.message || 'No se pudo publicar el recuerdo.';
}

export async function uploadImage(file) {
  if (!file) return null;

  const fileValidation = validateMediaFile(file);
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

  try {
    const normalizedPath = String(path).trim().replace(/^\/+/, '');

    const { data } = supabaseClient.storage
      .from(CONFIG.storageBucket)
      .getPublicUrl(normalizedPath);

    const publicUrl = data?.publicUrl || null;

    if (!publicUrl) {
      console.warn('No se pudo resolver publicUrl para el archivo:', {
        bucket: CONFIG.storageBucket,
        path: normalizedPath,
      });
      return null;
    }

    return publicUrl;
  } catch (error) {
    console.warn('Error resolviendo URL pública de archivo:', error, {
      bucket: CONFIG.storageBucket,
      path,
    });
    return null;
  }
}

export async function fetchMemoriesPage({ offset = 0, limit = CONFIG.galleryPageSize } = {}) {
  const from = Math.max(0, offset);
  const to = from + limit;

  const { data, error } = await supabaseClient
    .from('memories')
    .select(`
      id,
      message,
      image_path,
      created_at,
      guests (
        id,
        display_name
      )
    `)
    .eq('event_slug', CONFIG.eventSlug)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw error;

  const rows = data || [];
  const hasMore = rows.length > limit;

  return {
    items: hasMore ? rows.slice(0, limit) : rows,
    hasMore,
    nextOffset: from + Math.min(rows.length, limit),
  };
}

export async function updateMemory({ memoryId, message }) {
  const normalizedMessage = String(message || '').trim();

  if (!memoryId) {
    throw new Error('No se pudo identificar el recuerdo a editar.');
  }

  if (normalizedMessage.length > CONFIG.maxMessageLength) {
    throw new Error(`El mensaje no puede superar los ${CONFIG.maxMessageLength} caracteres.`);
  }

  await ensureAnonymousSession();

  const { data, error } = await supabaseClient
    .from('memories')
    .update({ message: normalizedMessage || null })
    .eq('id', memoryId)
    .eq('event_slug', CONFIG.eventSlug)
    .select()
    .single();

  if (error) {
    throw new Error(mapMemoryInsertError(error));
  }

  return data;
}

export async function deleteMemory({ memoryId, imagePath = null }) {
  if (!memoryId) {
    throw new Error('No se pudo identificar el recuerdo a borrar.');
  }

  await ensureAnonymousSession();

  const { error } = await supabaseClient
    .from('memories')
    .delete()
    .eq('id', memoryId)
    .eq('event_slug', CONFIG.eventSlug);

  if (error) {
    throw new Error(mapMemoryInsertError(error));
  }

  if (imagePath) {
    const normalizedPath = String(imagePath).trim().replace(/^\/+/, '');
    const { error: storageError } = await supabaseClient.storage
      .from(CONFIG.storageBucket)
      .remove([normalizedPath]);

    if (storageError) {
      console.warn('El recuerdo se borró, pero no se pudo borrar el archivo de Storage:', storageError);
    }
  }

  return true;
}
