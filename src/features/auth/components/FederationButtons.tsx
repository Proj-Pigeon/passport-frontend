import { Button, Divider, Stack } from '@mantine/core';
import { IconBrandGithub, IconBrandGoogle, IconWorld } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import { federationStartUrl } from '@/api/endpoints/federation';
import { listFederationProviders, type FederationProvider } from '@/lib/federation';

function providerIcon(slug: string, size: number) {
  if (slug === 'github') {
    return <IconBrandGithub size={size} stroke={1.5} />;
  }
  if (slug === 'google') {
    return <IconBrandGoogle size={size} stroke={1.5} />;
  }
  return <IconWorld size={size} stroke={1.5} />;
}

export function FederationButtons() {
  const { t } = useTranslation();
  const providers = listFederationProviders();

  if (providers.length === 0) {
    return null;
  }

  return (
    <>
      <Divider
        label={t('auth.login.federationDivider')}
        labelPosition="center"
      />
      <Stack gap="sm">
        {providers.map((provider: FederationProvider) => (
          <Button
            key={provider.slug}
            component="a"
            href={federationStartUrl(provider.slug)}
            variant="default"
            size="md"
            fullWidth
            leftSection={providerIcon(provider.slug, 16)}
          >
            {t('federation.loginWith', { name: provider.name })}
          </Button>
        ))}
      </Stack>
    </>
  );
}
