import { state } from './state/appState.js';
import { updatePreview, clearPreviewImage } from './features/preview.js';
import { loadGallery, renderGalleryError, startGalleryAutoRefresh, stopGalleryAutoRefresh } from './features/gallery.js';
import { bindForm } from './features/form.js';
import { bindTurnstileCallbacks } from './features/turnstile.js';
import { getExistingSession } from './services/authService.js';
import { updateProtectedUiState } from './ui/protectedUi.js';

async function bootstrapAccessState() {
  try {
    const session = await getExistingSession();
    state.sessionReady = Boolean(session);
    updateProtectedUiState();
    await loadGallery();
  } catch (error) {
    console.error(error);
    renderGalleryError();
  }
}

function bindLifecycleEvents() {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      loadGallery({ silent: true });
    }
  });

  window.addEventListener('beforeunload', () => {
    stopGalleryAutoRefresh();
    clearPreviewImage();
  });
}

async function bootstrap() {
  bindTurnstileCallbacks();
  bindForm();
  bindLifecycleEvents();

  updatePreview();
  updateProtectedUiState();
  await bootstrapAccessState();
  startGalleryAutoRefresh();
}

bootstrap();
