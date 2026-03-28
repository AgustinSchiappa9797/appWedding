import { CONFIG } from '../config/constants.js';
import { state } from '../state/appState.js';
import { elements } from '../ui/elements.js';
import { escapeHtml } from '../utils/escapeHtml.js';
import { formatDate } from '../utils/format.js';
import { fetchLatestMemories, getImageUrl } from '../services/memoryService.js';

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
}

export function renderGalleryEmpty() {
  elements.galleryGrid.innerHTML = `
    <article class="gallery-item">
      <span class="pill">Primer recuerdo</span>
      <p>Todavía no hay recuerdos cargados. El primero puede ser el tuyo 💛</p>
    </article>
  `;
}

export function renderGalleryError() {
  elements.galleryGrid.innerHTML = `
    <article class="gallery-item">
      <span class="pill">Ups</span>
      <p>No se pudo cargar la galería en este momento. Probá nuevamente en unos segundos.</p>
    </article>
  `;
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

export async function loadGallery({ silent = false } = {}) {
  if (state.galleryLoading) return;

  try {
    state.galleryLoading = true;

    if (!silent && !state.hasLoadedGalleryOnce) {
      renderGalleryLoading();
    }

    const memories = await fetchLatestMemories(CONFIG.galleryLimit);

    if (memories.length === 0) {
      renderGalleryEmpty();
      state.hasLoadedGalleryOnce = true;
      return;
    }

    const items = await Promise.all(memories.map(async (item) => {
      const guestData = Array.isArray(item.guests) ? item.guests[0] : item.guests;
      const imageUrl = item.image_path ? await getImageUrl(item.image_path) : null;

      return {
        ...item,
        author: guestData?.display_name || 'Invitado',
        imageUrl,
      };
    }));

    elements.galleryGrid.innerHTML = items.map(buildGalleryItemHtml).join('');
    state.hasLoadedGalleryOnce = true;
  } catch (error) {
    console.error(error);

    if (!silent || !state.hasLoadedGalleryOnce) {
      renderGalleryError();
    }
  } finally {
    state.galleryLoading = false;
  }
}

export function scrollToGallery() {
  elements.galleryGrid?.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  });
}

export function startGalleryAutoRefresh() {
  stopGalleryAutoRefresh();

  state.galleryRefreshTimer = window.setInterval(() => {
    if (!document.hidden) {
      loadGallery({ silent: true });
    }
  }, CONFIG.galleryRefreshMs);
}

export function stopGalleryAutoRefresh() {
  if (state.galleryRefreshTimer) {
    window.clearInterval(state.galleryRefreshTimer);
    state.galleryRefreshTimer = null;
  }
}
