import { describe, expect, it } from 'vitest';

import { normalizeDeviceCode } from './deviceCode';

describe('normalizeDeviceCode', () => {
  it('uppercases and strips separators', () => {
    expect(normalizeDeviceCode('bcdf-ghjk')).toBe('BCDFGHJK');
    expect(normalizeDeviceCode(' bcdf ghjk ')).toBe('BCDFGHJK');
  });

  it('truncates overlong input', () => {
    expect(normalizeDeviceCode('BCDFGHJKMNPR')).toBe('BCDFGHJK');
  });
});
