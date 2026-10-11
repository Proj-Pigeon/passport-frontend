import { Anchor, Group, Text, ThemeIcon } from '@mantine/core';
import { IconFeather } from '@tabler/icons-react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';

export interface BrandMarkProps {
  to?: string | null;
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
}

const ICON_SIZES = { sm: 18, md: 20, lg: 24 } as const;
const THEME_ICON_SIZES = { sm: 'md', md: 'lg', lg: 'xl' } as const;
const TEXT_SIZES = { sm: 'sm', md: 'md', lg: 'lg' } as const;

export function BrandMark({ to = '/', size = 'md', showText = true }: BrandMarkProps) {
  const { t } = useTranslation();

  const mark = (
    <Group gap="xs" wrap="nowrap">
      <ThemeIcon variant="light" size={THEME_ICON_SIZES[size]} radius="md">
        <IconFeather size={ICON_SIZES[size]} stroke={1.5} />
      </ThemeIcon>
      {showText && (
        <Text fw={600} size={TEXT_SIZES[size]}>
          {t('common.appName')}
        </Text>
      )}
    </Group>
  );

  if (!to) {
    return mark;
  }

  return (
    <Anchor component={Link} to={to} underline="never" c="inherit">
      {mark}
    </Anchor>
  );
}
