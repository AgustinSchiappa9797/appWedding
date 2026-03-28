const guestForm = document.getElementById('guest-form');

export const elements = {
  guestForm,
  guestNameInput: document.getElementById('guest-name'),
  memoryTextInput: document.getElementById('memory-text'),
  memoryImageInput: document.getElementById('memory-image'),
  formMessage: document.getElementById('form-message'),
  previewName: document.getElementById('preview-name'),
  previewDate: document.getElementById('preview-date'),
  previewText: document.getElementById('preview-text'),
  previewImage: document.getElementById('preview-image'),
  previewImageWrap: document.getElementById('preview-image-wrap'),
  galleryGrid: document.getElementById('gallery-grid'),
  submitButton: guestForm.querySelector('button[type="submit"]'),
};
