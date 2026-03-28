import { CONFIG } from '../config/constants.js';
import { elements } from '../ui/elements.js';
import { updatePreview } from './preview.js';

let draftSaveTimer = null;

function getSafeStorage() {
    try {
        return window.localStorage;
    } catch (error) {
        console.warn('localStorage no está disponible.', error);
        return null;
    }
}

function normalizeDraftPayload() {
    return {
        guestName: String(elements.guestNameInput.value || '')
            .trim()
            .slice(0, CONFIG.maxNameLength),
        memoryText: String(elements.memoryTextInput.value || '')
            .trim()
            .slice(0, CONFIG.maxMessageLength),
        savedAt: Date.now(),
    };
}

function dispatchSyntheticInput(element) {
    element?.dispatchEvent(new Event('input', { bubbles: true }));
}

export function saveDraftNow() {
    const storage = getSafeStorage();
    if (!storage) return;

    try {
        const payload = normalizeDraftPayload();

        if (!payload.guestName && !payload.memoryText) {
            storage.removeItem(CONFIG.draftStorageKey);
            return;
        }

        storage.setItem(CONFIG.draftStorageKey, JSON.stringify(payload));
    } catch (error) {
        console.warn('No se pudo guardar el draft del formulario.', error);
    }
}

export function scheduleDraftSave() {
    if (draftSaveTimer) {
        window.clearTimeout(draftSaveTimer);
    }

    draftSaveTimer = window.setTimeout(() => {
        draftSaveTimer = null;
        saveDraftNow();
    }, CONFIG.draftSaveDebounceMs);
}

export function flushDraftSave() {
    if (draftSaveTimer) {
        window.clearTimeout(draftSaveTimer);
        draftSaveTimer = null;
    }

    saveDraftNow();
}

export function clearDraft() {
    if (draftSaveTimer) {
        window.clearTimeout(draftSaveTimer);
        draftSaveTimer = null;
    }

    const storage = getSafeStorage();
    if (!storage) return;

    try {
        storage.removeItem(CONFIG.draftStorageKey);
    } catch (error) {
        console.warn('No se pudo limpiar el draft del formulario.', error);
    }
}

export function restoreDraft() {
    const storage = getSafeStorage();
    if (!storage) return;

    try {
        const rawDraft = storage.getItem(CONFIG.draftStorageKey);
        if (!rawDraft) return;

        const parsedDraft = JSON.parse(rawDraft);

        const guestName = String(parsedDraft?.guestName || '')
            .trim()
            .slice(0, CONFIG.maxNameLength);

        const memoryText = String(parsedDraft?.memoryText || '')
            .trim()
            .slice(0, CONFIG.maxMessageLength);

        let restoredSomething = false;

        if (!elements.guestNameInput.value.trim() && guestName) {
            elements.guestNameInput.value = guestName;
            restoredSomething = true;
        }

        if (!elements.memoryTextInput.value.trim() && memoryText) {
            elements.memoryTextInput.value = memoryText;
            restoredSomething = true;
        }

        if (restoredSomething) {
            dispatchSyntheticInput(elements.guestNameInput);
            dispatchSyntheticInput(elements.memoryTextInput);
        }

        updatePreview();
    } catch (error) {
        console.warn('No se pudo restaurar el draft del formulario.', error);
    }
}

export function bindDraftPersistence() {
    elements.guestNameInput.addEventListener('input', scheduleDraftSave);
    elements.memoryTextInput.addEventListener('input', scheduleDraftSave);
}