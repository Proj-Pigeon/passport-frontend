import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { seedUser } from '@/test/mocks/db';
import { mockDb, server } from '@/test/mocks/server';
import { renderRoute } from '@/test/render';

const PASSWORD = 'correct-horse-battery';

type User = ReturnType<typeof userEvent.setup>;

async function openRegisterPage() {
  renderRoute(['/register']);
  await screen.findByLabelText(/^用户名/);
}

async function fillForm(
  user: User,
  values: { username?: string; email?: string; password?: string; displayName?: string },
) {
  if (values.username !== undefined) {
    await user.type(screen.getByLabelText(/^用户名/), values.username);
  }
  if (values.email !== undefined) {
    await user.type(screen.getByLabelText(/^邮箱/), values.email);
  }
  if (values.password !== undefined) {
    await user.type(screen.getByLabelText(/^密码/), values.password);
  }
  if (values.displayName !== undefined) {
    await user.type(screen.getByLabelText(/^昵称/), values.displayName);
  }
}

describe('RegisterPage', () => {
  it('submits normalized values and omits an empty display name', async () => {
    const user = userEvent.setup();
    let payload: Record<string, unknown> | null = null;
    server.use(
      http.post('*/v1/registrations', async ({ request }) => {
        payload = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          { user_id: 'usr_1', status: 'pending_verification' },
          { status: 201 },
        );
      }),
    );

    await openRegisterPage();
    await fillForm(user, {
      username: 'Alice.Smith',
      email: ' Alice@Example.COM ',
      password: PASSWORD,
    });
    await user.click(screen.getByRole('button', { name: '注册' }));

    await waitFor(() => expect(payload).not.toBeNull());
    expect(payload).toEqual({
      username: 'alice.smith',
      email: 'alice@example.com',
      password: PASSWORD,
    });
  });

  it('includes the display name when provided', async () => {
    const user = userEvent.setup();
    let payload: Record<string, unknown> | null = null;
    server.use(
      http.post('*/v1/registrations', async ({ request }) => {
        payload = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ status: 'pending_verification' }, { status: 201 });
      }),
    );

    await openRegisterPage();
    await fillForm(user, {
      username: 'alice',
      email: 'alice@example.com',
      password: PASSWORD,
      displayName: '  Alice  ',
    });
    await user.click(screen.getByRole('button', { name: '注册' }));

    await waitFor(() => expect(payload).not.toBeNull());
    expect(payload).toMatchObject({ display_name: 'Alice' });
  });

  it('shows the same verification prompt whether or not user_id is returned', async () => {
    const user = userEvent.setup();
    await openRegisterPage();

    await fillForm(user, {
      username: 'alice',
      email: 'alice@example.com',
      password: PASSWORD,
    });
    await user.click(screen.getByRole('button', { name: '注册' }));

    expect(await screen.findByRole('heading', { name: '请查收验证邮件' })).toBeInTheDocument();
    expect(screen.getByText(/alice@example\.com/)).toBeInTheDocument();
    expect(mockDb.users).toHaveLength(1);
    expect(mockDb.users[0]?.email_verified).toBe(false);
  });

  it('does not reveal that an account already exists', async () => {
    seedUser(mockDb, { username: 'alice', email: 'alice@example.com' });
    const user = userEvent.setup();
    await openRegisterPage();

    await fillForm(user, {
      username: 'alice',
      email: 'alice@example.com',
      password: PASSWORD,
    });
    await user.click(screen.getByRole('button', { name: '注册' }));

    expect(await screen.findByRole('heading', { name: '请查收验证邮件' })).toBeInTheDocument();
    expect(screen.getByText(/无论邮箱或用户名是否已被占用/)).toBeInTheDocument();
    expect(mockDb.users).toHaveLength(1);
  });

  it('blocks submission on client-side validation errors', async () => {
    const user = userEvent.setup();
    let called = false;
    server.use(
      http.post('*/v1/registrations', () => {
        called = true;
        return HttpResponse.json({ status: 'pending_verification' }, { status: 201 });
      }),
    );

    await openRegisterPage();
    await fillForm(user, { username: 'ab', email: 'nope', password: 'short' });
    await user.click(screen.getByRole('button', { name: '注册' }));

    expect(await screen.findByText('用户名需为 3 ~ 64 个字符')).toBeInTheDocument();
    expect(screen.getByText('邮箱格式不正确')).toBeInTheDocument();
    expect(screen.getByText('密码至少需要 12 个字符')).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it('backfills 422 field errors from the server', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/v1/registrations', () =>
        HttpResponse.json(
          {
            error: {
              code: 'validation_failed',
              message: 'The request is not valid.',
              request_id: 'req_reg_422',
              fields: [
                { name: 'username', code: 'invalid_format' },
                { name: 'password', code: 'invalid_format' },
              ],
            },
          },
          { status: 422 },
        ),
      ),
    );

    await openRegisterPage();
    await fillForm(user, {
      username: 'alice',
      email: 'alice@example.com',
      password: PASSWORD,
    });
    await user.click(screen.getByRole('button', { name: '注册' }));

    expect(await screen.findByText('用户名格式不正确。')).toBeInTheDocument();
    expect(screen.getByText('密码不符合要求（至少 12 个字符）。')).toBeInTheDocument();
    expect(screen.getByText('req_reg_422')).toBeInTheDocument();
  });

  it('arms the retry countdown on 429', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/v1/registrations', () =>
        HttpResponse.json(
          { error: { code: 'rate_limited', message: 'slow down' } },
          { status: 429, headers: { 'Retry-After': '60' } },
        ),
      ),
    );

    await openRegisterPage();
    await fillForm(user, {
      username: 'alice',
      email: 'alice@example.com',
      password: PASSWORD,
    });
    await user.click(screen.getByRole('button', { name: '注册' }));

    const button = await screen.findByRole('button', { name: /尝试过于频繁/ });
    expect(button).toBeDisabled();
    expect(screen.getByText('尝试过于频繁，请稍后再试。')).toBeInTheDocument();
  });

  it('lowercases the username as it is typed', async () => {
    const user = userEvent.setup();
    await openRegisterPage();
    const username = screen.getByLabelText<HTMLInputElement>(/^用户名/);

    await user.type(username, 'Alice');
    expect(username).toHaveValue('alice');
  });
});
