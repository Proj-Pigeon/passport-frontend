import { Box, Button, Group, Modal, Slider, Stack, Text } from '@mantine/core';
import { useElementSize } from '@mantine/hooks';
import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { fieldErrorI18nKey } from '@/api/errors';
import { computeCropRect, renderAvatarCrop } from '@/lib/avatarCrop';
import type { AvatarMediaType, CropImageSource } from '@/lib/image';

const VIEWPORT_FALLBACK = 176;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

export interface AvatarCropResult {
  blob: Blob;
  mediaType: AvatarMediaType;
}

export interface AvatarCropModalProps {
  source: CropImageSource | null;
  onCancel: () => void;
  onConfirm: (result: AvatarCropResult) => void;
}

interface Offset {
  x: number;
  y: number;
}

function clampOffset(
  offset: Offset,
  displayed: { width: number; height: number },
  viewport: number,
): Offset {
  return {
    x: Math.min(Math.max(offset.x, viewport - displayed.width), 0),
    y: Math.min(Math.max(offset.y, viewport - displayed.height), 0),
  };
}

export function AvatarCropModal({ source, onCancel, onConfirm }: AvatarCropModalProps) {
  const { t } = useTranslation();
  const { ref: containerRef, width: measured } = useElementSize<HTMLDivElement>();
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    base: Offset;
  } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [exporting, setExporting] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);

  const viewport = measured > 0 ? measured : VIEWPORT_FALLBACK;
  const coverScale = source ? Math.max(viewport / source.width, viewport / source.height) : 1;
  const pixelsPerSourcePx = coverScale * zoom;
  const displayed = {
    width: (source?.width ?? 0) * pixelsPerSourcePx,
    height: (source?.height ?? 0) * pixelsPerSourcePx,
  };
  const boundedOffset = clampOffset(offset, displayed, viewport);

  const applyZoom = (next: number) => {
    const center = {
      x: boundedOffset.x + displayed.width / 2,
      y: boundedOffset.y + displayed.height / 2,
    };
    const nextDisplayed = {
      width: (source?.width ?? 0) * coverScale * next,
      height: (source?.height ?? 0) * coverScale * next,
    };
    setZoom(next);
    setOffset(
      clampOffset(
        { x: center.x - nextDisplayed.width / 2, y: center.y - nextDisplayed.height / 2 },
        nextDisplayed,
        viewport,
      ),
    );
  };

  const handleImageLoad = () => {
    setLoaded(true);
    setOffset(
      clampOffset(
        { x: (viewport - displayed.width) / 2, y: (viewport - displayed.height) / 2 },
        displayed,
        viewport,
      ),
    );
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!loaded) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      base: boundedOffset,
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    setOffset(
      clampOffset(
        {
          x: drag.base.x + (event.clientX - drag.startX),
          y: drag.base.y + (event.clientY - drag.startY),
        },
        displayed,
        viewport,
      ),
    );
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  };

  const handleConfirm = async () => {
    const image = imageRef.current;
    if (!source || !image || !loaded || exporting) {
      return;
    }
    setExporting(true);
    setIssue(null);
    try {
      const rect = computeCropRect({
        imageWidth: source.width,
        imageHeight: source.height,
        viewport,
        displayedWidth: displayed.width,
        offset: boundedOffset,
      });
      const result = await renderAvatarCrop(image, rect, source.mediaType);
      if (!result.ok) {
        setIssue(t(fieldErrorI18nKey('avatar', result.issue)));
        return;
      }
      onConfirm({ blob: result.blob, mediaType: result.mediaType });
    } catch {
      setIssue(t(fieldErrorI18nKey('avatar', 'encode_failed')));
    } finally {
      setExporting(false);
    }
  };

  return (
    <Modal
      opened={source !== null}
      onClose={onCancel}
      title={t('account.avatar.cropTitle')}
      size="min(400px, calc(100vw - 32px))"
      closeOnClickOutside={false}
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {t('account.avatar.cropHint')}
        </Text>
        {source && (
          <Box
            ref={containerRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{
              position: 'relative',
              width: 'min(176px, 100%)',
              marginInline: 'auto',
              aspectRatio: '1',
              borderRadius: '50%',
              overflow: 'hidden',
              touchAction: 'none',
              cursor: loaded ? 'grab' : 'default',
              backgroundColor: 'var(--mantine-color-body)',
            }}
          >
            <img
              ref={imageRef}
              src={source.url}
              alt={t('account.avatar.cropTitle')}
              onLoad={handleImageLoad}
              draggable={false}
              style={{
                position: 'absolute',
                left: boundedOffset.x,
                top: boundedOffset.y,
                width: displayed.width,
                height: displayed.height,
                maxWidth: 'none',
                userSelect: 'none',
                pointerEvents: 'none',
              }}
            />
          </Box>
        )}
        <Slider
          aria-label={t('account.avatar.cropZoom')}
          label={(value) => `${Math.round(value * 100)}%`}
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.05}
          value={zoom}
          onChange={applyZoom}
          disabled={!loaded || exporting}
        />
        {issue && (
          <Text size="sm" c="red">
            {issue}
          </Text>
        )}
        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" onClick={onCancel} disabled={exporting}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleConfirm} loading={exporting} disabled={!loaded}>
            {t('account.avatar.cropConfirm')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
