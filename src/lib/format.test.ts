import { describe, expect, it } from 'vitest';

import { formatBytes, formatClock, formatDateTime, parseDate, secondsUntil } from './format';

describe('formatClock', () => {
  it('pads seconds and floors fractions', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(9)).toBe('0:09');
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(600.9)).toBe('10:00');
  });

  it('never goes negative', () => {
    expect(formatClock(-30)).toBe('0:00');
  });
});

describe('formatBytes', () => {
  it('picks a readable unit', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(512 * 1024)).toBe('512 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});

describe('parseDate', () => {
  it('returns null for missing or malformed input', () => {
    expect(parseDate(null)).toBeNull();
    expect(parseDate(undefined)).toBeNull();
    expect(parseDate('not-a-date')).toBeNull();
  });

  it('parses an RFC 3339 timestamp', () => {
    expect(parseDate('2026-10-11T02:00:00Z')?.getTime()).toBe(Date.parse('2026-10-11T02:00:00Z'));
  });
});

describe('formatDateTime', () => {
  it('renders a locale string for a valid timestamp', () => {
    const text = formatDateTime('2026-10-11T02:00:00Z');
    expect(text).toBeTruthy();
    expect(text).toContain('2026');
  });

  it('returns null when there is nothing to render', () => {
    expect(formatDateTime(null)).toBeNull();
    expect(formatDateTime('garbage')).toBeNull();
  });
});

describe('secondsUntil', () => {
  it('counts down to a future timestamp', () => {
    const now = Date.parse('2026-10-11T02:00:00Z');
    expect(secondsUntil('2026-10-11T02:10:00Z', now)).toBe(600);
  });

  it('clamps to zero in the past or when missing', () => {
    const now = Date.parse('2026-10-11T02:00:00Z');
    expect(secondsUntil('2026-10-11T01:00:00Z', now)).toBe(0);
    expect(secondsUntil(null, now)).toBe(0);
  });
});
