import { state } from './state/appState.js';
import { updatePreview, clearPreviewImage } from './features/preview.js';
import { loadGallery, renderGalleryError, startGalleryAutoRefresh, stopGalleryAutoRefresh } from './features/gallery.js';
import { bindForm } from './features/form.js';
import { bindTurnstileCallbacks } from './features/turnstile.js';
import { getExistingSession } from './services/authService.js';
import { mountProtectedUiState } from './ui/protectedUi.js';

async function bootstrapAccessState() {
  try {
    const session = await getExistingSession();
    state.sessionReady = Boolean(session);
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

  const cleanup = () => {
    stopGalleryAutoRefresh();
    clearPreviewImage();
  };

  window.addEventListener('beforeunload', cleanup);
  window.addEventListener('pagehide', cleanup);
}

async function bootstrap() {
  mountProtectedUiState();
  bindTurnstileCallbacks();
  bindForm();
  bindLifecycleEvents();

  updatePreview();
  await bootstrapAccessState();
  startGalleryAutoRefresh();
}

bootstrap();