import { CONFIG } from '../config/constants.js';

export function validateImageFile(file) {
  if (!file) return { ok: true };

  if (!CONFIG.allowedImageTypes.includes(file.type)) {
    return {
      ok: false,
      message: 'Formato de imagen no permitido. Usá JPG, PNG o WEBP.',
    };
  }

  const fileSizeMb = file.size / 1024 / 1024;
  if (fileSizeMb > CONFIG.maxImageMb) {
    return {
      ok: false,
      message: `La imagen supera ${CONFIG.maxImageMb} MB. Elegí una más liviana.`,
    };
  }

  return { ok: true };
}

export function resolveFileExtension(file) {
  const extension = file?.name?.includes('.')
    ? file.name.split('.').pop().toLowerCase()
    : 'jpg';

  return ['jpg', 'jpeg', 'png', 'webp'].includes(extension) ? extension : 'jpg';
}
