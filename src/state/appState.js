const initialState = {
  previewObjectUrl: null,
  processedImageFile: null,
  selectedImageMeta: null,
  submitting: false,
  signingIn: false,
  galleryLoading: false,
  galleryLoadingMore: false,
  galleryRealtimeChannel: null,
  galleryRealtimeReloadTimer: null,
  galleryItems: [],
  galleryOffset: 0,
  galleryHasMore: true,
  hasLoadedGalleryOnce: false,
  captchaToken: null,
  adminCaptchaToken: null,
  sessionReady: false,
};

const listeners = new Set();

function emitChange(change) {
  listeners.forEach((listener) => {
    try {
      listener(state, change);
    } catch (error) {
      console.error('Error en listener de estado:', error);
    }
  });
}

export const state = new Proxy({ ...initialState }, {
  set(target, key, value) {
    const previousValue = target[key];

    if (Object.is(previousValue, value)) {
      return true;
    }

    target[key] = value;

    emitChange({
      key,
      value,
      previousValue,
      snapshot: { ...target },
    });

    return true;
  },
});

export function setState(keyOrPatch, value) {
  if (typeof keyOrPatch === 'string') {
    state[keyOrPatch] = value;
    return;
  }

  if (!keyOrPatch || typeof keyOrPatch !== 'object') {
    return;
  }

  Object.entries(keyOrPatch).forEach(([key, nextValue]) => {
    state[key] = nextValue;
  });
}

export function subscribeState(listener) {
  if (typeof listener !== 'function') {
    throw new Error('subscribeState requiere una función.');
  }

  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function resetState() {
  setState(initialState);
}