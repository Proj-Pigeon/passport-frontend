import { ModalsProvider } from '@mantine/modals';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { queryKeys } from '@/features/session/keys';
import * as image from '@/lib/image';
import {
  grantAccountRole,
  grantStepUp,
  seedDeveloperResource,
  seedUser,
  signIn,
} from '@/test/mocks/db';
import { mockDb, server } from '@/test/mocks/server';
import { renderWithProviders } from '@/test/render';

import { developerPanelKeys } from '../keys';
import { DeveloperApplicationLogoUploader } from './DeveloperApplicationLogoUploader';

const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function png(name = 'application.png') {
  return new File([pngBytes], name, { type: 'image/png' });
}

function prepared(): image.AvatarPrepareResult {
  return {
    ok: true,
    avatar: { blob: png(), mediaType: 'image/png', size: 8, width: 320, height: 240 },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 320, height: 240, close: vi.fn() })),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function uploader(canWrite: boolean | undefined) {
  return (
    <MemoryRouter>
      <ModalsProvider>
        <DeveloperApplicationLogoUploader
          applicationId="apl_logo"
          displayName="Logo application"
          canWrite={canWrite}
        />
      </ModalsProvider>
    </MemoryRouter>
  );
}

async function open(
  options: {
    exists?: boolean;
    verified?: boolean;
    stepUpRequired?: boolean;
    canWrite?: boolean;
    failUploadOnce?: boolean;
    failDeleteOnce?: boolean;
    uploadGate?: Promise<void>;
    deleteGate?: Promise<void>;
  } = {},
) {
  const account = seedUser(mockDb, { step_up_required: options.stepUpRequired ?? true });
  signIn(mockDb, account, 'pwd');
  if (options.verified !== false) grantStepUp(mockDb);
  grantAccountRole(mockDb, account.id, ['developer']);
  seedDeveloperResource(mockDb, { id: 'apl_logo', owner_user_id: account.id });
  let exists = options.exists ?? true;
  const uploads: unknown[] = [];
  const deletes: string[] = [];
  const reads: string[] = [];
  const adminRequests: string[] = [];
  const unavailable = () =>
    HttpResponse.json(
      { error: { code: 'dependency_unavailable', message: 'Try again' } },
      { status: 503 },
    );
  server.use(
    http.all('*/admin/v1/*', ({ request }) => {
      adminRequests.push(request.url);
      return new HttpResponse(null, { status: 500 });
    }),
    http.get('*/v1/developer/applications/apl_logo/logo', ({ request }) => {
      reads.push(request.url);
      return exists
        ? new HttpResponse(pngBytes, { headers: { 'Content-Type': 'image/png' } })
        : new HttpResponse(null, { status: 404 });
    }),
    http.put('*/v1/developer/applications/apl_logo/logo', async ({ request }) => {
      uploads.push(await request.json());
      await options.uploadGate;
      if (options.failUploadOnce && uploads.length === 1) return unavailable();
      exists = true;
      return new HttpResponse(null, { status: 204 });
    }),
    http.delete('*/v1/developer/applications/apl_logo/logo', async ({ request }) => {
      deletes.push(request.url);
      await options.deleteGate;
      if (options.failDeleteOnce && deletes.length === 1) return unavailable();
      exists = false;
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const view = renderWithProviders(uploader(options.canWrite ?? true));
  await waitFor(() => expect(view.queryClient.getQueryData(queryKeys.session)).toBeDefined());
  await waitFor(() =>
    expect(
      view.queryClient.getQueryState(developerPanelKeys.applicationLogo('apl_logo'))?.status,
    ).toBe('success'),
  );
  if (exists) await screen.findByRole('img', { name: 'Logo application' });
  const input = view.container.querySelector<HTMLInputElement>('input[type="file"]');
  return { ...view, uploads, deletes, reads, adminRequests, input };
}

async function select(view: Awaited<ReturnType<typeof open>>, file = png()) {
  if (!view.input) throw new Error('Logo file input is missing');
  await userEvent.setup({ applyAccept: false }).upload(view.input, file);
}

function uploadButton() {
  return screen.getByRole('button', { name: '上传图片' });
}

function expectNoUploadConfirmation() {
  expect(
    screen.queryByRole('button', { name: /选择图片|更换图标|上传图标|确认上传|取消/ }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText('选择图片后需再次确认上传才会生效。')).not.toBeInTheDocument();
  expect(screen.queryByText('application.png')).not.toBeInTheDocument();
  expect(screen.queryByText(/320 × 240/)).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
}

describe('developer application logo upload', () => {
  it.each([true, false])(
    'automatically uploads a selection without a preview or confirmation (existing logo: %s)',
    async (exists) => {
      const gate = deferred<void>();
      const view = await open({ exists, uploadGate: gate.promise });
      const prepare = vi.spyOn(image, 'prepareAvatarFile');
      const currentUrl = screen.queryByRole('img')?.getAttribute('src');
      expect(uploadButton().querySelector('.tabler-icon-upload')).toBeInTheDocument();
      expect(screen.getAllByText('支持 PNG 或 JPEG，不超过 512 KB。')).toHaveLength(1);
      expect(view.input).toHaveAttribute('accept', 'image/png,image/jpeg');
      expectNoUploadConfirmation();
      await select(view);
      await waitFor(() =>
        expect(view.uploads).toEqual([
          { media_type: 'image/png', content: btoa(String.fromCharCode(...pngBytes)) },
        ]),
      );
      expect(prepare).toHaveBeenCalledOnce();
      expect(view.input?.files).toHaveLength(0);
      expect(uploadButton()).toBeDisabled();
      expect(uploadButton()).toHaveAttribute('data-loading');
      expectNoUploadConfirmation();
      if (exists) {
        expect(screen.getByRole('img', { name: 'Logo application' })).toHaveAttribute(
          'src',
          currentUrl,
        );
      } else {
        expect(screen.queryByRole('img')).not.toBeInTheDocument();
        expect(view.container.querySelector('.tabler-icon-photo')).toBeInTheDocument();
      }
      await act(async () => gate.resolve());
      await waitFor(() => expect(uploadButton()).toBeEnabled());
      expect(screen.getByRole('img', { name: 'Logo application' })).toHaveAttribute(
        'src',
        expect.stringContaining('/v1/developer/applications/apl_logo/logo?v='),
      );
      if (exists) expect(screen.getByRole('img').getAttribute('src')).not.toBe(currentUrl);
      expect(view.reads).toHaveLength(2);
      expect(view.adminRequests).toEqual([]);
      expectNoUploadConfirmation();
    },
  );

  it('uploads JPEG files with the detected media type', async () => {
    const view = await open();
    const bytes = new Uint8Array([0xff, 0xd8, 0xff]);
    await select(view, new File([bytes], 'application.jpg', { type: 'image/jpeg' }));
    await waitFor(() => expect(uploadButton()).toBeEnabled());
    expect(view.uploads).toEqual([
      { media_type: 'image/jpeg', content: btoa(String.fromCharCode(...bytes)) },
    ]);
  });

  it('does not validate or write when the system file selection is cancelled', async () => {
    const view = await open();
    const prepare = vi.spyOn(image, 'prepareAvatarFile');
    await userEvent.click(uploadButton());
    fireEvent.change(view.input!, { target: { files: [] } });
    expect(prepare).not.toHaveBeenCalled();
    expect(view.uploads).toEqual([]);
    expect(view.deletes).toEqual([]);
    expect(view.queryClient.getMutationCache().getAll()).toHaveLength(0);
    expect(uploadButton()).toBeEnabled();
    expectNoUploadConfirmation();
  });

  it('keeps the current logo after failure and retries by selecting the same file again', async () => {
    const view = await open({ failUploadOnce: true });
    const file = png();
    const currentUrl = screen.getByRole('img').getAttribute('src');
    await select(view, file);
    await screen.findByRole('alert');
    expect(screen.getByRole('img', { name: 'Logo application' })).toHaveAttribute(
      'src',
      currentUrl,
    );
    expect(view.input?.files).toHaveLength(0);
    expect(uploadButton()).toBeEnabled();
    expectNoUploadConfirmation();
    await select(view, file);
    await waitFor(() => expect(view.uploads).toHaveLength(2));
    await waitFor(() => expect(uploadButton()).toBeEnabled());
    expect(view.uploads[1]).toEqual(view.uploads[0]);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(view.reads).toHaveLength(2);
  });

  it.each([
    [
      'corrupt bytes',
      () => new File(['not an image'], 'invalid.png', { type: 'image/png' }),
      '图片无法解析，请更换文件。',
    ],
    [
      'unsupported type',
      () => new File(['gif'], 'invalid.gif', { type: 'image/gif' }),
      '仅支持 JPEG 或 PNG 格式。',
    ],
    [
      'mismatched type',
      () => new File([pngBytes], 'invalid.jpg', { type: 'image/jpeg' }),
      '文件真实格式与声明的类型不一致。',
    ],
    [
      'oversized image',
      () =>
        new File([new Uint8Array(image.AVATAR_MAX_BYTES + 1)], 'large.png', { type: 'image/png' }),
      '图片超过 512 KB 限制。',
    ],
    [
      'unreadable file',
      () => {
        const file = png();
        vi.spyOn(file, 'arrayBuffer').mockRejectedValue(new Error('Cannot read file'));
        return file;
      },
      '图片读取失败，请重试。',
    ],
  ] as const)('rejects %s before uploading', async (_case, file, message) => {
    const view = await open();
    await select(view, file());
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('img', { name: 'Logo application' })).toBeInTheDocument();
    expect(uploadButton()).toBeEnabled();
    expect(view.uploads).toEqual([]);
    expect(view.queryClient.getMutationCache().getAll()).toHaveLength(0);
    expectNoUploadConfirmation();
  });

  it('rejects an image that cannot be decoded', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('Invalid image')));
    const view = await open();
    await select(view);
    expect(await screen.findByRole('alert')).toHaveTextContent('图片无法解析，请更换文件。');
    expect(uploadButton()).toBeEnabled();
    expect(view.uploads).toEqual([]);
  });

  it('rejects images with invalid dimensions', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: image.AVATAR_MAX_DIMENSION + 1, height: 240, close: vi.fn() })),
    );
    const view = await open();
    await select(view);
    expect(await screen.findByRole('alert')).toHaveTextContent('图片宽高需在 1 ~ 2048 像素之间。');
    expect(view.uploads).toEqual([]);
  });

  it('releases the busy state after an unexpected validation error for same-file retry', async () => {
    vi.spyOn(image, 'prepareAvatarFile').mockRejectedValueOnce(new Error('Cannot read file'));
    const view = await open();
    const file = png();
    await select(view, file);
    expect(await screen.findByRole('alert')).toHaveTextContent('图片读取失败，请重试。');
    expect(uploadButton()).toBeEnabled();
    expect(view.uploads).toEqual([]);
    await select(view, file);
    await waitFor(() => expect(view.uploads).toHaveLength(1));
    await waitFor(() => expect(uploadButton()).toBeEnabled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each(['logo', 'avatar'])('shows server-side %s image field errors', async (name) => {
    const view = await open();
    server.use(
      http.put('*/v1/developer/applications/apl_logo/logo', () =>
        HttpResponse.json(
          {
            error: {
              code: 'validation_failed',
              fields: [{ name, code: 'unsupported_format' }],
            },
          },
          { status: 422 },
        ),
      ),
    );
    await select(view);
    expect(await screen.findByRole('alert')).toHaveTextContent('仅支持 JPEG 或 PNG 格式。');
    expect(uploadButton()).toBeEnabled();
    expect(screen.getByRole('img', { name: 'Logo application' })).toBeInTheDocument();
  });

  it('blocks more selections and deletion while validation is pending', async () => {
    const preparation = deferred<image.AvatarPrepareResult>();
    const prepare = vi
      .spyOn(image, 'prepareAvatarFile')
      .mockImplementationOnce(() => preparation.promise);
    const view = await open();
    fireEvent.change(view.input!, { target: { files: [png()] } });
    fireEvent.change(view.input!, { target: { files: [png('second.png')] } });
    expect(prepare).toHaveBeenCalledOnce();
    expect(view.input).toBeDisabled();
    expect(uploadButton()).toBeDisabled();
    expect(uploadButton()).toHaveAttribute('data-loading');
    const remove = screen.getByRole('button', { name: '移除图标' });
    expect(remove).toBeDisabled();
    await userEvent.click(remove);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(view.uploads).toEqual([]);
    expect(view.deletes).toEqual([]);
    await act(async () => preparation.resolve(prepared()));
    await waitFor(() => expect(view.uploads).toHaveLength(1));
    await waitFor(() => expect(uploadButton()).toBeEnabled());
  });

  it('blocks selection and deletion until an upload finishes', async () => {
    const gate = deferred<void>();
    const view = await open({ uploadGate: gate.promise });
    const prepare = vi.spyOn(image, 'prepareAvatarFile');
    await select(view);
    await waitFor(() => expect(view.uploads).toHaveLength(1));
    expect(view.input).toBeDisabled();
    expect(uploadButton()).toBeDisabled();
    const remove = screen.getByRole('button', { name: '移除图标' });
    expect(remove).toBeDisabled();
    fireEvent.change(view.input!, { target: { files: [png()] } });
    await userEvent.click(remove);
    expect(prepare).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(view.deletes).toEqual([]);
    await act(async () => gate.resolve());
    await waitFor(() => expect(uploadButton()).toBeEnabled());
    expect(view.uploads).toHaveLength(1);
    expect(remove).toBeEnabled();
  });

  it('requires removal confirmation and blocks selection while deletion is pending', async () => {
    const gate = deferred<void>();
    const view = await open({ deleteGate: gate.promise });
    const user = userEvent.setup();
    const prepare = vi.spyOn(image, 'prepareAvatarFile');
    await user.click(screen.getByRole('button', { name: '移除图标' }));
    let dialog = await screen.findByRole('dialog', { name: '移除图标' });
    expect(view.deletes).toEqual([]);
    expect(view.input).toBeDisabled();
    fireEvent.change(view.input!, { target: { files: [png()] } });
    expect(prepare).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: '取消' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(view.deletes).toEqual([]);
    expect(uploadButton()).toBeEnabled();
    await user.click(screen.getByRole('button', { name: '移除图标' }));
    dialog = await screen.findByRole('dialog', { name: '移除图标' });
    await user.dblClick(within(dialog).getByRole('button', { name: '删除' }));
    await waitFor(() => expect(view.deletes).toHaveLength(1));
    expect(view.input).toBeDisabled();
    expect(uploadButton()).toBeDisabled();
    expect(screen.getByRole('button', { name: '移除图标' })).toBeDisabled();
    fireEvent.change(view.input!, { target: { files: [png()] } });
    expect(prepare).not.toHaveBeenCalled();
    expect(view.uploads).toEqual([]);
    await act(async () => gate.resolve());
    await waitFor(() => expect(screen.queryByRole('img')).not.toBeInTheDocument());
    expect(uploadButton()).toBeEnabled();
    expect(view.container.querySelector('.tabler-icon-photo')).toBeInTheDocument();
    expect(view.reads).toHaveLength(2);
    expect(view.adminRequests).toEqual([]);
  });

  it('keeps the current logo after a failed deletion and allows another confirmed attempt', async () => {
    const view = await open({ failDeleteOnce: true });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '移除图标' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: '删除' }),
    );
    await screen.findByRole('alert');
    expect(screen.getByRole('img', { name: 'Logo application' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '移除图标' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: '删除' }),
    );
    await waitFor(() => expect(view.deletes).toHaveLength(2));
    await waitFor(() => expect(screen.queryByRole('img')).not.toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([true, false])(
    'requires verification immediately on selection and allows reselecting after cancellation (step-up enabled: %s)',
    async (stepUpRequired) => {
      const view = await open({ verified: false, stepUpRequired });
      const file = png();
      await select(view, file);
      const dialog = await screen.findByRole('dialog', { name: '安全验证' });
      expect(view.uploads).toEqual([]);
      expect(view.adminRequests).toEqual([]);
      expect(view.input).toBeDisabled();
      expect(screen.getByRole('img', { name: 'Logo application' })).toBeInTheDocument();
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(dialog).not.toBeInTheDocument());
      await waitFor(() => expect(uploadButton()).toBeEnabled());
      expect(view.uploads).toEqual([]);
      grantStepUp(mockDb);
      await act(async () => {
        await view.queryClient.invalidateQueries({ queryKey: queryKeys.session });
      });
      await select(view, file);
      await waitFor(() => expect(view.uploads).toHaveLength(1));
      await waitFor(() => expect(uploadButton()).toBeEnabled());
    },
  );

  it.each([false, undefined])('hides write controls when canWrite is %s', async (canWrite) => {
    const view = await open({ canWrite: false });
    view.rerender(uploader(canWrite));
    expect(screen.getByRole('img', { name: 'Logo application' })).toBeInTheDocument();
    expect(view.container.querySelector('input[type="file"]')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(view.uploads).toEqual([]);
    expect(view.deletes).toEqual([]);
  });

  it('does not upload if write permission is lost during validation', async () => {
    const preparation = deferred<image.AvatarPrepareResult>();
    vi.spyOn(image, 'prepareAvatarFile').mockImplementationOnce(() => preparation.promise);
    const view = await open();
    await select(view);
    view.rerender(uploader(false));
    await act(async () => preparation.resolve(prepared()));
    expect(view.uploads).toEqual([]);
    expect(view.queryClient.getMutationCache().getAll()).toHaveLength(0);
    view.rerender(uploader(true));
    expect(uploadButton()).toBeEnabled();
    const input = view.container.querySelector<HTMLInputElement>('input[type="file"]');
    await select({ ...view, input });
    await waitFor(() => expect(view.uploads).toHaveLength(1));
    await waitFor(() => expect(uploadButton()).toBeEnabled());
  });

  it('prevents confirming deletion after write permission is lost', async () => {
    const view = await open();
    await userEvent.click(screen.getByRole('button', { name: '移除图标' }));
    const confirm = within(await screen.findByRole('dialog')).getByRole('button', {
      name: '删除',
    });
    view.rerender(uploader(false));
    fireEvent.click(confirm);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(view.deletes).toEqual([]);
    expect(view.queryClient.getMutationCache().getAll()).toHaveLength(0);
  });

  it.each(['valid', 'invalid', 'rejected'] as const)(
    'does not start a mutation when validation completes after unmount (%s)',
    async (result) => {
      const preparation = deferred<image.AvatarPrepareResult>();
      vi.spyOn(image, 'prepareAvatarFile').mockImplementationOnce(() => preparation.promise);
      const view = await open();
      await select(view);
      view.unmount();
      await act(async () => {
        if (result === 'rejected') preparation.reject(new Error('Cannot read file'));
        else {
          preparation.resolve(
            result === 'valid' ? prepared() : { ok: false, issue: 'invalid_image' },
          );
        }
      });
      expect(view.uploads).toEqual([]);
      expect(view.deletes).toEqual([]);
      expect(view.queryClient.getMutationCache().getAll()).toHaveLength(0);
    },
  );

  it('settles an already-started upload safely after unmount', async () => {
    const gate = deferred<void>();
    const view = await open({ uploadGate: gate.promise });
    await select(view);
    await waitFor(() => expect(view.uploads).toHaveLength(1));
    view.unmount();
    await act(async () => gate.resolve());
    await waitFor(() =>
      expect(view.queryClient.getMutationCache().getAll()[0]?.state.status).toBe('success'),
    );
    expect(view.uploads).toHaveLength(1);
    expect(view.deletes).toEqual([]);
  });
});
