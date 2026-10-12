import { env } from './env';

const KNOWN_PROVIDER_NAMES: Readonly<Record<string, string>> = {
  google: 'Google',
  github: 'GitHub',
};

export interface FederationProvider {
  slug: string;
  name: string;
}

function providerDisplayName(slug: string): string {
  const known = KNOWN_PROVIDER_NAMES[slug];
  if (known) {
    return known;
  }
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

export function listFederationProviders(): FederationProvider[] {
  return env.federationProviders.map((slug) => ({ slug, name: providerDisplayName(slug) }));
}
