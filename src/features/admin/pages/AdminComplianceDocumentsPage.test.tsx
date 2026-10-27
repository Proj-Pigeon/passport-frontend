import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { grantAdminStepUp, seedUser, signInAdmin } from '@/test/mocks/db';
import { mockDb, server } from '@/test/mocks/server';
import { renderRoute } from '@/test/render';

describe('AdminComplianceDocumentsPage HTML safety and tab drafts', () => {
  it('keeps all legal drafts as textarea values across tabs without rendering raw HTML and saves atomically', async () => {
    const user = userEvent.setup();
    const content = '# Policy\n\n<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">';
    let savedPayload: Record<string, unknown> | null = null;
    signInAdmin(mockDb, seedUser(mockDb), ['super_admin']);
    mockDb.adminSession?.capabilities.push('config:write');
    grantAdminStepUp(mockDb);
    server.use(
      http.get('*/admin/v1/compliance-documents', () =>
        HttpResponse.json({
          version: 1,
          terms_markdown: content,
          privacy_markdown: content,
          cross_border_markdown: content,
          cross_border_enabled: true,
          updated_at: '2026-10-19T00:00:00Z',
        }),
      ),
      http.patch('*/admin/v1/compliance-documents', async ({ request }) => {
        savedPayload = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          version: 2,
          ...savedPayload,
          updated_at: '2026-10-20T00:00:00Z',
        });
      }),
    );

    renderRoute(['/admin/compliance-documents']);

    const termsEditor = await screen.findByRole('textbox', { name: '用户协议' });
    await waitFor(() => expect(termsEditor).toHaveValue(content));
    fireEvent.change(termsEditor, {
      target: { value: '<iframe srcdoc="<script>alert(1)</script>"></iframe>' },
    });

    await user.click(screen.getByRole('tab', { name: '隐私政策' }));
    const privacyEditor = await screen.findByRole('textbox', { name: '隐私政策' });
    expect(privacyEditor).toHaveValue(content);
    fireEvent.change(privacyEditor, {
      target: { value: 'Updated privacy markdown' },
    });

    await user.click(screen.getByRole('tab', { name: /跨境数据传输声明/ }));
    const crossBorderEditor = await screen.findByRole('textbox', { name: '跨境数据传输声明' });
    expect(crossBorderEditor).toHaveValue(content);

    expect(document.querySelector('script, img[onerror], iframe[srcdoc]')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Policy' })).toBeNull();

    await user.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() =>
      expect(savedPayload).toEqual({
        terms_markdown: '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
        privacy_markdown: 'Updated privacy markdown',
        cross_border_enabled: true,
        cross_border_markdown: content,
      }),
    );
  });

  it('creates and approves key rotations via modals with If-Match version headers', async () => {
    const user = userEvent.setup();
    signInAdmin(mockDb, seedUser(mockDb), ['super_admin']);
    grantAdminStepUp(mockDb);

    renderRoute(['/admin/key-rotation-requests']);

    const createButtons = await screen.findAllByRole('button', { name: '创建轮换请求' });
    await user.click(createButtons[0]!);
    const createDialog = await screen.findByRole('dialog');
    await user.type(within(createDialog).getByLabelText(/^操作原因/), 'scheduled key rotation');
    await user.click(within(createDialog).getByRole('button', { name: '创建轮换请求' }));

    expect(await screen.findByText('kr_1')).toBeInTheDocument();

    const approveButtons = screen.getAllByRole('button', { name: '提交审批' });
    await user.click(approveButtons[approveButtons.length - 1]!);
    const approveDialog = await screen.findByRole('dialog');
    expect(within(approveDialog).getByLabelText(/^轮换请求 ID/)).toHaveValue('kr_1');
    expect(within(approveDialog).getByLabelText(/^版本/)).toHaveValue('1');
    await user.type(within(approveDialog).getByLabelText(/^操作原因/), 'promote to published');
    await user.click(within(approveDialog).getByRole('button', { name: '提交审批' }));

    await waitFor(() => expect(mockDb.adminKeyRotations[0]?.state).toBe('published'));
  });
});
