import { state } from '../state/appState.js';
import { showMessage } from '../ui/messages.js';
import { ensureAnonymousSession, resetTurnstileWidget } from '../services/authService.js';

export function bindTurnstileCallbacks() {
  window.onTurnstileSuccess = async function onTurnstileSuccess(token) {
    state.captchaToken = token;

    try {
      showMessage('Verificando acceso...', '');
      await ensureAnonymousSession();
      showMessage('Confirmación lista. Ya podés publicar 💛', 'success');
    } catch (error) {
      console.error(error);
      resetTurnstileWidget();
      showMessage(error.message || 'No se pudo completar la verificación.', 'error');
    }
  };

  window.onTurnstileError = function onTurnstileError() {
    state.captchaToken = null;
    showMessage('No se pudo verificar el CAPTCHA. Probá nuevamente.', 'error');
  };

  window.onTurnstileExpired = function onTurnstileExpired() {
    state.captchaToken = null;

    if (!state.sessionReady) {
      showMessage('La verificación expiró. Volvé a completarla.', 'error');
    }
  };

  window.onTurnstileTimeout = function onTurnstileTimeout() {
    state.captchaToken = null;

    if (!state.sessionReady) {
      showMessage('La verificación tardó demasiado. Intentá nuevamente.', 'error');
    }
  };
  window.onAdminTurnstileSuccess = function onAdminTurnstileSuccess(token) {
    state.adminCaptchaToken = token;
  };

  window.onAdminTurnstileError = function onAdminTurnstileError() {
    state.adminCaptchaToken = null;
  };

  window.onAdminTurnstileExpired = function onAdminTurnstileExpired() {
    state.adminCaptchaToken = null;
  };

  window.onAdminTurnstileTimeout = function onAdminTurnstileTimeout() {
    state.adminCaptchaToken = null;
  };

}