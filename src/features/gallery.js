import { CONFIG } from '../config/constants.js';
import { state } from '../state/appState.js';
import { elements } from '../ui/elements.js';
import { escapeHtml } from '../utils/escapeHtml.js';
import { formatDate } from '../utils/format.js';
import { fetchMemoriesPage, getImageUrl } from '../services/memoryService.js';
import { supabaseClient } from '../services/supabaseClient.js';

let galleryLoadMoreObserver = null;
let activeLightboxImageIndex = -1;
let activeLightboxItemId = null;
let lastLightboxTrigger = null;
let lightboxEventsBound = false;
let galleryActionsBound = false;

function getSkeletonMarkup(count = CONFIG.galleryLoadMoreSkeletonCount) {
  return Array.from({ length: count }, () => `
    <article class="gallery-item gallery-item-skeleton" aria-hidden="true">
      <div class="gallery-card-head">
        <div class="gallery-author-pill">
          <span class="gallery-author-mark skeleton-block"></span>
          <span class="pill skeleton-block skeleton-pill"></span>
        </div>
        <small class="skeleton-block skeleton-line skeleton-line-sm"></small>
      </div>

      <div class="skeleton-copy">
        <div class="skeleton-block skeleton-line"></div>
        <div class="skeleton-block skeleton-line"></div>
        <div class="skeleton-block skeleton-line skeleton-line-md"></div>
      </div>

      <div class="skeleton-block skeleton-image"></div>
    </article>
  `).join('');
}

function removeLoadMoreSkeletons() {
  elements.galleryGrid
    ?.querySelectorAll('[data-gallery-skeleton="true"]')
    .forEach((node) => node.remove());
}

function appendLoadMoreSkeletons() {
  if (!elements.galleryGrid) return;

  removeLoadMoreSkeletons();

  const wrapper = document.createElement('div');
  wrapper.dataset.gallerySkeleton = 'true';
  wrapper.className = 'gallery-skeleton-group';
  wrapper.innerHTML = getSkeletonMarkup();

  elements.galleryGrid.appendChild(wrapper);
}

function getGalleryItemsWithImage() {
  return state.galleryItems.filter((item) => Boolean(item.imageUrl));
}

function getSafeAuthor(item) {
  return escapeHtml(item.author || 'Invitado');
}

function getSafeDate(item) {
  return escapeHtml(formatDate(item.created_at));
}

function getSafeMessage(item) {
  return item.message ? escapeHtml(item.message) : '';
}

function getImageSequenceIndex(item) {
  return getGalleryItemsWithImage().findIndex((entry) => entry.id === item.id);
}

function getAuthorInitial(author) {
  const normalized = String(author || 'I').trim();
  return escapeHtml(normalized.charAt(0).toUpperCase() || 'I');
}

function getToneClass(index) {
  const tones = [
    'gallery-tone-sand',
    'gallery-tone-sage',
    'gallery-tone-clay',
    'gallery-tone-cream',
  ];

  return tones[index % tones.length];
}

function getLayoutVariant(item, index) {
  const hasImage = Boolean(item.imageUrl);
  const hasMessage = Boolean(String(item.message || '').trim());

  if (!hasImage && hasMessage) {
    return index % 3 === 0 ? 'quote-wide' : 'quote';
  }

  if (hasImage && hasMessage && index % 7 === 0) {
    return 'featured';
  }

  if (hasImage && index % 4 === 1) {
    return 'tall';
  }

  if (hasImage && !hasMessage) {
    return 'photo';
  }

  return 'standard';
}

function getGalleryImageMarkup(item, layoutVariant) {
  if (!item.imageUrl) return '';

  const author = getSafeAuthor(item);
  const imageIndex = getImageSequenceIndex(item);
  const mediaClass = layoutVariant === 'tall'
    ? 'gallery-media is-tall'
    : layoutVariant === 'featured'
      ? 'gallery-media is-featured'
      : 'gallery-media';

  return `
    <button
      type="button"
      class="${mediaClass} gallery-media-button"
      data-gallery-open-lightbox="true"
      data-gallery-image-index="${imageIndex}"
      aria-label="Ver foto ampliada de ${author}"
    >
      <img
        src="${item.imageUrl}"
        alt="Recuerdo compartido por ${author}"
        loading="lazy"
      />
      <span class="gallery-media-hint">Ver foto</span>
    </button>
  `;
}

function getGalleryBodyMarkup(item, layoutVariant) {
  const safeMessage = getSafeMessage(item);

  if (!safeMessage) {
    return `
      <p class="gallery-empty-copy">
        Compartió una foto para sumar a este álbum del evento.
      </p>
    `;
  }

  if (layoutVariant === 'quote' || layoutVariant === 'quote-wide') {
    return `
      <div class="gallery-quote-wrap">
        <span class="gallery-quote-mark">“</span>
        <p class="gallery-message gallery-message-quote">${safeMessage}</p>
      </div>
    `;
  }

  return `
    <p class="gallery-message">${safeMessage}</p>
  `;
}

function buildGalleryItemHtml(item, index) {
  const hasImage = Boolean(item.imageUrl);
  const safeAuthor = getSafeAuthor(item);
  const safeDate = getSafeDate(item);
  const toneClass = getToneClass(index);
  const layoutVariant = getLayoutVariant(item, index);
  const authorInitial = getAuthorInitial(item.author);

  return `
    <article class="gallery-item gallery-item-${layoutVariant} ${toneClass} ${hasImage ? 'gallery-item-with-image' : 'gallery-item-text-only'}">
      <div class="gallery-card-head">
        <div class="gallery-author-pill">
          <span class="gallery-author-mark" aria-hidden="true">${authorInitial}</span>
          <span class="pill">${safeAuthor}</span>
        </div>
        <small class="gallery-date">${safeDate}</small>
      </div>

      ${getGalleryImageMarkup(item, layoutVariant)}

      <div class="gallery-copy">
        ${getGalleryBodyMarkup(item, layoutVariant)}
      </div>
    </article>
  `;
}

function clearRealtimeReloadTimer() {
  if (!state.galleryRealtimeReloadTimer) return;

  window.clearTimeout(state.galleryRealtimeReloadTimer);
  state.galleryRealtimeReloadTimer = null;
}

function scheduleRealtimeGalleryReload() {
  clearRealtimeReloadTimer();

  state.galleryRealtimeReloadTimer = window.setTimeout(() => {
    state.galleryRealtimeReloadTimer = null;
    loadGallery({ silent: true, reset: true });
  }, CONFIG.galleryRealtimeDebounceMs);
}

function handleGalleryRealtimeChange(payload) {
  console.info('Cambio realtime detectado en memories:', payload?.eventType || 'unknown');
  scheduleRealtimeGalleryReload();
}

async function hydrateGalleryItems(memories) {
  return Promise.all(
    memories.map(async (item) => {
      const guestData = Array.isArray(item.guests) ? item.guests[0] : item.guests;
      const imageUrl = item.image_path ? await getImageUrl(item.image_path) : null;

      return {
        ...item,
        author: guestData?.display_name || 'Invitado',
        imageUrl,
      };
    }),
  );
}

function attachGalleryImageFallbacks() {
  if (!elements.galleryGrid) return;

  elements.galleryGrid.querySelectorAll('.gallery-media img').forEach((img) => {
    img.addEventListener(
      'error',
      () => {
        const media = img.closest('.gallery-media');
        if (!media) {
          img.remove();
          return;
        }

        media.outerHTML = `
          <div class="gallery-image-fallback">
            No se pudo mostrar esta imagen, pero el recuerdo sigue guardado.
          </div>
        `;
      },
      { once: true },
    );
  });
}

function getFocusableLightboxElements() {
  if (!elements.galleryLightbox) return [];

  return Array.from(
    elements.galleryLightbox.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((node) => !node.classList.contains('hidden'));
}

function setLightboxStatus(text, type = '') {
  if (!elements.galleryLightboxStatus) return;

  elements.galleryLightboxStatus.textContent = text;
  elements.galleryLightboxStatus.className = `lightbox-media-status ${type}`.trim();
}

function resetLightboxMediaState() {
  if (elements.galleryLightboxImage) {
    elements.galleryLightboxImage.classList.add('hidden');
    elements.galleryLightboxImage.removeAttribute('src');
    elements.galleryLightboxImage.alt = '';
    elements.galleryLightboxImage.onload = null;
    elements.galleryLightboxImage.onerror = null;
  }

  setLightboxStatus('Cargando imagen...');
}

function syncOpenLightboxAfterGalleryChange() {
  if (elements.galleryLightbox?.classList.contains('hidden')) return;
  if (!activeLightboxItemId) return;

  const itemsWithImage = getGalleryItemsWithImage();
  const nextIndex = itemsWithImage.findIndex((item) => item.id === activeLightboxItemId);

  if (nextIndex < 0) {
    closeLightbox({ restoreFocus: false });
    return;
  }

  renderLightboxItem(nextIndex);
}

function updateLightboxNavState() {
  const itemsWithImage = getGalleryItemsWithImage();
  const hasMultiple = itemsWithImage.length > 1;

  elements.galleryLightboxPrev?.classList.toggle('hidden', !hasMultiple);
  elements.galleryLightboxNext?.classList.toggle('hidden', !hasMultiple);
}

function renderLightboxItem(index) {
  const itemsWithImage = getGalleryItemsWithImage();
  const item = itemsWithImage[index];

  if (!item || !elements.galleryLightboxImage) return;

  activeLightboxImageIndex = index;
  activeLightboxItemId = item.id;

  resetLightboxMediaState();

  if (elements.galleryLightboxAuthor) {
    elements.galleryLightboxAuthor.textContent = item.author || 'Invitado';
  }

  if (elements.galleryLightboxDate) {
    elements.galleryLightboxDate.textContent = formatDate(item.created_at);
  }

  if (elements.galleryLightboxCount) {
    elements.galleryLightboxCount.textContent = `${index + 1} de ${itemsWithImage.length}`;
  }

  const safeMessage = String(item.message || '').trim();
  if (elements.galleryLightboxMessage) {
    elements.galleryLightboxMessage.textContent = safeMessage;
    elements.galleryLightboxMessage.classList.toggle('hidden', !safeMessage);
  }

  elements.galleryLightboxImage.onload = () => {
    elements.galleryLightboxImage.classList.remove('hidden');
    setLightboxStatus('', 'hidden');
  };

  elements.galleryLightboxImage.onerror = () => {
    elements.galleryLightboxImage.classList.add('hidden');
    setLightboxStatus('No se pudo cargar esta imagen.', 'is-error');
  };

  elements.galleryLightboxImage.src = item.imageUrl;
  elements.galleryLightboxImage.alt = `Recuerdo compartido por ${item.author || 'Invitado'}`;

  updateLightboxNavState();
}

function lockBodyScroll() {
  document.body.classList.add('lightbox-open');
}

function unlockBodyScroll() {
  document.body.classList.remove('lightbox-open');
}

function closeLightbox({ restoreFocus = true } = {}) {
  if (!elements.galleryLightbox) return;

  elements.galleryLightbox.classList.add('hidden');
  elements.galleryLightbox.setAttribute('aria-hidden', 'true');
  unlockBodyScroll();
  resetLightboxMediaState();

  if (restoreFocus && lastLightboxTrigger && typeof lastLightboxTrigger.focus === 'function') {
    lastLightboxTrigger.focus();
  }

  lastLightboxTrigger = null;
  activeLightboxImageIndex = -1;
  activeLightboxItemId = null;
}

function openLightbox(index, triggerElement = null) {
  const itemsWithImage = getGalleryItemsWithImage();
  if (!itemsWithImage.length || !itemsWithImage[index] || !elements.galleryLightbox) return;

  lastLightboxTrigger = triggerElement || document.activeElement;
  renderLightboxItem(index);

  elements.galleryLightbox.classList.remove('hidden');
  elements.galleryLightbox.setAttribute('aria-hidden', 'false');
  lockBodyScroll();

  elements.galleryLightboxClose?.focus();
}

function goToAdjacentLightboxItem(direction) {
  const itemsWithImage = getGalleryItemsWithImage();
  if (!itemsWithImage.length) return;

  const nextIndex = (activeLightboxImageIndex + direction + itemsWithImage.length) % itemsWithImage.length;
  renderLightboxItem(nextIndex);
}

function handleLightboxKeydown(event) {
  if (elements.galleryLightbox?.classList.contains('hidden')) return;

  if (event.key === 'Escape') {
    event.preventDefault();
    closeLightbox();
    return;
  }

  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    goToAdjacentLightboxItem(-1);
    return;
  }

  if (event.key === 'ArrowRight') {
    event.preventDefault();
    goToAdjacentLightboxItem(1);
    return;
  }

  if (event.key === 'Tab') {
    const focusable = getFocusableLightboxElements();
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
      return;
    }

    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }
}

function handleGalleryGridClick(event) {
  const trigger = event.target.closest('[data-gallery-open-lightbox="true"]');
  if (!trigger) return;

  const rawIndex = Number(trigger.dataset.galleryImageIndex);
  if (!Number.isInteger(rawIndex) || rawIndex < 0) return;

  openLightbox(rawIndex, trigger);
}

function handleLightboxBackdropClick() {
  closeLightbox();
}

function handleLightboxPrevClick() {
  goToAdjacentLightboxItem(-1);
}

function handleLightboxNextClick() {
  goToAdjacentLightboxItem(1);
}

function bindLightboxEvents() {
  if (lightboxEventsBound) return;
  lightboxEventsBound = true;

  elements.galleryGrid?.addEventListener('click', handleGalleryGridClick);
  elements.galleryLightboxBackdrop?.addEventListener('click', handleLightboxBackdropClick);
  elements.galleryLightboxClose?.addEventListener('click', handleLightboxBackdropClick);
  elements.galleryLightboxPrev?.addEventListener('click', handleLightboxPrevClick);
  elements.galleryLightboxNext?.addEventListener('click', handleLightboxNextClick);
  document.addEventListener('keydown', handleLightboxKeydown);
}

function unbindLightboxEvents() {
  if (!lightboxEventsBound) return;
  lightboxEventsBound = false;

  elements.galleryGrid?.removeEventListener('click', handleGalleryGridClick);
  elements.galleryLightboxBackdrop?.removeEventListener('click', handleLightboxBackdropClick);
  elements.galleryLightboxClose?.removeEventListener('click', handleLightboxBackdropClick);
  elements.galleryLightboxPrev?.removeEventListener('click', handleLightboxPrevClick);
  elements.galleryLightboxNext?.removeEventListener('click', handleLightboxNextClick);
  document.removeEventListener('keydown', handleLightboxKeydown);
}

export function renderGalleryLoading() {
  if (!elements.galleryGrid) return;

  elements.galleryGrid.innerHTML = `
    <article class="gallery-item gallery-item-state gallery-item-featured gallery-tone-cream">
      <span class="pill">Cargando...</span>
      <h3>Trayendo recuerdos del evento</h3>
      <p>Estamos buscando las fotos y mensajes compartidos para mostrarlos acá.</p>
    </article>

    <article class="gallery-item gallery-item-state gallery-tone-sage">
      <span class="pill">🤎</span>
      <h3>Preparando la galería</h3>
      <p>Si hay muchas fotos, puede tardar unos segundos más en completarse.</p>
    </article>

    <article class="gallery-item gallery-item-state gallery-tone-clay">
      <span class="pill">Álbum</span>
      <h3>Ordenando los recuerdos</h3>
      <p>La idea es que cada foto y cada mensaje se sientan como parte del mismo álbum.</p>
    </article>
  `;

  renderGalleryActions();
}

export function renderGalleryEmpty() {
  if (!elements.galleryGrid) return;

  elements.galleryGrid.innerHTML = `
    <article class="gallery-item gallery-item-state gallery-item-featured gallery-tone-cream">
      <span class="pill">Primer recuerdo</span>
      <h3>Todavía no hay recuerdos cargados</h3>
      <p>El primero puede ser el tuyo. Subí una foto, dejá un mensaje o ambas cosas.</p>
    </article>
  `;

  renderGalleryActions();
}

export function renderGalleryError() {
  if (!elements.galleryGrid) return;

  elements.galleryGrid.innerHTML = `
    <article class="gallery-item gallery-item-state gallery-item-featured gallery-tone-clay">
      <span class="pill">Ups</span>
      <h3>No se pudo cargar la galería</h3>
      <p>Probá nuevamente en unos segundos. La app va a volver a intentar refrescarla.</p>
    </article>
  `;

  renderGalleryActions();
}

function renderGalleryItems() {
  removeLoadMoreSkeletons();

  if (!state.galleryItems.length) {
    renderGalleryEmpty();
    return;
  }

  if (!elements.galleryGrid) return;

  elements.galleryGrid.innerHTML = state.galleryItems
    .map((item, index) => buildGalleryItemHtml(item, index))
    .join('');

  attachGalleryImageFallbacks();
  renderGalleryActions();
  syncOpenLightboxAfterGalleryChange();
}

function renderGalleryActions() {
  if (!elements.galleryActions || !elements.galleryLoadMoreButton) return;

  const hasItems = state.galleryItems.length > 0;
  const shouldShowActions = hasItems && state.galleryHasMore;
  const isBusy = state.galleryLoadingMore || state.galleryLoading;

  elements.galleryActions.classList.toggle('hidden', !shouldShowActions);
  elements.galleryLoadMoreButton.disabled = isBusy;
  elements.galleryLoadMoreButton.textContent = state.galleryLoadingMore
    ? 'Cargando más recuerdos...'
    : 'Cargar más recuerdos';

  if (!elements.galleryLoadMoreStatus) return;

  if (!hasItems) {
    elements.galleryLoadMoreStatus.textContent = '';
  } else if (!state.galleryHasMore) {
    elements.galleryLoadMoreStatus.textContent = `Ya se cargaron ${state.galleryItems.length} recuerdos.`;
  } else if (state.galleryLoadingMore) {
    elements.galleryLoadMoreStatus.textContent = 'Buscando más fotos y mensajes del evento...';
  } else {
    elements.galleryLoadMoreStatus.textContent = `${state.galleryItems.length} recuerdos cargados hasta ahora.`;
  }
}

function disconnectGalleryLoadMoreObserver() {
  if (!galleryLoadMoreObserver) return;
  galleryLoadMoreObserver.disconnect();
  galleryLoadMoreObserver = null;
}

function maybeLoadMoreFromObserver(entries) {
  const [entry] = entries || [];
  if (!entry?.isIntersecting) return;
  loadMoreGallery();
}

function initGalleryLoadMoreObserver() {
  disconnectGalleryLoadMoreObserver();

  if (!('IntersectionObserver' in window) || !elements.galleryLoadMoreSentinel) {
    return;
  }

  galleryLoadMoreObserver = new IntersectionObserver(maybeLoadMoreFromObserver, {
    root: null,
    rootMargin: CONFIG.galleryInfiniteScrollRootMargin,
    threshold: 0.01,
  });

  galleryLoadMoreObserver.observe(elements.galleryLoadMoreSentinel);
}

export async function loadGallery({ silent = false, reset = false } = {}) {
  if (state.galleryLoading || state.galleryLoadingMore) return;

  try {
    state.galleryLoading = true;

    if (reset) {
      state.galleryItems = [];
      state.galleryOffset = 0;
      state.galleryHasMore = true;
    }

    if (!silent && !state.hasLoadedGalleryOnce) {
      renderGalleryLoading();
    }

    const page = await fetchMemoriesPage({
      offset: 0,
      limit: CONFIG.galleryPageSize,
    });

    const hydratedItems = await hydrateGalleryItems(page.items);

    state.galleryItems = hydratedItems;
    state.galleryOffset = page.nextOffset;
    state.galleryHasMore = page.hasMore;
    state.hasLoadedGalleryOnce = true;

    renderGalleryItems();
  } catch (error) {
    console.error(error);

    if (!silent || !state.hasLoadedGalleryOnce) {
      renderGalleryError();
    }
  } finally {
    state.galleryLoading = false;
    renderGalleryActions();
  }
}

export async function loadMoreGallery() {
  if (
    state.galleryLoading ||
    state.galleryLoadingMore ||
    !state.galleryHasMore
  ) {
    return;
  }

  try {
    state.galleryLoadingMore = true;
    renderGalleryActions();
    appendLoadMoreSkeletons();

    const page = await fetchMemoriesPage({
      offset: state.galleryOffset,
      limit: CONFIG.galleryPageSize,
    });

    const hydratedItems = await hydrateGalleryItems(page.items);

    const existingIds = new Set(state.galleryItems.map((item) => item.id));
    const mergedItems = [...state.galleryItems];

    hydratedItems.forEach((item) => {
      if (!existingIds.has(item.id)) {
        mergedItems.push(item);
      }
    });

    state.galleryItems = mergedItems;
    state.galleryOffset = page.nextOffset;
    state.galleryHasMore = page.hasMore;

    renderGalleryItems();
  } catch (error) {
    console.error(error);
    removeLoadMoreSkeletons();
  } finally {
    state.galleryLoadingMore = false;
    renderGalleryActions();
  }
}

export function bindGalleryActions() {
  if (galleryActionsBound) return;
  galleryActionsBound = true;

  elements.galleryLoadMoreButton?.addEventListener('click', loadMoreGallery);

  initGalleryLoadMoreObserver();
  bindLightboxEvents();
}

export function destroyGalleryActions() {
  if (galleryActionsBound) {
    elements.galleryLoadMoreButton?.removeEventListener('click', loadMoreGallery);
    galleryActionsBound = false;
  }

  disconnectGalleryLoadMoreObserver();
  unbindLightboxEvents();
  closeLightbox({ restoreFocus: false });
}

export function scrollToGallery() {
  elements.galleryGrid?.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  });
}

export function startGalleryAutoRefresh() {
  stopGalleryAutoRefresh();

  const channel = supabaseClient
    .channel(CONFIG.galleryRealtimeChannelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'memories',
        filter: `event_slug=eq.${CONFIG.eventSlug}`,
      },
      handleGalleryRealtimeChange,
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.info('Realtime de galería activo.');
        return;
      }

      if (status === 'CHANNEL_ERROR') {
        console.warn('No se pudo suscribir el realtime de galería.');
      }

      if (status === 'TIMED_OUT') {
        console.warn('La suscripción realtime de galería expiró o tardó demasiado.');
      }

      if (status === 'CLOSED') {
        console.info('Realtime de galería cerrado.');
      }
    });

  state.galleryRealtimeChannel = channel;
}

export function stopGalleryAutoRefresh() {
  clearRealtimeReloadTimer();

  if (!state.galleryRealtimeChannel) return;

  try {
    supabaseClient.removeChannel(state.galleryRealtimeChannel);
  } catch (error) {
    console.warn('No se pudo remover el canal realtime de galería.', error);
  } finally {
    state.galleryRealtimeChannel = null;
  }
}