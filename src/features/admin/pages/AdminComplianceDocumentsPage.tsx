import { Alert, Button, Group, Stack, Switch, Textarea } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getAdminComplianceDocuments, updateAdminComplianceDocuments } from '@/api/endpoints/admin/operations';
import { AccountPageHeader, SectionCard } from '@/components/AccountSections';
import { describeApiError } from '@/i18n/errors';

import { adminKeys } from '../keys';
import { useAdminSession } from '../session/useAdminSession';
import { useAdminStepUp } from '../step-up/useAdminStepUp';

export function AdminComplianceDocumentsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: session } = useAdminSession();
  const stepUp = useAdminStepUp();
  const query = useQuery({ queryKey: ['admin-compliance-documents'], queryFn: ({ signal }) => getAdminComplianceDocuments(signal) });
  const [termsDraft, setTerms] = useState<string | null>(null);
  const [privacyDraft, setPrivacy] = useState<string | null>(null);
  const [crossBorderDraft, setCrossBorder] = useState<string | null>(null);
  const [crossBorderEnabledDraft, setCrossBorderEnabled] = useState<boolean | null>(null);
  const terms = termsDraft ?? query.data?.terms_markdown ?? '';
  const privacy = privacyDraft ?? query.data?.privacy_markdown ?? '';
  const crossBorder = crossBorderDraft ?? query.data?.cross_border_markdown ?? '';
  const crossBorderEnabled = crossBorderEnabledDraft ?? query.data?.cross_border_enabled ?? false;

  const mutation = useMutation({
    mutationFn: () => stepUp.runWithAdminStepUp(() => updateAdminComplianceDocuments({ terms_markdown: terms, privacy_markdown: privacy, cross_border_enabled: crossBorderEnabled, cross_border_markdown: crossBorder })),
    onSuccess: (data) => {
      queryClient.setQueryData(['admin-compliance-documents'], data);
      queryClient.invalidateQueries({ queryKey: adminKeys.session });
    },
  });
  const canWrite = session?.capabilities.includes('config:write') ?? false;

  return (
    <Stack gap="lg" maw={1080}>
      <AccountPageHeader title={t('admin.compliance.title')} subtitle={t('admin.compliance.subtitle')} />
      {query.isError && <Alert color="red" withCloseButton={false}>{describeApiError(query.error)}</Alert>}
      {mutation.isError && <Alert color="red" withCloseButton={false}>{describeApiError(mutation.error)}</Alert>}
      <SectionCard title={t('admin.compliance.termsTitle')} description={t('admin.compliance.markdownHint')}>
        <Textarea value={terms} onChange={(event) => setTerms(event.currentTarget.value)} minRows={12} autosize disabled={!canWrite || query.isPending || mutation.isPending} />
      </SectionCard>
      <SectionCard title={t('admin.compliance.privacyTitle')} description={t('admin.compliance.markdownHint')}>
        <Textarea value={privacy} onChange={(event) => setPrivacy(event.currentTarget.value)} minRows={12} autosize disabled={!canWrite || query.isPending || mutation.isPending} />
      </SectionCard>
      <SectionCard title={t('admin.compliance.crossBorderTitle')} description={t('admin.compliance.crossBorderHint')}>
        <Stack gap="md">
          <Switch checked={crossBorderEnabled} onChange={(event) => setCrossBorderEnabled(event.currentTarget.checked)} label={t('admin.compliance.crossBorderEnabled')} disabled={!canWrite || query.isPending || mutation.isPending} />
          <Textarea value={crossBorder} onChange={(event) => setCrossBorder(event.currentTarget.value)} minRows={10} autosize disabled={!canWrite || !crossBorderEnabled || query.isPending || mutation.isPending} />
        </Stack>
      </SectionCard>
      <Group justify="flex-end">
        <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!canWrite || query.isPending || !terms.trim() || !privacy.trim() || (crossBorderEnabled && !crossBorder.trim())}>{t('common.save')}</Button>
      </Group>
    </Stack>
  );
}
