import { ActionIcon, Button, Code, Group, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  addSamlAcsUrl,
  addSamlSigningCertificate,
  putSamlAttributePolicy,
  removeSamlAcsUrl,
  removeSamlSigningCertificate,
} from '@/api/endpoints/admin/resources';
import { isApiError } from '@/api/errors';
import { SectionCard } from '@/components/AccountSections';
import { formatDateTime } from '@/lib/format';

import { hasAdminCapability, useAdminSession } from '../../session/useAdminSession';
import { useAdminStepUp } from '../../step-up/useAdminStepUp';
import { AdminStatusBadge } from '../AdminStatusBadge';
import { ReasonModal } from '../ReasonModal';
import type { ResourceSectionProps } from './resourceTypes';

interface UriEntry {
  id: string;
  uri: string;
}

interface CertificateEntry {
  id: string;
  pem: string;
  fingerprint?: string;
  not_before?: string;
  not_after?: string;
  provenance?: string;
  state?: string;
}

function conflictHint(error: unknown, t: (key: string) => string): string | undefined {
  return isApiError(error) && (error.status === 412 || error.code === 'precondition_failed')
    ? t('admin.config.conflictHint')
    : undefined;
}

export function SamlProviderSections({ resource, etag, refresh }: ResourceSectionProps) {
  const { t } = useTranslation();
  const stepUp = useAdminStepUp();
  const { data: session } = useAdminSession();
  const canWrite = hasAdminCapability(session, 'applications:write');

  const acsUrls = (resource.configuration['acs_urls'] as UriEntry[] | undefined) ?? [];
  const certificates =
    (resource.configuration['signing_certificates'] as CertificateEntry[] | undefined) ?? [];
  const policy =
    (resource.configuration['attribute_policy'] as Record<string, string> | undefined) ?? {};

  const [newAcs, setNewAcs] = useState('');
  const [addAcsModal, setAddAcsModal] = useState(false);
  const [removeAcs, setRemoveAcs] = useState<UriEntry | null>(null);
  const [pemDraft, setPemDraft] = useState('');
  const [addCertModal, setAddCertModal] = useState(false);
  const [removeCert, setRemoveCert] = useState<CertificateEntry | null>(null);
  const [policyDraft, setPolicyDraft] = useState('');
  const [policyModal, setPolicyModal] = useState(false);
  const [policyError, setPolicyError] = useState<string | null>(null);

  const wrap = <T,>(action: () => Promise<T>) => stepUp.runWithAdminStepUp(action);

  const addAcsMutation = useMutation({
    mutationFn: () => wrap(() => addSamlAcsUrl(resource.id, { uri: newAcs.trim() }, etag)),
    onSuccess: async () => {
      setAddAcsModal(false);
      setNewAcs('');
      await refresh();
    },
  });

  const removeAcsMutation = useMutation({
    mutationFn: (input: { entry: UriEntry }) =>
      wrap(() => removeSamlAcsUrl(resource.id, input.entry.id, etag)),
    onSuccess: async () => {
      setRemoveAcs(null);
      await refresh();
    },
  });

  const addCertMutation = useMutation({
    mutationFn: () =>
      wrap(() => addSamlSigningCertificate(resource.id, { pem: pemDraft.trim() }, etag)),
    onSuccess: async () => {
      setAddCertModal(false);
      setPemDraft('');
      await refresh();
    },
  });

  const removeCertMutation = useMutation({
    mutationFn: (input: { entry: CertificateEntry }) =>
      wrap(() => removeSamlSigningCertificate(resource.id, input.entry.id, etag)),
    onSuccess: async () => {
      setRemoveCert(null);
      await refresh();
    },
  });

  const policyMutation = useMutation({
    mutationFn: (input: { attribute_policy: Record<string, string> }) =>
      wrap(() => putSamlAttributePolicy(resource.id, input, etag)),
    onSuccess: async () => {
      setPolicyModal(false);
      setPolicyError(null);
      await refresh();
    },
  });

  const openPolicyModal = () => {
    setPolicyDraft(`${JSON.stringify(policy, null, 2)}\n`);
    setPolicyError(null);
    policyMutation.reset();
    setPolicyModal(true);
  };

  const submitPolicy = () => {
    try {
      const parsed: unknown = JSON.parse(policyDraft);
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed) ||
        Object.values(parsed).some((value) => typeof value !== 'string')
      ) {
        setPolicyError(t('admin.saml.policyInvalid'));
        return;
      }
      setPolicyError(null);
      policyMutation.mutate({ attribute_policy: parsed as Record<string, string> });
    } catch {
      setPolicyError(t('admin.config.invalidJson'));
    }
  };

  return (
    <>
      <SectionCard
        title={t('admin.saml.acsCard')}
        description={t('admin.saml.acsHint')}
        action={
          canWrite ? (
            <Button
              size="xs"
              variant="light"
              onClick={() => {
                addAcsMutation.reset();
                setNewAcs('');
                setAddAcsModal(true);
              }}
            >
              {t('admin.saml.addAcs')}
            </Button>
          ) : undefined
        }
      >
        <Stack gap="xs">
          {acsUrls.length === 0 && (
            <Text size="sm" c="dimmed">
              {t('admin.saml.noAcs')}
            </Text>
          )}
          {acsUrls.map((entry) => (
            <Group key={entry.id} justify="space-between" gap="sm" wrap="nowrap">
              <Code style={{ wordBreak: 'break-all' }}>{entry.uri}</Code>
              {canWrite && (
                <ActionIcon
                  color="red"
                  variant="light"
                  size="sm"
                  aria-label={t('admin.saml.removeAcs')}
                  onClick={() => {
                    removeAcsMutation.reset();
                    setRemoveAcs(entry);
                  }}
                >
                  ×
                </ActionIcon>
              )}
            </Group>
          ))}
        </Stack>
      </SectionCard>

      <SectionCard
        title={t('admin.saml.certCard')}
        description={t('admin.saml.certHint')}
        action={
          canWrite ? (
            <Button
              size="xs"
              variant="light"
              onClick={() => {
                addCertMutation.reset();
                setPemDraft('');
                setAddCertModal(true);
              }}
            >
              {t('admin.saml.addCert')}
            </Button>
          ) : undefined
        }
      >
        <Stack gap="xs">
          {certificates.length === 0 && (
            <Text size="sm" c="dimmed">
              {t('admin.saml.noCerts')}
            </Text>
          )}
          {certificates.map((entry) => (
            <Group key={entry.id} justify="space-between" gap="sm" wrap="nowrap">
              <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                <Group gap="xs">
                  {entry.state && (
                    <AdminStatusBadge
                      status={entry.state === 'retired' ? 'disabled' : entry.state}
                    />
                  )}
                  <Text size="xs" ff="monospace" lineClamp={1}>
                    {entry.fingerprint ?? entry.id}
                  </Text>
                </Group>
                {(entry.not_before || entry.not_after) && (
                  <Text size="xs" c="dimmed">
                    {formatDateTime(entry.not_before ?? null)} →{' '}
                    {formatDateTime(entry.not_after ?? null)}
                  </Text>
                )}
              </Stack>
              {canWrite && entry.state !== 'retired' && (
                <Button
                  size="xs"
                  color="red"
                  variant="light"
                  onClick={() => {
                    removeCertMutation.reset();
                    setRemoveCert(entry);
                  }}
                >
                  {t('admin.saml.retireCert')}
                </Button>
              )}
            </Group>
          ))}
        </Stack>
      </SectionCard>

      <SectionCard
        title={t('admin.saml.policyCard')}
        description={t('admin.saml.policyHint')}
        action={
          canWrite ? (
            <Button size="xs" variant="light" onClick={openPolicyModal}>
              {t('admin.saml.editPolicy')}
            </Button>
          ) : undefined
        }
      >
        <Stack gap="xs">
          {Object.keys(policy).length === 0 ? (
            <Text size="sm" c="dimmed">
              {t('admin.saml.noPolicy')}
            </Text>
          ) : (
            Object.entries(policy).map(([source, target]) => (
              <Text key={source} size="sm" ff="monospace">
                {source} → {target}
              </Text>
            ))
          )}
        </Stack>
      </SectionCard>

      <ReasonModal
        opened={addAcsModal}
        onClose={() => (addAcsMutation.isPending ? undefined : setAddAcsModal(false))}
        title={t('admin.saml.addAcs')}
        confirmLabel={t('admin.saml.addAcs')}
        confirmDisabled={newAcs.trim().length === 0}
        pending={addAcsMutation.isPending}
        error={addAcsMutation.error}
        errorHint={conflictHint(addAcsMutation.error, t)}
        extraFields={
          <TextInput
            label={t('admin.saml.acsCard')}
            value={newAcs}
            onChange={(event) => setNewAcs(event.currentTarget.value)}
            placeholder="https://sp.example/acs"
            data-autofocus
            required
          />
        }
        onSubmit={() => addAcsMutation.mutate()}
      />

      <ReasonModal
        opened={removeAcs !== null}
        onClose={() => (removeAcsMutation.isPending ? undefined : setRemoveAcs(null))}
        title={t('admin.saml.removeAcs')}
        description={removeAcs?.uri}
        confirmLabel={t('common.delete')}
        confirmColor="red"
        pending={removeAcsMutation.isPending}
        error={removeAcsMutation.error}
        errorHint={conflictHint(removeAcsMutation.error, t)}
        onSubmit={() => {
          if (removeAcs) {
            removeAcsMutation.mutate({ entry: removeAcs });
          }
        }}
      />

      <ReasonModal
        opened={addCertModal}
        onClose={() => (addCertMutation.isPending ? undefined : setAddCertModal(false))}
        title={t('admin.saml.addCert')}
        confirmDisabled={pemDraft.trim().length === 0}
        extraFields={
          <Textarea
            label={t('admin.federation.certificateInput')}
            value={pemDraft}
            onChange={(event) => setPemDraft(event.currentTarget.value)}
            placeholder="-----BEGIN CERTIFICATE-----"
            autosize
            minRows={4}
            maxRows={10}
            ff="monospace"
            data-autofocus
          />
        }
        confirmLabel={t('admin.saml.addCert')}
        pending={addCertMutation.isPending}
        error={addCertMutation.error}
        errorHint={conflictHint(addCertMutation.error, t)}
        onSubmit={() => addCertMutation.mutate()}
      />

      <ReasonModal
        opened={removeCert !== null}
        onClose={() => (removeCertMutation.isPending ? undefined : setRemoveCert(null))}
        title={t('admin.saml.retireCert')}
        description={removeCert?.fingerprint ?? removeCert?.id}
        confirmLabel={t('admin.saml.retireCert')}
        confirmColor="red"
        pending={removeCertMutation.isPending}
        error={removeCertMutation.error}
        errorHint={conflictHint(removeCertMutation.error, t)}
        onSubmit={() => {
          if (removeCert) {
            removeCertMutation.mutate({ entry: removeCert });
          }
        }}
      />

      <ReasonModal
        opened={policyModal}
        onClose={() => (policyMutation.isPending ? undefined : setPolicyModal(false))}
        title={t('admin.saml.editPolicy')}
        extraFields={
          <Textarea
            label={t('admin.saml.policyLabel')}
            value={policyDraft}
            onChange={(event) => setPolicyDraft(event.currentTarget.value)}
            error={policyError ?? undefined}
            autosize
            minRows={4}
            maxRows={12}
            ff="monospace"
            data-autofocus
          />
        }
        confirmLabel={t('common.save')}
        pending={policyMutation.isPending}
        error={policyMutation.error}
        errorHint={conflictHint(policyMutation.error, t)}
        onSubmit={submitPolicy}
      />
    </>
  );
}
