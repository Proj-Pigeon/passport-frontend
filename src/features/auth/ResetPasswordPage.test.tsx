import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { seedUser, signIn } from '@/test/mocks/db';
import { mockDb, server } from '@/test/mocks/server';
import { renderRoute } from '@/test/render';

const OLD_PASSWORD = 'correct-horse-battery';
const NEW_PASSWORD = 'a-brand-new-secret';
const TOKEN = 'reset_token_that_is_long_enough';

function seedUserWithResetToken() {
  const user = seedUser(mockDb, {
    id: 'usr_reset',
    username: 'alice',
    email: 'alice@example.com',
    password: OLD_PASSWORD,
  });
  mockDb.resetTokens.set(TOKEN, user.id);
  return user;
}

async function openResetPage(path = `/reset-password?token=${TOKEN}`) {
  renderRoute([path]);
  return screen.findByLabelText(/^新密码/);
}

describe('ResetPasswordPage', () => {
  it('resets the password and signs every session out', async () => {
    const user = seedUserWithResetToken();
    signIn(mockDb, user, 'pwd');
    const interaction = userEvent.setup();
    await openResetPage();

    await interaction.type(screen.getByLabelText(/^新密码/), NEW_PASSWORD);
    await interaction.type(screen.getByLabelText(/^确认新密码/), NEW_PASSWORD);
    await interaction.click(screen.getByRole('button', { name: '重置密码' }));

    expect(await screen.findByRole('heading', { name: '密码已重置' })).toBeInTheDocument();
    expect(screen.getByText(/所有设备已登出/)).toBeInTheDocument();
    expect(user.password).toBe(NEW_PASSWORD);
    expect(mockDb.currentUserId).toBeNull();
  });

  it('consumes the token so it cannot be replayed', async () => {
    seedUserWithResetToken();
    const interaction = userEvent.setup();
    await openResetPage();

    await interaction.type(screen.getByLabelText(/^新密码/), NEW_PASSWORD);
    await interaction.type(screen.getByLabelText(/^确认新密码/), NEW_PASSWORD);
    await interaction.click(screen.getByRole('button', { name: '重置密码' }));

    await screen.findByRole('heading', { name: '密码已重置' });
    expect(mockDb.resetTokens.has(TOKEN)).toBe(false);
  });

  it('reports an expired or unknown token', async () => {
    seedUserWithResetToken();
    const interaction = userEvent.setup();
    await openResetPage('/reset-password?token=a_completely_unknown_token');

    await interaction.type(screen.getByLabelText(/^新密码/), NEW_PASSWORD);
    await interaction.type(screen.getByLabelText(/^确认新密码/), NEW_PASSWORD);
    await interaction.click(screen.getByRole('button', { name: '重置密码' }));

    expect(await screen.findByRole('heading', { name: '链接无效或已过期' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '重新申请' })).toBeInTheDocument();
  });

  it('blocks submission when the confirmation does not match', async () => {
    seedUserWithResetToken();
    let called = false;
    server.use(
      http.post('*/v1/recovery/password/reset', () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const interaction = userEvent.setup();
    await openResetPage();

    await interaction.type(screen.getByLabelText(/^新密码/), NEW_PASSWORD);
    await interaction.type(screen.getByLabelText(/^确认新密码/), 'a-different-secret');
    await interaction.click(screen.getByRole('button', { name: '重置密码' }));

    expect(await screen.findByText('两次输入的密码不一致')).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it('backfills a 422 password rejection from the server', async () => {
    seedUserWithResetToken();
    server.use(
      http.post('*/v1/recovery/password/reset', () =>
        HttpResponse.json(
          {
            error: {
              code: 'validation_failed',
              message: 'The request is not valid.',
              request_id: 'req_reset_422',
              fields: [{ name: 'password', code: 'invalid_format' }],
            },
          },
          { status: 422 },
        ),
      ),
    );
    const interaction = userEvent.setup();
    await openResetPage();

    await interaction.type(screen.getByLabelText(/^新密码/), NEW_PASSWORD);
    await interaction.type(screen.getByLabelText(/^确认新密码/), NEW_PASSWORD);
    await interaction.click(screen.getByRole('button', { name: '重置密码' }));

    expect(await screen.findByText('密码不符合要求（至少 12 个字符）。')).toBeInTheDocument();
    expect(screen.getByText('req_reset_422')).toBeInTheDocument();
  });

  it('explains what to do when no token is present', async () => {
    renderRoute(['/reset-password']);

    expect(await screen.findByRole('heading', { name: '链接无效或已过期' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^新密码/)).not.toBeInTheDocument();
  });
});
