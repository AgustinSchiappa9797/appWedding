import { CONFIG } from '../config/constants.js';
import { state } from '../state/appState.js';
import { elements } from '../ui/elements.js';
import { escapeHtml } from '../utils/escapeHtml.js';
import { formatDate } from '../utils/format.js';
import { fetchMemoriesPage, getImageUrl } from '../services/memoryService.js';
import { supabaseClient } from '../services/supabaseClient.js';

let galleryLoadMoreObserver = null;

function getSkeletonMarkup(count = CONFIG.galleryLoadMoreSkeletonCount) {
  return Array.from({ length: count }, () => `
    <article class="gallery-item gallery-item-skeleton" aria-hidden="true">
      <span class="pill skeleton-block skeleton-pill"></span>
      <small class="skeleton-block skeleton-line skeleton-line-sm"></small>
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
  removeLoadMoreSkeletons();

  const wrapper = document.createElement('div');
  wrapper.dataset.gallerySkeleton = 'true';
  wrapper.className = 'gallery-skeleton-group';
  wrapper.innerHTML = getSkeletonMarkup();

  elements.galleryGrid?.appendChild(wrapper);
}

export function renderGalleryLoading() {
  elements.galleryGrid.innerHTML = `
    <article class="gallery-item">
      <span class="pill">Cargando...</span>
      <p>Trayendo recuerdos del evento 💛</p>
    </article>
    <article class="gallery-item">
      <span class="pill">✨</span>
      <p>Puede tardar unos segundos si hay muchas fotos.</p>
    </article>
  `;
  renderGalleryActions();
}

export function renderGalleryEmpty() {
  elements.galleryGrid.innerHTML = `
    <article class="gallery-item">
      <span class="pill">Primer recuerdo</span>
      <p>Todavía no hay recuerdos cargados. El primero puede ser el tuyo 💛</p>
    </article>
  `;
  renderGalleryActions();
}

export function renderGalleryError() {
  elements.galleryGrid.innerHTML = `
    <article class="gallery-item">
      <span class="pill">Ups</span>
      <p>No se pudo cargar la galería en este momento. Probá nuevamente en unos segundos.</p>
    </article>
  `;
  renderGalleryActions();
}

function buildGalleryItemHtml(item) {
  return `
    <article class="gallery-item">
      <span class="pill">${escapeHtml(item.author)}</span>
      <small>${escapeHtml(formatDate(item.created_at))}</small>
      ${item.message ? `<p>${escapeHtml(item.message)}</p>` : ''}
      ${item.imageUrl ? `<img src="${item.imageUrl}" alt="Recuerdo compartido por ${escapeHtml(item.author)}" loading="lazy" />` : ''}
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
  return Promise.all(memories.map(async (item) => {
    const guestData = Array.isArray(item.guests) ? item.guests[0] : item.guests;
    const imageUrl = item.image_path ? await getImageUrl(item.image_path) : null;

    return {
      ...item,
      author: guestData?.display_name || 'Invitado',
      imageUrl,
    };
  }));
}

function renderGalleryItems() {
  removeLoadMoreSkeletons();

  if (!state.galleryItems.length) {
    renderGalleryEmpty();
    return;
  }

  elements.galleryGrid.innerHTML = state.galleryItems.map(buildGalleryItemHtml).join('');

  elements.galleryGrid.querySelectorAll('img').forEach((img) => {
    img.addEventListener('error', () => {
      img.remove();
    }, { once: true });
  });

  renderGalleryActions();
}

function renderGalleryActions() {
  if (!elements.galleryActions || !elements.galleryLoadMoreButton) return;

  const hasItems = state.galleryItems.length > 0;
  const shouldShowActions = hasItems && state.galleryHasMore;
  const isBusy = state.galleryLoadingMore || state.galleryLoading;

  elements.galleryActions.classList.toggle('hidden', !shouldShowActions);
  elements.galleryLoadMoreButton.disabled = isBusy;
  elements.galleryLoadMoreButton.textContent = state.galleryLoadingMore
    ? 'Cargando más...'
    : 'Cargar más recuerdos';

  if (elements.galleryLoadMoreStatus) {
    if (!hasItems) {
      elements.galleryLoadMoreStatus.textContent = '';
    } else if (!state.galleryHasMore) {
      elements.galleryLoadMoreStatus.textContent = `Ya se cargaron ${state.galleryItems.length} recuerdos.`;
    } else if (state.galleryLoadingMore) {
      elements.galleryLoadMoreStatus.textContent = 'Cargando más recuerdos...';
    } else {
      elements.galleryLoadMoreStatus.textContent = `${state.galleryItems.length} recuerdos cargados.`;
    }
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

  galleryLoadMoreObserver = new IntersectionObserver(
    maybeLoadMoreFromObserver,
    {
      root: null,
      rootMargin: CONFIG.galleryInfiniteScrollRootMargin,
      threshold: 0.01,
    },
  );

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
  elements.galleryLoadMoreButton?.addEventListener('click', () => {
    loadMoreGallery();
  });

  initGalleryLoadMoreObserver();
}

export function destroyGalleryActions() {
  disconnectGalleryLoadMoreObserver();
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