import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import type { AdminProtocolInfo } from '@/api/endpoints/admin/federation';
import {
  OidcConnectivityGuideCard,
  SamlConnectivityGuideCard,
} from '@/features/admin/guides/ConnectivityGuideCards';
import { adminKeys } from '@/features/admin/keys';
import { grantAccountRole, seedDeveloperResource, seedUser, signIn } from '@/test/mocks/db';
import { protocolInfo } from '@/test/mocks/federationFixtures';
import { mockDb, server, signInAdmin } from '@/test/mocks/server';
import { createTestQueryClient, renderRoute, renderWithProviders } from '@/test/render';
import { developerPanelKeys } from '../keys';

const developerInfo: AdminProtocolInfo = {
  ...protocolInfo,
  issuer: 'https://developer.example.com',
  oidc: {
    ...protocolInfo.oidc,
    discovery_url: 'https://developer.example.com/.well-known/openid-configuration',
  },
  saml: {
    ...protocolInfo.saml,
    metadata_url: 'https://developer.example.com/saml/idp/metadata',
  },
};

function login(kind: 'oauth' | 'saml') {
  const account = seedUser(mockDb);
  signIn(mockDb, account, 'pwd');
  grantAccountRole(mockDb, account.id, ['developer']);
  seedDeveloperResource(mockDb, {
    id: 'apl_guide',
    kind: 'application',
    owner_user_id: account.id,
    configuration: { application_type: kind === 'saml' ? 'saml' : 'web' },
  });
  const resource = seedDeveloperResource(mockDb, {
    id: `guide_${kind}`,
    kind,
    application_id: 'apl_guide',
    display_name: `${kind} guide application`,
    client_id: kind === 'oauth' ? 'developer-client-id' : undefined,
    configuration: {
      allowed_scopes: ['openid', 'profile'],
      entity_id: 'https://sp.example.com/entity',
      acs_urls: [{ uri: 'https://sp.example.com/acs' }],
    },
  });
  return `/account/developer/${kind === 'oauth' ? 'oauth-clients' : 'saml-service-providers'}/${resource.id}/integration`;
}

function blockAdminRequests() {
  const requests: string[] = [];
  server.use(
    http.all('*/admin/v1/*', ({ request }) => {
      requests.push(request.url);
      return new HttpResponse(null, { status: 401 });
    }),
  );
  return requests;
}

describe('developer connectivity guide sources', () => {
  it.each(['oauth', 'saml'] as const)(
    'loads the %s guide with only an account session and keeps the administrator cache isolated',
    async (kind) => {
      const route = login(kind);
      const adminRequests = blockAdminRequests();
      const developerRequests: string[] = [];
      let release = () => {};
      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      server.use(
        http.get('*/v1/developer/protocol-info', async ({ request }) => {
          developerRequests.push(request.url);
          await pending;
          return HttpResponse.json(developerInfo);
        }),
      );
      const queryClient = createTestQueryClient();
      queryClient.setQueryDefaults(adminKeys.protocolInfo, { gcTime: Infinity });
      queryClient.setQueryData(adminKeys.protocolInfo, protocolInfo);
      renderRoute([route], { queryClient });
      await waitFor(() => expect(developerRequests).toHaveLength(1));
      expect(mockDb.adminSession).toBeNull();
      const title = kind === 'oauth' ? 'OIDC 接入指南' : 'SAML 接入指南';
      expect(screen.queryByRole('heading', { name: title })).not.toBeInTheDocument();
      expect(adminRequests).toEqual([]);
      release();
      expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
      if (kind === 'oauth') {
        expect(screen.getByText(developerInfo.oidc.discovery_url)).toBeInTheDocument();
        expect(
          screen.getByRole('row', { name: /client_id developer-client-id/ }),
        ).toBeInTheDocument();
        expect(screen.getByText(/openid profile/)).toBeInTheDocument();
      } else {
        expect(screen.getByText('https://sp.example.com/entity')).toBeInTheDocument();
        expect(screen.getByText('https://sp.example.com/acs')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: '查看 / 保存元数据 XML' })).toHaveAttribute(
          'href',
          developerInfo.saml.metadata_url,
        );
        expect(screen.getByRole('button', { name: '下载签名证书' })).toBeInTheDocument();
      }
      expect(queryClient.getQueryData(developerPanelKeys.protocolInfo)).toEqual(developerInfo);
      expect(queryClient.getQueryData(adminKeys.protocolInfo)).toEqual(protocolInfo);
      expect(developerRequests).toHaveLength(1);
      expect(adminRequests).toEqual([]);
    },
  );

  it('does not fall back to an administrator request or cached data when the developer request fails', async () => {
    const route = login('oauth');
    const adminRequests = blockAdminRequests();
    server.use(
      http.get('*/v1/developer/protocol-info', () =>
        HttpResponse.json(
          { error: { code: 'dependency_unavailable', message: 'Unavailable' } },
          { status: 503 },
        ),
      ),
    );
    const queryClient = createTestQueryClient();
    queryClient.setQueryDefaults(adminKeys.protocolInfo, { gcTime: Infinity });
    queryClient.setQueryData(adminKeys.protocolInfo, protocolInfo);
    renderRoute([route], { queryClient });
    await waitFor(() =>
      expect(queryClient.getQueryState(developerPanelKeys.protocolInfo)?.status).toBe('error'),
    );
    expect(screen.queryByRole('heading', { name: 'OIDC 接入指南' })).not.toBeInTheDocument();
    expect(adminRequests).toEqual([]);
  });
});

describe('administrator connectivity guide compatibility', () => {
  it('keeps both default guide usages on the administrator endpoint with a shared query', async () => {
    signInAdmin(mockDb, seedUser(mockDb), ['super_admin']);
    const adminRequests: string[] = [];
    const developerRequests: string[] = [];
    server.use(
      http.get('*/admin/v1/protocol-info', ({ request }) => {
        adminRequests.push(request.url);
      }),
      http.get('*/v1/developer/protocol-info', ({ request }) => {
        developerRequests.push(request.url);
        return new HttpResponse(null, { status: 401 });
      }),
    );
    const { queryClient } = renderWithProviders(
      <>
        <OidcConnectivityGuideCard clientId="admin-client-id" scopes={['openid', 'email']} />
        <SamlConnectivityGuideCard configuration={{ entity_id: 'https://admin-sp.example.com' }} />
      </>,
    );
    expect(await screen.findByRole('heading', { name: 'OIDC 接入指南' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'SAML 接入指南' })).toBeInTheDocument();
    expect(screen.getByText(protocolInfo.oidc.discovery_url)).toBeInTheDocument();
    expect(screen.getByText('admin-client-id')).toBeInTheDocument();
    expect(screen.getByText('https://admin-sp.example.com')).toBeInTheDocument();
    expect(queryClient.getQueryData(adminKeys.protocolInfo)).toEqual(protocolInfo);
    expect(queryClient.getQueryData(developerPanelKeys.protocolInfo)).toBeUndefined();
    expect(adminRequests).toHaveLength(1);
    expect(developerRequests).toEqual([]);
  });
});
