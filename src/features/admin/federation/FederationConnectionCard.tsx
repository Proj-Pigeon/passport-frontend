import { Button, Group, SimpleGrid, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { patchAdminResource } from '@/api/endpoints/admin/resources';
import { SectionCard } from '@/components/AccountSections';

import type { ResourceSectionProps } from '../components/resource/resourceTypes';
import { useAdminStepUp } from '../step-up/useAdminStepUp';
import { ReasonModal } from '../components/ReasonModal';

interface CertificateEntry {
  id: string;
  fingerprint?: string;
  not_after?: string;
  state?: string;
}

function readString(configuration: Record<string, unknown>, key: string): string {
  const value = configuration[key];
  return typeof value === 'string' ? value : '';
}

function readCertificates(configuration: Record<string, unknown>): CertificateEntry[] {
  const raw = configuration['signing_certificates'];
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(
    (entry): entry is CertificateEntry =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as CertificateEntry).id === 'string',
  );
}

export function FederationConnectionCard({
  resource,
  etag,
  refresh,
  canWrite = true,
}: ResourceSectionProps) {
  const { t } = useTranslation();
  const stepUp = useAdminStepUp();
  const providerType = readString(resource.configuration, 'provider_type');
  const [issuer, setIssuer] = useState(readString(resource.configuration, 'issuer'));
  const [authorizationEndpoint, setAuthorizationEndpoint] = useState(
    readString(resource.configuration, 'authorization_endpoint'),
  );
  const [tokenEndpoint, setTokenEndpoint] = useState(
    readString(resource.configuration, 'token_endpoint'),
  );
  const [userinfoEndpoint, setUserinfoEndpoint] = useState(
    readString(resource.configuration, 'userinfo_endpoint'),
  );
  const [jwksUri, setJwksUri] = useState(readString(resource.configuration, 'jwks_uri'));
  const [certificatePem, setCertificatePem] = useState('');
  const [confirm, setConfirm] = useState<null | 'patch' | 'certificate'>(null);

  const mutation = useMutation({
    mutationFn: async (input: { reason: string; configuration: Record<string, unknown> }) =>
      stepUp.runWithAdminStepUp(() => patchAdminResource('federation', resource.id, input, etag)),
    onSuccess: async () => {
      setConfirm(null);
      setCertificatePem('');
      await refresh();
    },
  });

  const isSaml = providerType === 'saml';
  const certificates = readCertificates(resource.configuration);
  const dirty =
    issuer !== readString(resource.configuration, 'issuer') ||
    authorizationEndpoint !== readString(resource.configuration, 'authorization_endpoint') ||
    tokenEndpoint !== readString(resource.configuration, 'token_endpoint') ||
    userinfoEndpoint !== readString(resource.configuration, 'userinfo_endpoint') ||
    jwksUri !== readString(resource.configuration, 'jwks_uri');

  const buildPatch = (): Record<string, unknown> => {
    const patch: Record<string, unknown> = {};
    if (issuer !== readString(resource.configuration, 'issuer')) {
      patch.issuer = issuer.trim();
    }
    if (authorizationEndpoint !== readString(resource.configuration, 'authorization_endpoint')) {
      patch.authorization_endpoint = authorizationEndpoint.trim();
    }
    if (tokenEndpoint !== readString(resource.configuration, 'token_endpoint')) {
      patch.token_endpoint = tokenEndpoint.trim();
    }
    if (userinfoEndpoint !== readString(resource.configuration, 'userinfo_endpoint')) {
      patch.userinfo_endpoint = userinfoEndpoint.trim();
    }
    if (jwksUri !== readString(resource.configuration, 'jwks_uri')) {
      patch.jwks_uri = jwksUri.trim();
    }
    return patch;
  };

  return (
    <SectionCard
      title={t('admin.federation.connectionCard')}
      description={t('admin.federation.connectionHint', {
        type: providerType.toUpperCase(),
      })}
      action={
        canWrite && isSaml ? (
          <Button
            size="xs"
            variant="light"
            onClick={() => {
              mutation.reset();
              setCertificatePem('');
              setConfirm('certificate');
            }}
          >
            {t('admin.federation.addCertificate')}
          </Button>
        ) : undefined
      }
    >
      <Stack gap="sm">
        {providerType === 'oauth2' && (
          <Text size="sm" c="dimmed">
            {t('admin.federation.githubFixedEndpoints')}
          </Text>
        )}
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <TextInput
            label={t('admin.federation.field.issuer')}
            value={issuer}
            onChange={(event) => setIssuer(event.currentTarget.value)}
            disabled={!canWrite || (!isSaml && providerType === 'oauth2')}
          />
          <TextInput
            label={
              isSaml
                ? t('admin.federation.field.ssoUrl')
                : t('admin.federation.field.authorization_endpoint')
            }
            value={authorizationEndpoint}
            onChange={(event) => setAuthorizationEndpoint(event.currentTarget.value)}
            disabled={!canWrite || providerType === 'oauth2'}
          />
          {!isSaml && (
            <>
              <TextInput
                label={t('admin.federation.field.token_endpoint')}
                value={tokenEndpoint}
                onChange={(event) => setTokenEndpoint(event.currentTarget.value)}
                disabled={!canWrite || providerType === 'oauth2'}
              />
              <TextInput
                label={t('admin.federation.field.userinfo_endpoint')}
                value={userinfoEndpoint}
                onChange={(event) => setUserinfoEndpoint(event.currentTarget.value)}
                disabled={!canWrite || providerType === 'oauth2'}
              />
              <TextInput
                label={t('admin.federation.field.jwks_uri')}
                value={jwksUri}
                onChange={(event) => setJwksUri(event.currentTarget.value)}
                disabled={!canWrite || providerType === 'oauth2'}
              />
            </>
          )}
        </SimpleGrid>

        {isSaml && (
          <Stack gap={4}>
            {certificates.length === 0 && (
              <Text size="sm" c="dimmed">
                {t('admin.federation.noCertificates')}
              </Text>
            )}
            {certificates.map((certificate) => (
              <Text key={certificate.id} size="xs" ff="monospace">
                {certificate.state === 'retired'
                  ? t('admin.federation.certificateRetired')
                  : t('admin.federation.certificateFingerprint', {
                      fingerprint: certificate.fingerprint ?? '',
                    })}
              </Text>
            ))}
          </Stack>
        )}

        {providerType !== 'oauth2' && (
          <Group justify="flex-end">
            <Button
              size="xs"
              disabled={!canWrite || !dirty}
              onClick={() => {
                mutation.reset();
                setConfirm('patch');
              }}
            >
              {t('admin.federation.saveConnection')}
            </Button>
          </Group>
        )}
      </Stack>

      <ReasonModal
        opened={confirm !== null}
        onClose={() => (mutation.isPending ? undefined : setConfirm(null))}
        title={
          confirm === 'certificate'
            ? t('admin.federation.addCertificate')
            : t('admin.federation.saveConnection')
        }
        description={t('admin.federation.connectionConfirm')}
        confirmLabel={t('common.submit')}
        confirmDisabled={confirm === 'certificate' && certificatePem.trim().length === 0}
        pending={mutation.isPending}
        error={mutation.error}
        extraFields={
          confirm === 'certificate' ? (
            <Textarea
              label={t('admin.federation.certificateInput')}
              description={t('admin.federation.certificateInputHint')}
              value={certificatePem}
              onChange={(event) => setCertificatePem(event.currentTarget.value)}
              autosize
              minRows={4}
              maxRows={10}
              ff="monospace"
              data-autofocus
              required
            />
          ) : undefined
        }
        onSubmit={(reason) => {
          if (confirm === 'certificate') {
            const existing = (resource.configuration['signing_certificates'] as unknown[]) ?? [];
            mutation.mutate({
              reason,
              configuration: {
                signing_certificates: [...existing, { pem: certificatePem.trim() }],
              },
            });
          } else {
            mutation.mutate({ reason, configuration: buildPatch() });
          }
        }}
      />
    </SectionCard>
  );
}
