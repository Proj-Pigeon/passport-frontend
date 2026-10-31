import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { SubmitErrorAlert } from '@/features/auth/components/SubmitErrorAlert';

export interface ReasonModalProps {
  opened: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  confirmColor?: string;
  confirmDisabled?: boolean;
  pending?: boolean;
  error?: unknown;
  errorHint?: ReactNode;
  extraFields?: ReactNode;
  size?: string | number;
  onSubmit: () => void;
}

export function ReasonModal({
  opened,
  onClose,
  title,
  pending,
  size,
  description,
  extraFields,
  error,
  errorHint,
  confirmColor,
  confirmDisabled,
  onSubmit,
  confirmLabel,
}: ReasonModalProps) {
  const { t } = useTranslation();
  return (
    <Modal
      opened={opened}
      onClose={() => {
        if (!pending) onClose();
      }}
      closeOnClickOutside={!pending}
      closeOnEscape={!pending}
      withCloseButton={!pending}
      title={title}
      size={size}
      withinPortal
    >
      <Stack gap="sm">
        {description && <Text size="sm">{description}</Text>}
        {extraFields}
        <SubmitErrorAlert error={error} hint={errorHint} />
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button
            color={confirmColor}
            disabled={confirmDisabled}
            loading={pending}
            onClick={onSubmit}
          >
            {confirmLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
