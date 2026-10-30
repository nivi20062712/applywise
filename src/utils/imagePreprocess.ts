import type { OcrFailureReason } from '../types';

export interface ImagePreprocessResult {
  isImage: boolean;
  convertedFilename: string;
  convertedMimeType: string;
  convertedPngBase64?: string;
  preprocessedPngBase64?: string;
  originalWidth?: number;
  originalHeight?: number;
  exifOrientation?: number;
  wasRotated?: boolean;
  wasUpscaled?: boolean;
  edgeDensity?: number;
  textLikeBlockRatio?: number;
  isLikelyPhoto?: boolean;
  suspectedFailureReason?: OcrFailureReason;
}

// Longest side (px) of the image sent to the Upload Check API
const MAX_UPLOAD_IMAGE_SIDE = 2000;

/**
 * Reads JPEG/JFIF EXIF orientation tag (1..8) from an ArrayBuffer.
 */
export function readJpegExifOrientation(buffer: ArrayBuffer): number {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) {
    return 1;
  }

  let offset = 2;
  const length = view.byteLength;

  while (offset + 4 < length) {
    const marker = view.getUint16(offset, false);
    offset += 2;

    if (marker === 0xffe1) {
      const app1Length = view.getUint16(offset, false);
      if (offset + app1Length > length || app1Length < 10) return 1;

      // Check "Exif\0\0"
      if (view.getUint32(offset + 2, false) !== 0x45786966) return 1;

      const tiffOffset = offset + 8;
      if (tiffOffset + 8 > length) return 1;

      const littleEndian = view.getUint16(tiffOffset, false) === 0x4949;
      const firstIfdOffset = view.getUint32(tiffOffset + 4, littleEndian);
      const ifdStart = tiffOffset + firstIfdOffset;
      if (ifdStart + 2 > length) return 1;

      const entries = view.getUint16(ifdStart, littleEndian);
      for (let i = 0; i < entries; i++) {
        const entryOffset = ifdStart + 2 + i * 12;
        if (entryOffset + 12 > length) break;
        const tag = view.getUint16(entryOffset, littleEndian);
        if (tag === 0x0112) {
          return view.getUint16(entryOffset + 8, littleEndian);
        }
      }
      return 1;
    } else if ((marker & 0xff00) !== 0xff00) {
      break;
    } else {
      const segLen = view.getUint16(offset, false);
      offset += segLen;
    }
  }

  return 1;
}

function loadHtmlImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

function applyExifTransform(
  ctx: CanvasRenderingContext2D,
  orientation: number,
  width: number,
  height: number
) {
  switch (orientation) {
    case 2:
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
      break;
    case 3:
      ctx.translate(width, height);
      ctx.rotate(Math.PI);
      break;
    case 4:
      ctx.translate(0, height);
      ctx.scale(1, -1);
      break;
    case 5:
      ctx.rotate(0.5 * Math.PI);
      ctx.scale(1, -1);
      break;
    case 6:
      ctx.rotate(0.5 * Math.PI);
      ctx.translate(0, -height);
      break;
    case 7:
      ctx.rotate(0.5 * Math.PI);
      ctx.translate(width, -height);
      ctx.scale(-1, 1);
      break;
    case 8:
      ctx.rotate(-0.5 * Math.PI);
      ctx.translate(-width, 0);
      break;
    default:
      break;
  }
}

/**
 * Converts .jfif/.jpg/.webp/.png to a compact JPEG/PNG on an HTML5 canvas (EXIF rotation fixed,
 * capped at 2000px),
 * and produces a preprocessed OCR version (upscaled to >= 1600px wide, grayscale,
 * increased contrast, and integral-image adaptive threshold).
 */
export async function preprocessImageFileForOcr(file: File): Promise<ImagePreprocessResult> {
  const isImage =
    file.type.startsWith('image/') ||
    /\.(jfif|jpe?g|webp|png|bmp|gif)$/i.test(file.name);

  if (!isImage || typeof document === 'undefined') {
    return {
      isImage: false,
      convertedFilename: file.name,
      convertedMimeType: file.type || 'application/octet-stream',
    };
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const exifOrientation = readJpegExifOrientation(arrayBuffer);
    const img = await loadHtmlImageFromBlob(file);

    const rawW = img.naturalWidth || img.width || 1;
    const rawH = img.naturalHeight || img.height || 1;

    const swapDims = exifOrientation >= 5 && exifOrientation <= 8;
    const orientedW = swapDims ? rawH : rawW;
    const orientedH = swapDims ? rawW : rawH;
    const wasRotated = exifOrientation > 1;

    // Cap the longest side so the upload stays well under the serverless request body limit
    // (full-resolution phone photos encoded as PNG easily exceed 6 MB and get rejected)
    const downscale = Math.min(1, MAX_UPLOAD_IMAGE_SIDE / Math.max(orientedW, orientedH));
    const baseW = Math.max(1, Math.round(orientedW * downscale));
    const baseH = Math.max(1, Math.round(orientedH * downscale));

    // Step 1: Convert .jfif/.jpg/.webp to a clean image on canvas with EXIF orientation fixed
    const baseCanvas = document.createElement('canvas');
    baseCanvas.width = baseW;
    baseCanvas.height = baseH;
    const baseCtx = baseCanvas.getContext('2d');
    if (!baseCtx) {
      throw new Error('Canvas 2D context unavailable');
    }

    baseCtx.save();
    baseCtx.scale(downscale, downscale);
    applyExifTransform(baseCtx, exifOrientation, rawW, rawH);
    baseCtx.drawImage(img, 0, 0, rawW, rawH);
    baseCtx.restore();

    // JPEG keeps photos/scans compact; PNG is only used when it is actually smaller
    const convertedJpegUrl = baseCanvas.toDataURL('image/jpeg', 0.9);
    const convertedIsJpeg = convertedJpegUrl.startsWith('data:image/jpeg');
    const convertedDataUrl = convertedIsJpeg ? convertedJpegUrl : baseCanvas.toDataURL('image/png');
    const convertedMimeType = convertedIsJpeg ? 'image/jpeg' : 'image/png';
    const convertedPngBase64 = convertedDataUrl.split(',')[1] || '';

    // Step 2: Preprocess on a second canvas:
    // - Upscale small images to at least 1600px wide
    // - Convert to grayscale
    // - Increase contrast
    // - Apply adaptive threshold
    const targetW = Math.max(1600, baseW);
    const scale = targetW / baseW;
    const targetH = Math.max(1, Math.round(baseH * scale));
    const wasUpscaled = targetW > orientedW;

    const procCanvas = document.createElement('canvas');
    procCanvas.width = targetW;
    procCanvas.height = targetH;
    const procCtx = procCanvas.getContext('2d');
    if (!procCtx) {
      throw new Error('Preprocess canvas 2D context unavailable');
    }

    procCtx.imageSmoothingEnabled = true;
    procCtx.imageSmoothingQuality = 'high';
    procCtx.drawImage(baseCanvas, 0, 0, targetW, targetH);

    const imgData = procCtx.getImageData(0, 0, targetW, targetH);
    const data = imgData.data;
    const numPixels = targetW * targetH;
    const gray = new Uint8Array(numPixels);

    // Grayscale + contrast stretch pass
    let minLum = 255;
    let maxLum = 0;
    let colorVarianceSum = 0;
    let brightBgCount = 0;

    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      gray[p] = lum;
      if (lum < minLum) minLum = lum;
      if (lum > maxLum) maxLum = lum;
      colorVarianceSum += Math.abs(r - g) + Math.abs(g - b) + Math.abs(r - b);
      if (lum > 200) brightBgCount++;
    }

    const lumRange = Math.max(1, maxLum - minLum);
    const contrastFactor = 1.45;

    for (let p = 0; p < numPixels; p++) {
      // Normalize to 0..255 and apply 1.45x contrast around midpoint 128
      const norm = ((gray[p] - minLum) / lumRange) * 255;
      const contrasted = Math.max(0, Math.min(255, Math.round((norm - 128) * contrastFactor + 128)));
      gray[p] = contrasted;
    }

    // Compute integral image for fast local adaptive thresholding (window radius = 15px)
    const integral = new Float64Array(numPixels);
    for (let y = 0; y < targetH; y++) {
      let rowSum = 0;
      const rowOffset = y * targetW;
      for (let x = 0; x < targetW; x++) {
        rowSum += gray[rowOffset + x];
        integral[rowOffset + x] = (y > 0 ? integral[(y - 1) * targetW + x] : 0) + rowSum;
      }
    }

    const radius = 16;
    const thresholdBias = 11;
    let highGradPixels = 0;

    for (let y = 0; y < targetH; y++) {
      const y1 = Math.max(0, y - radius);
      const y2 = Math.min(targetH - 1, y + radius);
      for (let x = 0; x < targetW; x++) {
        const x1 = Math.max(0, x - radius);
        const x2 = Math.min(targetW - 1, x + radius);
        const count = (x2 - x1 + 1) * (y2 - y1 + 1);

        const a = integral[y2 * targetW + x2];
        const b = y1 > 0 ? integral[(y1 - 1) * targetW + x2] : 0;
        const c = x1 > 0 ? integral[y2 * targetW + (x1 - 1)] : 0;
        const d = y1 > 0 && x1 > 0 ? integral[(y1 - 1) * targetW + (x1 - 1)] : 0;
        const localMean = (a - b - c + d) / count;

        const idx = y * targetW + x;
        const val = gray[idx];

        if (x > 0 && Math.abs(val - gray[idx - 1]) > 28) {
          highGradPixels++;
        }

        // Blend adaptive threshold with contrasted grayscale so characters stay crisp for both Tesseract & Vision LLMs
        const bin = val < localMean - thresholdBias ? 18 : 252;
        const out = Math.round(bin * 0.65 + val * 0.35);

        const rgbaIdx = idx * 4;
        data[rgbaIdx] = out;
        data[rgbaIdx + 1] = out;
        data[rgbaIdx + 2] = out;
        data[rgbaIdx + 3] = 255;
      }
    }

    procCtx.putImageData(imgData, 0, 0);
    const preprocessedDataUrl = procCanvas.toDataURL('image/png');
    const preprocessedPngBase64 = preprocessedDataUrl.split(',')[1] || '';

    const edgeDensity = highGradPixels / numPixels;
    const avgColorSpread = colorVarianceSum / numPixels;
    const brightBgRatio = brightBgCount / numPixels;

    // Heuristic diagnostics for Check A failure reasons:
    // - If original width < 600 or height < 400 -> 'too_small'
    // - If EXIF orientation was rotated or extreme aspect ratio -> 'rotated'
    // - If high color saturation + low bright background + very low text-like edges -> 'not_a_document'
    // - Otherwise -> 'blurry'
    const isLikelyPhoto =
      avgColorSpread > 45 && brightBgRatio < 0.18 && edgeDensity < 0.04;

    let suspectedFailureReason: OcrFailureReason = 'blurry';
    if (isLikelyPhoto) {
      suspectedFailureReason = 'not_a_document';
    } else if (rawW < 600 || rawH < 400) {
      suspectedFailureReason = 'too_small';
    } else if (wasRotated) {
      suspectedFailureReason = 'rotated';
    } else {
      suspectedFailureReason = 'blurry';
    }

    const cleanBase = file.name.replace(/\.[^.]+$/, '') || 'upload';

    return {
      isImage: true,
      convertedFilename: `${cleanBase}.${convertedIsJpeg ? 'jpg' : 'png'}`,
      convertedMimeType,
      convertedPngBase64,
      preprocessedPngBase64,
      originalWidth: rawW,
      originalHeight: rawH,
      exifOrientation,
      wasRotated,
      wasUpscaled,
      edgeDensity: Number(edgeDensity.toFixed(4)),
      isLikelyPhoto,
      suspectedFailureReason,
    };
  } catch {
    return {
      isImage: true,
      convertedFilename: file.name,
      convertedMimeType: file.type || 'image/png',
    };
  }
}
