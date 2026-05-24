import { CONFIG } from '../config/constants.js';
import { elements } from '../ui/elements.js';
import { state } from '../state/appState.js';
import { showMessage } from '../ui/messages.js';
import { formatDate } from '../utils/format.js';
import { escapeHtml } from '../utils/escapeHtml.js';
import { getPublicDisplayName, updateGuestDisplayName } from '../services/guestService.js';
import { deleteMemory, updateMemory } from '../services/memoryService.js';
import { loadGallery } from './gallery.js';
import { isCurrentUserAdmin, signInAdmin, signOutAdmin } from '../services/adminAuthService.js';

let adminBound = false;
let adminUnlocked = false;
let adminBusy = false;

function getGuestData(item) {
  const guestData = Array.isArray(item.guests) ? item.guests[0] : item.guests;
  return guestData || null;
}

function setAdminStatus(message, type = '') {
  if (!elements.adminStatus) return;
  elements.adminStatus.textContent = message;
  elements.adminStatus.className = `admin-status ${type}`.trim();
}

function toggleAdminBody(forceOpen = null) {
  if (!elements.adminBody) return;
  const shouldOpen = typeof forceOpen === 'boolean'
    ? forceOpen
    : elements.adminBody.classList.contains('hidden');

  elements.adminBody.classList.toggle('hidden', !shouldOpen);
  if (elements.adminToggle) {
    elements.adminToggle.textContent = shouldOpen ? 'Cerrar admin' : 'Abrir admin';
  }
}

function renderAdminList() {
  if (!elements.adminList) return;

  if (!adminUnlocked) {
    elements.adminList.innerHTML = '';
    return;
  }

  if (!state.galleryItems.length) {
    elements.adminList.innerHTML = `
      <article class="admin-item admin-item-empty">
        <p>No hay recuerdos cargados todavía.</p>
      </article>
    `;
    return;
  }

  elements.adminList.innerHTML = state.galleryItems.map((item) => {
    const guest = getGuestData(item);
    const publicName = getPublicDisplayName(item.author) || 'Invitado';
    const hasFile = Boolean(item.image_path);

    return `
      <article class="admin-item" data-admin-memory-id="${escapeHtml(item.id)}">
        <div class="admin-item-head">
          <div>
            <strong>${escapeHtml(publicName)}</strong>
            <small>${escapeHtml(formatDate(item.created_at))}${hasFile ? ' · con archivo' : ''}</small>
          </div>
          <button type="button" class="btn btn-danger" data-admin-delete="${escapeHtml(item.id)}">Borrar</button>
        </div>

        <div class="admin-grid">
          <label>
            Nombre
            <input type="text" maxlength="${CONFIG.maxNameLength}" value="${escapeHtml(publicName)}" data-admin-name="${escapeHtml(item.id)}" data-admin-guest-id="${escapeHtml(guest?.id || '')}" />
          </label>
          <label>
            Mensaje
            <textarea rows="3" maxlength="${CONFIG.maxMessageLength}" data-admin-message="${escapeHtml(item.id)}">${escapeHtml(item.message || '')}</textarea>
          </label>
        </div>

        <div class="admin-item-actions">
          <button type="button" class="btn btn-secondary" data-admin-save="${escapeHtml(item.id)}">Guardar cambios</button>
        </div>
      </article>
    `;
  }).join('');
}

async function unlockAdmin() {
  if (adminBusy) return;

  adminBusy = true;
  setAdminStatus('Validando acceso admin...');

  try {
    await signInAdmin({
      email: elements.adminEmail?.value || '',
      password: elements.adminPassword?.value || '',
    });

    const canAdmin = await isCurrentUserAdmin();

    if (!canAdmin) {
      await signOutAdmin();
      throw new Error('Ese usuario existe, pero no está habilitado como admin para esta app.');
    }

    adminUnlocked = true;
    if (elements.adminPassword) elements.adminPassword.value = '';
    elements.adminLogin?.classList.add('hidden');
    elements.adminTools?.classList.remove('hidden');
    await loadGallery({ silent: true, reset: true });
    renderAdminList();
    setAdminStatus('Modo admin activo. Los cambios impactan en Supabase.', 'is-success');
  } catch (error) {
    console.error(error);
    const message = error?.message || 'No se pudo iniciar sesión como admin.';
    setAdminStatus(message, 'is-error');
    showMessage(message, 'error');
  } finally {
    adminBusy = false;
  }
}

async function logoutAdmin() {
  if (adminBusy) return;
  adminBusy = true;

  try {
    await signOutAdmin();
    adminUnlocked = false;
    elements.adminTools?.classList.add('hidden');
    elements.adminLogin?.classList.remove('hidden');
    setAdminStatus('Sesión admin cerrada.', 'is-success');
  } catch (error) {
    console.error(error);
    setAdminStatus(error?.message || 'No se pudo cerrar sesión.', 'is-error');
  } finally {
    adminBusy = false;
  }
}

async function refreshAdminList() {
  if (adminBusy) return;
  adminBusy = true;
  setAdminStatus('Actualizando recuerdos...');

  try {
    await loadGallery({ silent: true, reset: true });
    renderAdminList();
    setAdminStatus('Lista actualizada.', 'is-success');
  } catch (error) {
    console.error(error);
    setAdminStatus(error?.message || 'No se pudo actualizar la lista.', 'is-error');
  } finally {
    adminBusy = false;
  }
}

async function saveAdminItem(memoryId) {
  if (adminBusy || !memoryId) return;
  const nameInput = elements.adminList?.querySelector(`[data-admin-name="${CSS.escape(memoryId)}"]`);
  const messageInput = elements.adminList?.querySelector(`[data-admin-message="${CSS.escape(memoryId)}"]`);
  const guestId = nameInput?.dataset.adminGuestId || '';
  const nextName = String(nameInput?.value || '').trim();
  const nextMessage = String(messageInput?.value || '').trim();

  adminBusy = true;
  setAdminStatus('Guardando cambios...');

  try {
    if (guestId && nextName) {
      await updateGuestDisplayName(guestId, nextName);
    }

    await updateMemory({ memoryId, message: nextMessage });
    await loadGallery({ silent: true, reset: true });
    renderAdminList();
    setAdminStatus('Cambios guardados.', 'is-success');
    showMessage('Cambios guardados en Supabase.', 'success');
  } catch (error) {
    console.error(error);
    const message = error?.message || 'No se pudieron guardar los cambios.';
    setAdminStatus(message, 'is-error');
    showMessage(message, 'error');
  } finally {
    adminBusy = false;
  }
}

async function deleteAdminItem(memoryId) {
  if (adminBusy || !memoryId) return;
  const item = state.galleryItems.find((entry) => String(entry.id) === String(memoryId));
  if (!item) return;

  const ok = window.confirm('¿Borrar este recuerdo? También se intentará borrar su foto/video de Storage.');
  if (!ok) return;

  adminBusy = true;
  setAdminStatus('Borrando recuerdo...');

  try {
    await deleteMemory({ memoryId, imagePath: item.image_path });
    await loadGallery({ silent: true, reset: true });
    renderAdminList();
    setAdminStatus('Recuerdo borrado.', 'is-success');
    showMessage('Recuerdo borrado.', 'success');
  } catch (error) {
    console.error(error);
    const message = error?.message || 'No se pudo borrar el recuerdo.';
    setAdminStatus(message, 'is-error');
    showMessage(message, 'error');
  } finally {
    adminBusy = false;
  }
}

function handleAdminListClick(event) {
  const saveButton = event.target.closest('[data-admin-save]');
  if (saveButton) {
    saveAdminItem(saveButton.dataset.adminSave);
    return;
  }

  const deleteButton = event.target.closest('[data-admin-delete]');
  if (deleteButton) {
    deleteAdminItem(deleteButton.dataset.adminDelete);
  }
}

export function bindAdminPanel() {
  if (adminBound) return;
  adminBound = true;

  elements.adminToggle?.addEventListener('click', () => toggleAdminBody());
  elements.adminUnlock?.addEventListener('click', unlockAdmin);
  elements.adminEmail?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      elements.adminPassword?.focus();
    }
  });
  elements.adminPassword?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      unlockAdmin();
    }
  });
  elements.adminRefresh?.addEventListener('click', refreshAdminList);
  elements.adminLogout?.addEventListener('click', logoutAdmin);
  elements.adminList?.addEventListener('click', handleAdminListClick);
}
