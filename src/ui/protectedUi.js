import { elements } from './elements.js';
import { state, subscribeState } from '../state/appState.js';

const PROTECTED_UI_KEYS = new Set(['sessionReady', 'submitting', 'signingIn']);

export function updateProtectedUiState() {
  const uploadDisabled = !state.sessionReady || state.submitting || state.signingIn;

  elements.memoryImageInput.disabled = uploadDisabled;
  elements.submitButton.disabled = uploadDisabled;

  if (state.submitting) {
    elements.submitButton.textContent = 'Guardando...';
    return;
  }

  if (state.signingIn) {
    elements.submitButton.textContent = 'Verificando...';
    return;
  }

  if (!state.sessionReady) {
    elements.submitButton.textContent = 'Completá la verificación';
    return;
  }

  elements.submitButton.textContent = 'Guardar recuerdo';
}

export function mountProtectedUiState() {
  updateProtectedUiState();

  return subscribeState((_currentState, change) => {
    if (!change || PROTECTED_UI_KEYS.has(change.key)) {
      updateProtectedUiState();
    }
  });
}