export const AVATAR_MAX_BYTES = 512 * 1024;
export const AVATAR_MIN_DIMENSION = 1;
export const AVATAR_MAX_DIMENSION = 2048;

export const AVATAR_MEDIA_TYPES = ['image/jpeg', 'image/png'] as const;

export type AvatarMediaType = (typeof AVATAR_MEDIA_TYPES)[number];

export type AvatarIssue =
  | 'unsupported_media_type'
  | 'media_type_mismatch'
  | 'too_large'
  | 'invalid_image'
  | 'invalid_dimensions'
  | 'read_failed';

export interface PreparedAvatar {
  blob: Blob;
  mediaType: AvatarMediaType;
  width: number;
  height: number;
  size: number;
}

export type AvatarPrepareResult =
  { ok: true; avatar: PreparedAvatar } | { ok: false; issue: AvatarIssue };

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) {
    return false;
  }
  return signature.every((value, index) => bytes[index] === value);
}

export function detectImageMediaType(bytes: Uint8Array): AvatarMediaType | null {
  if (startsWith(bytes, PNG_SIGNATURE)) {
    return 'image/png';
  }
  if (startsWith(bytes, JPEG_SIGNATURE)) {
    return 'image/jpeg';
  }
  return null;
}

export function isAvatarMediaType(value: string): value is AvatarMediaType {
  return (AVATAR_MEDIA_TYPES as readonly string[]).includes(value);
}

export interface ImageDimensions {
  width: number;
  height: number;
}

export async function readImageDimensions(blob: Blob): Promise<ImageDimensions | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob);
      const dimensions = { width: bitmap.width, height: bitmap.height };
      bitmap.close?.();
      return dimensions;
    } catch {
      return null;
    }
  }

  if (typeof Image === 'undefined' || typeof URL?.createObjectURL !== 'function') {
    return null;
  }

  const url = URL.createObjectURL(blob);
  try {
    return await new Promise<ImageDimensions | null>((resolve) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => resolve(null);
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function rejected(issue: AvatarIssue): AvatarPrepareResult {
  return { ok: false, issue };
}

export async function prepareAvatarFile(file: Blob): Promise<AvatarPrepareResult> {
  if (file.size > AVATAR_MAX_BYTES) {
    return rejected('too_large');
  }

  let buffer: ArrayBuffer;
  try {
    buffer = await file.arrayBuffer();
  } catch {
    return rejected('read_failed');
  }

  if (file.type.length > 0 && !isAvatarMediaType(file.type)) {
    return rejected('unsupported_media_type');
  }

  const detected = detectImageMediaType(new Uint8Array(buffer));
  if (!detected) {
    return rejected('invalid_image');
  }
  if (file.type.length > 0 && file.type !== detected) {
    return rejected('media_type_mismatch');
  }

  const dimensions = await readImageDimensions(new Blob([buffer], { type: detected }));
  if (!dimensions) {
    return rejected('invalid_image');
  }
  const { width, height } = dimensions;
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < AVATAR_MIN_DIMENSION ||
    height < AVATAR_MIN_DIMENSION ||
    width > AVATAR_MAX_DIMENSION ||
    height > AVATAR_MAX_DIMENSION
  ) {
    return rejected('invalid_dimensions');
  }

  return {
    ok: true,
    avatar: {
      blob: new Blob([buffer], { type: detected }),
      mediaType: detected,
      width,
      height,
      size: buffer.byteLength,
    },
  };
}
