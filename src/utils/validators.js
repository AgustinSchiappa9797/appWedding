import { CONFIG } from '../config/constants.js';
import { validateImageFile } from './fileHelpers.js';

export function validateSubmission({ name, message, file }) {
  const normalizedName = String(name || '').trim();
  const normalizedMessage = String(message || '').trim();

  if (normalizedName.length < CONFIG.minNameLength) {
    return {
      ok: false,
      message: `El nombre debe tener al menos ${CONFIG.minNameLength} caracteres.`,
    };
  }

  if (normalizedName.length > CONFIG.maxNameLength) {
    return {
      ok: false,
      message: `El nombre no puede superar los ${CONFIG.maxNameLength} caracteres.`,
    };
  }

  if (normalizedMessage.length > CONFIG.maxMessageLength) {
    return {
      ok: false,
      message: `El mensaje no puede superar los ${CONFIG.maxMessageLength} caracteres.`,
    };
  }

  if (!normalizedMessage && !file) {
    return {
      ok: false,
      message: 'Escribí un mensaje o subí una foto antes de guardar.',
    };
  }

  return validateImageFile(file);
}