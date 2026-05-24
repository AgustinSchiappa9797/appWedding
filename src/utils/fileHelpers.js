import { CONFIG } from '../config/constants.js';

export function getFileExtension(file) {
  const name = typeof file === 'string' ? file : file?.name;
  if (!name || !String(name).includes('.')) return '';
  return String(name).split('.').pop().toLowerCase().trim();
}

export function getMediaKind(fileOrPath = null) {
  const type = String(typeof fileOrPath === 'string' ? '' : fileOrPath?.type || '').toLowerCase().trim();
  const extension = getFileExtension(fileOrPath);

  if (type.startsWith('video/') || CONFIG.allowedVideoExtensions.includes(extension)) {
    return 'video';
  }

  if (type.startsWith('image/') || CONFIG.allowedImageExtensions.includes(extension)) {
    return 'image';
  }

  return 'unknown';
}

export function isCompressibleImage(file) {
  const normalizedType = String(file?.type || '').toLowerCase().trim();
  return ['image/jpeg', 'image/png', 'image/webp'].includes(normalizedType);
}

export function validateMediaFile(file) {
  if (!file) return { ok: true };

  const normalizedType = String(file.type || '').toLowerCase().trim();
  const extension = getFileExtension(file);
  const mediaKind = getMediaKind(file);
  const hasGenericType = !normalizedType || normalizedType === 'application/octet-stream';

  if (!normalizedType && !extension) {
    return {
      ok: false,
      message: 'No se pudo identificar el tipo de archivo. Probá con una foto JPG, PNG, WEBP, HEIC o un video MP4, WEBM o MOV.',
    };
  }

  if (mediaKind === 'image') {
    const typeAllowed = hasGenericType || CONFIG.allowedImageTypes.includes(normalizedType);
    const extensionAllowed = CONFIG.allowedImageExtensions.includes(extension);

    if (!typeAllowed || !extensionAllowed) {
      return {
        ok: false,
        message: 'Formato de imagen no permitido. Usá JPG, PNG, WEBP, HEIC o HEIF.',
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

  if (mediaKind === 'video') {
    const typeAllowed = hasGenericType || CONFIG.allowedVideoTypes.includes(normalizedType);
    const extensionAllowed = CONFIG.allowedVideoExtensions.includes(extension);

    if (!typeAllowed || !extensionAllowed) {
      return {
        ok: false,
        message: 'Formato de video no permitido. Usá MP4, WEBM o MOV.',
      };
    }

    if (file.size <= 0) {
      return {
        ok: false,
        message: 'El video seleccionado está vacío o dañado. Elegí otro.',
      };
    }

    if (file.size > CONFIG.maxVideoBytes) {
      return {
        ok: false,
        message: `El video supera ${CONFIG.maxVideoMb} MB. Elegí uno más liviano.`,
      };
    }

    return { ok: true };
  }

  return {
    ok: false,
    message: 'Formato no permitido. Usá una foto JPG, PNG, WEBP, HEIC o un video MP4, WEBM o MOV.',
  };
}

export const validateImageFile = validateMediaFile;

export function resolveFileExtension(file) {
  const extension = getFileExtension(file);
  return CONFIG.allowedMediaExtensions.includes(extension) ? extension : 'jpg';
}
