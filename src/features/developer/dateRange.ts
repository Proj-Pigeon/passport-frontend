import type { DeveloperOverviewRange } from '@/api/endpoints/developer/resources';

export type DeveloperRangeDuration = 7 | 14 | 30 | 90 | 180 | '12m';

export function offsetDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function rangeEnd(start: string, duration: DeveloperRangeDuration): string {
  if (duration !== '12m') return offsetDate(start, duration - 1);
  const date = new Date(`${start}T00:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() + 1);
  return offsetDate(date.toISOString().slice(0, 10), -1);
}

export function recentRange(
  duration: DeveloperRangeDuration,
  today: string,
): DeveloperOverviewRange {
  if (duration !== '12m') {
    return { start_date: offsetDate(today, 1 - duration), end_date: today };
  }
  const date = new Date(`${offsetDate(today, 1)}T00:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() - 1);
  const start = date.toISOString().slice(0, 10);
  const previous = offsetDate(start, -1);
  return { start_date: rangeEnd(previous, '12m') >= today ? previous : start, end_date: today };
}

export function validDateRange(start: string | null, end: string | null, today: string): boolean {
  return (
    start !== null && end !== null && start <= end && end <= today && end <= rangeEnd(start, '12m')
  );
}
