import { Alert, Badge, Button, Code, CopyButton, Group, Stack, Table } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { getAdminProtocolInfo } from '@/api/endpoints/admin/federation';
import { SectionCard } from '@/components/AccountSections';

import { adminKeys } from '../keys';

function CopyRow({ label, value }: { label: string; value: string }) {
  const { t } = useTranslation();
  return (
    <Table.Tr>
      <Table.Td w={220}>{label}</Table.Td>
      <Table.Td>
        <Group gap="xs" wrap="nowrap">
          <Code style={{ wordBreak: 'break-all' }}>{value}</Code>
          <CopyButton value={value}>
            {({ copied, copy }) => (
              <Button
                aria-label={t('admin.guides.copyValue', { label })}
                size="compact-xs"
                variant={copied ? 'light' : 'default'}
                onClick={copy}
              >
                {copied ? t('common.copied') : t('common.copy')}
              </Button>
            )}
          </CopyButton>
        </Group>
      </Table.Td>
    </Table.Tr>
  );
}

function useProtocolInfo() {
  return useQuery({
    queryKey: adminKeys.protocolInfo,
    queryFn: ({ signal }) => getAdminProtocolInfo(signal),
    staleTime: 60_000,
  });
}

export function OidcConnectivityGuideCard({
  clientId,
  scopes,
}: {
  clientId?: string;
  scopes?: unknown;
}) {
  const { t } = useTranslation();
  const info = useProtocolInfo();
  if (!info.data) {
    return null;
  }
  const oidc = info.data.oidc;
  const scopeList = Array.isArray(scopes) ? scopes.join(' ') : '';

  return (
    <SectionCard title={t('admin.guides.oidcCard')} description={t('admin.guides.oidcHint')}>
      <Stack gap="sm">
        <Table.ScrollContainer minWidth={520}>
          <Table verticalSpacing="xs">
            <Table.Tbody>
              <CopyRow label={t('admin.guides.discoveryUrl')} value={oidc.discovery_url} />
              <CopyRow label="issuer" value={info.data.issuer} />
              <CopyRow label="authorization_endpoint" value={oidc.authorization_endpoint} />
              <CopyRow label="token_endpoint" value={oidc.token_endpoint} />
              <CopyRow label="userinfo_endpoint" value={oidc.userinfo_endpoint} />
              <CopyRow label="jwks_uri" value={oidc.jwks_uri} />
              <CopyRow label="revocation_endpoint" value={oidc.revocation_endpoint} />
              <CopyRow label="introspection_endpoint" value={oidc.introspection_endpoint} />
              <CopyRow label="end_session_endpoint" value={oidc.end_session_endpoint} />
              {clientId && <CopyRow label="client_id" value={clientId} />}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        <Group gap="xs">
          <Badge variant="light">RS256</Badge>
          <Badge variant="light">PKCE S256</Badge>
          {scopeList && (
            <Badge variant="light">{t('admin.guides.scopesBadge', { scopes: scopeList })}</Badge>
          )}
        </Group>
        <Alert variant="light" color="blue">
          {t('admin.guides.oidcNote')}
        </Alert>
      </Stack>
    </SectionCard>
  );
}

export function SamlConnectivityGuideCard({
  configuration,
}: {
  configuration: Record<string, unknown>;
}) {
  const { t } = useTranslation();
  const info = useProtocolInfo();
  if (!info.data) {
    return null;
  }
  const saml = info.data.saml;

  const downloadCertificate = () => {
    if (!saml.signing_certificate_pem) {
      return;
    }
    const blob = new Blob([saml.signing_certificate_pem], { type: 'application/x-pem-file' });
    const target = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = target;
    anchor.download = 'passport-idp-certificate.pem';
    anchor.click();
    URL.revokeObjectURL(target);
  };

  const acsUrls = (Array.isArray(configuration['acs_urls']) ? configuration['acs_urls'] : [])
    .map((entry: unknown) =>
      typeof entry === 'object' && entry !== null && 'uri' in entry && typeof entry.uri === 'string'
        ? entry.uri
        : '',
    )
    .filter((uri) => uri.length > 0);

  return (
    <SectionCard title={t('admin.guides.samlCard')} description={t('admin.guides.samlHint')}>
      {!saml.available ? (
        <Alert variant="light" color="orange">
          {t('admin.guides.samlUnavailable')}
        </Alert>
      ) : (
        <Stack gap="sm">
          <Table.ScrollContainer minWidth={520}>
            <Table verticalSpacing="xs">
              <Table.Tbody>
                <CopyRow
                  label={t('admin.federation.spEntityId')}
                  value={
                    typeof configuration['entity_id'] === 'string' ? configuration['entity_id'] : ''
                  }
                />
                {acsUrls.map((uri, index) => (
                  <CopyRow key={uri} label={`ACS ${index + 1}`} value={uri} />
                ))}
                <CopyRow
                  label={t('admin.guides.idpInitiated')}
                  value={String(configuration['allow_idp_initiated'] === true)}
                />
                <CopyRow label={t('admin.guides.idpEntityId')} value={saml.idp_entity_id ?? ''} />
                <CopyRow label={t('admin.guides.idpSsoUrl')} value={saml.sso_redirect_url ?? ''} />
                <CopyRow label={t('admin.guides.idpSsoPostUrl')} value={saml.sso_post_url ?? ''} />
                <CopyRow label={t('admin.guides.idpMetadataUrl')} value={saml.metadata_url ?? ''} />
                {saml.signing_certificate_fingerprint && (
                  <CopyRow label="SHA-256" value={saml.signing_certificate_fingerprint} />
                )}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          <Group gap="xs">
            <Badge variant="light">{saml.name_id_format}</Badge>
            {saml.signing_certificate_pem && (
              <Button size="xs" variant="default" onClick={downloadCertificate}>
                {t('admin.federation.downloadCertificate')}
              </Button>
            )}
          </Group>
          {saml.metadata_url && (
            <Button
              component="a"
              href={saml.metadata_url}
              target="_blank"
              rel="noreferrer"
              size="xs"
              variant="default"
            >
              {t('admin.guides.viewMetadata')}
            </Button>
          )}
          <Alert variant="light" color="blue">
            {t('admin.guides.samlNote')}
          </Alert>
        </Stack>
      )}
    </SectionCard>
  );
}
