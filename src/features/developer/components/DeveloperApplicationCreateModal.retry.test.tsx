import { Button } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useState } from 'react';
import { MemoryRouter, useLocation } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import type { AdminResourceInput } from '@/api/endpoints/admin/types';
import {
  APPLICATION_TYPES,
  type ApplicationPreset,
} from '@/features/admin/components/resource/applicationPresets';
import { queryKeys } from '@/features/session/keys';
import { grantAccountRole, grantStepUp, seedUser, signIn } from '@/test/mocks/db';
import { mockDb, server } from '@/test/mocks/server';
import { renderWithProviders } from '@/test/render';
import { developerPanelKeys } from '../keys';
import { DeveloperApplicationCreateModal } from './DeveloperApplicationCreateModal';

const secret = 'one-time-secret-must-not-be-cached';

function Harness({ onClose }: { onClose: () => void }) {
  const [opened, setOpened] = useState(true);
  const location = useLocation();
  return (
    <>
      <Button onClick={() => setOpened(true)}>Open application modal</Button>
      <output aria-label="Current path">{location.pathname}</output>
      <DeveloperApplicationCreateModal
        opened={opened}
        onClose={() => {
          onClose();
          setOpened(false);
        }}
      />
    </>
  );
}

async function open() {
  const account = seedUser(mockDb);
  signIn(mockDb, account, 'pwd');
  grantStepUp(mockDb);
  grantAccountRole(mockDb, account.id, ['developer']);
  const onClose = vi.fn();
  const view = renderWithProviders(
    <MemoryRouter initialEntries={['/account/developer']}>
      <ModalsProvider>
        <Harness onClose={onClose} />
      </ModalsProvider>
    </MemoryRouter>,
  );
  await waitFor(() => expect(view.queryClient.getQueryData(queryKeys.session)).toBeDefined());
  return { ...view, onClose, account };
}

function recordRequests(failure?: 'application' | 'protocol') {
  const applications: AdminResourceInput[] = [];
  const protocols: AdminResourceInput[] = [];
  const adminRequests: string[] = [];
  const unavailable = () =>
    HttpResponse.json(
      { error: { code: 'dependency_unavailable', message: 'Try again' } },
      { status: 503 },
    );
  server.use(
    http.all('*/admin/v1/*', ({ request }) => {
      adminRequests.push(request.url);
      return new HttpResponse(null, { status: 401 });
    }),
    http.post('*/v1/developer/applications', async ({ request }) => {
      applications.push((await request.clone().json()) as AdminResourceInput);
      if (failure === 'application' && applications.length === 1) return unavailable();
    }),
    ...['oauth-clients', 'saml-service-providers'].map((path) =>
      http.post(`*/v1/developer/${path}`, async ({ request }) => {
        protocols.push((await request.json()) as AdminResourceInput);
        if (failure === 'protocol' && protocols.length === 1) return unavailable();
        return HttpResponse.json(
          { id: 'protocol_created', client_secret: secret },
          { status: 201 },
        );
      }),
    ),
  );
  return { applications, protocols, adminRequests };
}

async function fill(preset: ApplicationPreset = 'web') {
  const user = userEvent.setup();
  const dialog = screen.getByRole('dialog');
  if (preset !== 'web') {
    await user.click(within(dialog).getByRole('combobox', { name: /^应用类型/ }));
    await user.keyboard('{ArrowDown}'.repeat(APPLICATION_TYPES.indexOf(preset)) + '{Enter}');
  }
  fireEvent.change(within(dialog).getByLabelText(/^应用名称/), {
    target: { value: 'Retry application' },
  });
  return { user, dialog };
}

async function expectClosed(onClose: ReturnType<typeof vi.fn>) {
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
}

describe('simplified developer application creation', () => {
  it.each(APPLICATION_TYPES)(
    'creates a %s draft using only name and type with safe protocol defaults',
    async (preset) => {
      const requests = recordRequests();
      const view = await open();
      const { user, dialog } = await fill(preset);
      expect(within(dialog).getAllByRole('textbox')).toHaveLength(1);
      expect(within(dialog).getAllByRole('combobox')).toHaveLength(1);
      expect(dialog.querySelector('input[type="file"]')).toBeNull();
      expect(within(dialog).queryByLabelText(/^操作原因/)).not.toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: '创建应用' }));
      await expectClosed(view.onClose);
      const application = mockDb.developerResources[0];
      expect(requests.applications).toHaveLength(1);
      expect(requests.applications[0]?.configuration).toEqual({
        owner_user_id: view.account.id,
        display_name: 'Retry application',
        application_type: preset,
        risk: 'normal',
      });
      expect(requests.protocols).toHaveLength(1);
      expect(requests.protocols[0]?.application_id).toBe(application?.id);
      expect(requests.protocols[0]?.configuration).toMatchObject(
        preset === 'saml'
          ? {
              entity_id: '',
              acs_urls: [],
              signing_certificates: [],
              require_signed_requests: true,
              allow_idp_initiated: false,
            }
          : {
              redirect_uris: [],
              allowed_scopes: ['openid', 'profile', 'email'],
              subject_type: 'pairwise',
              require_consent: true,
              client_type: preset === 'web' ? 'confidential' : 'public',
              token_endpoint_auth_method: preset === 'web' ? 'client_secret_basic' : 'none',
            },
      );
      expect(screen.getByLabelText('Current path')).toHaveTextContent(
        `/account/developer/applications/${application?.id}`,
      );
      const caches = [view.queryClient.getQueryCache(), view.queryClient.getMutationCache()].map(
        (cache) => cache.getAll().map((entry) => entry.state),
      );
      expect(JSON.stringify(caches)).not.toContain(secret);
      expect(requests.adminRequests).toEqual([]);
    },
  );

  it('blocks blank and overlong names before sending requests', async () => {
    const requests = recordRequests();
    await open();
    const { user, dialog } = await fill();
    const name = within(dialog).getByLabelText(/^应用名称/);
    fireEvent.change(name, { target: { value: '   ' } });
    expect(within(dialog).getByRole('button', { name: '创建应用' })).toBeDisabled();
    fireEvent.change(name, { target: { value: '名'.repeat(81) } });
    await user.click(within(dialog).getByRole('button', { name: '创建应用' }));
    expect(within(dialog).getByText('请输入 1–80 个字符的应用名称。')).toBeInTheDocument();
    expect(requests.applications).toEqual([]);
  });

  it.each(['web', 'saml'] as const)(
    'retries a failed %s protocol on the same application',
    async (preset) => {
      const requests = recordRequests('protocol');
      const view = await open();
      const listKey = developerPanelKeys.resourceList('application', {});
      view.queryClient.setQueryDefaults(listKey, { gcTime: Infinity });
      view.queryClient.setQueryData(listKey, { items: [] });
      const overviewKey = developerPanelKeys.overview({
        start_date: '2026-10-01',
        end_date: '2026-10-28',
      });
      view.queryClient.setQueryDefaults(overviewKey, { gcTime: Infinity });
      view.queryClient.setQueryData(overviewKey, { applications: 0 });
      const { user, dialog } = await fill(preset);
      await user.click(within(dialog).getByRole('button', { name: '创建应用' }));
      expect(await within(dialog).findByText('应用草稿已创建')).toBeInTheDocument();
      const applicationId = mockDb.developerResources[0]?.id;
      expect(view.queryClient.getQueryState(listKey)?.isInvalidated).toBe(true);
      expect(view.queryClient.getQueryState(overviewKey)?.isInvalidated).toBe(true);
      expect(within(dialog).getByLabelText(/^应用名称/)).toBeDisabled();
      expect(within(dialog).getByRole('combobox', { name: /^应用类型/ })).toBeDisabled();
      expect(within(dialog).getByRole('link', { name: '查看已创建的应用草稿' })).toHaveAttribute(
        'href',
        `/account/developer/applications/${applicationId}`,
      );
      await user.click(within(dialog).getByRole('button', { name: '重试' }));
      await expectClosed(view.onClose);
      expect(requests.applications).toHaveLength(1);
      expect(requests.protocols.map((body) => body.application_id)).toEqual([
        applicationId,
        applicationId,
      ]);
      expect(requests.adminRequests).toEqual([]);
    },
  );

  it('keeps the form editable when application creation fails', async () => {
    const requests = recordRequests('application');
    const view = await open();
    const { user, dialog } = await fill();
    await user.click(within(dialog).getByRole('button', { name: '创建应用' }));
    await within(dialog).findByText('服务暂时不可用，请稍后重试。');
    expect(within(dialog).getByLabelText(/^应用名称/)).toBeEnabled();
    expect(requests.protocols).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: '创建应用' }));
    await expectClosed(view.onClose);
    expect(requests.applications).toHaveLength(2);
    expect(mockDb.developerResources).toHaveLength(1);
  });

  it('resets the form when closing and reopening without deleting the previous draft', async () => {
    const requests = recordRequests('protocol');
    const view = await open();
    const { user, dialog } = await fill();
    await user.click(within(dialog).getByRole('button', { name: '创建应用' }));
    await within(dialog).findByText('应用草稿已创建');
    const firstId = mockDb.developerResources[0]?.id;
    await user.click(within(dialog).getByRole('button', { name: '取消' }));
    await expectClosed(view.onClose);
    await user.click(screen.getByRole('button', { name: 'Open application modal' }));
    const nextDialog = await screen.findByRole('dialog');
    expect(within(nextDialog).getByLabelText(/^应用名称/)).toHaveValue('');
    expect(within(nextDialog).getByLabelText(/^应用名称/)).toBeEnabled();
    await fill();
    await user.click(within(nextDialog).getByRole('button', { name: '创建应用' }));
    await waitFor(() => expect(view.onClose).toHaveBeenCalledTimes(2));
    expect(requests.applications).toHaveLength(2);
    expect(mockDb.developerResources[1]?.id).not.toBe(firstId);
  });

  it('opens an existing draft after partial failure without resubmitting', async () => {
    const requests = recordRequests('protocol');
    const view = await open();
    const { user, dialog } = await fill();
    await user.click(within(dialog).getByRole('button', { name: '创建应用' }));
    await user.click(await within(dialog).findByRole('link', { name: '查看已创建的应用草稿' }));
    await expectClosed(view.onClose);
    expect(screen.getByLabelText('Current path')).toHaveTextContent(
      `/account/developer/applications/${mockDb.developerResources[0]?.id}`,
    );
    expect(requests.applications).toHaveLength(1);
    expect(requests.protocols).toHaveLength(1);
  });
});
