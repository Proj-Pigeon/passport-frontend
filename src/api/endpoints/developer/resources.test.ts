import { afterEach, describe, expect, it } from 'vitest';
import { grantAccountRole, seedUser, signIn } from '@/test/mocks/db';
import { mockDb, server } from '@/test/mocks/server';
import { getDeveloperOverview } from './resources';

function login(developer = true) {
  const user = seedUser(mockDb);
  signIn(mockDb, user, 'pwd');
  if (developer) grantAccountRole(mockDb, user.id, ['developer']);
}

afterEach(() => server.events.removeAllListeners('request:start'));

describe('developer overview API date contract', () => {
  it('sends both absolute dates using the account scope and returns every inclusive day', async () => {
    login();
    const requests: string[] = [];
    server.events.on('request:start', ({ request }) => requests.push(request.url));
    const result = await getDeveloperOverview({ start_date: '2024-02-27', end_date: '2024-03-04' });
    const url = new URL(requests[0]!);
    expect(url.pathname).toBe('/v1/developer/overview');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      start_date: '2024-02-27',
      end_date: '2024-03-04',
    });
    expect(requests).toHaveLength(1);
    expect(result).toMatchObject({
      start_date: '2024-02-27',
      end_date: '2024-03-04',
      window_days: 7,
    });
    expect(result.daily_authorized.map((point) => point.date)).toEqual([
      '2024-02-27',
      '2024-02-28',
      '2024-02-29',
      '2024-03-01',
      '2024-03-02',
      '2024-03-03',
      '2024-03-04',
    ]);
  });

  it('separates historical windows of equal length', async () => {
    login();
    const first = await getDeveloperOverview({ start_date: '2024-02-01', end_date: '2024-02-07' });
    const second = await getDeveloperOverview({ start_date: '2024-03-01', end_date: '2024-03-07' });
    expect(first.window_days).toBe(second.window_days);
    expect(first.daily_authorized[0]?.date).toBe('2024-02-01');
    expect(second.daily_authorized[0]?.date).toBe('2024-03-01');
  });

  it('rejects a range exceeding twelve months', async () => {
    login();
    await expect(
      getDeveloperOverview({ start_date: '2025-01-01', end_date: '2026-01-01' }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
  });

  it('rejects accounts without a developer role', async () => {
    login(false);
    await expect(
      getDeveloperOverview({ start_date: '2024-02-01', end_date: '2024-02-01' }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });
});
