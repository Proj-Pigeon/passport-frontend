import { afterEach, describe, expect, it, vi } from 'vitest';

import { AVATAR_CROP_SIZE, computeCropRect, renderAvatarCrop } from './avatarCrop';
import { AVATAR_MAX_BYTES } from './image';

const IMAGE = {} as CanvasImageSource;

function blobOf(bytes: number, type: string): Blob {
  return new Blob([new Uint8Array(bytes)], { type });
}

interface StubCanvas {
  drawImage: ReturnType<typeof vi.fn>;
  encode: (type: string) => Blob | null;
}

function stubCanvas(encode: (type: string) => Blob | null, withContext = true): StubCanvas {
  const drawImage = vi.fn();
  const toBlob = vi.fn((callback: (blob: Blob | null) => void, type: string) => {
    callback(encode(type));
  });
  const canvas = {
    width: 0,
    height: 0,
    getContext: withContext ? () => ({ drawImage }) : () => null,
    toBlob,
  };
  const original = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
    if (tagName === 'canvas') {
      return canvas as unknown as HTMLCanvasElement;
    }
    return original(tagName);
  }) as typeof document.createElement);
  return { drawImage, encode };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('computeCropRect', () => {
  it('maps the visible viewport back to source pixels', () => {
    expect(
      computeCropRect({
        imageWidth: 1024,
        imageHeight: 512,
        viewport: 320,
        displayedWidth: 640,
        offset: { x: -160, y: 0 },
      }),
    ).toEqual({ sx: 256, sy: 0, sw: 512, sh: 512 });
  });

  it('clamps the rect inside the image bounds', () => {
    expect(
      computeCropRect({
        imageWidth: 256,
        imageHeight: 256,
        viewport: 320,
        displayedWidth: 640,
        offset: { x: -1000, y: -1000 },
      }),
    ).toEqual({ sx: 256, sy: 256, sw: 0, sh: 0 });
  });
});

describe('renderAvatarCrop', () => {
  const rect = { sx: 0, sy: 0, sw: 512, sh: 512 };

  it('draws the source rect into a square canvas and keeps the media type', async () => {
    const stub = stubCanvas((type) => blobOf(64, type));

    await expect(renderAvatarCrop(IMAGE, rect, 'image/png')).resolves.toEqual({
      ok: true,
      blob: expect.any(Blob),
      mediaType: 'image/png',
    });
    expect(stub.drawImage).toHaveBeenCalledWith(
      IMAGE,
      rect.sx,
      rect.sy,
      rect.sw,
      rect.sh,
      0,
      0,
      AVATAR_CROP_SIZE,
      AVATAR_CROP_SIZE,
    );
  });

  it('falls back to JPEG when an encoded PNG exceeds the byte limit', async () => {
    stubCanvas((type) => blobOf(type === 'image/png' ? AVATAR_MAX_BYTES + 1 : 64, type));

    await expect(renderAvatarCrop(IMAGE, rect, 'image/png')).resolves.toMatchObject({
      ok: true,
      mediaType: 'image/jpeg',
    });
  });

  it('reports too_large when every encode exceeds the byte limit', async () => {
    stubCanvas((type) => blobOf(AVATAR_MAX_BYTES + 1, type));

    await expect(renderAvatarCrop(IMAGE, rect, 'image/jpeg')).resolves.toEqual({
      ok: false,
      issue: 'too_large',
    });
  });

  it('reports encode_failed when the canvas context is unavailable', async () => {
    stubCanvas(() => blobOf(64, 'image/png'), false);

    await expect(renderAvatarCrop(IMAGE, rect, 'image/png')).resolves.toEqual({
      ok: false,
      issue: 'encode_failed',
    });
  });

  it('reports encode_failed when the encoder produces no blob', async () => {
    stubCanvas(() => null);

    await expect(renderAvatarCrop(IMAGE, rect, 'image/png')).resolves.toEqual({
      ok: false,
      issue: 'encode_failed',
    });
  });
});
