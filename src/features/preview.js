import { elements } from '../ui/elements.js';
import { state } from '../state/appState.js';
import { formatToday } from '../utils/format.js';

const PREVIEW_EMPTY_NAME = 'Tu nombre';
const PREVIEW_EMPTY_TEXT = 'Tu mensaje aparecerá acá cuando empieces a escribir.';

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

function normalizePreviewName(value) {
  return String(value || '').trim();
}

function normalizePreviewText(value) {
  return String(value || '').trim();
}

export function updatePreview() {
  const nextName = normalizePreviewName(elements.guestNameInput.value);
  const nextText = normalizePreviewText(elements.memoryTextInput.value);

  elements.previewName.textContent = nextName || PREVIEW_EMPTY_NAME;
  elements.previewDate.textContent = formatToday();
  elements.previewText.textContent = nextText || PREVIEW_EMPTY_TEXT;
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