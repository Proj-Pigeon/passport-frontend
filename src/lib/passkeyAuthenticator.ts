import type { Passkey } from '@/api/types';

import providers from './passkey-providers.json';

export type PasskeyDeviceKind = 'computer' | 'phone' | 'hardware' | 'device' | 'passwordManager';

interface PasskeyProvider {
  name: string;
  icon_light: string;
  icon_dark: string;
}

export interface PasskeyAuthenticator {
  kind: PasskeyDeviceKind;
  name?: string;
  provider?: PasskeyProvider;
}

const providerRegistry: Readonly<Record<string, PasskeyProvider>> = providers;

const deviceRegistry: Readonly<Record<string, PasskeyAuthenticator>> = {
  '08987058-cadc-4b81-b6e1-30de50dcbe96': { kind: 'computer', name: 'Windows Hello' },
  '6028b017-b1d4-4c02-b4b3-afcdafc96bb2': { kind: 'computer', name: 'Windows Hello' },
  '9ddd1817-af5a-4672-a2b9-3e3dd95000a9': { kind: 'computer', name: 'Windows Hello' },
  'adce0002-35bc-c60a-648b-0b25f1f05503': { kind: 'computer', name: 'Chrome on Mac' },
  '771b48fd-d3d4-4f74-9232-fc157ab0507a': { kind: 'computer', name: 'Edge on Mac' },
  'b93fd961-f2e6-462f-b122-82002247de78': { kind: 'phone', name: 'Android' },
  '53414d53-554e-4700-0000-000000000000': { kind: 'phone', name: 'Samsung Pass' },
};

export function identifyPasskeyAuthenticator(
  passkey: Pick<Passkey, 'aaguid' | 'transports' | 'backup_eligible' | 'authenticator_attachment'>,
): PasskeyAuthenticator {
  const aaguid = passkey.aaguid?.toLowerCase() ?? '';
  const provider = Object.hasOwn(providerRegistry, aaguid) ? providerRegistry[aaguid] : undefined;
  if (provider) {
    return { kind: 'passwordManager', name: provider.name, provider };
  }
  const device = Object.hasOwn(deviceRegistry, aaguid) ? deviceRegistry[aaguid] : undefined;
  if (device) {
    return device;
  }
  if (passkey.backup_eligible) {
    return { kind: 'passwordManager' };
  }
  const transports = passkey.transports ?? [];
  if (transports.some((transport) => ['usb', 'nfc', 'ble'].includes(transport))) {
    return { kind: 'hardware' };
  }
  return { kind: 'device' };
}
