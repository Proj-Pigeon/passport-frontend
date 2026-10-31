import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { grantAdminStepUp, mockDb, seedUser, server, signInAdmin } from '@/test/mocks/server';
import { renderWithProviders } from '@/test/render';
import { FederationPresetCreateModal } from './FederationPresetCreateModal';

async function fillGithub() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: /GitHub.*OAUTH2/ }));
  fireEvent.change(screen.getByLabelText(/^显示名称/), { target: { value: 'GitHub Login' } });
  fireEvent.change(screen.getByLabelText(/^Client ID/), { target: { value: 'github-client' } });
  fireEvent.change(screen.getByLabelText(/^Client Secret/), {
    target: { value: '  secret-with-spaces  ' },
  });
  expect(screen.queryByLabelText(/^操作原因/)).not.toBeInTheDocument();
  return user;
}
function open(onClose = vi.fn()) {
  signInAdmin(mockDb, seedUser(mockDb), ['federation_admin']);
  grantAdminStepUp(mockDb);
  return {
    ...renderWithProviders(
      <ModalsProvider>
        <FederationPresetCreateModal opened onClose={onClose} />
      </ModalsProvider>,
    ),
    onClose,
  };
}
describe('federation preset creation', () => {
  it('saves the secret separately and keeps it out of both caches', async () => {
    const view = open();
    const user = await fillGithub();
    let submittedSecret = '';
    server.use(
      http.put('*/admin/v1/federation-providers/:id/secrets', async ({ request }) => {
        submittedSecret = ((await request.json()) as { secret: string }).secret;
        return HttpResponse.json({ secret_set: true });
      }),
    );
    await user.click(screen.getByRole('button', { name: '创建草稿' }));
    await waitFor(() => expect(view.onClose).toHaveBeenCalledOnce());
    expect(submittedSecret).toBe('  secret-with-spaces  ');
    expect(mockDb.adminResources).toHaveLength(1);
    expect(JSON.stringify(mockDb.adminResources)).not.toContain('secret-with-spaces');
    const caches = [
      view.queryClient.getQueryCache().getAll(),
      view.queryClient.getMutationCache().getAll(),
    ].map((cache) => cache.map((entry) => entry.state));
    expect(JSON.stringify(caches)).not.toContain('secret-with-spaces');
  });
  it('retries secret storage on the same draft after a partial failure', async () => {
    const view = open();
    const user = await fillGithub();
    let attempts = 0;
    server.use(
      http.put('*/admin/v1/federation-providers/:id/secrets', () => {
        attempts++;
        return attempts === 1
          ? HttpResponse.json(
              { error: { code: 'dependency_unavailable', message: 'Try again' } },
              { status: 503 },
            )
          : HttpResponse.json({ secret_set: true });
      }),
    );
    await user.click(screen.getByRole('button', { name: '创建草稿' }));
    await screen.findByText(/草稿已创建/);
    expect(mockDb.adminResources).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: '创建草稿' }));
    await waitFor(() => expect(view.onClose).toHaveBeenCalledOnce());
    expect(attempts).toBe(2);
    expect(mockDb.adminResources).toHaveLength(1);
  });
});
