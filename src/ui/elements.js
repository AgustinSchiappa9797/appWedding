const guestForm = document.getElementById('guest-form');

export const elements = {
  guestForm,
  guestNameInput: document.getElementById('guest-name'),
  guestNameCounter: document.getElementById('guest-name-counter'),
  memoryTextInput: document.getElementById('memory-text'),
  memoryTextCounter: document.getElementById('memory-text-counter'),
  memoryImageInput: document.getElementById('memory-image'),
  formMessage: document.getElementById('form-message'),
  previewName: document.getElementById('preview-name'),
  previewDate: document.getElementById('preview-date'),
  previewText: document.getElementById('preview-text'),
  previewImage: document.getElementById('preview-image'),
  previewImageWrap: document.getElementById('preview-image-wrap'),
  galleryGrid: document.getElementById('gallery-grid'),
  galleryActions: document.getElementById('gallery-actions'),
  galleryLoadMoreButton: document.getElementById('gallery-load-more'),
  galleryLoadMoreStatus: document.getElementById('gallery-load-more-status'),
  galleryLoadMoreSentinel: document.getElementById('gallery-load-more-sentinel'),
  submitButton: guestForm.querySelector('button[type="submit"]'),
};