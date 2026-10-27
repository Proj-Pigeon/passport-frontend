import { Alert, Badge, Button, Group, Stack, Switch, Tabs, Text, Textarea } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  getAdminComplianceDocuments,
  updateAdminComplianceDocuments,
} from '@/api/endpoints/admin/operations';
import { AccountPageHeader, SectionCard } from '@/components/AccountSections';
import { describeApiError } from '@/i18n/errors';

import { AdminPageContainer } from '../components/AdminPageShell';
import { adminKeys } from '../keys';
import { useAdminSession } from '../session/useAdminSession';
import { useAdminStepUp } from '../step-up/useAdminStepUp';

export function AdminComplianceDocumentsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: session } = useAdminSession();
  const stepUp = useAdminStepUp();
  const query = useQuery({
    queryKey: ['admin-compliance-documents'],
    queryFn: ({ signal }) => getAdminComplianceDocuments(signal),
  });
  const [activeTab, setActiveTab] = useState<string>('terms');
  const [termsDraft, setTerms] = useState<string | null>(null);
  const [privacyDraft, setPrivacy] = useState<string | null>(null);
  const [crossBorderDraft, setCrossBorder] = useState<string | null>(null);
  const [crossBorderEnabledDraft, setCrossBorderEnabled] = useState<boolean | null>(null);
  const terms = termsDraft ?? query.data?.terms_markdown ?? '';
  const privacy = privacyDraft ?? query.data?.privacy_markdown ?? '';
  const crossBorder = crossBorderDraft ?? query.data?.cross_border_markdown ?? '';
  const crossBorderEnabled = crossBorderEnabledDraft ?? query.data?.cross_border_enabled ?? false;

  const mutation = useMutation({
    mutationFn: () =>
      stepUp.runWithAdminStepUp(() =>
        updateAdminComplianceDocuments({
          terms_markdown: terms,
          privacy_markdown: privacy,
          cross_border_enabled: crossBorderEnabled,
          cross_border_markdown: crossBorder,
        }),
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(['admin-compliance-documents'], data);
      queryClient.invalidateQueries({ queryKey: adminKeys.session });
      setTerms(null);
      setPrivacy(null);
      setCrossBorder(null);
      setCrossBorderEnabled(null);
    },
  });
  const canWrite = session?.capabilities.includes('config:write') ?? false;
  const saveDisabled =
    !canWrite ||
    query.isPending ||
    !terms.trim() ||
    !privacy.trim() ||
    (crossBorderEnabled && !crossBorder.trim());

  return (
    <AdminPageContainer maw={1080}>
      <AccountPageHeader
        title={t('admin.compliance.title')}
        subtitle={t('admin.compliance.subtitle')}
        actions={
          <Button
            size="xs"
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={saveDisabled}
          >
            {t('common.save')}
          </Button>
        }
      />
      {query.isError && (
        <Alert color="red" withCloseButton={false}>
          {describeApiError(query.error)}
        </Alert>
      )}
      {mutation.isError && (
        <Alert color="red" withCloseButton={false}>
          {describeApiError(mutation.error)}
        </Alert>
      )}
      <SectionCard
        title={t('admin.compliance.title')}
        description={t('admin.compliance.markdownHint')}
      >
        <Tabs
          value={activeTab}
          onChange={(next) => {
            if (next) setActiveTab(next);
          }}
        >
          <Tabs.List style={{ flexWrap: 'nowrap', overflowX: 'auto' }}>
            <Tabs.Tab value="terms">{t('admin.compliance.termsTitle')}</Tabs.Tab>
            <Tabs.Tab value="privacy">{t('admin.compliance.privacyTitle')}</Tabs.Tab>
            <Tabs.Tab
              value="crossBorder"
              rightSection={
                <Badge size="xs" variant="light" color={crossBorderEnabled ? 'green' : 'gray'}>
                  {crossBorderEnabled ? t('common.enabled') : t('common.disabled')}
                </Badge>
              }
            >
              {t('admin.compliance.crossBorderTitle')}
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="terms" pt="md">
            <Textarea
              aria-label={t('admin.compliance.termsTitle')}
              value={terms}
              onChange={(event) => setTerms(event.currentTarget.value)}
              minRows={12}
              autosize
              disabled={!canWrite || query.isPending || mutation.isPending}
            />
          </Tabs.Panel>

          <Tabs.Panel value="privacy" pt="md">
            <Textarea
              aria-label={t('admin.compliance.privacyTitle')}
              value={privacy}
              onChange={(event) => setPrivacy(event.currentTarget.value)}
              minRows={12}
              autosize
              disabled={!canWrite || query.isPending || mutation.isPending}
            />
          </Tabs.Panel>

          <Tabs.Panel value="crossBorder" pt="md">
            <Stack gap="md">
              <Group justify="space-between" wrap="wrap">
                <Switch
                  checked={crossBorderEnabled}
                  onChange={(event) => setCrossBorderEnabled(event.currentTarget.checked)}
                  label={t('admin.compliance.crossBorderEnabled')}
                  disabled={!canWrite || query.isPending || mutation.isPending}
                />
                <Text size="xs" c="dimmed">
                  {t('admin.compliance.crossBorderHint')}
                </Text>
              </Group>
              <Textarea
                aria-label={t('admin.compliance.crossBorderTitle')}
                value={crossBorder}
                onChange={(event) => setCrossBorder(event.currentTarget.value)}
                minRows={10}
                autosize
                disabled={!canWrite || !crossBorderEnabled || query.isPending || mutation.isPending}
              />
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </SectionCard>
    </AdminPageContainer>
  );
}
