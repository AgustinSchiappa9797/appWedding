import { CONFIG } from '../config/constants.js';
import { elements } from '../ui/elements.js';
import { state } from '../state/appState.js';
import { showMessage } from '../ui/messages.js';
import { getMediaKind, isCompressibleImage, validateMediaFile } from '../utils/fileHelpers.js';
import { validateSubmission } from '../utils/validators.js';
import { compressImageForUpload, formatBytes } from '../utils/imageCompression.js';
import { updatePreview, clearPreviewImage, setPreviewImage } from './preview.js';
import { loadGallery, scrollToGallery } from './gallery.js';
import { ensureAnonymousSession } from '../services/authService.js';
import { ensureGuest } from '../services/guestService.js';
import { uploadImage, createMemory } from '../services/memoryService.js';
import { clearDraft } from './draft.js';

let submitLock = false;
let formBound = false;
let currentGuidedStep = 0;

const DEFAULT_UPLOAD_TITLE = 'Elegí una foto o video para sumar al álbum';
const DEFAULT_UPLOAD_SUBTITLE = `JPG, PNG, WEBP, HEIC · hasta ${CONFIG.maxImageMb} MB / Videos MP4, WEBM, MOV · hasta ${CONFIG.maxVideoMb} MB`;

let uploadShellCache = null;

function getSelectedFile() {
  return state.processedImageFile || null;
}

function getRawSelectedFile() {
  const [file] = elements.memoryImageInput?.files || [];
  return file || null;
}

function getUploadShellElements() {
  if (uploadShellCache) {
    return uploadShellCache;
  }

  const shell = document.querySelector('.upload-shell');
  const surface = shell?.querySelector('.upload-surface') || null;
  const title = shell?.querySelector('.upload-copy strong') || null;
  const subtitle = shell?.querySelector('.upload-copy span') || null;

  uploadShellCache = { shell, surface, title, subtitle };
  return uploadShellCache;
}

function resetUploadUx() {
  const { shell, title, subtitle } = getUploadShellElements();

  shell?.classList.remove('is-selected', 'is-error', 'is-processing');

  if (title) {
    title.textContent = DEFAULT_UPLOAD_TITLE;
  }

  if (subtitle) {
    subtitle.textContent = DEFAULT_UPLOAD_SUBTITLE;
  }
}

function setUploadProcessingUx() {
  const { shell, title, subtitle } = getUploadShellElements();

  shell?.classList.remove('is-error', 'is-selected');
  shell?.classList.add('is-processing');

  if (title) {
    title.textContent = 'Preparando el archivo para subirlo';
  }

  if (subtitle) {
    subtitle.textContent = 'Validando formato y tamaño antes de guardar el recuerdo';
  }
}

function setUploadSelectedUx(file, meta = null) {
  const { shell, title, subtitle } = getUploadShellElements();

  shell?.classList.remove('is-error', 'is-processing');
  shell?.classList.add('is-selected');

  if (title) {
    title.textContent = getMediaKind(file) === 'video' ? 'Video listo para sumarse al recuerdo' : 'Foto lista para sumarse al recuerdo';
  }

  if (subtitle) {
    if (meta?.compressed && meta.originalSize && meta.finalSize) {
      subtitle.textContent = `${file.name} · ${formatBytes(meta.originalSize)} → ${formatBytes(meta.finalSize)} · -${meta.savingsPercent || 0}%`;
    } else {
      subtitle.textContent = `${file.name} · ${formatBytes(file.size)}`;
    }
  }
}

function setUploadErrorUx(message) {
  const { shell, title, subtitle } = getUploadShellElements();

  shell?.classList.remove('is-selected', 'is-processing');
  shell?.classList.add('is-error');

  if (title) {
    title.textContent = 'No pudimos usar ese archivo';
  }

  if (subtitle) {
    subtitle.textContent = message || DEFAULT_UPLOAD_SUBTITLE;
  }
}

function clearImageSelection({ resetInput = true } = {}) {
  if (resetInput && elements.memoryImageInput) {
    elements.memoryImageInput.value = '';
  }

  state.processedImageFile = null;
  state.selectedImageMeta = null;
  clearPreviewImage();
  resetUploadUx();
}

function applyFieldConstraints() {
  if (elements.guestNameInput) {
    elements.guestNameInput.maxLength = CONFIG.maxNameLength;
  }

  if (elements.memoryTextInput) {
    elements.memoryTextInput.maxLength = CONFIG.maxMessageLength;
  }
}

function updateCounterElement(counterElement, current, max) {
  if (!counterElement) return;

  counterElement.textContent = `${current}/${max}`;
  counterElement.classList.remove('is-warning', 'is-limit');

  const ratio = max > 0 ? current / max : 0;

  if (current >= max) {
    counterElement.classList.add('is-limit');
    return;
  }

  if (ratio >= 0.85) {
    counterElement.classList.add('is-warning');
  }
}

export function syncFormUx() {
  updateCounterElement(
    elements.guestNameCounter,
    elements.guestNameInput?.value.trim().length || 0,
    CONFIG.maxNameLength,
  );

  updateCounterElement(
    elements.memoryTextCounter,
    elements.memoryTextInput?.value.trim().length || 0,
    CONFIG.maxMessageLength,
  );
}

function resetFormUx() {
  elements.guestForm?.reset();
  clearImageSelection();
  clearDraft();
  updatePreview();
  syncFormUx();
  setGuidedStep(0);
}

function handleTextInput() {
  updatePreview();
  syncFormUx();
}

function bindPreviewInputs() {
  elements.guestNameInput?.addEventListener('input', handleTextInput);
  elements.memoryTextInput?.addEventListener('input', handleTextInput);
}

async function handleImageInputChange() {
  const rawFile = getRawSelectedFile();

  if (!rawFile) {
    clearImageSelection({ resetInput: false });
    return;
  }

  const validation = validateMediaFile(rawFile);

  if (!validation.ok) {
    clearImageSelection();
    setUploadErrorUx(validation.message);
    showMessage(validation.message, 'error');
    return;
  }

  try {
    setUploadProcessingUx();
    const canCompress = isCompressibleImage(rawFile);

    if (canCompress) {
      showMessage('Optimizando la foto para que suba más rápido...', '');
    } else {
      showMessage(getMediaKind(rawFile) === 'video' ? 'Video listo para subirse al álbum...' : 'Archivo listo para subirse al álbum...', '');
    }

    const result = canCompress
      ? await compressImageForUpload(rawFile)
      : {
          file: rawFile,
          compressed: false,
          originalSize: rawFile.size,
          finalSize: rawFile.size,
          savingsPercent: 0,
        };
    const nextFile = result.file || rawFile;

    state.processedImageFile = nextFile;
    state.selectedImageMeta = result;

    setPreviewImage(nextFile);
    setUploadSelectedUx(nextFile, result);

    if (result.compressed) {
      showMessage(`Foto optimizada: ${formatBytes(result.originalSize)} → ${formatBytes(result.finalSize)} 🤎`, 'success');
    } else {
      showMessage(getMediaKind(nextFile) === 'video' ? 'El video quedó listo para subirse junto con tu recuerdo 🤎' : 'La foto quedó lista para subirse junto con tu recuerdo 🤎', 'success');
    }
  } catch (error) {
    console.error(error);
    clearImageSelection();
    setUploadErrorUx(error?.message || 'No pudimos procesar ese archivo.');
    showMessage(error?.message || 'No pudimos procesar ese archivo.', 'error');
  }
}

function bindImageInput() {
  elements.memoryImageInput?.addEventListener('change', handleImageInputChange);
}

function tryAcquireSubmitLock() {
  if (submitLock || state.submitting) {
    return false;
  }

  submitLock = true;
  state.submitting = true;
  return true;
}

function releaseSubmitLock() {
  submitLock = false;
  state.submitting = false;
}

async function handleSubmit(event) {
  event.preventDefault();

  if (!state.sessionReady) {
    showMessage('Primero completá la verificación para poder guardar tu recuerdo.', 'error');
    return;
  }

  const name = elements.guestNameInput?.value.trim() || '';
  const message = elements.memoryTextInput?.value.trim() || '';
  const file = getSelectedFile();

  const validation = validateSubmission({ name, message, file });

  if (!validation.ok) {
    showMessage(validation.message, 'error');
    return;
  }

  if (!tryAcquireSubmitLock()) {
    return;
  }

  try {
    showMessage('Estamos guardando tu recuerdo...', '');

    await ensureAnonymousSession();

    showMessage('Registrando tu nombre para este recuerdo...', '');
    const guest = await ensureGuest(name);

    let imagePath = null;

    if (file) {
      const fileValidation = validateMediaFile(file);

      if (!fileValidation.ok) {
        setUploadErrorUx(fileValidation.message);
        throw new Error(fileValidation.message);
      }

      showMessage(getMediaKind(file) === 'video' ? 'Subiendo el video al álbum...' : 'Subiendo la foto al álbum...', '');
      imagePath = await uploadImage(file);
    }

    showMessage('Armando tu recuerdo final...', '');
    await createMemory({
      guestId: guest.id,
      message,
      imagePath,
    });

    resetFormUx();
    showMessage('¡Listo! Tu recuerdo ya forma parte del álbum 🤎', 'success');

    await loadGallery({ silent: false, reset: true });
    scrollToGallery();
  } catch (error) {
    console.error(error);

    const nextMessage = error?.message || 'Ocurrió un error al guardar el recuerdo.';
    showMessage(nextMessage, 'error');
  } finally {
    releaseSubmitLock();
  }
}


function getGuidedStepElements() {
  return Array.from(document.querySelectorAll('[data-form-step]'));
}

function getGuidedProgressElements() {
  return Array.from(document.querySelectorAll('[data-progress-step]'));
}

function getEntryPanelElement() {
  return document.getElementById('compartir-recuerdo');
}

function setGuidedStep(nextStep, { scroll = false } = {}) {
  const steps = getGuidedStepElements();
  const progressItems = getGuidedProgressElements();

  if (!steps.length) return;

  const normalizedStep = Math.max(0, Math.min(nextStep, steps.length - 1));
  currentGuidedStep = normalizedStep;

  steps.forEach((step, index) => {
    const isActive = index === normalizedStep;
    step.classList.toggle('is-active', isActive);
    step.setAttribute('aria-hidden', isActive ? 'false' : 'true');
  });

  progressItems.forEach((item, index) => {
    item.classList.toggle('is-active', index === normalizedStep);
    item.classList.toggle('is-complete', index < normalizedStep);
  });

  if (scroll) {
    getEntryPanelElement()?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
}

function validateCurrentGuidedStep() {
  const name = elements.guestNameInput?.value.trim() || '';
  const message = elements.memoryTextInput?.value.trim() || '';
  const file = getSelectedFile();

  if (currentGuidedStep === 0) {
    if (name.length < CONFIG.minNameLength) {
      showMessage(`El nombre debe tener al menos ${CONFIG.minNameLength} caracteres.`, 'error');
      elements.guestNameInput?.focus();
      return false;
    }

    return true;
  }

  if (currentGuidedStep === 1) {
    const rawFile = getRawSelectedFile();
    const validation = validateMediaFile(rawFile);

    if (!validation.ok) {
      showMessage(validation.message, 'error');
      return false;
    }

    return true;
  }

  if (currentGuidedStep === 2) {
    if (!message && !file) {
      showMessage('Podés dejar solo un mensaje o subir una foto/video, pero necesitamos al menos uno de los dos.', 'error');
      return false;
    }

    return true;
  }

  return true;
}

function bindGuidedForm() {
  const steps = getGuidedStepElements();

  if (!steps.length) return;

  document.querySelectorAll('[data-guided-next]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!validateCurrentGuidedStep()) return;
      setGuidedStep(currentGuidedStep + 1, { scroll: true });
    });
  });

  document.querySelectorAll('[data-guided-back]').forEach((button) => {
    button.addEventListener('click', () => {
      setGuidedStep(currentGuidedStep - 1, { scroll: true });
    });
  });

  setGuidedStep(0);
}

function bindSubmit() {
  elements.guestForm?.addEventListener('submit', handleSubmit);
}

export function bindForm() {
  if (formBound) return;
  formBound = true;

  applyFieldConstraints();
  resetUploadUx();
  bindPreviewInputs();
  bindImageInput();
  bindGuidedForm();
  bindSubmit();
  syncFormUx();
  setGuidedStep(0);
}
