import { state } from './state/appState.js';
import { updatePreview, clearPreviewImage } from './features/preview.js';
import { bindGalleryActions, destroyGalleryActions, loadGallery, renderGalleryError, startGalleryAutoRefresh, stopGalleryAutoRefresh, } from './features/gallery.js';
import { bindForm, syncFormUx } from './features/form.js';
import { bindTurnstileCallbacks } from './features/turnstile.js';
import { bindDraftPersistence, restoreDraft, flushDraftSave } from './features/draft.js';
import { getExistingSession } from './services/authService.js';
import { mountProtectedUiState } from './ui/protectedUi.js';

let revealObserver = null;
let lifecycleEventsBound = false;
let bootstrapStarted = false;
let cleanupRan = false;

async function bootstrapAccessState() {
  try {
    const session = await getExistingSession();
    state.sessionReady = Boolean(session);
    await loadGallery();
    return true;
  } catch (error) {
    console.error(error);
    renderGalleryError();
    return false;
  }
}

function initScrollReveal() {
  const items = Array.from(document.querySelectorAll('.reveal-on-scroll'));

  if (!items.length) return;

  if (!('IntersectionObserver' in window)) {
    items.forEach((item) => item.classList.add('is-visible'));
    return;
  }

  revealObserver?.disconnect();

  revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        entry.target.classList.add('is-visible');
        revealObserver?.unobserve(entry.target);
      });
    },
    {
      root: null,
      threshold: 0.12,
      rootMargin: '0px 0px -8% 0px',
    },
  );

  items.forEach((item) => {
    if (item.classList.contains('is-visible')) return;
    revealObserver.observe(item);
  });
}

function cleanupApp() {
  if (cleanupRan) return;
  cleanupRan = true;

  flushDraftSave();
  stopGalleryAutoRefresh();
  destroyGalleryActions();
  clearPreviewImage();
  revealObserver?.disconnect();
  revealObserver = null;
}

function handleVisibilityChange() {
  if (document.hidden) {
    flushDraftSave();
    return;
  }

  loadGallery({ silent: true, reset: true });
}

function bindLifecycleEvents() {
  if (lifecycleEventsBound) return;
  lifecycleEventsBound = true;

  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('beforeunload', cleanupApp);
  window.addEventListener('pagehide', cleanupApp);
}

async function bootstrap() {
  if (bootstrapStarted) return;
  bootstrapStarted = true;
  cleanupRan = false;

  mountProtectedUiState();
  bindTurnstileCallbacks();
  bindForm();
  bindDraftPersistence();
  bindGalleryActions();
  bindLifecycleEvents();

  restoreDraft();
  updatePreview();
  syncFormUx();
  initScrollReveal();

  const accessReady = await bootstrapAccessState();

  if (accessReady) {
    startGalleryAutoRefresh();
  }
}

bootstrap();