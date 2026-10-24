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
  confirmDisabled?: boolean;
  pending?: boolean;
  required?: boolean;
  minReasonLength?: number;
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
  confirmDisabled,
  pending,
  required,
  minReasonLength = 1,
  error,
  errorHint,
  extraFields,
  onClose,
  onSubmit,
}: ReasonModalProps) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [blurred, setBlurred] = useState(false);

  const trimmed = reason.trim();
  const length = [...trimmed].length;
  const invalid =
    length > MAX_REASON_LENGTH || ((required || length > 0) && length < minReasonLength);
  const guidance = t('authorization.reasonLength', {
    min: minReasonLength,
    max: MAX_REASON_LENGTH,
  });

  return (
    <Stack gap="sm">
      {description && <Text size="sm">{description}</Text>}
      {extraFields}
      <Textarea
        label={t('admin.reason.label')}
        description={minReasonLength > 1 ? guidance : t('admin.reason.hint')}
        placeholder={t('admin.reason.placeholder')}
        value={reason}
        error={blurred && invalid ? guidance : undefined}
        onBlur={() => setBlurred(true)}
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
          disabled={invalid || confirmDisabled}
          loading={pending}
          onClick={() => onSubmit(trimmed)}
        >
          {confirmLabel}
        </Button>
      </Group>
    </Stack>
  );
}
