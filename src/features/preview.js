import { elements } from '../ui/elements.js';
import { state } from '../state/appState.js';
import { formatToday } from '../utils/format.js';
import { getMediaKind } from '../utils/fileHelpers.js';

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
  if (elements.previewImage) {
    elements.previewImage.onload = null;
    elements.previewImage.onerror = null;
    elements.previewImage.removeAttribute('src');
    elements.previewImage.alt = 'Preview del recuerdo elegido';
    elements.previewImage.classList.remove('hidden');
  }

  if (elements.previewVideo) {
    elements.previewVideo.pause?.();
    elements.previewVideo.removeAttribute('src');
    elements.previewVideo.load?.();
    elements.previewVideo.classList.add('hidden');
  }

  elements.previewImageWrap?.classList.add('hidden');
}

function normalizePreviewName(value) {
  return String(value || '').trim();
}

function normalizePreviewText(value) {
  return String(value || '').trim();
}

export function updatePreview() {
  const nextName = normalizePreviewName(elements.guestNameInput?.value);
  const nextText = normalizePreviewText(elements.memoryTextInput?.value);

  if (elements.previewName) {
    elements.previewName.textContent = nextName || PREVIEW_EMPTY_NAME;
  }

  if (elements.previewDate) {
    elements.previewDate.textContent = formatToday();
  }

  if (elements.previewText) {
    elements.previewText.textContent = nextText || PREVIEW_EMPTY_TEXT;
  }
}

export function clearPreviewImage() {
  revokePreviewObjectUrl();
  resetPreviewImageDom();
}

export function setPreviewImage(file) {
  if (!file || !elements.previewImageWrap) {
    clearPreviewImage();
    return;
  }

  clearPreviewImage();

  const nextObjectUrl = URL.createObjectURL(file);
  const mediaKind = getMediaKind(file);
  state.previewObjectUrl = nextObjectUrl;

  if (mediaKind === 'video' && elements.previewVideo) {
    elements.previewImage?.classList.add('hidden');
    elements.previewVideo.src = nextObjectUrl;
    elements.previewVideo.classList.remove('hidden');
    elements.previewImageWrap.classList.remove('hidden');
    return;
  }

  if (!elements.previewImage) {
    return;
  }

  elements.previewVideo?.classList.add('hidden');
  elements.previewImage.classList.remove('hidden');

  elements.previewImage.onload = () => {
    if (!elements.previewImage) return;

    elements.previewImage.onload = null;
    elements.previewImage.onerror = null;
  };

  elements.previewImage.onerror = () => {
    if (!elements.previewImage) return;

    elements.previewImage.onload = null;
    elements.previewImage.onerror = null;

    // HEIC/HEIF se aceptan y se suben, aunque algunos navegadores no puedan previsualizarlos.
    elements.previewImage.classList.add('hidden');
  };

  elements.previewImage.src = nextObjectUrl;
  elements.previewImage.alt = `Preview de ${file.name || 'el recuerdo elegido'}`;
  elements.previewImageWrap.classList.remove('hidden');
}
