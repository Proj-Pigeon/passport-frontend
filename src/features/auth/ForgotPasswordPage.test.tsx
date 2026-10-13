import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { seedUser } from '@/test/mocks/db';
import { mockDb, server } from '@/test/mocks/server';
import { renderRoute } from '@/test/render';

async function openPage() {
  renderRoute(['/forgot-password']);
  await screen.findByRole('heading', { name: '找回密码' });
}

async function submitEmail(user: ReturnType<typeof userEvent.setup>, email: string) {
  await user.type(screen.getByLabelText(/^邮箱/), email);
  await user.click(screen.getByRole('button', { name: '发送重置邮件' }));
}

describe('ForgotPasswordPage', () => {
  it('issues a reset token for a known address', async () => {
    seedUser(mockDb, { id: 'usr_known', email: 'alice@example.com' });
    const user = userEvent.setup();
    await openPage();

    await submitEmail(user, 'alice@example.com');

    expect(await screen.findByRole('heading', { name: '重置邮件已发出' })).toBeInTheDocument();
    expect(mockDb.resetTokens.has('reset_usr_known')).toBe(true);
  });

  it('shows the identical result for an unknown address', async () => {
    let payload: Record<string, unknown> | null = null;
    server.use(
      http.post('*/v1/recovery/password', async ({ request }) => {
        payload = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ status: 'accepted' }, { status: 202 });
      }),
    );
    const user = userEvent.setup();
    await openPage();

    await submitEmail(user, 'nobody@example.com');

    expect(await screen.findByRole('heading', { name: '重置邮件已发出' })).toBeInTheDocument();
    expect(screen.getByText(/如该邮箱已注册/)).toBeInTheDocument();
    expect(payload).toEqual({ email: 'nobody@example.com' });
  });

  it('normalizes the address before submitting', async () => {
    let payload: Record<string, unknown> | null = null;
    server.use(
      http.post('*/v1/recovery/password', async ({ request }) => {
        payload = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ status: 'accepted' }, { status: 202 });
      }),
    );
    const user = userEvent.setup();
    await openPage();

    await submitEmail(user, '  Alice@Example.COM ');

    expect(await screen.findByRole('heading', { name: '重置邮件已发出' })).toBeInTheDocument();
    expect(payload).toEqual({ email: 'alice@example.com' });
  });

  it('blocks an invalid address on the client', async () => {
    let called = false;
    server.use(
      http.post('*/v1/recovery/password', () => {
        called = true;
        return HttpResponse.json({ status: 'accepted' }, { status: 202 });
      }),
    );
    const user = userEvent.setup();
    await openPage();

    await submitEmail(user, 'not-an-email');

    expect(await screen.findByText('邮箱格式不正确')).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it('arms the countdown on 429', async () => {
    server.use(
      http.post('*/v1/recovery/password', () =>
        HttpResponse.json(
          { error: { code: 'rate_limited', message: 'slow down' } },
          { status: 429, headers: { 'Retry-After': '60' } },
        ),
      ),
    );
    const user = userEvent.setup();
    await openPage();

    await submitEmail(user, 'alice@example.com');

    const button = await screen.findByRole('button', { name: /尝试过于频繁/ });
    expect(button).toBeDisabled();
  });
});
