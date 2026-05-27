import { elements } from './elements.js';
import { state, subscribeState } from '../state/appState.js';

const PROTECTED_UI_KEYS = new Set(['sessionReady', 'submitting', 'signingIn']);

function setAriaBusy(isBusy) {
  if (!elements.guestForm) return;
  elements.guestForm.setAttribute('aria-busy', isBusy ? 'true' : 'false');
}

function getSubmitButtonLabel() {
  if (state.submitting) {
    return 'Publicando...';
  }

  if (state.signingIn) {
    return 'Verificando acceso...';
  }

  if (!state.sessionReady) {
    return 'Completá la verificación';
  }

  return 'Publicar recuerdo';
}

export function updateProtectedUiState() {
  const uploadDisabled = !state.sessionReady || state.submitting || state.signingIn;
  const textInputsDisabled = state.submitting || state.signingIn;
  const isBusy = state.submitting || state.signingIn;

  elements.memoryImageInput.disabled = uploadDisabled;
  elements.submitButton.disabled = uploadDisabled;
  elements.guestNameInput.disabled = textInputsDisabled;
  elements.memoryTextInput.disabled = textInputsDisabled;

  elements.submitButton.textContent = getSubmitButtonLabel();
  elements.submitButton.classList.toggle('is-loading', isBusy);
  elements.guestForm?.classList.toggle('is-busy', isBusy);
  setAriaBusy(isBusy);
}

export function mountProtectedUiState() {
  updateProtectedUiState();

  return subscribeState((_currentState, change) => {
    if (!change || PROTECTED_UI_KEYS.has(change.key)) {
      updateProtectedUiState();
    }
  });
}