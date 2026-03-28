import { elements } from './elements.js';
import { state } from '../state/appState.js';

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
