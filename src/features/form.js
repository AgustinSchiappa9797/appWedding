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
import { uploadImage, createMemory, getImageUrl } from '../services/memoryService.js';
import { clearDraft } from './draft.js';

let submitLock = false;
let formBound = false;
let currentGuidedStep = 0;
let lastSuccessTrigger = null;

const DEFAULT_UPLOAD_TITLE = 'Elegí una foto o video para sumar al álbum';
const DEFAULT_UPLOAD_SUBTITLE = `JPG, PNG, WEBP, HEIC · hasta ${CONFIG.maxImageMb} MB / Videos MP4, WEBM, MOV · hasta ${CONFIG.maxVideoMb} MB`;

let uploadShellCache = null;


function setSubmissionStatus(title = '', detail = '', type = 'busy') {
  if (!elements.submissionStatus) return;

  const safeTitle = String(title || '').trim();
  const safeDetail = String(detail || '').trim();

  if (!safeTitle && !safeDetail) {
    elements.submissionStatus.classList.add('hidden');
    elements.submissionStatus.classList.remove('is-busy', 'is-success', 'is-error');
    return;
  }

  const titleElement = elements.submissionStatus.querySelector('strong');
  const detailElement = elements.submissionStatus.querySelector('small');

  if (titleElement) titleElement.textContent = safeTitle;
  if (detailElement) detailElement.textContent = safeDetail;

  elements.submissionStatus.classList.remove('hidden', 'is-busy', 'is-success', 'is-error');
  elements.submissionStatus.classList.add(`is-${type}`);
}

function setSubmitStage(title, detail = '') {
  showMessage(title, '');
  setSubmissionStatus(title, detail || 'No cierres esta pantalla mientras termina la carga.', 'busy');
}

function clearSubmissionStatus() {
  setSubmissionStatus('', '', 'busy');
}

function setSubmittingUx(isBusy, label = 'Publicar recuerdo') {
  const submitButton = elements.submitButton;
  const form = elements.guestForm;

  form?.classList.toggle('is-busy', Boolean(isBusy));

  if (!submitButton) return;

  if (!submitButton.dataset.defaultLabel) {
    submitButton.dataset.defaultLabel = submitButton.textContent.trim() || 'Publicar recuerdo';
  }

  submitButton.disabled = Boolean(isBusy);
  submitButton.classList.toggle('is-loading', Boolean(isBusy));
  submitButton.setAttribute('aria-busy', isBusy ? 'true' : 'false');
  submitButton.textContent = isBusy ? label : submitButton.dataset.defaultLabel;
}

function getSuccessModalFocusableElements() {
  if (!elements.successModal || elements.successModal.classList.contains('hidden')) return [];

  return Array.from(
    elements.successModal.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((node) => !node.classList.contains('hidden'));
}

function getFieldWrapper(element) {
  return element?.closest?.('.field') || null;
}

function clearFieldError(element) {
  const field = getFieldWrapper(element);
  field?.classList.remove('has-error');
  element?.removeAttribute?.('aria-invalid');
}

function markFieldError(element) {
  const field = getFieldWrapper(element);
  field?.classList.add('has-error');
  element?.setAttribute?.('aria-invalid', 'true');
}

function scrollToCurrentGuidedStep() {
  getEntryPanelElement()?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

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
    subtitle.textContent = 'Revisando que el archivo esté listo para subir';
  }
}

function setUploadSelectedUx(file, meta = null) {
  const { shell, title, subtitle } = getUploadShellElements();

  shell?.classList.remove('is-error', 'is-processing');
  shell?.classList.add('is-selected');

  if (title) {
    title.textContent = getMediaKind(file) === 'video' ? 'Video listo para el álbum' : 'Foto lista para el álbum';
  }

  if (subtitle) {
    if (meta?.compressed && meta.originalSize && meta.finalSize) {
      subtitle.textContent = `${file.name} · ${formatBytes(meta.originalSize)} → ${formatBytes(meta.finalSize)} · -${meta.savingsPercent || 0}%`;
    } else {
      const extra = getMediaKind(file) === 'video' ? ' · puede tardar un poco más al publicar' : '';
      subtitle.textContent = `${file.name} · ${formatBytes(file.size)}${extra}`;
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
  clearFieldError(elements.memoryImageInput);
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
  clearSubmissionStatus();
  setGuidedStep(0);
}

function handleTextInput(event) {
  clearFieldError(event?.target);
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

  clearFieldError(elements.memoryImageInput);

  if (!validation.ok) {
    clearImageSelection();
    markFieldError(elements.memoryImageInput);
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
      showMessage(getMediaKind(nextFile) === 'video' ? 'El video quedó listo para subir 🤎' : 'La foto quedó lista para subir 🤎', 'success');
    }
  } catch (error) {
    console.error(error);
    clearImageSelection();
    markFieldError(elements.memoryImageInput);
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

function resetSuccessModalMedia() {
  elements.successModalImage?.classList.add('hidden');
  elements.successModalVideo?.classList.add('hidden');
  elements.successModalMessage?.classList.add('hidden');
  elements.successModalPreview?.classList.add('hidden');

  if (elements.successModalImage) {
    elements.successModalImage.removeAttribute('src');
  }

  if (elements.successModalVideo) {
    elements.successModalVideo.pause?.();
    elements.successModalVideo.removeAttribute('src');
    elements.successModalVideo.load?.();
  }
}

function closeSuccessModal({ focusForm = false, restoreFocus = true } = {}) {
  if (!elements.successModal) return;

  elements.successModal.classList.add('hidden');
  elements.successModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('lightbox-open');

  if (focusForm) {
    document.getElementById('compartir-recuerdo')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    elements.guestNameInput?.focus({ preventScroll: true });
  } else if (restoreFocus && lastSuccessTrigger && typeof lastSuccessTrigger.focus === 'function') {
    lastSuccessTrigger.focus({ preventScroll: true });
  }

  lastSuccessTrigger = null;
}

function openSuccessModal({ name, message, mediaUrl, mediaKind }) {
  if (!elements.successModal) return;

  lastSuccessTrigger = document.activeElement;
  resetSuccessModalMedia();

  const safeName = String(name || '').trim();
  const safeMessage = String(message || '').trim();
  const isVideo = mediaKind === 'video';
  const hasMedia = Boolean(mediaUrl);

  if (elements.successModalTitle) {
    elements.successModalTitle.textContent = safeName ? `Gracias, ${safeName}` : 'Gracias por compartir';
  }

  if (elements.successModalCopy) {
    elements.successModalCopy.textContent = hasMedia
      ? `Tu ${isVideo ? 'video' : 'foto'} ya forma parte del álbum.`
      : 'Tu mensaje ya forma parte del álbum.';
  }

  if (hasMedia && elements.successModalPreview) {
    elements.successModalPreview.classList.remove('hidden');

    if (isVideo && elements.successModalVideo) {
      elements.successModalVideo.src = mediaUrl;
      elements.successModalVideo.classList.remove('hidden');
    } else if (elements.successModalImage) {
      elements.successModalImage.src = mediaUrl;
      elements.successModalImage.alt = `Recuerdo compartido por ${safeName || 'invitado'}`;
      elements.successModalImage.classList.remove('hidden');
    }
  }

  if (safeMessage && elements.successModalMessage) {
    elements.successModalPreview?.classList.remove('hidden');
    elements.successModalMessage.textContent = safeMessage;
    elements.successModalMessage.classList.remove('hidden');
  }

  elements.successModal.classList.remove('hidden');
  elements.successModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('lightbox-open');
  elements.successModalGallery?.focus();
}

function bindSuccessModal() {
  elements.successModalClose?.addEventListener('click', () => closeSuccessModal());
  elements.successModalBackdrop?.addEventListener('click', () => closeSuccessModal());

  elements.successModalGallery?.addEventListener('click', () => {
    closeSuccessModal();
    scrollToGallery();
  });

  elements.successModalAnother?.addEventListener('click', () => {
    closeSuccessModal({ focusForm: true, restoreFocus: false });
  });

  document.addEventListener('keydown', (event) => {
    if (elements.successModal?.classList.contains('hidden')) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      closeSuccessModal();
      return;
    }

    if (event.key === 'Tab') {
      const focusable = getSuccessModalFocusableElements();
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
  });
}

async function handleSubmit(event) {
  event.preventDefault();

  if (!state.sessionReady) {
    setGuidedStep(3, { scroll: true });
    showMessage('Primero completá la confirmación para poder publicar.', 'error');
    setSubmissionStatus('Falta la verificación', 'Completá el CAPTCHA del último paso y volvé a intentar.', 'error');
    return;
  }

  const name = elements.guestNameInput?.value.trim() || '';
  const message = elements.memoryTextInput?.value.trim() || '';
  const file = getSelectedFile();

  const validation = validateSubmission({ name, message, file });

  if (!validation.ok) {
    const rawFile = getRawSelectedFile();

    if (name.length < CONFIG.minNameLength || name.length > CONFIG.maxNameLength) {
      setGuidedStep(0, { scroll: true });
      markFieldError(elements.guestNameInput);
      elements.guestNameInput?.focus({ preventScroll: true });
    } else if (rawFile && !validateMediaFile(rawFile).ok) {
      setGuidedStep(1, { scroll: true });
      markFieldError(elements.memoryImageInput);
    } else {
      setGuidedStep(2, { scroll: true });
      markFieldError(elements.memoryTextInput);
      elements.memoryTextInput?.focus({ preventScroll: true });
    }

    setSubmissionStatus('Revisá este paso', validation.message, 'error');
    showMessage(validation.message, 'error');
    return;
  }

  if (!tryAcquireSubmitLock()) {
    showMessage('Ya estamos publicando tu recuerdo. Esperá unos segundos.', '');
    return;
  }

  try {
    setSubmittingUx(true, 'Publicando...');
    setSubmitStage('Estamos publicando tu recuerdo...', 'Estamos preparando la carga. Si es video, puede tardar un poco más.');

    await ensureAnonymousSession();

    setSubmitStage('Guardando tu nombre...', 'Estamos dejando listo el recuerdo.');
    const guest = await ensureGuest(name);

    let imagePath = null;

    if (file) {
      const fileValidation = validateMediaFile(file);

      if (!fileValidation.ok) {
        setUploadErrorUx(fileValidation.message);
        throw new Error(fileValidation.message);
      }

      const isVideoUpload = getMediaKind(file) === 'video';
      setSubmittingUx(true, isVideoUpload ? 'Subiendo video...' : 'Subiendo foto...');
      setSubmitStage(
        isVideoUpload ? 'Subiendo el video al álbum...' : 'Subiendo la foto al álbum...',
        isVideoUpload ? 'Los videos pueden tardar más. No cierres esta pantalla.' : 'Estamos guardando la foto en el álbum.'
      );
      imagePath = await uploadImage(file);
    }

    setSubmittingUx(true, 'Guardando...');
    setSubmitStage('Sumándolo al álbum...', 'Ya casi está listo.');
    await createMemory({
      guestId: guest.id,
      message,
      imagePath,
    });

    const uploadedMediaUrl = imagePath ? await getImageUrl(imagePath) : null;
    const uploadedMediaKind = imagePath ? getMediaKind(imagePath) : 'unknown';

    resetFormUx();
    showMessage('¡Listo! Tu recuerdo ya quedó en el álbum 🤎', 'success');
    setSubmissionStatus('Recuerdo guardado', 'Ya forma parte del álbum compartido.', 'success');

    await loadGallery({ silent: false, reset: true });
    openSuccessModal({
      name,
      message,
      mediaUrl: uploadedMediaUrl,
      mediaKind: uploadedMediaKind,
    });
  } catch (error) {
    console.error(error);

    const nextMessage = error?.message || 'No pudimos publicar el recuerdo. Probá de nuevo.';
    setSubmissionStatus('No se pudo guardar', nextMessage, 'error');
    showMessage(nextMessage, 'error');
  } finally {
    releaseSubmitLock();
    setSubmittingUx(false);
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
      markFieldError(elements.guestNameInput);
      showMessage(`El nombre debe tener al menos ${CONFIG.minNameLength} caracteres.`, 'error');
      scrollToCurrentGuidedStep();
      elements.guestNameInput?.focus({ preventScroll: true });
      return false;
    }

    clearFieldError(elements.guestNameInput);
    return true;
  }

  if (currentGuidedStep === 1) {
    const rawFile = getRawSelectedFile();
    const validation = validateMediaFile(rawFile);

    if (!validation.ok) {
      markFieldError(elements.memoryImageInput);
      setUploadErrorUx(validation.message);
      showMessage(validation.message, 'error');
      scrollToCurrentGuidedStep();
      return false;
    }

    clearFieldError(elements.memoryImageInput);
    return true;
  }

  if (currentGuidedStep === 2) {
    if (!message && !file) {
      markFieldError(elements.memoryTextInput);
      showMessage('Podés dejar solo un mensaje o subir una foto/video, pero necesitamos al menos uno de los dos.', 'error');
      scrollToCurrentGuidedStep();
      elements.memoryTextInput?.focus({ preventScroll: true });
      return false;
    }

    clearFieldError(elements.memoryTextInput);
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
  bindSuccessModal();
  syncFormUx();
  setGuidedStep(0);
}
