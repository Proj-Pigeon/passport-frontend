import {
  AppShell,
  Avatar,
  Badge,
  Burger,
  Group,
  Menu,
  NavLink,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconArrowsExchange,
  IconApps,
  IconChevronDown,
  IconFileText,
  IconKey,
  IconLayoutDashboard,
  IconListSearch,
  IconLogout,
  IconRestore,
  IconUsers,
  IconVersions,
  IconWorld,
  type Icon,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';

import { BrandMark } from '@/components/BrandMark';
import { ColorSchemeToggle } from '@/components/ColorSchemeToggle';
import { LanguageSwitch } from '@/components/LanguageSwitch';
import type { AdminCapability } from '@/api/endpoints/admin/types';

import { useAdminLogout } from './session/useAdminLogout';
import { hasAdminCapability, useAdminSession } from './session/useAdminSession';

interface NavItem {
  to: string;
  labelKey: string;
  icon: Icon;
  anyOf?: AdminCapability[];
}

interface NavSection {
  labelKey?: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    items: [{ to: '/admin', labelKey: 'admin.nav.overview', icon: IconLayoutDashboard }],
  },
  {
    labelKey: 'admin.nav.sectionPeople',
    items: [
      { to: '/admin/users', labelKey: 'admin.nav.users', icon: IconUsers, anyOf: ['users:read'] },
      {
        to: '/admin/audit-events',
        labelKey: 'admin.nav.auditEvents',
        icon: IconListSearch,
        anyOf: ['audit:read'],
      },
    ],
  },
  {
    labelKey: 'admin.nav.sectionAccess',
    items: [
      {
        to: '/admin/applications',
        labelKey: 'admin.nav.applications',
        icon: IconApps,
        anyOf: ['applications:read'],
      },
      {
        to: '/admin/federation-providers',
        labelKey: 'admin.nav.federationProviders',
        icon: IconWorld,
        anyOf: ['federation:read'],
      },
    ],
  },
  {
    labelKey: 'admin.nav.sectionSystem',
    items: [
      {
        to: '/admin/compliance-documents',
        labelKey: 'admin.nav.complianceDocuments',
        icon: IconFileText,
        anyOf: ['config:read'],
      },
      {
        to: '/admin/configuration-versions',
        labelKey: 'admin.nav.configurationVersions',
        icon: IconVersions,
        anyOf: ['config:read'],
      },
      {
        to: '/admin/key-rotation-requests',
        labelKey: 'admin.nav.keyRotations',
        icon: IconKey,
        anyOf: ['keys:write', 'keys:approve'],
      },
      {
        to: '/admin/backup-exercises',
        labelKey: 'admin.nav.backupExercises',
        icon: IconRestore,
        anyOf: ['operations:read'],
      },
    ],
  },
];

export function AdminLayout() {
  const { t } = useTranslation();
  const { data: session } = useAdminSession();
  const logout = useAdminLogout();
  const navigate = useNavigate();
  const location = useLocation();
  const [navOpened, { toggle, close }] = useDisclosure();

  const username = session?.username ?? '';

  const handleLogout = () => {
    close();
    logout.mutate(undefined, {
      onSettled: () => navigate('/admin/login', { replace: true }),
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
            <BrandMark to="/admin" size="md" />
            <Badge variant="light" color="indigo" size="sm">
              {t('admin.badge')}
            </Badge>
          </Group>

          <Group gap="xs" wrap="nowrap">
            <LanguageSwitch />
            <ColorSchemeToggle />
            <Menu position="bottom-end" width={260} shadow="md">
              <Menu.Target>
                <UnstyledButton
                  aria-label={t('nav.userMenu')}
                  style={{ borderRadius: 'var(--mantine-radius-md)' }}
                >
                  <Group gap="xs" wrap="nowrap">
                    <Avatar name={username || 'Admin'} radius="xl" variant="light" size="sm" />
                    <Stack gap={0} visibleFrom="xs">
                      <Text size="sm" fw={500} lineClamp={1}>
                        {username}
                      </Text>
                    </Stack>
                    <IconChevronDown size={14} />
                  </Group>
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>
                  <Stack gap={4}>
                    <Text size="xs" fw={500} lineClamp={1}>
                      {username}
                    </Text>
                    <Group gap={4}>
                      {session?.roles.slice(0, 2).map((role) => (
                        <Badge key={role} size="sm" variant="light" color="indigo">
                          {t(`admin.roles.${role}`)}
                        </Badge>
                      ))}
                      {session && session.roles.length > 2 && (
                        <Badge size="sm" variant="light" color="indigo">
                          +{session.roles.length - 2}
                        </Badge>
                      )}
                    </Group>
                  </Stack>
                </Menu.Label>
                <Menu.Divider />
                <Menu.Item
                  leftSection={<IconArrowsExchange size={14} stroke={1.5} />}
                  onClick={() => {
                    close();
                    navigate('/account');
                  }}
                >
                  {t('admin.switchToUserView')}
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item
                  color="red"
                  leftSection={<IconLogout size={14} stroke={1.5} />}
                  onClick={handleLogout}
                  disabled={logout.isPending}
                >
                  {logout.isPending ? t('session.loggingOut') : t('admin.session.logout')}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        <Stack gap="xs">
          {NAV_SECTIONS.map((section, index) => {
            const items = section.items.filter(
              (item) =>
                !item.anyOf ||
                item.anyOf.some((capability) => hasAdminCapability(session, capability)),
            );
            if (items.length === 0) {
              return null;
            }
            return (
              <Stack key={section.labelKey ?? `root-${index}`} gap={4}>
                {section.labelKey && (
                  <Text size="xs" fw={600} c="dimmed" tt="uppercase" px="sm" pt={4}>
                    {t(section.labelKey)}
                  </Text>
                )}
                {items.map((item) => {
                  const active =
                    item.to === '/admin'
                      ? location.pathname === '/admin'
                      : location.pathname.startsWith(item.to);
                  return (
                    <NavLink
                      key={item.to}
                      component={Link}
                      to={item.to}
                      label={t(item.labelKey)}
                      leftSection={<item.icon size={18} stroke={1.5} />}
                      active={active}
                      onClick={close}
                      style={{ borderRadius: 'var(--mantine-radius-md)' }}
                    />
                  );
                })}
              </Stack>
            );
          })}
        </Stack>
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
