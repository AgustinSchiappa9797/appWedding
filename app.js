const guestForm = document.getElementById('guest-form');
const guestNameInput = document.getElementById('guest-name');
const memoryTextInput = document.getElementById('memory-text');
const memoryImageInput = document.getElementById('memory-image');
const formMessage = document.getElementById('form-message');
const previewName = document.getElementById('preview-name');
const previewDate = document.getElementById('preview-date');
const previewText = document.getElementById('preview-text');
const previewImage = document.getElementById('preview-image');
const previewImageWrap = document.getElementById('preview-image-wrap');
const galleryGrid = document.getElementById('gallery-grid');
const submitButton = guestForm.querySelector('button[type="submit"]');

const SUPABASE_URL = 'https://nwqdxnubaltoojvfpkwu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_OMDf1TtpQV_3hf51J7GnZQ_Cn0t6Pl7';
const EVENT_SLUG = 'CamientoNathiyAgus';
const STORAGE_BUCKET = 'wedding-memories';
const GALLERY_REFRESH_MS = 15000;
const GALLERY_LIMIT = 24;

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

const state = {
  previewObjectUrl: null,
  submitting: false,
  signingIn: false,
  galleryLoading: false,
  galleryRefreshTimer: null,
  hasLoadedGalleryOnce: false,
  captchaToken: null,
  sessionReady: false,
};

const formatToday = () =>
  new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date());

const formatDate = (value) =>
  new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));

const showMessage = (text, type = '') => {
  formMessage.textContent = text;
  formMessage.className = `feedback ${type}`.trim();
};

const updatePreview = () => {
  previewName.textContent = guestNameInput.value.trim() || 'Tu nombre';
  previewDate.textContent = formatToday();
  previewText.textContent =
    memoryTextInput.value.trim() || 'Todavía no escribiste ningún mensaje.';
};

const clearPreviewImage = () => {
  if (state.previewObjectUrl) {
    URL.revokeObjectURL(state.previewObjectUrl);
    state.previewObjectUrl = null;
  }

  previewImage.removeAttribute('src');
  previewImageWrap.classList.add('hidden');
};

const validateImageFile = (file) => {
  if (!file) return { ok: true };

  const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!validTypes.includes(file.type)) {
    return {
      ok: false,
      message: 'Formato de imagen no permitido. Usá JPG, PNG o WEBP.',
    };
  }

  const maxMb = 6;
  const fileSizeMb = file.size / 1024 / 1024;
  if (fileSizeMb > maxMb) {
    return {
      ok: false,
      message: `La imagen supera ${maxMb} MB. Elegí una más liviana.`,
    };
  }

  return { ok: true };
};

const updateProtectedUiState = () => {
  const uploadDisabled = !state.sessionReady || state.submitting || state.signingIn;

  memoryImageInput.disabled = uploadDisabled;
  submitButton.disabled = uploadDisabled;

  if (state.submitting) {
    submitButton.textContent = 'Guardando...';
    return;
  }

  if (state.signingIn) {
    submitButton.textContent = 'Verificando...';
    return;
  }

  if (!state.sessionReady) {
    submitButton.textContent = 'Completá la verificación';
    return;
  }

  submitButton.textContent = 'Guardar recuerdo';
};

const renderGalleryLoading = () => {
  galleryGrid.innerHTML = `
    <article class="gallery-item">
      <span class="pill">Cargando...</span>
      <p>Trayendo recuerdos del evento 💛</p>
    </article>
    <article class="gallery-item">
      <span class="pill">✨</span>
      <p>Puede tardar unos segundos si hay muchas fotos.</p>
    </article>
  `;
};

const renderGalleryEmpty = () => {
  galleryGrid.innerHTML = `
    <article class="gallery-item">
      <span class="pill">Primer recuerdo</span>
      <p>Todavía no hay recuerdos cargados. El primero puede ser el tuyo 💛</p>
    </article>
  `;
};

const renderGalleryError = () => {
  galleryGrid.innerHTML = `
    <article class="gallery-item">
      <span class="pill">Ups</span>
      <p>No se pudo cargar la galería en este momento. Probá nuevamente en unos segundos.</p>
    </article>
  `;
};

async function getExistingSession() {
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) throw error;
  return data?.session || null;
}

function resetTurnstileWidget() {
  state.captchaToken = null;

  if (window.turnstile) {
    try {
      window.turnstile.reset();
    } catch (error) {
      console.warn('No se pudo resetear Turnstile', error);
    }
  }
}

async function ensureAnonymousSession() {
  const existingSession = await getExistingSession();

  if (existingSession) {
    state.sessionReady = true;
    updateProtectedUiState();
    return existingSession;
  }

  if (!state.captchaToken) {
    throw new Error('Completá la verificación antes de continuar.');
  }

  if (state.signingIn) {
    throw new Error('Estamos verificando tu acceso. Intentá de nuevo en un instante.');
  }

  state.signingIn = true;
  updateProtectedUiState();

  try {
    const { data, error } = await supabaseClient.auth.signInAnonymously({
      options: {
        captchaToken: state.captchaToken,
      },
    });

    resetTurnstileWidget();

    if (error) throw error;

    state.sessionReady = true;
    updateProtectedUiState();

    return data.session;
  } finally {
    state.signingIn = false;
    updateProtectedUiState();
  }
}

async function getCurrentUser() {
  const { data, error } = await supabaseClient.auth.getUser();
  if (error) throw error;
  if (!data?.user) throw new Error('No se pudo obtener el usuario actual.');
  return data.user;
}

async function findGuestByAuthUserId(authUserId) {
  const { data, error } = await supabaseClient
    .from('guests')
    .select('id, auth_user_id, display_name, event_slug')
    .eq('auth_user_id', authUserId)
    .eq('event_slug', EVENT_SLUG)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function isNameTaken(displayName) {
  const { data, error } = await supabaseClient
    .from('guests')
    .select('id')
    .eq('event_slug', EVENT_SLUG)
    .ilike('display_name', displayName)
    .limit(1);

  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}

async function createGuest(displayName, authUserId) {
  const { data, error } = await supabaseClient
    .from('guests')
    .insert({
      auth_user_id: authUserId,
      event_slug: EVENT_SLUG,
      display_name: displayName,
    })
    .select('id, auth_user_id, display_name, event_slug')
    .single();

  if (error) throw error;
  return data;
}

async function ensureGuest(displayName) {
  await ensureAnonymousSession();
  const user = await getCurrentUser();

  const existingGuest = await findGuestByAuthUserId(user.id);
  if (existingGuest) return existingGuest;

  const taken = await isNameTaken(displayName);
  if (taken) {
    throw new Error('Ese nombre ya está en uso para este evento. Elegí otro.');
  }

  return createGuest(displayName, user.id);
}

async function uploadImage(file, authUserId) {
  if (!file) return null;

  const extension = file.name.includes('.')
    ? file.name.split('.').pop().toLowerCase()
    : 'jpg';

  const safeExtension = ['jpg', 'jpeg', 'png', 'webp'].includes(extension)
    ? extension
    : 'jpg';

  const fileName = `${crypto.randomUUID()}.${safeExtension}`;
  const filePath = `${EVENT_SLUG}/${authUserId}/${fileName}`;

  const { error } = await supabaseClient.storage
    .from(STORAGE_BUCKET)
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    });

  if (error) throw error;
  return filePath;
}

async function createMemory({ guestId, message, imagePath }) {
  const { data, error } = await supabaseClient
    .from('memories')
    .insert({
      guest_id: guestId,
      event_slug: EVENT_SLUG,
      message: message || null,
      image_path: imagePath || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function getImageUrl(path) {
  if (!path) return null;

  const { data } = supabaseClient.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(path);

  return data?.publicUrl || null;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
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

async function loadGallery({ silent = false } = {}) {
  if (state.galleryLoading) return;

  try {
    state.galleryLoading = true;

    if (!silent && !state.hasLoadedGalleryOnce) {
      renderGalleryLoading();
    }

    const { data, error } = await supabaseClient
      .from('memories')
      .select(`
        id,
        message,
        image_path,
        created_at,
        guests (
          display_name
        )
      `)
      .eq('event_slug', EVENT_SLUG)
      .order('created_at', { ascending: false })
      .limit(GALLERY_LIMIT);

    if (error) throw error;

    if (!data || data.length === 0) {
      renderGalleryEmpty();
      state.hasLoadedGalleryOnce = true;
      return;
    }

    galleryGrid.innerHTML = '';

    for (const item of data) {
      const imageUrl = item.image_path
        ? await getImageUrl(item.image_path)
        : null;

      const guestData = Array.isArray(item.guests) ? item.guests[0] : item.guests;

      const html = buildGalleryItemHtml({
        ...item,
        author: guestData?.display_name || 'Invitado',
        imageUrl,
      });

      galleryGrid.insertAdjacentHTML('beforeend', html);
    }

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

function scrollToGallery() {
  galleryGrid?.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  });
}

function startGalleryAutoRefresh() {
  stopGalleryAutoRefresh();

  state.galleryRefreshTimer = window.setInterval(() => {
    if (!document.hidden) {
      loadGallery({ silent: true });
    }
  }, GALLERY_REFRESH_MS);
}

function stopGalleryAutoRefresh() {
  if (state.galleryRefreshTimer) {
    window.clearInterval(state.galleryRefreshTimer);
    state.galleryRefreshTimer = null;
  }
}

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

window.onTurnstileSuccess = async function onTurnstileSuccess(token) {
  state.captchaToken = token;

  try {
    showMessage('Verificando acceso...', '');
    await ensureAnonymousSession();
    showMessage('Verificación completa. Ya podés subir tu recuerdo 💛', 'success');
  } catch (error) {
    console.error(error);
    resetTurnstileWidget();
    showMessage(error.message || 'No se pudo completar la verificación.', 'error');
  }
};

window.onTurnstileError = function onTurnstileError() {
  state.captchaToken = null;
  if (!state.sessionReady) {
    updateProtectedUiState();
  }
  showMessage('No se pudo verificar el CAPTCHA. Probá nuevamente.', 'error');
};

window.onTurnstileExpired = function onTurnstileExpired() {
  state.captchaToken = null;
  if (!state.sessionReady) {
    updateProtectedUiState();
    showMessage('La verificación expiró. Volvé a completarla.', 'error');
  }
};

window.onTurnstileTimeout = function onTurnstileTimeout() {
  state.captchaToken = null;
  if (!state.sessionReady) {
    updateProtectedUiState();
    showMessage('La verificación tardó demasiado. Intentá nuevamente.', 'error');
  }
};

guestNameInput.addEventListener('input', updatePreview);
memoryTextInput.addEventListener('input', updatePreview);

memoryImageInput.addEventListener('change', () => {
  const [file] = memoryImageInput.files || [];

  if (!file) {
    clearPreviewImage();
    return;
  }

  const validation = validateImageFile(file);
  if (!validation.ok) {
    memoryImageInput.value = '';
    clearPreviewImage();
    showMessage(validation.message, 'error');
    return;
  }

  clearPreviewImage();
  state.previewObjectUrl = URL.createObjectURL(file);
  previewImage.src = state.previewObjectUrl;
  previewImageWrap.classList.remove('hidden');
  showMessage('Imagen lista para subirse.', 'success');
});

guestForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (state.submitting || !state.sessionReady) return;

  const name = guestNameInput.value.trim();
  const message = memoryTextInput.value.trim();
  const [file] = memoryImageInput.files || [];

  if (name.length < 2) {
    showMessage('El nombre debe tener al menos 2 caracteres.', 'error');
    return;
  }

  if (name.length > 32) {
    showMessage('El nombre no puede superar los 32 caracteres.', 'error');
    return;
  }

  if (!message && !file) {
    showMessage('Escribí un mensaje o subí una foto antes de guardar.', 'error');
    return;
  }

  const imageValidation = validateImageFile(file);
  if (!imageValidation.ok) {
    showMessage(imageValidation.message, 'error');
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

    guestForm.reset();
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

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    loadGallery({ silent: true });
  }
});

window.addEventListener('beforeunload', () => {
  stopGalleryAutoRefresh();
  clearPreviewImage();
});

updatePreview();
updateProtectedUiState();
bootstrapAccessState();
startGalleryAutoRefresh();