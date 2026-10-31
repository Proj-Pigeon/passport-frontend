import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mockDb, seedUser, server, signIn } from '@/test/mocks/server';
import { renderRoute } from '@/test/render';

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const GIF_HEADER = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];

function imageFile(header: readonly number[], name: string, type: string): File {
  const bytes = new Uint8Array(header.length + 32);
  bytes.set(header, 0);
  return new File([bytes.buffer as ArrayBuffer], name, { type });
}

function fileInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) {
    throw new Error('the avatar file input was not rendered');
  }
  return input;
}

async function openProfilePage() {
  renderRoute(['/account/profile']);
  await screen.findByLabelText(/^昵称/);
}

beforeEach(() => {
  vi.stubGlobal('createImageBitmap', async () => ({ width: 512, height: 512, close: () => {} }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ProfilePage display name', () => {
  it('renders a federation account without a mailbox', async () => {
    signIn(mockDb, seedUser(mockDb, { email: '', email_verified: false }), 'federation');
    await openProfilePage();

    expect(screen.getByText('未绑定邮箱')).toBeInTheDocument();
    expect(screen.queryByText('邮箱未验证')).not.toBeInTheDocument();
  });

  it('saves a new display name', async () => {
    signIn(mockDb, seedUser(mockDb, { display_name: 'Alice' }), 'pwd');
    const user = userEvent.setup();
    await openProfilePage();

    const input = screen.getByLabelText(/^昵称/);
    await user.clear(input);
    await user.type(input, 'Alice Wang');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(mockDb.users[0]?.display_name).toBe('Alice Wang'));
    expect(await screen.findByText('资料已更新')).toBeInTheDocument();
  });

  it('keeps the save button disabled until the value changes', async () => {
    signIn(mockDb, seedUser(mockDb, { display_name: 'Alice' }), 'pwd');
    await openProfilePage();

    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
  });

  it('backfills a 422 field error from the server', async () => {
    signIn(mockDb, seedUser(mockDb, { display_name: 'Alice' }), 'pwd');
    server.use(
      http.patch('*/v1/me', () =>
        HttpResponse.json(
          {
            error: {
              code: 'validation_failed',
              message: 'The request is not valid.',
              fields: [{ name: 'display_name', code: 'invalid_format' }],
            },
          },
          { status: 422 },
        ),
      ),
    );
    const user = userEvent.setup();
    await openProfilePage();

    const input = screen.getByLabelText(/^昵称/);
    await user.clear(input);
    await user.type(input, 'Bob');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText('昵称格式不正确。')).toBeInTheDocument();
    expect(mockDb.users[0]?.display_name).toBe('Alice');
  });

  it('shows the locked username and email alongside the editable name', async () => {
    signIn(mockDb, seedUser(mockDb, { username: 'alice' }), 'pwd');
    await openProfilePage();

    expect(screen.getByText('@alice')).toBeInTheDocument();
    expect(screen.getByText('用户名暂不支持修改')).toBeInTheDocument();
    expect(screen.getByText('可在「安全」页修改邮箱')).toBeInTheDocument();
  });

  it('hides the external identities section when no provider is configured', async () => {
    signIn(mockDb, seedUser(mockDb), 'pwd');
    await openProfilePage();

    expect(screen.queryByRole('heading', { name: '第三方身份' })).not.toBeInTheDocument();
  });
});

describe('ProfilePage avatar', () => {
  const uploadRequest = vi.fn();
  const trackUploadRequest = ({ request }: { request: Request }) => {
    if (request.method === 'PUT' && new URL(request.url).pathname === '/v1/me/avatar') {
      uploadRequest(request);
    }
  };

  beforeEach(() => {
    uploadRequest.mockClear();
    server.events.on('request:start', trackUploadRequest);
  });

  afterEach(() => {
    server.events.removeListener('request:start', trackUploadRequest);
  });

  it('uploads a chosen image immediately and displays the saved avatar', async () => {
    signIn(mockDb, seedUser(mockDb), 'pwd');
    const user = userEvent.setup();
    await openProfilePage();

    const uploadButton = screen.getByRole('button', { name: '上传图片' });
    expect(uploadButton.querySelector('svg.tabler-icon-upload')).toBeInTheDocument();
    expect(screen.queryByText('选择图片后需再次确认上传才会生效。')).not.toBeInTheDocument();
    await user.upload(fileInput(), imageFile(PNG_HEADER, 'avatar.png', 'image/png'));

    await waitFor(() => expect(mockDb.avatar?.mediaType).toBe('image/png'));
    expect(uploadRequest).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('头像已更新')).toBeInTheDocument();
    await waitFor(() =>
      expect(document.querySelector('img[src*="/v1/me/avatar"]')).toBeInTheDocument(),
    );
    expect(screen.queryByText('avatar.png')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '上传头像' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '取消' })).not.toBeInTheDocument();
    expect(document.querySelector('img[src^="blob:"]')).not.toBeInTheDocument();
    expect(uploadButton).toBeEnabled();
  });

  it('does not upload when the file picker is cancelled', async () => {
    signIn(mockDb, seedUser(mockDb), 'pwd');
    const user = userEvent.setup();
    await openProfilePage();

    await user.click(screen.getByRole('button', { name: '上传图片' }));
    fireEvent.change(fileInput(), { target: { files: [] } });

    expect(uploadRequest).not.toHaveBeenCalled();
    expect(mockDb.avatar).toBeNull();
    expect(screen.getByRole('button', { name: '上传图片' })).toBeEnabled();
  });

  it('rejects an unsupported file type before contacting the server', async () => {
    signIn(mockDb, seedUser(mockDb), 'pwd');
    const user = userEvent.setup({ applyAccept: false });
    await openProfilePage();

    await user.upload(fileInput(), imageFile(GIF_HEADER, 'avatar.gif', 'image/gif'));

    expect(await screen.findByText('仅支持 JPEG 或 PNG 格式。')).toBeInTheDocument();
    expect(uploadRequest).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '上传图片' })).toBeEnabled();
    expect(mockDb.avatar).toBeNull();
  });

  it('rejects a file whose bytes contradict the declared type', async () => {
    signIn(mockDb, seedUser(mockDb), 'pwd');
    const user = userEvent.setup();
    await openProfilePage();

    await user.upload(fileInput(), imageFile(PNG_HEADER, 'avatar.jpg', 'image/jpeg'));

    expect(await screen.findByText('文件真实格式与声明的类型不一致。')).toBeInTheDocument();
    expect(uploadRequest).not.toHaveBeenCalled();
    expect(mockDb.avatar).toBeNull();
  });

  it('rejects an oversized file before contacting the server', async () => {
    signIn(mockDb, seedUser(mockDb), 'pwd');
    const user = userEvent.setup();
    await openProfilePage();

    const oversized = new File([new Uint8Array(512 * 1024 + 1)], 'oversized.png', {
      type: 'image/png',
    });
    await user.upload(fileInput(), oversized);

    expect(await screen.findByText('图片超过 512 KB 限制。')).toBeInTheDocument();
    expect(uploadRequest).not.toHaveBeenCalled();
    expect(mockDb.avatar).toBeNull();
  });

  it('shows a server rejection and retries when the same file is selected again', async () => {
    signIn(mockDb, seedUser(mockDb), 'pwd');
    server.use(
      http.put(
        '*/v1/me/avatar',
        () =>
          HttpResponse.json(
            {
              error: {
                code: 'validation_failed',
                message: 'The request is not valid.',
                fields: [{ name: 'avatar', code: 'too_large' }],
              },
            },
            { status: 422 },
          ),
        { once: true },
      ),
    );
    const user = userEvent.setup();
    await openProfilePage();
    const file = imageFile(PNG_HEADER, 'avatar.png', 'image/png');

    await user.upload(fileInput(), file);

    expect(await screen.findByText('图片超过 512 KB 限制。')).toBeInTheDocument();
    expect(uploadRequest).toHaveBeenCalledTimes(1);
    expect(mockDb.avatar).toBeNull();
    expect(screen.queryByText('avatar.png')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '上传图片' })).toBeEnabled();

    await user.upload(fileInput(), file);

    expect(await screen.findByText('头像已更新')).toBeInTheDocument();
    expect(uploadRequest).toHaveBeenCalledTimes(2);
    expect(mockDb.avatar?.mediaType).toBe('image/png');
    expect(screen.queryByText('图片超过 512 KB 限制。')).not.toBeInTheDocument();
  });

  it('disables uploads and deletion while preparing and uploading an image', async () => {
    mockDb.avatar = { mediaType: 'image/png', content: new Uint8Array(PNG_HEADER) };
    signIn(mockDb, seedUser(mockDb), 'pwd');
    const bitmap = { width: 512, height: 512, close: vi.fn() };
    let finishReading!: (value: typeof bitmap) => void;
    const reading = new Promise<typeof bitmap>((resolve) => {
      finishReading = resolve;
    });
    const readImage = vi.fn(() => reading);
    vi.stubGlobal('createImageBitmap', readImage);
    let finishUpload!: () => void;
    const uploading = new Promise<void>((resolve) => {
      finishUpload = resolve;
    });
    server.use(
      http.put('*/v1/me/avatar', async () => {
        await uploading;
        return HttpResponse.json({
          url: '/v1/me/avatar',
          media_type: 'image/png',
          width: 512,
          height: 512,
          bytes: PNG_HEADER.length,
        });
      }),
    );
    const user = userEvent.setup();
    await openProfilePage();
    const uploadButton = screen.getByRole('button', { name: '上传图片' });
    const deleteButton = await screen.findByRole('button', { name: '删除' });
    const file = imageFile(PNG_HEADER, 'avatar.png', 'image/png');

    await user.upload(fileInput(), file);
    await waitFor(() => expect(readImage).toHaveBeenCalledTimes(1));
    expect(uploadButton).toBeDisabled();
    expect(deleteButton).toBeDisabled();
    expect(fileInput()).toBeDisabled();
    expect(uploadRequest).not.toHaveBeenCalled();
    fireEvent.change(fileInput(), { target: { files: [file] } });
    expect(readImage).toHaveBeenCalledTimes(1);

    await act(async () => finishReading(bitmap));
    await waitFor(() => expect(uploadRequest).toHaveBeenCalledTimes(1));
    expect(uploadButton).toBeDisabled();
    expect(deleteButton).toBeDisabled();
    expect(fileInput()).toBeDisabled();
    fireEvent.change(fileInput(), { target: { files: [file] } });
    expect(readImage).toHaveBeenCalledTimes(1);

    await act(async () => finishUpload());
    expect(await screen.findByText('头像已更新')).toBeInTheDocument();
    expect(uploadButton).toBeEnabled();
    expect(deleteButton).toBeEnabled();
    expect(uploadRequest).toHaveBeenCalledTimes(1);
  });

  it('does not upload an image whose validation finishes after unmounting', async () => {
    signIn(mockDb, seedUser(mockDb), 'pwd');
    const bitmap = { width: 512, height: 512, close: vi.fn() };
    let finishReading!: (value: typeof bitmap) => void;
    const reading = new Promise<typeof bitmap>((resolve) => {
      finishReading = resolve;
    });
    const readImage = vi.fn(() => reading);
    vi.stubGlobal('createImageBitmap', readImage);
    const user = userEvent.setup();
    const { unmount } = renderRoute(['/account/profile']);
    await screen.findByLabelText(/^昵称/);

    await user.upload(fileInput(), imageFile(PNG_HEADER, 'avatar.png', 'image/png'));
    await waitFor(() => expect(readImage).toHaveBeenCalledTimes(1));
    unmount();
    await act(async () => finishReading(bitmap));

    expect(bitmap.close).toHaveBeenCalledTimes(1);
    expect(uploadRequest).not.toHaveBeenCalled();
    expect(mockDb.avatar).toBeNull();
  });

  it('deletes the current avatar after confirmation', async () => {
    const bytes = new Uint8Array(PNG_HEADER.length + 32);
    bytes.set(PNG_HEADER, 0);
    mockDb.avatar = { mediaType: 'image/png', content: bytes };
    signIn(mockDb, seedUser(mockDb), 'pwd');
    const user = userEvent.setup();
    await openProfilePage();

    await user.click(await screen.findByRole('button', { name: '删除' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('删除头像')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: '删除' }));

    await waitFor(() => expect(mockDb.avatar).toBeNull());
    expect(await screen.findByText('头像已删除')).toBeInTheDocument();
  });

  it('disables image uploads while deleting the current avatar', async () => {
    mockDb.avatar = { mediaType: 'image/png', content: new Uint8Array(PNG_HEADER) };
    signIn(mockDb, seedUser(mockDb), 'pwd');
    let finishDelete!: () => void;
    const deleting = new Promise<void>((resolve) => {
      finishDelete = resolve;
    });
    server.use(
      http.delete('*/v1/me/avatar', async () => {
        await deleting;
        mockDb.avatar = null;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    await openProfilePage();
    await user.click(await screen.findByRole('button', { name: '删除' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: '删除' }));

    expect(screen.getByRole('button', { name: '上传图片' })).toBeDisabled();
    expect(fileInput()).toBeDisabled();
    fireEvent.change(fileInput(), {
      target: { files: [imageFile(PNG_HEADER, 'avatar.png', 'image/png')] },
    });
    await act(async () => finishDelete());

    expect(await screen.findByText('头像已删除')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '上传图片' })).toBeEnabled();
    expect(uploadRequest).not.toHaveBeenCalled();
  });

  it('hides the delete action when there is no avatar', async () => {
    signIn(mockDb, seedUser(mockDb), 'pwd');
    await openProfilePage();

    expect(screen.queryByRole('button', { name: '删除' })).not.toBeInTheDocument();
  });
});
