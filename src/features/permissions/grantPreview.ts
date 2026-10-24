import type {
  PermissionDefinition,
  PermissionGrants,
  PermissionGrantsInput,
} from '@/api/endpoints/permissions';

export type GrantSelection = Omit<PermissionGrantsInput, 'reason'>;

export function initialGrantSelection(grants: PermissionGrants): GrantSelection {
  return {
    roles: [...grants.roles],
    builtin_permission_ids: grants.builtin_grants.map((item) => item.id),
    application_permission_ids: grants.application_grants.map((item) => item.id),
  };
}

export function permissionCatalog(definitions: PermissionDefinition[], grants: PermissionGrants) {
  return [
    ...new Map(
      [...grants.builtin_grants, ...grants.application_grants, ...definitions].map((item) => [
        item.id,
        item,
      ]),
    ).values(),
  ];
}

export function grantPreview(
  grants: PermissionGrants,
  selection: GrantSelection,
  definitions: PermissionDefinition[],
) {
  const inherited = new Map<string, string[]>();
  const inactiveBuiltin = new Set(
    definitions
      .filter((item) => !item.application_id && item.status !== 'active')
      .map((item) => item.code),
  );
  for (const role of selection.roles) {
    for (const capability of grants.role_capabilities[role] ?? []) {
      if (!inactiveBuiltin.has(capability))
        inherited.set(capability, [...(inherited.get(capability) ?? []), role]);
    }
  }
  const activeBuiltin = definitions.filter(
    (item) =>
      !item.application_id &&
      item.status === 'active' &&
      selection.builtin_permission_ids.includes(item.id),
  );
  const effective = [
    ...new Set([...inherited.keys(), ...activeBuiltin.map((item) => item.code)]),
  ].sort();
  const appEffective = definitions.filter(
    (item) =>
      item.application_id &&
      item.status === 'active' &&
      selection.application_permission_ids.includes(item.id),
  );
  const previous = initialGrantSelection(grants);
  const changes = (before: string[], after: string[]) => ({
    added: after.filter((id) => !before.includes(id)),
    removed: before.filter((id) => !after.includes(id)),
  });
  const roles = changes(previous.roles, selection.roles);
  const builtin = changes(previous.builtin_permission_ids, selection.builtin_permission_ids);
  const applications = changes(
    previous.application_permission_ids,
    selection.application_permission_ids,
  );
  return {
    inherited,
    effective,
    appEffective,
    roles,
    builtin,
    applications,
    changed: [roles, builtin, applications].some(
      (change) => change.added.length || change.removed.length,
    ),
  };
}
