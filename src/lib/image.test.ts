import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AVATAR_MAX_BYTES,
  detectImageMediaType,
  prepareAvatarFile,
  readImageDimensions,
} from './image';

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_HEADER = [0xff, 0xd8, 0xff, 0xe0];
const GIF_HEADER = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];

function content(header: readonly number[], totalBytes = header.length + 32): Uint8Array {
  const bytes = new Uint8Array(totalBytes);
  bytes.set(header, 0);
  return bytes;
}

function fileOf(bytes: Uint8Array, name: string, type: string): File {
  return new File([bytes.buffer as ArrayBuffer], name, { type });
}

function blobOf(header: readonly number[]): Blob {
  return new Blob([content(header).buffer as ArrayBuffer]);
}

function stubDimensions(width: number, height: number): void {
  vi.stubGlobal('createImageBitmap', async () => ({ width, height, close: () => {} }));
}

function stubUndecodable(): void {
  vi.stubGlobal('createImageBitmap', async () => {
    throw new Error('could not decode');
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('detectImageMediaType', () => {
  it('recognizes PNG and JPEG magic bytes', () => {
    expect(detectImageMediaType(content(PNG_HEADER))).toBe('image/png');
    expect(detectImageMediaType(content(JPEG_HEADER))).toBe('image/jpeg');
  });

  it('returns null for anything else', () => {
    expect(detectImageMediaType(content(GIF_HEADER))).toBeNull();
    expect(detectImageMediaType(new Uint8Array([0x89, 0x50]))).toBeNull();
  });
});

describe('readImageDimensions', () => {
  it('reads width and height from a bitmap', async () => {
    stubDimensions(320, 240);
    await expect(readImageDimensions(blobOf(PNG_HEADER))).resolves.toEqual({
      width: 320,
      height: 240,
    });
  });

  it('returns null when decoding fails', async () => {
    stubUndecodable();
    await expect(readImageDimensions(blobOf(PNG_HEADER))).resolves.toBeNull();
  });
});

describe('prepareAvatarFile', () => {
  it('accepts a PNG inside every limit', async () => {
    stubDimensions(512, 512);
    const result = await prepareAvatarFile(fileOf(content(PNG_HEADER), 'a.png', 'image/png'));

    expect(result).toMatchObject({
      ok: true,
      avatar: { mediaType: 'image/png', width: 512, height: 512 },
    });
  });

  it('accepts a file without a declared type', async () => {
    stubDimensions(64, 64);
    const result = await prepareAvatarFile(fileOf(content(JPEG_HEADER), 'a.bin', ''));

    expect(result).toMatchObject({ ok: true, avatar: { mediaType: 'image/jpeg' } });
  });

  it('rejects a file above the byte limit before reading it', async () => {
    const oversized = content(PNG_HEADER, AVATAR_MAX_BYTES + 1);
    await expect(prepareAvatarFile(fileOf(oversized, 'big.png', 'image/png'))).resolves.toEqual({
      ok: false,
      issue: 'too_large',
    });
  });

  it('rejects a declared type outside JPEG and PNG', async () => {
    await expect(
      prepareAvatarFile(fileOf(content(GIF_HEADER), 'a.gif', 'image/gif')),
    ).resolves.toEqual({ ok: false, issue: 'unsupported_media_type' });
  });

  it('rejects bytes that are not a supported image', async () => {
    await expect(
      prepareAvatarFile(fileOf(content(GIF_HEADER), 'a.png', 'image/png')),
    ).resolves.toEqual({ ok: false, issue: 'invalid_image' });
  });

  it('rejects a declared type that contradicts the magic bytes', async () => {
    await expect(
      prepareAvatarFile(fileOf(content(PNG_HEADER), 'a.jpg', 'image/jpeg')),
    ).resolves.toEqual({ ok: false, issue: 'media_type_mismatch' });
  });

  it('rejects undecodable bytes', async () => {
    stubUndecodable();
    await expect(
      prepareAvatarFile(fileOf(content(PNG_HEADER), 'a.png', 'image/png')),
    ).resolves.toEqual({ ok: false, issue: 'invalid_image' });
  });

  it('rejects dimensions outside 1 to 2048 pixels', async () => {
    stubDimensions(4096, 256);
    await expect(
      prepareAvatarFile(fileOf(content(PNG_HEADER), 'a.png', 'image/png')),
    ).resolves.toEqual({ ok: false, issue: 'invalid_dimensions' });

    stubDimensions(0, 256);
    await expect(
      prepareAvatarFile(fileOf(content(PNG_HEADER), 'a.png', 'image/png')),
    ).resolves.toEqual({ ok: false, issue: 'invalid_dimensions' });
  });
});
