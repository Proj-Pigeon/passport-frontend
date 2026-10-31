import { ModalsProvider } from '@mantine/modals';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import type { AdminResourceInput } from '@/api/endpoints/admin/types';
import { queryKeys } from '@/features/session/keys';
import i18n from '@/i18n';
import {
  grantAccountRole,
  grantStepUp,
  seedDeveloperResource,
  seedUser,
  signIn,
} from '@/test/mocks/db';
import { mockDb, server } from '@/test/mocks/server';
import { renderWithProviders } from '@/test/render';

import { DeveloperBrandingCard } from './DeveloperResourceDetailPage';

const supplementaryCharacter = String.fromCodePoint(0x20000);

async function open(
  options: { verified?: boolean; canWrite?: boolean; failOnce?: boolean; stale?: boolean } = {},
) {
  const account = seedUser(mockDb);
  signIn(mockDb, account, 'pwd');
  if (options.verified !== false) grantStepUp(mockDb);
  grantAccountRole(mockDb, account.id, ['developer']);
  const resource = seedDeveloperResource(mockDb, {
    id: 'apl_details',
    display_name: 'Existing application',
    owner_user_id: account.id,
    configuration: {
      display_name: 'Existing application',
      description: 'Existing description',
      developer_name: 'Existing developer',
      developer_url: 'https://developer.example.com',
      application_type: 'web',
    },
  });
  const requests: { input: AdminResourceInput; etag: string | null }[] = [];
  const adminRequests: string[] = [];
  server.use(
    http.all('*/admin/v1/*', ({ request }) => {
      adminRequests.push(request.url);
      return new HttpResponse(null, { status: 500 });
    }),
    http.patch('*/v1/developer/applications/apl_details', async ({ request }) => {
      requests.push({
        input: (await request.clone().json()) as AdminResourceInput,
        etag: request.headers.get('If-Match'),
      });
      if (options.failOnce && requests.length === 1) {
        return HttpResponse.json(
          { error: { code: 'dependency_unavailable', message: 'Try again' } },
          { status: 503 },
        );
      }
    }),
  );
  const refresh = vi.fn(async () => {});
  const view = renderWithProviders(
    <MemoryRouter>
      <ModalsProvider>
        <DeveloperBrandingCard
          resource={resource}
          etag={options.stale ? '"0"' : '"1"'}
          refresh={refresh}
          canWrite={options.canWrite ?? true}
        />
      </ModalsProvider>
    </MemoryRouter>,
  );
  await waitFor(() => expect(view.queryClient.getQueryData(queryKeys.session)).toBeDefined());
  return { ...view, resource, refresh, requests, adminRequests };
}

async function edit() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: i18n.t('developer.details.edit') }));
  const dialog = await screen.findByRole('dialog', { name: i18n.t('developer.details.edit') });
  const fields = {
    name: within(dialog).getByRole('textbox', {
      name: new RegExp(`^${i18n.t('developer.create.name')}`),
    }),
    description: within(dialog).getByRole('textbox', { name: '应用说明' }),
    developerName: within(dialog).getByRole('textbox', { name: '开发者名称' }),
    developerUrl: within(dialog).getByRole('textbox', { name: '开发者网址' }),
  };
  expect(within(dialog).queryByLabelText(/^操作原因/)).not.toBeInTheDocument();
  return { user, dialog, fields, submit: within(dialog).getByRole('button', { name: '提交' }) };
}

function change(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

describe('developer application details card', () => {
  it('shows application name, description and developer details before editing', async () => {
    await open();
    expect(screen.getByText(i18n.t('developer.details.card'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('developer.details.hint'))).toBeInTheDocument();
    expect(screen.getByText(i18n.t('developer.create.name'))).toBeInTheDocument();
    expect(screen.getByText('Existing application')).toBeInTheDocument();
    expect(screen.getByText('Existing description')).toBeInTheDocument();
    expect(screen.getByText('Existing developer')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'https://developer.example.com' })).toHaveAttribute(
      'href',
      'https://developer.example.com',
    );
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('saves all editable details with account scope and the current ETag', async () => {
    const view = await open();
    const { user, fields, submit } = await edit();
    expect(submit).toBeDisabled();
    change(fields.name, ' Updated application ');
    change(fields.description, ' Updated description\nSecond line ');
    change(fields.developerName, ' Updated developer ');
    change(fields.developerUrl, ' https://new.example.com ');
    await user.click(submit);
    await waitFor(() => expect(view.refresh).toHaveBeenCalledOnce());
    expect(view.requests).toEqual([
      {
        etag: '"1"',
        input: {
          configuration: {
            display_name: 'Updated application',
            description: 'Updated description\nSecond line',
            developer_name: 'Updated developer',
            developer_url: 'https://new.example.com',
          },
        },
      },
    ]);
    expect(view.resource.display_name).toBe('Updated application');
    expect(view.resource.configuration).toMatchObject({
      application_type: 'web',
      description: 'Updated description\nSecond line',
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(view.adminRequests).toEqual([]);
  });

  it.each([
    ['name', '   '],
    ['name', supplementaryCharacter.repeat(81)],
    ['description', '界'.repeat(667)],
    ['developerName', supplementaryCharacter.repeat(161)],
    ['developerUrl', 'javascript:alert(1)'],
    ['developerUrl', 'not a URL'],
    ['developerUrl', `https://example.com/${'a'.repeat(2048)}`],
  ] as const)('blocks an invalid %s without sending a patch', async (field, value) => {
    const view = await open();
    const { user, fields, submit } = await edit();
    change(fields.name, 'Updated application');
    change(fields[field], value);
    expect(fields[field]).toHaveAttribute('aria-invalid', 'true');
    expect(submit).toBeDisabled();
    await user.click(submit);
    expect(view.requests).toEqual([]);
    expect(view.refresh).not.toHaveBeenCalled();
  });

  it('accepts exactly 80 Unicode name characters, 160 developer characters and 2000 description bytes', async () => {
    const view = await open();
    const { user, fields, submit } = await edit();
    const name = supplementaryCharacter.repeat(80);
    const developerName = supplementaryCharacter.repeat(160);
    const description = `${'界'.repeat(666)}ab`;
    change(fields.name, name);
    change(fields.developerName, developerName);
    change(fields.description, description);
    change(fields.developerUrl, 'http://localhost:8080');
    expect(submit).toBeEnabled();
    await user.click(submit);
    await waitFor(() => expect(view.refresh).toHaveBeenCalledOnce());
    expect(view.requests[0]?.input.configuration).toEqual({
      display_name: name,
      description,
      developer_name: developerName,
      developer_url: 'http://localhost:8080',
    });
  });

  it('allows clearing optional details without changing the application name', async () => {
    const view = await open();
    const { user, fields, submit } = await edit();
    change(fields.description, ' ');
    change(fields.developerName, ' ');
    change(fields.developerUrl, ' ');
    await user.click(submit);
    await waitFor(() => expect(view.refresh).toHaveBeenCalledOnce());
    expect(view.requests[0]?.input.configuration).toEqual({
      display_name: 'Existing application',
      description: '',
      developer_name: '',
      developer_url: '',
    });
  });

  it('discards unsaved values when the edit modal is cancelled', async () => {
    const view = await open();
    const { user, fields, dialog } = await edit();
    change(fields.name, 'Unsaved name');
    change(fields.description, 'Unsaved description');
    await user.click(within(dialog).getByRole('button', { name: '取消' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const next = await edit();
    expect(next.fields.name).toHaveValue('Existing application');
    expect(next.fields.description).toHaveValue('Existing description');
    expect(next.submit).toBeDisabled();
    expect(view.requests).toEqual([]);
  });

  it('retains edited values after a failure so the same patch can be retried', async () => {
    const view = await open({ failOnce: true });
    const { user, fields, submit, dialog } = await edit();
    change(fields.name, 'Retry application');
    change(fields.description, 'Retry description');
    await user.click(submit);
    await within(dialog).findByRole('alert');
    expect(fields.name).toHaveValue('Retry application');
    expect(fields.description).toHaveValue('Retry description');
    expect(view.refresh).not.toHaveBeenCalled();
    await user.click(submit);
    await waitFor(() => expect(view.refresh).toHaveBeenCalledOnce());
    expect(view.requests).toHaveLength(2);
    expect(view.requests[1]).toEqual(view.requests[0]);
  });

  it('preserves input on an ETag conflict and does not refresh or bypass the precondition', async () => {
    const view = await open({ stale: true });
    const { user, fields, submit, dialog } = await edit();
    change(fields.name, 'Conflict application');
    await user.click(submit);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      '资源已被修改，请刷新后重试。',
    );
    expect(fields.name).toHaveValue('Conflict application');
    expect(view.requests).toHaveLength(1);
    expect(view.requests[0]?.etag).toBe('"0"');
    expect(view.refresh).not.toHaveBeenCalled();
    expect(view.resource.display_name).toBe('Existing application');
  });

  it('allows saving without an audit reason', async () => {
    const view = await open();
    const { user, fields, submit } = await edit();
    change(fields.name, 'Updated application');
    expect(submit).toBeEnabled();
    await user.click(submit);
    await waitFor(() => expect(view.refresh).toHaveBeenCalledOnce());
    expect(view.requests[0]?.input).not.toHaveProperty('reason');
  });

  it('waits for account verification before patching and disables detail inputs while pending', async () => {
    const view = await open({ verified: false });
    const { user, fields, submit } = await edit();
    change(fields.name, 'Verified application');
    await user.click(submit);
    const verification = await screen.findByRole('dialog', { name: '安全验证' });
    expect(view.requests).toEqual([]);
    expect(view.adminRequests).toEqual([]);
    expect(fields.name).toBeDisabled();
    expect(fields.description).toBeDisabled();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(verification).not.toBeInTheDocument());
    await waitFor(() => expect(submit).toBeEnabled());
    expect(fields.name).toHaveValue('Verified application');
    expect(view.requests).toEqual([]);
  });

  it('shows read-only details without edit or upload controls', async () => {
    await open({ canWrite: false });
    expect(screen.getByText('Existing application')).toBeInTheDocument();
    expect(screen.getByText('Existing description')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
