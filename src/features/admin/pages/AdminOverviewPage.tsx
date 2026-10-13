import { Badge, Divider, Grid, Group, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';

import { AccountPageHeader, InfoItem } from '@/components/AccountSections';
import { secondsUntil } from '@/lib/format';

import { useAdminSession } from '../session/useAdminSession';

export function AdminOverviewPage() {
  const { t } = useTranslation();
  const { data: session } = useAdminSession();

  const stepUpRemaining = secondsUntil(session?.step_up_expires_at ?? null);

  return (
    <Stack gap="lg" maw={960}>
      <AccountPageHeader
        title={t('admin.overview.title')}
        subtitle={t('admin.overview.subtitle')}
      />

      <Grid>
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Paper p="lg" h="100%">
            <Stack gap="md">
              <Title order={2} fz={16} fw={600}>
                {t('admin.overview.sessionCard')}
              </Title>
              <Group gap="xs">
                {session?.roles.map((role) => (
                  <Badge key={role} size="sm" variant="light" color="indigo">
                    {t(`admin.roles.${role}`)}
                  </Badge>
                ))}
              </Group>
              <Divider />
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <InfoItem label={t('admin.overview.username')}>{session?.username}</InfoItem>
                <InfoItem label={t('admin.overview.userId')}>{session?.user_id}</InfoItem>
                <InfoItem label={t('admin.overview.sessionId')}>{session?.session_id}</InfoItem>
                <InfoItem label={t('admin.overview.loginMethod')}>
                  {session?.amr.map((method) => t(`admin.amr.${method}`, method)).join(' + ')}
                </InfoItem>
              </SimpleGrid>
            </Stack>
          </Paper>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Paper p="lg" h="100%">
            <Stack gap="md">
              <Title order={2} fz={16} fw={600}>
                {t('admin.overview.stepUpCard')}
              </Title>
              <Text size="sm" c={stepUpRemaining > 0 ? undefined : 'dimmed'}>
                {stepUpRemaining > 0
                  ? t('admin.overview.stepUpActive', { seconds: stepUpRemaining })
                  : t('admin.overview.stepUpInactive')}
              </Text>
              <Text size="xs" c="dimmed">
                {t('admin.overview.stepUpHint')}
              </Text>
            </Stack>
          </Paper>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
