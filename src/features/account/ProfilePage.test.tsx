import { screen, waitFor, within } from '@testing-library/react';
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
    expect(screen.getByText('邮箱暂不支持修改')).toBeInTheDocument();
  });

  it('hides the external identities section when no provider is configured', async () => {
    signIn(mockDb, seedUser(mockDb), 'pwd');
    await openProfilePage();

    expect(screen.queryByRole('heading', { name: '第三方身份' })).not.toBeInTheDocument();
  });
});

describe('ProfilePage avatar', () => {
  it('previews a chosen file before uploading it', async () => {
    signIn(mockDb, seedUser(mockDb), 'pwd');
    const user = userEvent.setup();
    await openProfilePage();

    await user.upload(fileInput(), imageFile(PNG_HEADER, 'avatar.png', 'image/png'));

    expect(await screen.findByText('avatar.png')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '上传头像' })).toBeEnabled();
    expect(mockDb.avatar).toBeNull();
  });

  it('uploads the previewed image and refreshes the profile', async () => {
    signIn(mockDb, seedUser(mockDb), 'pwd');
    const user = userEvent.setup();
    await openProfilePage();

    await user.upload(fileInput(), imageFile(PNG_HEADER, 'avatar.png', 'image/png'));
    await user.click(await screen.findByRole('button', { name: '上传头像' }));

    await waitFor(() => expect(mockDb.avatar?.mediaType).toBe('image/png'));
    expect(await screen.findByText('头像已更新')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('avatar.png')).not.toBeInTheDocument());
  });

  it('rejects an unsupported file type before contacting the server', async () => {
    signIn(mockDb, seedUser(mockDb), 'pwd');
    const user = userEvent.setup({ applyAccept: false });
    await openProfilePage();

    await user.upload(fileInput(), imageFile(GIF_HEADER, 'avatar.gif', 'image/gif'));

    expect(await screen.findByText('仅支持 JPEG 或 PNG 格式。')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '上传头像' })).not.toBeInTheDocument();
    expect(mockDb.avatar).toBeNull();
  });

  it('rejects a file whose bytes contradict the declared type', async () => {
    signIn(mockDb, seedUser(mockDb), 'pwd');
    const user = userEvent.setup();
    await openProfilePage();

    await user.upload(fileInput(), imageFile(PNG_HEADER, 'avatar.jpg', 'image/jpeg'));

    expect(await screen.findByText('文件真实格式与声明的类型不一致。')).toBeInTheDocument();
  });

  it('surfaces a server-side rejection with the matching copy', async () => {
    signIn(mockDb, seedUser(mockDb), 'pwd');
    server.use(
      http.put('*/v1/me/avatar', () =>
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
      ),
    );
    const user = userEvent.setup();
    await openProfilePage();

    await user.upload(fileInput(), imageFile(PNG_HEADER, 'avatar.png', 'image/png'));
    await user.click(await screen.findByRole('button', { name: '上传头像' }));

    expect(await screen.findByText('图片超过 512 KB 限制。')).toBeInTheDocument();
    expect(screen.getByText('avatar.png')).toBeInTheDocument();
  });

  it('discards the preview when the user cancels', async () => {
    signIn(mockDb, seedUser(mockDb), 'pwd');
    const user = userEvent.setup();
    await openProfilePage();

    await user.upload(fileInput(), imageFile(PNG_HEADER, 'avatar.png', 'image/png'));
    await user.click(await screen.findByRole('button', { name: '取消' }));

    await waitFor(() => expect(screen.queryByText('avatar.png')).not.toBeInTheDocument());
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

  it('hides the delete action when there is no avatar', async () => {
    signIn(mockDb, seedUser(mockDb), 'pwd');
    await openProfilePage();

    expect(screen.queryByRole('button', { name: '删除' })).not.toBeInTheDocument();
  });
});
