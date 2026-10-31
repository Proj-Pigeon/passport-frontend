import { Alert, Button, Group, Stack, Text, Textarea } from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { isApiError } from '@/api/errors';
import { RequestIdText } from '@/components/RequestIdText';
import { describeApiError } from '@/i18n/errors';

export interface JsonConfigEditorProps {
  initial: Record<string, unknown>;
  onSave: (configuration: Record<string, unknown>) => void;
  pending?: boolean;
  error?: unknown;
  disabled?: boolean;
  disabledReason?: string;
}

function formatJson(value: Record<string, unknown>): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function JsonConfigEditor({
  initial,
  onSave,
  pending,
  error,
  disabled,
  disabledReason,
}: JsonConfigEditorProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(() => formatJson(initial));
  const [parseError, setParseError] = useState<string | null>(null);

  const submit = () => {
    try {
      const parsed: unknown = JSON.parse(draft);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        setParseError(t('admin.config.mustBeObject'));
        return;
      }
      setParseError(null);
      onSave(parsed as Record<string, unknown>);
    } catch {
      setParseError(t('admin.config.invalidJson'));
    }
  };

  const conflict =
    isApiError(error) && (error.code === 'precondition_failed' || error.status === 412);

  return (
    <Stack gap="sm">
      <Textarea
        label={t('admin.config.editorLabel')}
        description={t('admin.config.editorHint')}
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        error={parseError ?? undefined}
        autosize
        minRows={6}
        maxRows={24}
        ff="monospace"
        readOnly={disabled}
      />
      {disabled && disabledReason && (
        <Alert color="yellow" variant="light">
          <Text size="sm">{disabledReason}</Text>
        </Alert>
      )}
      {Boolean(error) && (
        <Alert color="red" variant="light" role="alert" title={t('errors.title')}>
          <Stack gap={6}>
            <Text size="sm">{describeApiError(error)}</Text>
            {conflict && (
              <Text size="xs" c="dimmed">
                {t('admin.config.conflictHint')}
              </Text>
            )}
            <RequestIdText requestId={isApiError(error) ? error.requestId : null} />
          </Stack>
        </Alert>
      )}
      <Group justify="flex-end">
        <Button disabled={disabled || parseError !== null} loading={pending} onClick={submit}>
          {t('admin.config.save')}
        </Button>
      </Group>
    </Stack>
  );
}
