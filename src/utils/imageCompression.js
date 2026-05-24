import { CONFIG } from '../config/constants.js';

function loadImageFromBlob(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('No pudimos procesar esa imagen. Probá con otra.'));
    };

    image.src = objectUrl;
  });
}

function getOutputDimensions(width, height) {
  const maxDimension = CONFIG.compressionMaxDimension;

  if (!width || !height) {
    return { width: maxDimension, height: maxDimension };
  }

  const longestSide = Math.max(width, height);

  if (longestSide <= maxDimension) {
    return { width, height };
  }

  const scale = maxDimension / longestSide;

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function blobFromCanvas(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('No pudimos comprimir la imagen.'));
        return;
      }

      resolve(blob);
    }, type, quality);
  });
}

function buildCompressedFile(blob, originalFile, forcedExtension = 'jpg') {
  const baseName = String(originalFile?.name || 'recuerdo')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/^-+|-+$/g, '') || 'recuerdo';

  const outputType = blob.type || 'image/jpeg';
  const outputExtension = outputType === 'image/webp' ? 'webp' : forcedExtension;
  const outputName = `${baseName}.${outputExtension}`;

  return new File([blob], outputName, {
    type: outputType,
    lastModified: Date.now(),
  });
}

export function formatBytes(bytes) {
  const size = Number(bytes) || 0;

  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (size >= 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }

  return `${size} B`;
}

export async function compressImageForUpload(file) {
  if (!file) {
    return {
      file: null,
      compressed: false,
      originalSize: 0,
      finalSize: 0,
      savingsPercent: 0,
    };
  }

  const isAlreadySmall = file.size <= CONFIG.compressionTargetBytes;
  const prefersOriginalFormat = file.type === 'image/webp';
  const outputType = prefersOriginalFormat ? 'image/webp' : 'image/jpeg';
  const forcedExtension = prefersOriginalFormat ? 'webp' : 'jpg';

  const image = await loadImageFromBlob(file);
  const { width, height } = getOutputDimensions(image.naturalWidth || image.width, image.naturalHeight || image.height);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d', { alpha: false });

  if (!context) {
    throw new Error('No pudimos preparar la compresión de la imagen.');
  }

  context.drawImage(image, 0, 0, width, height);

  let quality = CONFIG.compressionInitialQuality;
  let bestBlob = await blobFromCanvas(canvas, outputType, quality);

  while (bestBlob.size > CONFIG.compressionTargetBytes && quality > CONFIG.compressionMinQuality) {
    quality = Math.max(CONFIG.compressionMinQuality, Number((quality - 0.08).toFixed(2)));
    bestBlob = await blobFromCanvas(canvas, outputType, quality);

    if (quality === CONFIG.compressionMinQuality) {
      break;
    }
  }

  if (bestBlob.size >= file.size && isAlreadySmall && width === image.naturalWidth && height === image.naturalHeight) {
    return {
      file,
      compressed: false,
      originalSize: file.size,
      finalSize: file.size,
      savingsPercent: 0,
      width,
      height,
    };
  }

  const compressedFile = buildCompressedFile(bestBlob, file, forcedExtension);
  const savingsPercent = file.size > 0
    ? Math.max(0, Math.round(((file.size - compressedFile.size) / file.size) * 100))
    : 0;

  return {
    file: compressedFile,
    compressed: compressedFile.size < file.size || compressedFile.type !== file.type,
    originalSize: file.size,
    finalSize: compressedFile.size,
    savingsPercent,
    width,
    height,
  };
}
