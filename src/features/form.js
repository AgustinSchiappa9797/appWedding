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

function getSelectedFile() {
  const [file] = elements.memoryImageInput.files || [];
  return file || null;
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
      clearPreviewImage();
      return;
    }

    const validation = validateImageFile(file);
    if (!validation.ok) {
      elements.memoryImageInput.value = '';
      clearPreviewImage();
      showMessage(validation.message, 'error');
      return;
    }

    setPreviewImage(file);
    showMessage('Imagen lista para subirse.', 'success');
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

    if (!state.sessionReady) return;

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
      showMessage('Guardando tu recuerdo...', '');

      await ensureAnonymousSession();
      const guest = await ensureGuest(name);

      let imagePath = null;
      if (file) {
        const fileValidation = validateImageFile(file);
        if (!fileValidation.ok) {
          throw new Error(fileValidation.message);
        }

        imagePath = await uploadImage(file);
      }

      await createMemory({
        guestId: guest.id,
        message,
        imagePath,
      });

      elements.guestForm.reset();
      clearPreviewImage();
      clearDraft();
      updatePreview();
      syncFormUx();
      showMessage('Gracias por compartir este recuerdo 💛', 'success');

      await loadGallery({ silent: false, reset: true });
      scrollToGallery();
    } catch (error) {
      console.error(error);
      showMessage(error.message || 'Ocurrió un error al guardar el recuerdo.', 'error');
    } finally {
      releaseSubmitLock();
    }
  });
}

export function bindForm() {
  applyFieldConstraints();
  bindPreviewInputs();
  bindImageInput();
  bindSubmit();
  syncFormUx();
}