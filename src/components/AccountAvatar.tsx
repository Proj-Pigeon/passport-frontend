import { Avatar, type AvatarProps } from '@mantine/core';

import { useAvatarUrl, useDisplayName } from '@/features/account/useProfile';

export function AccountAvatar(props: AvatarProps) {
  const src = useAvatarUrl();
  const name = useDisplayName();

  return <Avatar {...props} src={src} name={name} alt={name} variant="light" />;
}
