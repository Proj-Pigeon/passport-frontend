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
