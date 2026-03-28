import { elements } from '../ui/elements.js';
import { state } from '../state/appState.js';
import { formatToday } from '../utils/format.js';

function revokePreviewObjectUrl() {
  if (!state.previewObjectUrl) return;

  try {
    URL.revokeObjectURL(state.previewObjectUrl);
  } catch (error) {
    console.warn('No se pudo liberar el object URL del preview.', error);
  } finally {
    state.previewObjectUrl = null;
  }
}

function resetPreviewImageDom() {
  elements.previewImage.removeAttribute('src');
  elements.previewImageWrap.classList.add('hidden');
}

export function updatePreview() {
  elements.previewName.textContent = elements.guestNameInput.value.trim() || 'Tu nombre';
  elements.previewDate.textContent = formatToday();
  elements.previewText.textContent =
    elements.memoryTextInput.value.trim() || 'Todavía no escribiste ningún mensaje.';
}

export function clearPreviewImage() {
  revokePreviewObjectUrl();
  resetPreviewImageDom();
}

export function setPreviewImage(file) {
  clearPreviewImage();

  const nextObjectUrl = URL.createObjectURL(file);
  state.previewObjectUrl = nextObjectUrl;

  elements.previewImage.onload = () => {
    elements.previewImage.onload = null;
    elements.previewImage.onerror = null;
  };

  elements.previewImage.onerror = () => {
    elements.previewImage.onload = null;
    elements.previewImage.onerror = null;

    if (state.previewObjectUrl === nextObjectUrl) {
      clearPreviewImage();
    }
  };

  elements.previewImage.src = nextObjectUrl;
  elements.previewImageWrap.classList.remove('hidden');
}