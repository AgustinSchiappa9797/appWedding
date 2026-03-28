import { CONFIG } from '../config/constants.js';
import { validateImageFile } from './fileHelpers.js';

export function validateSubmission({ name, message, file }) {
  if (name.length < CONFIG.minNameLength) {
    return { ok: false, message: `El nombre debe tener al menos ${CONFIG.minNameLength} caracteres.` };
  }

  if (name.length > CONFIG.maxNameLength) {
    return { ok: false, message: `El nombre no puede superar los ${CONFIG.maxNameLength} caracteres.` };
  }

  if (!message && !file) {
    return { ok: false, message: 'Escribí un mensaje o subí una foto antes de guardar.' };
  }

  return validateImageFile(file);
}
