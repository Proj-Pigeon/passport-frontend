import { Box, useComputedColorScheme } from '@mantine/core';
import {
  IconDeviceDesktop,
  IconDeviceMobile,
  IconDevices,
  IconDeviceUsb,
  IconKey,
} from '@tabler/icons-react';

import type { PasskeyAuthenticator } from '@/lib/passkeyAuthenticator';

const deviceIcons = {
  computer: IconDeviceDesktop,
  phone: IconDeviceMobile,
  hardware: IconDeviceUsb,
  device: IconDevices,
  passwordManager: IconKey,
};

export function PasskeyAuthenticatorIcon({
  authenticator,
}: {
  authenticator: PasskeyAuthenticator;
}) {
  const scheme = useComputedColorScheme('light');
  if (authenticator.provider) {
    return (
      <Box
        component="img"
        src={
          scheme === 'dark' ? authenticator.provider.icon_dark : authenticator.provider.icon_light
        }
        alt=""
        aria-hidden="true"
        w={22}
        h={22}
        style={{ flexShrink: 0, objectFit: 'contain' }}
      />
    );
  }
  const Icon = deviceIcons[authenticator.kind];
  return <Icon size={22} stroke={1.5} aria-hidden="true" style={{ flexShrink: 0 }} />;
}
