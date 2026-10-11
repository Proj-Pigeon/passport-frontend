import {
  ActionIcon,
  Collapse,
  Group,
  Popover,
  Progress,
  Stack,
  Text,
  ThemeIcon,
  VisuallyHidden,
} from '@mantine/core';
import { IconCheck, IconInfoCircle, IconX } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import { passwordChecks } from '@/lib/validators';

const LEVEL_COLORS = ['red', 'red', 'orange', 'yellow', 'lime', 'teal'] as const;

export interface PasswordStrengthProps {
  value: string;
}

export function PasswordStrength({ value }: PasswordStrengthProps) {
  const { t } = useTranslation();
  const checks = passwordChecks(value);
  const score = checks.filter((check) => check.passed).length;
  const hasValue = value.length > 0;
  const color = LEVEL_COLORS[score] ?? 'gray';
  const percent = hasValue ? Math.max(12, (score / checks.length) * 100) : 0;
  const levelLabel = t(`passwordStrength.level.${score}`);

  return (
    <Stack gap={6}>
      <Group justify="space-between" gap="xs" wrap="nowrap">
        <Group gap={4} wrap="nowrap">
          <Text size="xs" c="dimmed">
            {t('passwordStrength.label')}
          </Text>
          <Popover width={240} position="bottom-start" withArrow shadow="md">
            <Popover.Target>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="xs"
                aria-label={t('passwordStrength.hint')}
              >
                <IconInfoCircle size={14} stroke={1.5} />
              </ActionIcon>
            </Popover.Target>
            <Popover.Dropdown>
              <Text size="xs">{t('passwordStrength.hint')}</Text>
            </Popover.Dropdown>
          </Popover>
        </Group>
        <Text size="xs" fw={600} c={hasValue ? color : 'dimmed'}>
          {levelLabel}
        </Text>
        <VisuallyHidden>{`${t('passwordStrength.label')}: ${levelLabel}`}</VisuallyHidden>
      </Group>

      <Progress
        value={percent}
        color={color}
        size="xs"
        transitionDuration={300}
        aria-hidden="true"
      />

      <Collapse expanded={hasValue}>
        <Stack gap={4} mt={6}>
          {checks.map((check) => (
            <Group key={check.key} gap={6} wrap="nowrap" align="center">
              <ThemeIcon
                size={16}
                radius="xl"
                variant="light"
                color={check.passed ? 'teal' : 'gray'}
                aria-hidden="true"
              >
                {check.passed ? <IconCheck size={11} stroke={3} /> : <IconX size={11} stroke={3} />}
              </ThemeIcon>
              <Text size="xs" c={check.passed ? undefined : 'dimmed'}>
                {t(`passwordStrength.check.${check.key}`)}
              </Text>
            </Group>
          ))}
        </Stack>
      </Collapse>
    </Stack>
  );
}
