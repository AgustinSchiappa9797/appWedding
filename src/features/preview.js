import { elements } from '../ui/elements.js';
import { state } from '../state/appState.js';
import { formatToday } from '../utils/format.js';

export function updatePreview() {
  elements.previewName.textContent = elements.guestNameInput.value.trim() || 'Tu nombre';
  elements.previewDate.textContent = formatToday();
  elements.previewText.textContent =
    elements.memoryTextInput.value.trim() || 'Todavía no escribiste ningún mensaje.';
}

export function clearPreviewImage() {
  if (state.previewObjectUrl) {
    URL.revokeObjectURL(state.previewObjectUrl);
    state.previewObjectUrl = null;
  }

  elements.previewImage.removeAttribute('src');
  elements.previewImageWrap.classList.add('hidden');
}

export function setPreviewImage(file) {
  clearPreviewImage();
  state.previewObjectUrl = URL.createObjectURL(file);
  elements.previewImage.src = state.previewObjectUrl;
  elements.previewImageWrap.classList.remove('hidden');
}
