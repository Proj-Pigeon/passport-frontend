import { AVATAR_MAX_BYTES, type AvatarMediaType } from './image';

export const AVATAR_CROP_SIZE = 512;

export interface AvatarCropRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export interface AvatarCropParams {
  imageWidth: number;
  imageHeight: number;
  viewport: number;
  displayedWidth: number;
  offset: { x: number; y: number };
}

export type AvatarCropRenderResult =
  | { ok: true; blob: Blob; mediaType: AvatarMediaType }
  | { ok: false; issue: 'encode_failed' | 'too_large' };

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function computeCropRect(params: AvatarCropParams): AvatarCropRect {
  const pixelsPerSourcePx = params.displayedWidth / params.imageWidth;
  const sx = clamp(-params.offset.x / pixelsPerSourcePx, 0, params.imageWidth);
  const sy = clamp(-params.offset.y / pixelsPerSourcePx, 0, params.imageHeight);
  const sw = clamp(params.viewport / pixelsPerSourcePx, 0, params.imageWidth - sx);
  const sh = clamp(params.viewport / pixelsPerSourcePx, 0, params.imageHeight - sy);
  return { sx, sy, sw, sh };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob | null> {
  if (typeof canvas.toBlob !== 'function') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), type, quality);
    } catch {
      resolve(null);
    }
  });
}

export async function renderAvatarCrop(
  image: CanvasImageSource,
  rect: AvatarCropRect,
  mediaType: AvatarMediaType,
): Promise<AvatarCropRenderResult> {
  if (typeof document === 'undefined') {
    return { ok: false, issue: 'encode_failed' };
  }
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_CROP_SIZE;
  canvas.height = AVATAR_CROP_SIZE;
  const context = canvas.getContext('2d');
  if (!context) {
    return { ok: false, issue: 'encode_failed' };
  }
  try {
    context.drawImage(
      image,
      rect.sx,
      rect.sy,
      rect.sw,
      rect.sh,
      0,
      0,
      AVATAR_CROP_SIZE,
      AVATAR_CROP_SIZE,
    );
  } catch {
    return { ok: false, issue: 'encode_failed' };
  }

  let outputType: AvatarMediaType = mediaType;
  let blob = await canvasToBlob(canvas, outputType, 0.92);
  if (!blob) {
    return { ok: false, issue: 'encode_failed' };
  }
  if (blob.size > AVATAR_MAX_BYTES && outputType === 'image/png') {
    outputType = 'image/jpeg';
    blob = await canvasToBlob(canvas, outputType, 0.92);
    if (!blob) {
      return { ok: false, issue: 'encode_failed' };
    }
  }
  if (blob.size > AVATAR_MAX_BYTES && outputType === 'image/jpeg') {
    blob = await canvasToBlob(canvas, outputType, 0.75);
    if (!blob) {
      return { ok: false, issue: 'encode_failed' };
    }
  }
  if (blob.size > AVATAR_MAX_BYTES) {
    return { ok: false, issue: 'too_large' };
  }
  return { ok: true, blob, mediaType: outputType };
}
