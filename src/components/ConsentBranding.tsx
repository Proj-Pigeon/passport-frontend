import { Anchor, Avatar, Group, Paper, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconCheck, IconExternalLink, IconFeather, IconLink } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import { resolveAssetUrl } from '@/api/http';

export interface ConsentApplication {
  name: string;
  logoUrl?: string | null;
  developerName?: string | null;
  developerUrl?: string | null;
}

const KNOWN_SCOPES = ['openid', 'profile', 'email'] as const;

export function ConsentBrandRow({ application }: { application: ConsentApplication }) {
  return (
    <Group justify="center" gap="md" wrap="nowrap">
      <Avatar
        src={resolveAssetUrl(application.logoUrl)}
        alt={application.name}
        size={64}
        radius="md"
      >
        {application.name.slice(0, 1).toUpperCase()}
      </Avatar>
      <IconLink size={20} color="var(--mantine-color-dimmed)" />
      <ThemeIcon size={64} radius="md" variant="light">
        <IconFeather size={32} stroke={1.5} />
      </ThemeIcon>
    </Group>
  );
}

export function ConsentDeveloperLine({ application }: { application: ConsentApplication }) {
  const { t } = useTranslation();
  if (!application.developerName) {
    return <>{t('oauth.hostedBy', { platform: t('common.platformName') })}</>;
  }
  return (
    <>
      {t('oauth.developedByBefore')}
      {application.developerUrl ? (
        <Anchor href={application.developerUrl} target="_blank" rel="noopener noreferrer" size="sm">
          {application.developerName}
          <IconExternalLink size={13} style={{ marginInlineStart: 2, verticalAlign: '-2px' }} />
        </Anchor>
      ) : (
        application.developerName
      )}
      {t('oauth.developedByAfter')}
    </>
  );
}

export function ConsentScopeList({ scopes }: { scopes: string[] }) {
  const { t } = useTranslation();
  const platform = t('common.platformName');
  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="md">
        <Text size="sm" fw={500}>
          {t('oauth.permissionsTitle')}
        </Text>
        <Stack gap="md">
          {scopes.map((scope) => {
            const known = (KNOWN_SCOPES as readonly string[]).includes(scope);
            return (
              <Group key={scope} gap="sm" align="flex-start" wrap="nowrap">
                <ThemeIcon size={24} radius="xl" mt={1}>
                  <IconCheck size={14} />
                </ThemeIcon>
                <Stack gap={2} style={{ minWidth: 0 }}>
                  <Text size="sm" fw={500}>
                    {known ? t(`oauth.scopes.${scope}.title`) : scope}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {known
                      ? t(`oauth.scopes.${scope}.description`, { platform })
                      : t('oauth.scopes.unknownDescription', { scope })}
                  </Text>
                </Stack>
              </Group>
            );
          })}
        </Stack>
      </Stack>
    </Paper>
  );
}
