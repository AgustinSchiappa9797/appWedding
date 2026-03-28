import { elements } from '../ui/elements.js';
import { state } from '../state/appState.js';
import { showMessage } from '../ui/messages.js';
import { updateProtectedUiState } from '../ui/protectedUi.js';
import { validateImageFile } from '../utils/fileHelpers.js';
import { validateSubmission } from '../utils/validators.js';
import { updatePreview, clearPreviewImage, setPreviewImage } from './preview.js';
import { loadGallery, scrollToGallery } from './gallery.js';
import { ensureAnonymousSession, getCurrentUser } from '../services/authService.js';
import { ensureGuest } from '../services/guestService.js';
import { uploadImage, createMemory } from '../services/memoryService.js';

function getSelectedFile() {
  const [file] = elements.memoryImageInput.files || [];
  return file || null;
}

function bindPreviewInputs() {
  elements.guestNameInput.addEventListener('input', updatePreview);
  elements.memoryTextInput.addEventListener('input', updatePreview);
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

function bindSubmit() {
  elements.guestForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (state.submitting || !state.sessionReady) return;

    const name = elements.guestNameInput.value.trim();
    const message = elements.memoryTextInput.value.trim();
    const file = getSelectedFile();

    const validation = validateSubmission({ name, message, file });
    if (!validation.ok) {
      showMessage(validation.message, 'error');
      return;
    }

    try {
      state.submitting = true;
      updateProtectedUiState();
      showMessage('Guardando tu recuerdo...', '');

      await ensureAnonymousSession();
      const user = await getCurrentUser();
      const guest = await ensureGuest(name);

      let imagePath = null;
      if (file) {
        imagePath = await uploadImage(file, user.id);
      }

      await createMemory({
        guestId: guest.id,
        message,
        imagePath,
      });

      elements.guestForm.reset();
      clearPreviewImage();
      updatePreview();
      showMessage('Gracias por compartir este recuerdo 💛', 'success');

      await loadGallery({ silent: false });
      scrollToGallery();
    } catch (error) {
      console.error(error);

      if (error?.message?.includes('duplicate key')) {
        showMessage('Ese nombre ya está en uso para este evento. Elegí otro.', 'error');
      } else {
        showMessage(error.message || 'Ocurrió un error al guardar el recuerdo.', 'error');
      }
    } finally {
      state.submitting = false;
      updateProtectedUiState();
    }
  });
}

export function bindForm() {
  bindPreviewInputs();
  bindImageInput();
  bindSubmit();
}
