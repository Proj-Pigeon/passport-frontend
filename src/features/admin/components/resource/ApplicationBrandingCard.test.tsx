import { ModalsProvider } from '@mantine/modals';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import * as resourcesApi from '@/api/endpoints/admin/resources';
import * as image from '@/lib/image';
import { mockDb, seedAdminResource } from '@/test/mocks/server';
import { renderWithProviders } from '@/test/render';

import { ApplicationBrandingCard } from './ApplicationBrandingCard';

function open(canWrite = true) {
  const resource = seedAdminResource(mockDb, { id: 'apl_upload', display_name: 'Test app' });
  const getLogo = vi.spyOn(resourcesApi, 'getApplicationLogo').mockResolvedValue(null);
  const upload = vi.spyOn(resourcesApi, 'uploadApplicationLogo').mockResolvedValue(undefined);
  const view = renderWithProviders(
    <MemoryRouter>
      <ModalsProvider>
        <ApplicationBrandingCard
          resource={resource}
          etag='"1"'
          refresh={async () => {}}
          canWrite={canWrite}
        />
      </ModalsProvider>
    </MemoryRouter>,
  );
  return { ...view, getLogo, upload };
}

function prepare(file: File) {
  return vi.spyOn(image, 'prepareAvatarFile').mockResolvedValue({
    ok: true,
    avatar: { blob: file, mediaType: 'image/png', width: 32, height: 32, size: file.size },
  });
}

function fileInput(container: HTMLElement) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error('Image upload input is missing');
  return input;
}

describe('administrator application image upload', () => {
  it('uploads immediately after selection and refreshes the saved image', async () => {
    const file = new File(['png'], 'logo.png', { type: 'image/png' });
    const validate = prepare(file);
    const view = open();
    await waitFor(() => expect(view.getLogo).toHaveBeenCalledTimes(1));
    view.getLogo.mockResolvedValue({ blob: file, contentType: 'image/png', etag: null });
    const button = screen.getByRole('button', { name: '上传图片' });
    expect(button.querySelector('svg.tabler-icon-upload')).not.toBeNull();
    await userEvent.setup().upload(fileInput(view.container), file);
    await waitFor(() => expect(view.upload).toHaveBeenCalledTimes(1));
    expect(validate).toHaveBeenCalledWith(file);
    expect(view.upload).toHaveBeenCalledWith('apl_upload', expect.any(File), 'image/png');
    await waitFor(() => expect(view.getLogo).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '上传图片' })).toHaveLength(1);
    expect(screen.queryByText(/再次确认上传/)).not.toBeInTheDocument();
  });

  it('rejects an invalid image without sending an upload', async () => {
    vi.spyOn(image, 'prepareAvatarFile').mockResolvedValue({ ok: false, issue: 'too_large' });
    const view = open();
    await userEvent
      .setup()
      .upload(fileInput(view.container), new File(['invalid'], 'large.png', { type: 'image/png' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/512/);
    expect(view.upload).not.toHaveBeenCalled();
  });

  it('lets the same file be selected again after an upload failure', async () => {
    const file = new File(['png'], 'logo.png', { type: 'image/png' });
    prepare(file);
    const view = open();
    view.upload.mockRejectedValueOnce(new Error('Upload failed'));
    const user = userEvent.setup();
    await user.upload(fileInput(view.container), file);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await user.upload(fileInput(view.container), file);
    await waitFor(() => expect(view.upload).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('does not expose upload controls in read-only mode', () => {
    const view = open(false);
    expect(screen.queryByRole('button', { name: '上传图片' })).not.toBeInTheDocument();
    expect(view.container.querySelector('input[type="file"]')).toBeNull();
    expect(view.upload).not.toHaveBeenCalled();
  });
});
