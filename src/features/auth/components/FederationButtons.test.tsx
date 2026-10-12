import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderRoute, renderWithProviders } from '@/test/render';

import { FederationButtons } from './FederationButtons';

const envState = vi.hoisted(() => ({ providers: ['github', 'google'] as string[] }));

vi.mock('@/lib/env', () => ({
  env: {
    apiBase: '',
    turnstileSiteKey: null,
    get federationProviders() {
      return envState.providers;
    },
  },
}));

beforeEach(() => {
  envState.providers = ['github', 'google'];
});

describe('FederationButtons', () => {
  it('renders a top-level link per configured provider', () => {
    renderWithProviders(<FederationButtons />);

    expect(screen.getByText('或使用第三方账号')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '使用 GitHub 继续' })).toHaveAttribute(
      'href',
      '/federation/github/start',
    );
    expect(screen.getByRole('link', { name: '使用 Google 继续' })).toHaveAttribute(
      'href',
      '/federation/google/start',
    );
  });

  it('renders nothing when no provider is configured', () => {
    envState.providers = [];
    renderWithProviders(<FederationButtons />);

    expect(screen.queryByText('或使用第三方账号')).not.toBeInTheDocument();
  });

  it('capitalises unknown provider slugs', () => {
    envState.providers = ['acme'];
    renderWithProviders(<FederationButtons />);

    expect(screen.getByRole('link', { name: '使用 Acme 继续' })).toHaveAttribute(
      'href',
      '/federation/acme/start',
    );
  });

  it('appears on the login page', async () => {
    renderRoute(['/login']);
    await screen.findByRole('heading', { name: '登录' });

    expect(screen.getByRole('link', { name: '使用 GitHub 继续' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '使用 Google 继续' })).toBeInTheDocument();
  });
});
