import {
  AppShell,
  Avatar,
  Burger,
  Group,
  Menu,
  NavLink,
  Skeleton,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconChevronDown,
  IconLayoutDashboard,
  IconLogout,
  IconShieldLock,
  IconUserCircle,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';

import { useLogout } from '@/features/session/useLogout';
import { useSession } from '@/features/session/useSession';

import { BrandMark } from './BrandMark';
import { ColorSchemeToggle } from './ColorSchemeToggle';
import { LanguageSwitch } from './LanguageSwitch';

interface NavItem {
  to: string;
  labelKey: string;
  icon: (props: { size: number; stroke: number }) => ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/account', labelKey: 'nav.account', icon: (p) => <IconLayoutDashboard {...p} /> },
  { to: '/account/profile', labelKey: 'nav.profile', icon: (p) => <IconUserCircle {...p} /> },
  { to: '/account/security', labelKey: 'nav.security', icon: (p) => <IconShieldLock {...p} /> },
];

export function AccountLayout() {
  const { t } = useTranslation();
  const { user, isLoading } = useSession();
  const logout = useLogout();
  const navigate = useNavigate();
  const location = useLocation();
  const [navOpened, { toggle, close }] = useDisclosure();

  const displayName = user?.display_name?.trim() || user?.username || '';

  const handleLogout = () => {
    close();
    logout.mutate(undefined, {
      onSettled: () => navigate('/login', { replace: true }),
    });
  };

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 248, breakpoint: 'sm', collapsed: { mobile: !navOpened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group wrap="nowrap" gap="sm">
            <Burger
              opened={navOpened}
              onClick={toggle}
              hiddenFrom="sm"
              size="sm"
              aria-label={t('nav.openMenu')}
            />
            <BrandMark to="/account" size="md" />
          </Group>

          <Group gap="xs" wrap="nowrap">
            <LanguageSwitch />
            <ColorSchemeToggle />
            <Menu position="bottom-end" width={240} shadow="md">
              <Menu.Target>
                <UnstyledButton
                  aria-label={t('nav.userMenu')}
                  style={{ borderRadius: 'var(--mantine-radius-md)' }}
                >
                  <Group gap="xs" wrap="nowrap">
                    {isLoading ? (
                      <Skeleton circle width={30} height={30} />
                    ) : (
                      <Avatar size="sm" radius="xl" name={displayName} variant="light" />
                    )}
                    <Stack gap={0} visibleFrom="xs">
                      {isLoading ? (
                        <Skeleton height={12} width={80} />
                      ) : (
                        <Text size="sm" fw={500} lineClamp={1}>
                          {displayName}
                        </Text>
                      )}
                    </Stack>
                    <IconChevronDown size={14} />
                  </Group>
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>
                  {isLoading ? (
                    <Skeleton height={12} />
                  ) : (
                    <>
                      <Text size="xs" fw={500} lineClamp={1}>
                        {displayName}
                      </Text>
                      <Text size="xs" c="dimmed" lineClamp={1}>
                        {user?.email}
                      </Text>
                    </>
                  )}
                </Menu.Label>
                <Menu.Divider />
                {NAV_ITEMS.map((item) => (
                  <Menu.Item
                    key={item.to}
                    component={Link}
                    to={item.to}
                    leftSection={item.icon({ size: 14, stroke: 1.5 })}
                    onClick={close}
                  >
                    {t(item.labelKey)}
                  </Menu.Item>
                ))}
                <Menu.Divider />
                <Menu.Item
                  color="red"
                  leftSection={<IconLogout size={14} stroke={1.5} />}
                  onClick={handleLogout}
                  disabled={logout.isPending}
                >
                  {logout.isPending ? t('session.loggingOut') : t('nav.logout')}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        <Stack gap={4}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              component={Link}
              to={item.to}
              label={t(item.labelKey)}
              leftSection={
                <span style={{ display: 'inline-flex', transform: 'translateY(1px)' }}>
                  {item.icon({ size: 18, stroke: 1.5 })}
                </span>
              }
              active={location.pathname === item.to}
              onClick={close}
              style={{ borderRadius: 'var(--mantine-radius-md)' }}
            />
          ))}
        </Stack>
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
