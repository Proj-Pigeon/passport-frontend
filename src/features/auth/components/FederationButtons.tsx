import { Button, Divider, Stack } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { rememberSamlRequest } from '@/lib/loginReturn';

import { federationStartUrl } from '@/api/endpoints/federation';
import { FederationProviderIcon } from '@/components/FederationProviderIcon';
import { useFederationProviders, type FederationProvider } from '@/lib/federation';

export function FederationButtons({
  consented = true,
  complianceVersions = {},
  onRequireConsent = () => undefined,
  reauthentication,
}: {
  consented?: boolean;
  complianceVersions?: Record<string, number>;
  onRequireConsent?: () => void;
  reauthentication?: { next: string | null };
}) {
  const { t } = useTranslation();
  const providers = (useFederationProviders().data?.providers ?? []).filter(
    (provider) =>
      !reauthentication || provider.provider_type === 'oidc' || provider.provider_type === 'saml',
  );

  if (providers.length === 0) {
    return null;
  }

  return (
    <>
      <Divider label={t('auth.login.federationDivider')} labelPosition="center" />
      <Stack gap="sm">
        {providers.map((provider: FederationProvider) => (
          <Button
            key={provider.slug}
            component="a"
            href={federationStartUrl(provider.slug, complianceVersions, reauthentication)}
            onClick={(event) => {
              if (!consented) {
                event.preventDefault();
                onRequireConsent();
                return;
              }
              rememberSamlRequest(reauthentication ? '' : window.location.search);
            }}
            variant="default"
            size="md"
            fullWidth
            leftSection={
              <FederationProviderIcon
                slug={provider.slug}
                providerType={provider.provider_type}
                size={16}
              />
            }
          >
            {t('federation.loginWith', { name: provider.display_name })}
          </Button>
        ))}
      </Stack>
    </>
  );
}
