import { Button, Group, TextInput } from '@mantine/core';
import { IconChevronLeft, IconChevronRight, IconSearch } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { CursorPagerState } from './useCursorPager';

export function AdminSearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value);
  const latest = useRef(onChange);
  const lastEmitted = useRef(value);

  useEffect(() => {
    latest.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (draft !== lastEmitted.current) {
        lastEmitted.current = draft;
        latest.current(draft.trim());
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [draft]);

  return (
    <TextInput
      value={draft}
      onChange={(event) => setDraft(event.currentTarget.value)}
      placeholder={placeholder ?? t('admin.list.searchPlaceholder')}
      leftSection={<IconSearch size={14} stroke={1.5} />}
      w={{ base: '100%', sm: 280 }}
    />
  );
}

export function CursorNav({
  pager,
  nextCursor,
  loading,
}: {
  pager: CursorPagerState;
  nextCursor: string | null;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const hasNext = (nextCursor ?? '').length > 0;
  return (
    <Group justify="center" gap="sm" mt="md">
      <Button
        variant="default"
        size="xs"
        leftSection={<IconChevronLeft size={14} stroke={1.5} />}
        disabled={!pager.hasPrev || loading}
        onClick={pager.goPrev}
      >
        {t('admin.list.prevPage')}
      </Button>
      <Button
        variant="default"
        size="xs"
        rightSection={<IconChevronRight size={14} stroke={1.5} />}
        disabled={!hasNext || loading}
        onClick={() => {
          if (nextCursor) {
            pager.goNext(nextCursor);
          }
        }}
      >
        {t('admin.list.nextPage')}
      </Button>
    </Group>
  );
}
