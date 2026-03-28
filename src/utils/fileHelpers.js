import { CONFIG } from '../config/constants.js';

function getFileExtension(file) {
  if (!file?.name || !file.name.includes('.')) return '';
  return file.name.split('.').pop().toLowerCase().trim();
}

export function validateImageFile(file) {
  if (!file) return { ok: true };

  const normalizedType = String(file.type || '').toLowerCase().trim();
  const extension = getFileExtension(file);

  if (!normalizedType) {
    return {
      ok: false,
      message: 'No se pudo identificar el tipo de archivo. Probá con una imagen JPG, PNG o WEBP.',
    };
  }

  if (!CONFIG.allowedImageTypes.includes(normalizedType)) {
    return {
      ok: false,
      message: 'Formato de imagen no permitido. Usá JPG, PNG o WEBP.',
    };
  }

  if (!CONFIG.allowedImageExtensions.includes(extension)) {
    return {
      ok: false,
      message: 'La extensión del archivo no es válida. Usá JPG, PNG o WEBP.',
    };
  }

  if (file.size <= 0) {
    return {
      ok: false,
      message: 'La imagen seleccionada está vacía o dañada. Elegí otra.',
    };
  }

  if (file.size > CONFIG.maxImageBytes) {
    return {
      ok: false,
      message: `La imagen supera ${CONFIG.maxImageMb} MB. Elegí una más liviana.`,
    };
  }

  return { ok: true };
}

export function resolveFileExtension(file) {
  const extension = getFileExtension(file);
  return CONFIG.allowedImageExtensions.includes(extension) ? extension : 'jpg';
}