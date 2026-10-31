import { Button, Group, Paper, SimpleGrid, Stack, Text } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import 'dayjs/locale/zh-cn';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { DeveloperOverviewRange } from '@/api/endpoints/developer/resources';
import { rangeEnd, recentRange, validDateRange, type DeveloperRangeDuration } from '../dateRange';

const RECENT_DURATIONS = [7, 30, 90, 180, '12m'] as const;
const QUICK_DURATIONS = [7, 14, 30, 90, 180, '12m'] as const;

interface DeveloperDateRangePickerProps {
  value: DeveloperOverviewRange;
  today: string;
  onChange: (range: DeveloperOverviewRange) => void;
}

export function DeveloperDateRangePicker({
  value,
  today,
  onChange,
}: DeveloperDateRangePickerProps) {
  const { t, i18n } = useTranslation();
  const [preset, setPreset] = useState<DeveloperRangeDuration | 'custom'>(30);
  const [start, setStart] = useState<string | null>(value.start_date);
  const [end, setEnd] = useState<string | null>(value.end_date);
  const maxEnd = start && rangeEnd(start, '12m') < today ? rangeEnd(start, '12m') : today;
  const label = (duration: DeveloperRangeDuration) =>
    duration === '12m'
      ? t('developer.range.months12')
      : t('developer.range.days', { count: duration });
  const calendarProps = {
    locale: i18n.resolvedLanguage?.startsWith('zh') ? 'zh-cn' : 'en',
    valueFormat: 'YYYY-MM-DD',
    getDayAriaLabel: (date: string) => date,
    clearable: true,
    ariaLabels: {
      nextMonth: t('developer.range.nextMonth'),
      previousMonth: t('developer.range.previousMonth'),
      nextYear: t('developer.range.nextYear'),
      previousYear: t('developer.range.previousYear'),
      nextDecade: t('developer.range.nextDecade'),
      previousDecade: t('developer.range.previousDecade'),
      monthLevelControl: t('developer.range.chooseMonth'),
      yearLevelControl: t('developer.range.chooseYear'),
    },
  };

  return (
    <Paper p="md">
      <Stack gap="sm">
        <Group gap="xs" aria-label={t('developer.range.preset')} role="group">
          {RECENT_DURATIONS.map((duration) => (
            <Button
              key={duration}
              size="xs"
              variant={preset === duration ? 'filled' : 'light'}
              aria-pressed={preset === duration}
              onClick={() => {
                const next = recentRange(duration, today);
                setPreset(duration);
                setStart(next.start_date);
                setEnd(next.end_date);
                onChange(next);
              }}
            >
              {label(duration)}
            </Button>
          ))}
          <Button
            size="xs"
            variant={preset === 'custom' ? 'filled' : 'light'}
            aria-pressed={preset === 'custom'}
            onClick={() => setPreset('custom')}
          >
            {t('developer.range.custom')}
          </Button>
        </Group>
        {preset === 'custom' && (
          <>
            <SimpleGrid cols={{ base: 1, xs: 2 }}>
              <DatePickerInput
                {...calendarProps}
                label={t('developer.range.start')}
                placeholder={t('developer.range.selectDate')}
                clearButtonProps={{ 'aria-label': t('developer.range.clearStart') }}
                value={start}
                maxDate={today}
                onChange={(next) => {
                  setStart(next);
                  setEnd(null);
                }}
              />
              <DatePickerInput
                {...calendarProps}
                key={start}
                label={t('developer.range.end')}
                placeholder={t('developer.range.selectDate')}
                clearButtonProps={{ 'aria-label': t('developer.range.clearEnd') }}
                value={end}
                onChange={setEnd}
                defaultDate={start ?? today}
                minDate={start ?? undefined}
                maxDate={maxEnd}
                disabled={!start}
              />
            </SimpleGrid>
            <Stack gap="xs">
              <Text size="xs" c="dimmed">
                {t('developer.range.quick')}
              </Text>
              <Group gap="xs" role="group" aria-label={t('developer.range.quick')}>
                {QUICK_DURATIONS.map((duration) => (
                  <Button
                    key={duration}
                    size="xs"
                    variant="default"
                    disabled={!start || !validDateRange(start, rangeEnd(start, duration), today)}
                    onClick={() => {
                      if (!start) return;
                      const nextEnd = rangeEnd(start, duration);
                      setEnd(nextEnd);
                      onChange({ start_date: start, end_date: nextEnd });
                    }}
                  >
                    {label(duration)}
                  </Button>
                ))}
              </Group>
            </Stack>
            <Group justify="space-between" align="end">
              <Text size="xs" c="dimmed" maw={650}>
                {t('developer.range.hint')}
              </Text>
              <Button
                size="xs"
                disabled={!validDateRange(start, end, today)}
                onClick={() => {
                  if (start && end) onChange({ start_date: start, end_date: end });
                }}
              >
                {t('developer.range.apply')}
              </Button>
            </Group>
          </>
        )}
        <Text size="xs" c="dimmed" aria-live="polite">
          {t('developer.range.selected', { start: value.start_date, end: value.end_date })}
        </Text>
      </Stack>
    </Paper>
  );
}
