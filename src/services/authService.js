import { supabaseClient } from './supabaseClient.js';
import { state } from '../state/appState.js';
import { updateProtectedUiState } from '../ui/protectedUi.js';

export async function getExistingSession() {
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) throw error;
  return data?.session || null;
}

export function resetTurnstileWidget() {
  state.captchaToken = null;

  if (window.turnstile) {
    try {
      window.turnstile.reset();
    } catch (error) {
      console.warn('No se pudo resetear Turnstile', error);
    }
  }
}

export async function ensureAnonymousSession() {
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

export async function getCurrentUser() {
  const { data, error } = await supabaseClient.auth.getUser();
  if (error) throw error;
  if (!data?.user) throw new Error('No se pudo obtener el usuario actual.');
  return data.user;
}
