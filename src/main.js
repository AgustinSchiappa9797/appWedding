import { state } from './state/appState.js';
import { updatePreview, clearPreviewImage } from './features/preview.js';
import {
  bindGalleryActions,
  destroyGalleryActions,
  loadGallery,
  renderGalleryError,
  startGalleryAutoRefresh,
  stopGalleryAutoRefresh,
} from './features/gallery.js';
import { bindForm, syncFormUx } from './features/form.js';
import { bindTurnstileCallbacks } from './features/turnstile.js';
import { bindDraftPersistence, restoreDraft, flushDraftSave } from './features/draft.js';
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
    if (document.hidden) {
      flushDraftSave();
      return;
    }

    loadGallery({ silent: true, reset: true });
  });

  const cleanup = () => {
    flushDraftSave();
    stopGalleryAutoRefresh();
    destroyGalleryActions();
    clearPreviewImage();
  };

  window.addEventListener('beforeunload', cleanup);
  window.addEventListener('pagehide', cleanup);
}

async function bootstrap() {
  mountProtectedUiState();
  bindTurnstileCallbacks();
  bindForm();
  bindDraftPersistence();
  bindGalleryActions();
  bindLifecycleEvents();

  restoreDraft();
  updatePreview();
  syncFormUx();
  await bootstrapAccessState();
  startGalleryAutoRefresh();
}

bootstrap();