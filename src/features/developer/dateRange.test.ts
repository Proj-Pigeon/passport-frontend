import { describe, expect, it } from 'vitest';
import { offsetDate, rangeEnd, recentRange, validDateRange } from './dateRange';

describe('developer overview date ranges', () => {
  it('counts both endpoints and crosses months and years', () => {
    expect(rangeEnd('2025-12-28', 7)).toBe('2026-01-03');
    expect(rangeEnd('2026-01-28', 14)).toBe('2026-02-10');
    expect(recentRange(7, '2026-01-03')).toEqual({
      start_date: '2025-12-28',
      end_date: '2026-01-03',
    });
    expect(offsetDate('2024-03-01', -1)).toBe('2024-02-29');
  });

  it('matches the backend twelve-month inclusive boundary including leap days', () => {
    expect(rangeEnd('2024-02-29', '12m')).toBe('2025-02-28');
    expect(rangeEnd('2025-03-01', '12m')).toBe('2026-02-28');
    expect(validDateRange('2024-02-29', '2025-02-28', '2026-10-28')).toBe(true);
    expect(validDateRange('2024-02-29', '2025-03-01', '2026-10-28')).toBe(false);
    expect(validDateRange('2025-03-01', '2026-03-01', '2026-10-28')).toBe(false);
  });

  it.each(['2024-02-29', '2025-02-28', '2026-10-28', '2024-02-28'])(
    'produces a valid recent twelve-month range ending on %s',
    (today) => {
      const range = recentRange('12m', today);
      expect(range.end_date).toBe(today);
      expect(validDateRange(range.start_date, range.end_date, today)).toBe(true);
      expect(validDateRange(offsetDate(range.start_date, -1), range.end_date, today)).toBe(false);
    },
  );

  it('allows same-day ranges but rejects incomplete, reversed and future ranges', () => {
    expect(validDateRange('2026-10-28', '2026-10-28', '2026-10-28')).toBe(true);
    expect(validDateRange(null, '2026-10-28', '2026-10-28')).toBe(false);
    expect(validDateRange('2026-10-28', null, '2026-10-28')).toBe(false);
    expect(validDateRange('2026-10-28', '2026-10-27', '2026-10-28')).toBe(false);
    expect(validDateRange('2026-10-28', '2026-10-29', '2026-10-28')).toBe(false);
  });
});
