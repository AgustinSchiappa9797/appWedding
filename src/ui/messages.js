import { elements } from './elements.js';

export function showMessage(text, type = '') {
  elements.formMessage.textContent = text;
  elements.formMessage.className = `feedback ${type}`.trim();
}
