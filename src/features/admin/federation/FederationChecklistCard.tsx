import {
  Alert,
  Badge,
  Button,
  CopyButton,
  Group,
  Stack,
  Table,
  Text,
  ThemeIcon,
} from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import { SectionCard } from '@/components/AccountSections';

function CopyableValue({ value }: { value: string }) {
  const { t } = useTranslation();
  return (
    <Group gap="xs" wrap="nowrap">
      <code style={{ wordBreak: 'break-all' }}>{value}</code>
      <CopyButton value={value}>
        {({ copied, copy }) => (
          <Button size="compact-xs" variant={copied ? 'light' : 'default'} onClick={copy}>
            {copied ? t('common.copied') : t('common.copy')}
          </Button>
        )}
      </CopyButton>
    </Group>
  );
}

function StatusItem({ done, label }: { done: boolean; label: string }) {
  return (
    <Group gap="xs">
      <ThemeIcon size="sm" variant="light" color={done ? 'green' : 'gray'}>
        {done ? <IconCheck size={12} /> : <IconX size={12} />}
      </ThemeIcon>
      <Text size="sm">{label}</Text>
    </Group>
  );
}

interface ChecklistInput {
  isSaml: boolean;
  secretConfigured: boolean;
  secretRefConfigured: boolean;
  clientIdConfigured: boolean;
  endpointsConfigured: boolean;
  discoveryAvailable: boolean;
  certificatesConfigured: boolean;
  canRequestActivation: boolean;
  onRequestActivation: () => void;
  activationPending: boolean;
}

export function FederationChecklistCard({
  isSaml,
  secretConfigured,
  secretRefConfigured,
  clientIdConfigured,
  endpointsConfigured,
  discoveryAvailable,
  certificatesConfigured,
  canRequestActivation,
  onRequestActivation,
  activationPending,
}: ChecklistInput) {
  const { t } = useTranslation();
  const secretsDone = secretConfigured || secretRefConfigured;

  return (
    <SectionCard
      title={t('admin.federation.checklistCard')}
      description={t('admin.federation.checklistHint')}
    >
      <Stack gap="sm">
        {!isSaml && (
          <StatusItem done={clientIdConfigured} label={t('admin.federation.checkClientId')} />
        )}
        {!isSaml && <StatusItem done={secretsDone} label={t('admin.federation.checkSecret')} />}
        {isSaml ? (
          <StatusItem done={endpointsConfigured} label={t('admin.federation.checkSamlEndpoints')} />
        ) : (
          <StatusItem done={endpointsConfigured} label={t('admin.federation.checkEndpoints')} />
        )}
        {discoveryAvailable && (
          <StatusItem done={endpointsConfigured} label={t('admin.federation.checkDiscovery')} />
        )}
        {isSaml && (
          <StatusItem
            done={certificatesConfigured}
            label={t('admin.federation.checkCertificates')}
          />
        )}
        {canRequestActivation && (
          <Group>
            <Button size="xs" loading={activationPending} onClick={onRequestActivation}>
              {t('admin.resources.requestActivate')}
            </Button>
          </Group>
        )}
      </Stack>
    </SectionCard>
  );
}

export function UpstreamSpGuideCard({
  spEntityId,
  spAcsUrl,
  spMetadataUrl,
  spCertificatePem,
  spCertificateFingerprint,
}: {
  spEntityId?: string;
  spAcsUrl?: string;
  spMetadataUrl?: string;
  spCertificatePem?: string;
  spCertificateFingerprint?: string;
}) {
  const { t } = useTranslation();
  if (!spEntityId && !spAcsUrl) {
    return null;
  }

  const downloadCertificate = () => {
    if (!spCertificatePem) {
      return;
    }
    const blob = new Blob([spCertificatePem], { type: 'application/x-pem-file' });
    const target = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = target;
    anchor.download = 'passport-sp-certificate.pem';
    anchor.click();
    URL.revokeObjectURL(target);
  };

  return (
    <SectionCard
      title={t('admin.federation.spGuideCard')}
      description={t('admin.federation.spGuideHint')}
    >
      <Stack gap="sm">
        <Table.ScrollContainer minWidth={480}>
          <Table verticalSpacing="xs">
            <Table.Tbody>
              {spEntityId && (
                <Table.Tr>
                  <Table.Td w={180}>{t('admin.federation.spEntityId')}</Table.Td>
                  <Table.Td>
                    <CopyableValue value={spEntityId} />
                  </Table.Td>
                </Table.Tr>
              )}
              {spAcsUrl && (
                <Table.Tr>
                  <Table.Td>{t('admin.federation.spAcsUrl')}</Table.Td>
                  <Table.Td>
                    <CopyableValue value={spAcsUrl} />
                  </Table.Td>
                </Table.Tr>
              )}
              {spMetadataUrl && (
                <Table.Tr>
                  <Table.Td>{t('admin.federation.spMetadataUrl')}</Table.Td>
                  <Table.Td>
                    <CopyableValue value={spMetadataUrl} />
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {spCertificatePem && (
          <Group gap="sm">
            {spCertificateFingerprint && (
              <Badge
                variant="light"
                ff="monospace"
                maw="100%"
                h="auto"
                styles={{ label: { whiteSpace: 'normal', wordBreak: 'break-all' } }}
              >
                {t('admin.federation.certificateFingerprint', {
                  fingerprint: spCertificateFingerprint,
                })}
              </Badge>
            )}
            <Button size="xs" variant="default" onClick={downloadCertificate}>
              {t('admin.federation.downloadCertificate')}
            </Button>
          </Group>
        )}
        <Alert variant="light" color="blue">
          {t('admin.federation.spGuideNote')}
        </Alert>
      </Stack>
    </SectionCard>
  );
}
