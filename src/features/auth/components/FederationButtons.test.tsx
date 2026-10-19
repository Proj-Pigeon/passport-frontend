import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { server } from '@/test/mocks/server';
import { renderRoute, renderWithProviders } from '@/test/render';
import { FederationButtons } from './FederationButtons';
const providers = [
  { slug: 'github', display_name: 'GitHub', provider_type: 'oauth2' },
  { slug: 'google', display_name: 'Google', provider_type: 'oidc' },
];
beforeEach(() =>
  server.use(http.get('*/v1/federation/providers', () => HttpResponse.json({ providers }))),
);
describe('FederationButtons', () => {
  it('keeps federation hidden for downstream SAML ForceAuthn without an OAuth return', async () => {
    renderRoute(['/login?saml_request=srq_1234567890abcdefghijklmnop&reauth=required']);
    await screen.findByRole('checkbox');
    expect(screen.queryByRole('link', { name: '使用 Google 继续' })).toBeNull();
    expect(screen.getByRole('button', { name: '登录' })).toBeEnabled();
  });
  it('offers OIDC and SAML with the reauth contract and hides plain OAuth2', async () => {
    server.use(
      http.get('*/v1/federation/providers', () =>
        HttpResponse.json({
          providers: [...providers, { slug: 'acme', display_name: 'Acme', provider_type: 'saml' }],
        }),
      ),
    );
    renderRoute(['/login?reauth=required&next=%2Fauthorize%3Finteraction%3Dint_1']);
    for (const name of ['Google', 'Acme']) {
      const link = await screen.findByRole('link', { name: `使用 ${name} 继续` });
      const url = new URL(link.getAttribute('href')!, window.location.origin);
      expect(url.searchParams.get('reauth')).toBe('required');
      expect(url.searchParams.get('next')).toBe('/authorize?interaction=int_1');
      expect(JSON.parse(url.searchParams.get('compliance_versions')!)).toEqual({
        terms: 1,
        privacy: 1,
      });
    }
    expect(screen.queryByRole('link', { name: '使用 GitHub 继续' })).toBeNull();
  });
  it('loads enabled providers from the backend', async () => {
    renderWithProviders(<FederationButtons />);
    expect(await screen.findByRole('link', { name: '使用 GitHub 继续' })).toHaveAttribute(
      'href',
      '/federation/github/start',
    );
    expect(await screen.findByRole('link', { name: '使用 Google 继续' })).toHaveAttribute(
      'href',
      '/federation/google/start',
    );
  });
  it('renders no buttons when the backend has no enabled providers', async () => {
    let fetched = false;
    server.use(
      http.get('*/v1/federation/providers', () => {
        fetched = true;
        return HttpResponse.json({ providers: [] });
      }),
    );
    renderWithProviders(<FederationButtons />);
    await waitFor(() => expect(fetched).toBe(true));
    expect(screen.queryByText('或使用第三方账号')).not.toBeInTheDocument();
  });
  it('uses the configured display name for SAML', async () => {
    server.use(
      http.get('*/v1/federation/providers', () =>
        HttpResponse.json({
          providers: [{ slug: 'acme', display_name: 'Acme 企业登录', provider_type: 'saml' }],
        }),
      ),
    );
    renderWithProviders(<FederationButtons />);
    expect(await screen.findByRole('link', { name: '使用 Acme 企业登录 继续' })).toHaveAttribute(
      'href',
      '/federation/acme/start',
    );
  });
  it('appears on the login page', async () => {
    renderRoute(['/login']);
    expect(await screen.findByRole('link', { name: '使用 GitHub 继续' })).toBeInTheDocument();
  });
});
