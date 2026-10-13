import type { AdminResourceKind } from '@/api/endpoints/admin/types';
import { FederationPresetCreateModal } from '@/features/admin/federation/FederationPresetCreateModal';

import { ApplicationCreateModal } from './ApplicationCreateModal';

interface Props {
  kind: AdminResourceKind;
  opened: boolean;
  onClose: () => void;
  fixedApplicationId?: string;
}

export function CreateResourceModal({ kind, ...props }: Props) {
  return kind === 'federation' ? (
    <FederationPresetCreateModal opened={props.opened} onClose={props.onClose} />
  ) : (
    <ApplicationCreateModal kind={kind} {...props} />
  );
}
