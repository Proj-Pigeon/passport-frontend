import { describe, expect, it } from 'vitest';

import { crossOriginViewURL } from './viewSwitch';

describe('crossOriginViewURL', () => {
  it('returns null without a configured origin', () => {
    expect(crossOriginViewURL('admin', '/admin', { adminBase: '', accountBase: '' })).toBeNull();
  });

  it('returns null when already on the target origin', () => {
    expect(
      crossOriginViewURL('account', '/account', {
        adminBase: 'https://admin.example',
        accountBase: window.location.origin,
      }),
    ).toBeNull();
  });

  it('builds a top-level URL for the other origin', () => {
    expect(
      crossOriginViewURL('admin', '/admin/users?next=%2Fadmin', {
        adminBase: 'https://admin.example',
        accountBase: '',
      }),
    ).toBe('https://admin.example/admin/users?next=%2Fadmin');
  });
});
