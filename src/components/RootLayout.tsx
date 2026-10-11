import { Anchor, AppShell, Button, Group, Menu, Text, ThemeIcon } from '@mantine/core';
import { IconChevronDown, IconFeather } from '@tabler/icons-react';
import { Link, Outlet } from 'react-router';

import { ColorSchemeToggle } from './ColorSchemeToggle';

const devLinks = [
  { to: '/login', label: '登录' },
  { to: '/register', label: '注册' },
  { to: '/forgot-password', label: '忘记密码' },
  { to: '/reset-password', label: '重置密码' },
  { to: '/verify-email', label: '邮箱验证' },
  { to: '/federation/complete?result=success', label: '第三方登录落点' },
  { to: '/authorize?interaction=demo', label: 'OAuth 授权' },
  { to: '/account', label: '账号概览' },
  { to: '/account/profile', label: '个人资料' },
  { to: '/account/security', label: '安全' },
  { to: '/account/connections', label: '连接账号' },
] as const;

export function RootLayout() {
  return (
    <AppShell header={{ height: 56 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Anchor component={Link} to="/" underline="never" c="inherit">
            <Group gap="xs" wrap="nowrap">
              <ThemeIcon variant="light" size="lg">
                <IconFeather size={20} stroke={1.5} />
              </ThemeIcon>
              <Text fw={600}>Pigeon Passport</Text>
            </Group>
          </Anchor>

          <Group gap="xs" wrap="nowrap">
            <Menu position="bottom-end" width={200}>
              <Menu.Target>
                <Button variant="subtle" rightSection={<IconChevronDown size={14} />}>
                  页面
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                {devLinks.map((link) => (
                  <Menu.Item key={link.to} component={Link} to={link.to}>
                    {link.label}
                  </Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>
            <ColorSchemeToggle />
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
