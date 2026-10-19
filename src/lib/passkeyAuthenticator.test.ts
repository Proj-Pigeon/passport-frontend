import { describe, expect, it } from 'vitest';

import type { Passkey } from '@/api/types';

import { identifyPasskeyAuthenticator } from './passkeyAuthenticator';

function identify(overrides: Partial<Passkey> = {}) {
  return identifyPasskeyAuthenticator({ backup_eligible: false, ...overrides });
}

describe('identifyPasskeyAuthenticator', () => {
  it.each([
    ['bada5566-a7aa-401f-bd96-45619a55120d', '1Password'],
    ['d548826e-79b4-db40-a3d8-11116f7e8349', 'Bitwarden'],
    ['ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4', 'Google Password Manager'],
    ['fbfc3007-154e-4ecc-8c0b-6e020557d7bd', 'Apple Passwords'],
    ['50726f74-6f6e-5061-7373-50726f746f6e', 'Proton Pass'],
  ])('recognizes provider %s independently of the label and transports', (aaguid, name) => {
    const result = identify({
      aaguid: aaguid.toUpperCase(),
      label: 'My device',
      transports: ['usb'],
    });
    expect(result).toMatchObject({ kind: 'passwordManager', name });
    expect(result.provider?.icon_light).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(result.provider?.icon_dark).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it.each([
    ['08987058-cadc-4b81-b6e1-30de50dcbe96', 'computer', 'Windows Hello'],
    ['6028b017-b1d4-4c02-b4b3-afcdafc96bb2', 'computer', 'Windows Hello'],
    ['9ddd1817-af5a-4672-a2b9-3e3dd95000a9', 'computer', 'Windows Hello'],
    ['adce0002-35bc-c60a-648b-0b25f1f05503', 'computer', 'Chrome on Mac'],
    ['b93fd961-f2e6-462f-b122-82002247de78', 'phone', 'Android'],
    ['53414d53-554e-4700-0000-000000000000', 'phone', 'Samsung Pass'],
  ])('recognizes device %s', (aaguid, kind, name) => {
    expect(identify({ aaguid })).toEqual({ kind, name });
  });

  it.each(['usb', 'nfc', 'ble'] as const)('recognizes external %s keys', (transport) => {
    expect(identify({ transports: [transport] })).toEqual({ kind: 'hardware' });
  });

  it('does not mistake a synced provider for external hardware', () => {
    expect(identify({ backup_eligible: true, transports: ['usb'] })).toEqual({
      kind: 'passwordManager',
    });
  });

  it.each([
    undefined,
    '',
    '00000000-0000-0000-0000-000000000000',
    'unknown',
    '__proto__',
    'constructor',
  ])('keeps unidentified device %s generic', (aaguid) => {
    expect(
      identify({ aaguid, label: '1Password on iPhone', transports: ['internal', 'hybrid'] }),
    ).toEqual({ kind: 'device' });
  });

  it('does not assume hybrid transport means a phone', () => {
    expect(
      identify({ transports: ['hybrid'], authenticator_attachment: 'cross-platform' }),
    ).toEqual({ kind: 'device' });
  });
});
