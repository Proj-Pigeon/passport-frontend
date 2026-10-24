import { describe, expect, it } from 'vitest';
import type { PermissionDefinition, PermissionGrants } from '@/api/endpoints/permissions';
import { grantPreview, initialGrantSelection, permissionCatalog } from './grantPreview';

const builtin: PermissionDefinition = {
  id: 'builtin',
  code: 'users:read',
  name: 'Read users',
  description: '',
  status: 'active',
  version: 1,
  grant_count: 0,
};
const app: PermissionDefinition = {
  ...builtin,
  id: 'app',
  application_id: 'one',
  code: 'api.access',
};
const other: PermissionDefinition = { ...app, id: 'other', application_id: 'two' };
const grants: PermissionGrants = {
  version: 1,
  roles: ['user_admin'],
  builtin_grants: [builtin],
  application_grants: [app],
  effective_capabilities: ['users:read', 'users:write'],
  role_capabilities: { user_admin: ['users:read', 'users:write'] },
};

describe('grant preview', () => {
  it('keeps inherited access when its direct grant is removed', () => {
    const preview = grantPreview(
      grants,
      { ...initialGrantSelection(grants), builtin_permission_ids: [] },
      [builtin, app],
    );
    expect(preview.builtin.removed).toEqual(['builtin']);
    expect(preview.effective).toEqual(['users:read', 'users:write']);
    expect(preview.inherited.get('users:read')).toEqual(['user_admin']);
    expect(preview.changed).toBe(true);
  });

  it('excludes disabled builtins from both role inheritance and direct access', () => {
    const preview = grantPreview(grants, initialGrantSelection(grants), [
      { ...builtin, status: 'disabled' },
      app,
    ]);
    expect(preview.inherited.has('users:read')).toBe(false);
    expect(preview.effective).toEqual(['users:write']);
  });

  it('removes inherited access only when the role is explicitly removed', () => {
    const preview = grantPreview(
      grants,
      { roles: [], builtin_permission_ids: [], application_permission_ids: [] },
      [builtin, app],
    );
    expect(preview.effective).toEqual([]);
    expect(preview.roles.removed).toEqual(['user_admin']);
  });

  it('isolates identical permission codes by application and excludes inactive definitions', () => {
    const preview = grantPreview(
      grants,
      {
        roles: [],
        builtin_permission_ids: ['builtin'],
        application_permission_ids: ['app', 'other'],
      },
      [{ ...builtin, status: 'disabled' }, { ...app, status: 'deleted' }, other],
    );
    expect(preview.effective).toEqual([]);
    expect(preview.appEffective).toEqual([other]);
    expect(preview.applications.added).toEqual(['other']);
  });

  it('uses current catalog metadata and retains selected missing definitions for removal', () => {
    const catalog = permissionCatalog(
      [{ ...builtin, name: 'Updated', status: 'disabled' }],
      grants,
    );
    expect(catalog).toEqual([{ ...builtin, name: 'Updated', status: 'disabled' }, app]);
    expect(grantPreview(grants, initialGrantSelection(grants), catalog).changed).toBe(false);
  });
});
