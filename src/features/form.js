import { CONFIG } from '../config/constants.js';
import { elements } from '../ui/elements.js';
import { state } from '../state/appState.js';
import { showMessage } from '../ui/messages.js';
import { validateImageFile } from '../utils/fileHelpers.js';
import { validateSubmission } from '../utils/validators.js';
import { updatePreview, clearPreviewImage, setPreviewImage } from './preview.js';
import { loadGallery, scrollToGallery } from './gallery.js';
import { ensureAnonymousSession } from '../services/authService.js';
import { ensureGuest } from '../services/guestService.js';
import { uploadImage, createMemory } from '../services/memoryService.js';
import { clearDraft } from './draft.js';

let submitLock = false;

const DEFAULT_UPLOAD_TITLE = 'Elegí una imagen para sumar al álbum';
const DEFAULT_UPLOAD_SUBTITLE = `JPG, PNG o WEBP · hasta ${CONFIG.maxImageMb} MB`;

function getSelectedFile() {
  const [file] = elements.memoryImageInput.files || [];
  return file || null;
}

function getUploadShellElements() {
  const shell = document.querySelector('.upload-shell');
  const surface = shell?.querySelector('.upload-surface') || null;
  const title = shell?.querySelector('.upload-copy strong') || null;
  const subtitle = shell?.querySelector('.upload-copy span') || null;

  return { shell, surface, title, subtitle };
}

function formatFileSize(bytes) {
  const size = Number(bytes) || 0;

  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (size >= 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }

  return `${size} B`;
}

function resetUploadUx() {
  const { shell, title, subtitle } = getUploadShellElements();

  shell?.classList.remove('is-selected', 'is-error');

  if (title) {
    title.textContent = DEFAULT_UPLOAD_TITLE;
  }

  if (subtitle) {
    subtitle.textContent = DEFAULT_UPLOAD_SUBTITLE;
  }
}

function setUploadSelectedUx(file) {
  const { shell, title, subtitle } = getUploadShellElements();

  shell?.classList.remove('is-error');
  shell?.classList.add('is-selected');

  if (title) {
    title.textContent = 'Foto lista para sumarse al recuerdo';
  }

  if (subtitle) {
    subtitle.textContent = `${file.name} · ${formatFileSize(file.size)}`;
  }
}

function setUploadErrorUx(message) {
  const { shell, title, subtitle } = getUploadShellElements();

  shell?.classList.remove('is-selected');
  shell?.classList.add('is-error');

  if (title) {
    title.textContent = 'No pudimos usar esa imagen';
  }

  if (subtitle) {
    subtitle.textContent = message || DEFAULT_UPLOAD_SUBTITLE;
  }
}

function clearImageSelection({ resetInput = true } = {}) {
  if (resetInput) {
    elements.memoryImageInput.value = '';
  }

  clearPreviewImage();
  resetUploadUx();
}

function applyFieldConstraints() {
  elements.guestNameInput.maxLength = CONFIG.maxNameLength;
  elements.memoryTextInput.maxLength = CONFIG.maxMessageLength;
}

function updateCounterElement(counterElement, current, max) {
  if (!counterElement) return;

  counterElement.textContent = `${current}/${max}`;
  counterElement.classList.remove('is-warning', 'is-limit');

  const ratio = max > 0 ? current / max : 0;

  if (current >= max) {
    counterElement.classList.add('is-limit');
    return;
  }

  if (ratio >= 0.85) {
    counterElement.classList.add('is-warning');
  }
}

export function syncFormUx() {
  updateCounterElement(
    elements.guestNameCounter,
    elements.guestNameInput.value.trim().length,
    CONFIG.maxNameLength,
  );

  updateCounterElement(
    elements.memoryTextCounter,
    elements.memoryTextInput.value.trim().length,
    CONFIG.maxMessageLength,
  );
}

function resetFormUx() {
  elements.guestForm.reset();
  clearImageSelection();
  clearDraft();
  updatePreview();
  syncFormUx();
}

function bindPreviewInputs() {
  const handleTextInput = () => {
    updatePreview();
    syncFormUx();
  };

  elements.guestNameInput.addEventListener('input', handleTextInput);
  elements.memoryTextInput.addEventListener('input', handleTextInput);
}

function bindImageInput() {
  elements.memoryImageInput.addEventListener('change', () => {
    const file = getSelectedFile();

    if (!file) {
      clearImageSelection({ resetInput: false });
      return;
    }

    const validation = validateImageFile(file);

    if (!validation.ok) {
      clearImageSelection();
      setUploadErrorUx(validation.message);
      showMessage(validation.message, 'error');
      return;
    }

    setPreviewImage(file);
    setUploadSelectedUx(file);
    showMessage('La foto quedó lista para subirse junto con tu recuerdo 🤎', 'success');
  });
}

function tryAcquireSubmitLock() {
  if (submitLock || state.submitting) {
    return false;
  }

  submitLock = true;
  state.submitting = true;
  return true;
}

function releaseSubmitLock() {
  submitLock = false;
  state.submitting = false;
}

function bindSubmit() {
  elements.guestForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!state.sessionReady) {
      showMessage('Primero completá la verificación para poder guardar tu recuerdo.', 'error');
      return;
    }

    const name = elements.guestNameInput.value.trim();
    const message = elements.memoryTextInput.value.trim();
    const file = getSelectedFile();

    const validation = validateSubmission({ name, message, file });

    if (!validation.ok) {
      showMessage(validation.message, 'error');
      return;
    }

    if (!tryAcquireSubmitLock()) {
      return;
    }

    try {
      showMessage('Estamos guardando tu recuerdo...', '');

      await ensureAnonymousSession();

      showMessage('Validando tu nombre dentro del evento...', '');
      const guest = await ensureGuest(name);

      let imagePath = null;

      if (file) {
        const fileValidation = validateImageFile(file);

        if (!fileValidation.ok) {
          setUploadErrorUx(fileValidation.message);
          throw new Error(fileValidation.message);
        }

        showMessage('Subiendo la foto al álbum...', '');
        imagePath = await uploadImage(file);
      }

      showMessage('Armando tu recuerdo final...', '');
      await createMemory({
        guestId: guest.id,
        message,
        imagePath,
      });

      resetFormUx();
      showMessage('¡Listo! Tu recuerdo ya forma parte del álbum 🤎', 'success');

      await loadGallery({ silent: false, reset: true });
      scrollToGallery();
    } catch (error) {
      console.error(error);

      const nextMessage = error?.message || 'Ocurrió un error al guardar el recuerdo.';
      showMessage(nextMessage, 'error');
    } finally {
      releaseSubmitLock();
    }
  });
}

export function bindForm() {
  applyFieldConstraints();
  resetUploadUx();
  bindPreviewInputs();
  bindImageInput();
  bindSubmit();
  syncFormUx();
}