import { Badge } from '@mantine/core';
import { useTranslation } from 'react-i18next';

const COLOR_BY_STATUS: Record<string, string> = {
  active: 'green',
  draft: 'gray',
  disabled: 'red',
  suspended: 'red',
  deactivated: 'dark',
  pending_verification: 'orange',
  pending: 'orange',
  applied: 'green',
  approved: 'green',
  rejected: 'red',
  staged: 'orange',
  published: 'blue',
  retiring: 'yellow',
  passed: 'green',
  failed: 'red',
  running: 'blue',
};

export function AdminStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  return (
    <Badge size="sm" variant="light" color={COLOR_BY_STATUS[status] ?? 'gray'}>
      {t(`admin.status.${status}`, status)}
    </Badge>
  );
}
