import type { AdminFederationPreset, AdminProtocolInfo } from '@/api/endpoints/admin/federation';
export const federationPresets: AdminFederationPreset[] = [
  {
    id: 'github',
    provider_type: 'oauth2',
    slug: 'github',
    icon: 'github',
    fixed: {
      issuer: 'https://github.com',
      authorization_endpoint: 'https://github.com/login/oauth2/authorize',
      token_endpoint: 'https://github.com/login/oauth2/access_token',
      userinfo_endpoint: 'https://api.github.com/user',
    },
    defaults: { scopes: ['read:user', 'user:email'] },
    fields: [
      { name: 'client_id', required: true },
      { name: 'client_secret', kind: 'secret', required: true },
    ],
  },
  {
    id: 'google',
    provider_type: 'oidc',
    slug: 'google',
    icon: 'google',
    fixed: {
      issuer: 'https://accounts.google.com',
      jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs',
    },
    defaults: { scopes: ['openid', 'profile', 'email'] },
    fields: [
      { name: 'client_id', required: true },
      { name: 'client_secret', kind: 'secret', required: true },
    ],
  },
  {
    id: 'oidc',
    provider_type: 'oidc',
    icon: 'oidc',
    defaults: { scopes: ['openid', 'profile', 'email'] },
    fields: [
      { name: 'issuer', required: true },
      { name: 'client_id', required: true },
      { name: 'client_secret', kind: 'secret' },
      { name: 'authorization_endpoint' },
      { name: 'token_endpoint' },
      { name: 'userinfo_endpoint' },
      { name: 'jwks_uri' },
    ],
  },
  {
    id: 'saml',
    provider_type: 'saml',
    icon: 'saml',
    fields: [
      { name: 'issuer', required: true },
      { name: 'authorization_endpoint', required: true },
    ],
  },
];
const issuer = 'https://passport.example';
export const protocolInfo: AdminProtocolInfo = {
  issuer,
  oidc: {
    discovery_url: `${issuer}/.well-known/openid-configuration`,
    authorization_endpoint: `${issuer}/oauth2/authorize`,
    token_endpoint: `${issuer}/oauth2/token`,
    jwks_uri: `${issuer}/jwks.json`,
    userinfo_endpoint: `${issuer}/oauth2/userinfo`,
    revocation_endpoint: `${issuer}/oauth2/revoke`,
    introspection_endpoint: `${issuer}/oauth2/introspect`,
    end_session_endpoint: `${issuer}/oauth2/logout`,
    scopes_supported: ['openid', 'profile', 'email'],
    code_challenge_methods: ['S256'],
    grant_types: ['authorization_code', 'refresh_token'],
    id_token_signing_alg: ['RS256'],
    subject_types: ['public', 'pairwise'],
  },
  saml: {
    available: true,
    idp_entity_id: `${issuer}/saml/idp`,
    sso_redirect_url: `${issuer}/saml/idp/sso`,
    sso_post_url: `${issuer}/saml/idp/sso`,
    metadata_url: `${issuer}/saml/idp/metadata`,
    name_id_format: 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent',
    signing_certificate_pem: 'TEST CERTIFICATE',
    signing_certificate_fingerprint: 'test-fingerprint',
  },
};
