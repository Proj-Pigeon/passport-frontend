import { Button, Group, Modal, Stack, Text, Textarea } from '@mantine/core';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { SubmitErrorAlert } from '@/features/auth/components/SubmitErrorAlert';

export interface ReasonModalProps {
  opened: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  confirmColor?: string;
  pending?: boolean;
  required?: boolean;
  error?: unknown;
  errorHint?: ReactNode;
  extraFields?: ReactNode;
  onSubmit: (reason: string) => void;
}

const MAX_REASON_LENGTH = 1000;

export function ReasonModal(props: ReasonModalProps) {
  const { opened, onClose, title } = props;
  return (
    <Modal opened={opened} onClose={onClose} title={title} withinPortal>
      <ReasonForm {...props} />
    </Modal>
  );
}

function ReasonForm({
  description,
  confirmLabel,
  confirmColor,
  pending,
  required,
  error,
  errorHint,
  extraFields,
  onClose,
  onSubmit,
}: ReasonModalProps) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');

  const trimmed = reason.trim();
  const invalid = [...trimmed].length > MAX_REASON_LENGTH || (required && trimmed.length === 0);

  return (
    <Stack gap="sm">
      {description && <Text size="sm">{description}</Text>}
      {extraFields}
      <Textarea
        label={t('admin.reason.label')}
        description={t('admin.reason.hint')}
        placeholder={t('admin.reason.placeholder')}
        value={reason}
        onChange={(event) => setReason(event.currentTarget.value)}
        autosize
        minRows={2}
        maxRows={6}
        data-autofocus
        required={required}
      />
      <SubmitErrorAlert error={error} hint={errorHint} />
      <Group justify="flex-end" gap="sm">
        <Button variant="default" onClick={onClose} disabled={pending}>
          {t('common.cancel')}
        </Button>
        <Button
          color={confirmColor}
          disabled={invalid}
          loading={pending}
          onClick={() => onSubmit(trimmed)}
        >
          {confirmLabel}
        </Button>
      </Group>
    </Stack>
  );
}
