import { ActionIcon, Badge, Group, Stack, Text, TextInput, Tooltip } from '@mantine/core';
import { IconCheck, IconPencil, IconTrash, IconX } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Passkey } from '@/api/types';
import { useFieldErrorText } from '@/i18n/errors';
import { formatDateTime } from '@/lib/format';
import { passkeyLabelSchema } from '@/lib/validators';

export interface PasskeyRowProps {
  passkey: Passkey;
  busy: boolean;
  onRename: (label: string) => Promise<unknown>;
  onDelete: () => void;
}

export function PasskeyRow({ passkey, busy, onRename, onDelete }: PasskeyRowProps) {
  const { t } = useTranslation();
  const errorText = useFieldErrorText();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(passkey.label);
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setDraft(passkey.label);
    setEditing(true);
  };

  const labelIssue = editing ? passkeyLabelSchema.safeParse(draft) : null;
  const invalid = labelIssue !== null && !labelIssue.success;
  const issueMessage =
    labelIssue && !labelIssue.success ? labelIssue.error.issues[0]?.message : undefined;

  const save = async () => {
    if (invalid || saving) {
      return;
    }
    setSaving(true);
    try {
      await onRename(draft.trim());
      setEditing(false);
    } catch {
      // surfaced as a notification by the mutation hook
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack gap={6} py="sm">
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
        <Stack gap={4} style={{ minWidth: 0, flex: 1 }}>
          {editing ? (
            <TextInput
              value={draft}
              onChange={(event) => setDraft(event.currentTarget.value)}
              error={errorText(issueMessage)}
              label={t('account.security.renameLabel')}
              size="sm"
              maxLength={80}
              autoFocus
              disabled={saving}
              rightSection={
                <Group gap={2} wrap="nowrap">
                  <Tooltip label={t('common.save')}>
                    <ActionIcon
                      variant="subtle"
                      color="teal"
                      aria-label={t('account.security.saveRename')}
                      onClick={() => void save()}
                      disabled={invalid || saving}
                      loading={saving}
                    >
                      <IconCheck size={16} stroke={1.5} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label={t('common.cancel')}>
                    <ActionIcon
                      variant="subtle"
                      aria-label={t('account.security.cancelRename')}
                      onClick={() => setEditing(false)}
                      disabled={saving}
                    >
                      <IconX size={16} stroke={1.5} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              }
              rightSectionWidth={64}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void save();
                }
                if (event.key === 'Escape') {
                  setEditing(false);
                }
              }}
            />
          ) : (
            <Text size="sm" fw={500} lineClamp={1}>
              {passkey.label.trim().length > 0 ? passkey.label : t('account.security.unnamed')}
            </Text>
          )}

          <Group gap="xs" wrap="wrap">
            <Text size="xs" c="dimmed">
              {t('account.security.createdAt', {
                time: formatDateTime(passkey.created_at) ?? t('account.overview.unknown'),
              })}
            </Text>
            {passkey.last_used_at && (
              <Text size="xs" c="dimmed">
                {t('account.security.lastUsedAt', {
                  time: formatDateTime(passkey.last_used_at) ?? t('account.overview.unknown'),
                })}
              </Text>
            )}
          </Group>

          <Group gap={4} wrap="wrap">
            {passkey.backup_eligible && (
              <Badge size="xs" variant="light" color="blue">
                {passkey.backup_state
                  ? t('account.security.synced')
                  : t('account.security.syncEligible')}
              </Badge>
            )}
            {passkey.transports.map((transport) => (
              <Badge key={transport} size="xs" variant="outline" color="gray">
                {t(`account.security.transport.${transport}`)}
              </Badge>
            ))}
          </Group>
        </Stack>

        <Group gap={4} wrap="nowrap">
          {!editing && (
            <>
              <Tooltip label={t('account.security.rename')}>
                <ActionIcon
                  variant="subtle"
                  aria-label={t('account.security.rename')}
                  onClick={startEdit}
                  disabled={busy}
                >
                  <IconPencil size={16} stroke={1.5} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label={t('common.delete')}>
                <ActionIcon
                  variant="subtle"
                  color="red"
                  aria-label={t('account.security.delete')}
                  onClick={onDelete}
                  disabled={busy}
                >
                  <IconTrash size={16} stroke={1.5} />
                </ActionIcon>
              </Tooltip>
            </>
          )}
        </Group>
      </Group>
    </Stack>
  );
}
