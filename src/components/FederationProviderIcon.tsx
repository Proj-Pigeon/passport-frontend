import { IconBrandGithub, IconBrandGoogle, IconCertificate, IconWorld } from '@tabler/icons-react';

export function FederationProviderIcon({
  slug,
  providerType,
  size,
}: {
  slug: string;
  providerType: string;
  size: number;
}) {
  if (slug === 'github') {
    return <IconBrandGithub size={size} stroke={1.5} />;
  }
  if (slug === 'google') {
    return <IconBrandGoogle size={size} stroke={1.5} />;
  }
  if (providerType === 'saml') {
    return <IconCertificate size={size} stroke={1.5} />;
  }
  return <IconWorld size={size} stroke={1.5} />;
}
