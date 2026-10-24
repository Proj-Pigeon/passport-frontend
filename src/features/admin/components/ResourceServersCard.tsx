import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  createResourceServer,
  createResourceServerSecret,
  decideResourceServerApproval,
  getResourceServer,
  listResourceServers,
  requestResourceServerActivation,
  updateResourceServer,
  type ResourceServer,
  type ResourceServerChangeRequest,
  type ResourceServerInput,
  type ResourceServerSecret,
} from '@/api/endpoints/admin/resourceServers';
import { isApiError } from '@/api/errors';
import { InfoItem, SectionCard } from '@/components/AccountSections';
import { PageState } from '@/components/PageState';
import { describeApiError } from '@/i18n/errors';
import { SubmitErrorAlert } from '@/features/auth/components/SubmitErrorAlert';
import { adminKeys } from '../keys';
import { hasAdminCapability, useAdminSession } from '../session/useAdminSession';
import { useAdminStepUp } from '../step-up/useAdminStepUp';
import { AdminStatusBadge } from './AdminStatusBadge';
import { ReasonModal } from './ReasonModal';

export function ResourceServersCard({ applicationId }: { applicationId: string }) {
  const { t } = useTranslation();
  const { data: session } = useAdminSession();
  const client = useQueryClient();
  const [creating, setCreating] = useState(false);
  const query = useQuery({
    queryKey: adminKeys.resourceServers(applicationId),
    queryFn: ({ signal }) => listResourceServers(applicationId, signal),
  });
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: adminKeys.resourceServers(applicationId) });
  };
  return (
    <SectionCard
      title={t('authorization.serversTitle')}
      description={t('authorization.serversHint')}
    >
      <Stack>
        {hasAdminCapability(session, 'applications:write') && (
          <Button onClick={() => setCreating(true)}>{t('authorization.createServer')}</Button>
        )}
        {query.isError && query.data && <SubmitErrorAlert error={query.error} />}
        {query.isPending ? (
          <PageState kind="loading" />
        ) : !query.data ? (
          <PageState
            kind="error"
            error={query.error}
            description={describeApiError(query.error)}
            onRetry={() => query.refetch()}
          />
        ) : query.data.items.length === 0 ? (
          <PageState kind="empty" title={t('authorization.noServers')} minHeight={80} />
        ) : (
          query.data.items.map((server) => (
            <ResourceServerCard key={server.id} serverId={server.id} refreshList={refresh} />
          ))
        )}
        {creating && (
          <ServerActionModal
            applicationId={applicationId}
            action={{ kind: 'create' }}
            onClose={() => setCreating(false)}
            refresh={refresh}
          />
        )}
      </Stack>
    </SectionCard>
  );
}

type ServerAction =
  | { kind: 'create' | 'edit' | 'issue_secret' | 'rotate_secret' | 'activate' | 'deactivate' }
  | { kind: 'approve' | 'reject' | 'redeem'; requestId: string };

const credentialAction = (action: string) =>
  action === 'issue_secret' || action === 'rotate_secret';

function ChangeReview({
  server,
  request,
}: {
  server: ResourceServer;
  request: ResourceServerChangeRequest;
}) {
  const { t } = useTranslation();
  const stale = request.base_version !== server.version;
  const fields = [
    { label: t('authorization.serverName'), proposed: request.snapshot.name, current: server.name },
    {
      label: t('authorization.audience'),
      proposed: request.snapshot.audience,
      current: server.audience,
    },
    {
      label: t('authorization.clientIds'),
      proposed: request.snapshot.client_ids.join(', '),
      current: server.client_ids.join(', '),
    },
  ];
  return (
    <Stack gap="xs">
      <Text size="sm">
        {t('authorization.changeVersions', { base: request.base_version, current: server.version })}
      </Text>
      {stale && ['pending', 'approved'].includes(request.status) && (
        <Alert color="yellow">{t('authorization.staleChange')}</Alert>
      )}
      <Text fw={500} size="sm">
        {t('authorization.proposedSnapshot')}
      </Text>
      {fields.map((field) => (
        <InfoItem key={field.label} label={field.label}>
          <Text size="sm">{field.proposed || t('authorization.none')}</Text>
          {field.proposed !== field.current && (
            <Text size="sm" c="dimmed">
              {t('authorization.currentValue', { value: field.current || t('authorization.none') })}
            </Text>
          )}
        </InfoItem>
      ))}
    </Stack>
  );
}

function ResourceServerCard({
  serverId,
  refreshList,
}: {
  serverId: string;
  refreshList: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const { data: session } = useAdminSession();
  const query = useQuery({
    queryKey: adminKeys.resourceServer(serverId),
    queryFn: ({ signal }) => getResourceServer(serverId, signal),
  });
  const [action, setAction] = useState<ServerAction | null>(null);
  const [secret, setSecret] = useState<ResourceServerSecret | null>(null);
  const refresh = async () => {
    await Promise.all([query.refetch(), refreshList()]);
  };
  if (query.isPending) return <PageState kind="loading" />;
  if (!query.data)
    return (
      <PageState
        kind="error"
        error={query.error}
        description={describeApiError(query.error)}
        onRetry={() => query.refetch()}
      />
    );
  const server = query.data;
  const canWrite = hasAdminCapability(session, 'applications:write');
  const canApprove = hasAdminCapability(session, 'applications:approve');
  const lifecycle = server.status === 'active' ? 'deactivate' : 'activate';
  const pending =
    server.change_requests?.some(
      (item) => item.status === 'pending' && item.base_version === server.version,
    ) ?? false;
  const approvedCredential =
    server.change_requests?.some(
      (item) =>
        item.status === 'approved' &&
        item.base_version === server.version &&
        credentialAction(item.action),
    ) ?? false;
  return (
    <SectionCard title={server.name}>
      <Stack>
        {query.isError && <SubmitErrorAlert error={query.error} />}
        <Group>
          <AdminStatusBadge status={server.status} />
          <Text size="sm">{server.id}</Text>
        </Group>
        <InfoItem label={t('authorization.audience')}>{server.audience}</InfoItem>
        <InfoItem label={t('authorization.clientIds')}>
          {server.client_ids.join(', ') || t('authorization.none')}
        </InfoItem>
        <InfoItem label={t('authorization.credentialStatus')}>
          {t(server.secret_set ? 'authorization.secretSet' : 'authorization.secretUnset')}
        </InfoItem>
        {!canWrite && <Text size="sm">{t('authorization.readOnly')}</Text>}
        {canWrite && (
          <Group>
            <Button variant="light" disabled={pending} onClick={() => setAction({ kind: 'edit' })}>
              {t('authorization.editServer')}
            </Button>
            <Button
              variant="light"
              disabled={pending || approvedCredential}
              onClick={() =>
                setAction({ kind: server.secret_set ? 'rotate_secret' : 'issue_secret' })
              }
            >
              {t(server.secret_set ? 'authorization.rotateSecret' : 'authorization.createSecret')}
            </Button>
            <Button
              variant="light"
              color={lifecycle === 'deactivate' ? 'red' : undefined}
              disabled={pending}
              onClick={() => setAction({ kind: lifecycle })}
            >
              {t(
                lifecycle === 'activate'
                  ? 'admin.resources.requestActivate'
                  : 'admin.resources.requestDeactivate',
              )}
            </Button>
          </Group>
        )}
        {pending && <Alert>{t('admin.resources.activationPendingHint')}</Alert>}
        {(server.change_requests ?? []).map((request) => (
          <Stack key={request.id} gap="xs">
            <Group>
              <Text size="sm">
                {t(`admin.changeAction.${request.action}`, { defaultValue: request.action })}
              </Text>
              <Badge>{t(`admin.status.${request.status}`, { defaultValue: request.status })}</Badge>
            </Group>
            <Text size="sm">{request.reason}</Text>
            <Text size="xs">{t('authorization.requestedBy', { user: request.requested_by })}</Text>
            <ChangeReview server={server} request={request} />
            {request.status === 'approved' &&
              credentialAction(request.action) &&
              request.base_version === server.version && (
                <>
                  <Alert>{t('authorization.approvedCredential')}</Alert>
                  {canWrite && session?.user_id === request.requested_by && (
                    <Button onClick={() => setAction({ kind: 'redeem', requestId: request.id })}>
                      {t('authorization.redeemSecret')}
                    </Button>
                  )}
                </>
              )}
            {canApprove && request.status === 'pending' && (
              <Group>
                <Button
                  variant="light"
                  disabled={request.base_version !== server.version}
                  onClick={() => setAction({ kind: 'approve', requestId: request.id })}
                >
                  {t('admin.approval.approve')}
                </Button>
                <Button
                  variant="light"
                  color="red"
                  onClick={() => setAction({ kind: 'reject', requestId: request.id })}
                >
                  {t('admin.approval.reject')}
                </Button>
              </Group>
            )}
          </Stack>
        ))}
        {action && (
          <ServerActionModal
            applicationId={server.application_id}
            server={server}
            action={action}
            onClose={() => setAction(null)}
            refresh={refresh}
            onSecret={setSecret}
          />
        )}
        <Modal
          opened={secret !== null}
          onClose={() => setSecret(null)}
          title={t('authorization.secretTitle')}
          closeOnClickOutside={false}
          closeOnEscape={false}
          withCloseButton={false}
        >
          <Stack>
            <Alert color="red">{t('admin.secret.warning')}</Alert>
            {secret && (
              <>
                <TextInput
                  label={t('authorization.credentialId')}
                  value={secret.credential_id}
                  readOnly
                />
                <TextInput
                  label={t('admin.secret.valueLabel')}
                  value={secret.secret}
                  readOnly
                  autoComplete="off"
                />
              </>
            )}
            <Button onClick={() => setSecret(null)}>{t('admin.secret.acknowledge')}</Button>
          </Stack>
        </Modal>
      </Stack>
    </SectionCard>
  );
}

function ServerActionModal({
  applicationId,
  server,
  action,
  onClose,
  refresh,
  onSecret,
}: {
  applicationId: string;
  server?: ResourceServer;
  action: ServerAction;
  onClose: () => void;
  refresh: () => Promise<void>;
  onSecret?: (secret: ResourceServerSecret) => void;
}) {
  const { t } = useTranslation();
  const { data: session } = useAdminSession();
  const { runWithAdminStepUp } = useAdminStepUp();
  const [baseline] = useState(server);
  const [name, setName] = useState(server?.name ?? '');
  const [audience, setAudience] = useState(server?.audience ?? '');
  const [clients, setClients] = useState(server?.client_ids.join('\n') ?? '');
  const selectedRequest =
    'requestId' in action
      ? baseline?.change_requests?.find((item) => item.id === action.requestId)
      : undefined;
  const currentRequest =
    'requestId' in action
      ? server?.change_requests?.find((item) => item.id === action.requestId)
      : undefined;
  const canAct =
    hasAdminCapability(
      session,
      action.kind === 'approve' || action.kind === 'reject'
        ? 'applications:approve'
        : 'applications:write',
    ) &&
    (action.kind !== 'redeem' ||
      (currentRequest?.status === 'approved' &&
        credentialAction(currentRequest.action) &&
        currentRequest.requested_by === session?.user_id &&
        currentRequest.base_version === server?.version));
  const editing = action.kind === 'create' || action.kind === 'edit';
  const clientIds = [
    ...new Set(
      clients
        .split(/[\n,]/)
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ];
  const mutation = useMutation({
    gcTime: 0,
    retry: false,
    mutationFn: async (reason: string) => {
      if (!canAct) return;
      await runWithAdminStepUp(async () => {
        const input: ResourceServerInput = {
          name: name.trim(),
          audience: audience.trim(),
          client_ids: clientIds,
          reason,
        };
        if (action.kind === 'create') {
          await createResourceServer({ ...input, application_id: applicationId });
        } else if (baseline) {
          if (action.kind === 'edit') {
            await updateResourceServer(baseline, input);
            if (baseline.status === 'active')
              notifications.show({ message: t('authorization.bindingSubmitted') });
          } else if (action.kind === 'redeem') {
            const result = await createResourceServerSecret(baseline, reason, action.requestId);
            onSecret?.(result);
          } else if (
            action.kind === 'activate' ||
            action.kind === 'deactivate' ||
            action.kind === 'issue_secret' ||
            action.kind === 'rotate_secret'
          ) {
            const result = await requestResourceServerActivation(baseline, action.kind, reason);
            const messages = {
              pending: t('authorization.requestPending'),
              approved: t('authorization.requestApproved'),
              applied: t('authorization.requestApplied'),
            };
            notifications.show({ message: messages[result.status] });
          } else if ('requestId' in action) {
            await decideResourceServerApproval(baseline, {
              change_request_id: action.requestId,
              decision: action.kind,
              reason,
            });
          }
        }
      });
    },
    onSuccess: async () => {
      onClose();
      await refresh();
    },
  });
  const conflict = isApiError(mutation.error) && mutation.error.status === 412;
  const labels = {
    create: t('authorization.createServer'),
    edit: t('authorization.editServer'),
    issue_secret: t('authorization.createSecret'),
    rotate_secret: t('authorization.rotateSecret'),
    redeem: t('authorization.redeemSecret'),
    activate: t('admin.resources.requestActivate'),
    deactivate: t('admin.resources.requestDeactivate'),
    approve: t('admin.approval.approve'),
    reject: t('admin.approval.reject'),
  };
  return (
    <ReasonModal
      opened
      onClose={() => {
        if (!mutation.isPending) onClose();
      }}
      title={labels[action.kind]}
      confirmLabel={t('common.confirm')}
      confirmColor={
        action.kind === 'deactivate' ||
        action.kind === 'reject' ||
        action.kind === 'redeem' ||
        credentialAction(action.kind)
          ? 'red'
          : undefined
      }
      required
      minReasonLength={3}
      pending={mutation.isPending}
      error={mutation.error}
      confirmDisabled={
        !canAct ||
        conflict ||
        (editing && (!name.trim() || !audience.trim() || clientIds.length === 0))
      }
      description={t(
        action.kind === 'redeem'
          ? 'authorization.secretHint'
          : credentialAction(action.kind)
            ? 'authorization.credentialApprovalHint'
            : 'authorization.bindingHint',
      )}
      extraFields={
        <Stack>
          {editing && (
            <>
              <TextInput
                label={t('authorization.serverName')}
                required
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
              />
              <TextInput
                label={t('authorization.audience')}
                required
                value={audience}
                onChange={(event) => setAudience(event.currentTarget.value)}
              />
              <Textarea
                required
                label={t('authorization.clientIds')}
                description={t('authorization.clientIdsHint')}
                value={clients}
                onChange={(event) => setClients(event.currentTarget.value)}
                autosize
                minRows={2}
              />
            </>
          )}
          {!editing && baseline && (
            <Text size="sm">
              {baseline.name} · {baseline.audience}
            </Text>
          )}
          {selectedRequest && baseline && (
            <>
              <Text size="sm">{selectedRequest.reason}</Text>
              <ChangeReview server={server ?? baseline} request={selectedRequest} />
              {selectedRequest.status === 'pending' &&
                selectedRequest.requested_by === session?.user_id && (
                  <Alert color="yellow">{t('authorization.independentApprover')}</Alert>
                )}
            </>
          )}
          {conflict && (
            <Button
              onClick={async () => {
                onClose();
                await refresh();
              }}
            >
              {t('authorization.refresh')}
            </Button>
          )}
        </Stack>
      }
      onSubmit={(reason) => mutation.mutate(reason)}
    />
  );
}
