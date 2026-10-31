import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';

import { AccountLayout } from '@/components/AccountLayout';
import { NotFoundPage } from '@/components/NotFoundPage';
import { RouteErrorPage } from '@/components/RouteErrorPage';
import { AdminLayout } from '@/features/admin/AdminLayout';
import { AdminLoginPage } from '@/features/admin/AdminLoginPage';
import { AdminAuditEventsPage } from '@/features/admin/pages/AdminAuditEventsPage';
import { AdminBackupExercisesPage } from '@/features/admin/pages/AdminBackupExercisesPage';
import { AdminConfigurationVersionDetailPage } from '@/features/admin/pages/AdminConfigurationVersionDetailPage';
import { AdminConfigurationVersionsPage } from '@/features/admin/pages/AdminConfigurationVersionsPage';
import { AdminComplianceDocumentsPage } from '@/features/admin/pages/AdminComplianceDocumentsPage';
import { AdminKeyRotationsPage } from '@/features/admin/pages/AdminKeyRotationsPage';
import { AdminOverviewPage } from '@/features/admin/pages/AdminOverviewPage';
import {
  AdminResourceAccessSubpage,
  AdminResourceActivitySubpage,
  AdminResourceDetailPage,
  AdminResourceIntegrationSubpage,
  AdminResourceOverviewSubpage,
  AdminResourceProtocolsSubpage,
  AdminResourceSectionRedirect,
  AdminResourceSettingsSubpage,
} from '@/features/admin/pages/AdminResourceDetailPage';
import { AdminResourceListPage } from '@/features/admin/pages/AdminResourceListPage';
import {
  AdminUserAccessSubpage,
  AdminUserDetailPage,
  AdminUserOverviewSubpage,
  AdminUserSectionRedirect,
} from '@/features/admin/pages/AdminUserDetailPage';
import { AdminUsersPage } from '@/features/admin/pages/AdminUsersPage';
import { AdminGuestOnly, RequireAdmin } from '@/features/admin/session/guards';
import { AdminOriginGate } from '@/features/admin/session/AdminOriginGate';
import { DeveloperPanelPage } from '@/features/developer/components/DeveloperPanelPage';
import {
  DeveloperResourceAccessSubpage,
  DeveloperResourceActivitySubpage,
  DeveloperResourceDetailPage,
  DeveloperResourceIntegrationSubpage,
  DeveloperResourceOverviewSubpage,
  DeveloperResourceProtocolsSubpage,
  DeveloperResourceSectionRedirect,
  DeveloperResourceSettingsSubpage,
} from '@/features/developer/components/DeveloperResourceDetailPage';
import { OverviewPage } from '@/features/account/OverviewPage';
import { ProfilePage } from '@/features/account/ProfilePage';
import { SecurityPage } from '@/features/account/SecurityPage';
import { ConfirmEmailChangePage } from '@/features/auth/ConfirmEmailChangePage';
import { FederationCompletePage } from '@/features/auth/FederationCompletePage';
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage';
import { LoginPage } from '@/features/auth/LoginPage';
import { RegisterPage } from '@/features/auth/RegisterPage';
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage';
import { VerifyEmailPage } from '@/features/auth/VerifyEmailPage';
import { DeviceCodePage } from '@/features/devices/DeviceCodePage';
import { DeviceConsentPage } from '@/features/devices/DeviceConsentPage';
import { AuthorizePage } from '@/features/oauth/AuthorizePage';
import { GuestOnly, RequireAuth } from '@/features/session/guards';

import { RootShell } from './RootShell';

const protocolDetailChildren: RouteObject[] = [
  { index: true, element: <AdminResourceSectionRedirect /> },
  { path: 'overview', element: <AdminResourceOverviewSubpage /> },
  { path: 'settings', element: <AdminResourceSettingsSubpage /> },
  { path: 'integration', element: <AdminResourceIntegrationSubpage /> },
  { path: 'activity', element: <AdminResourceActivitySubpage /> },
];

const developerProtocolDetailChildren: RouteObject[] = [
  { index: true, element: <DeveloperResourceSectionRedirect /> },
  { path: 'overview', element: <DeveloperResourceOverviewSubpage /> },
  { path: 'settings', element: <DeveloperResourceSettingsSubpage /> },
  { path: 'integration', element: <DeveloperResourceIntegrationSubpage /> },
  { path: 'activity', element: <DeveloperResourceActivitySubpage /> },
];

export const routes: RouteObject[] = [
  {
    element: <RootShell />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <Navigate to="/account" replace /> },

      {
        path: 'login',
        element: (
          <GuestOnly>
            <LoginPage />
          </GuestOnly>
        ),
      },
      {
        path: 'register',
        element: (
          <GuestOnly>
            <RegisterPage />
          </GuestOnly>
        ),
      },
      {
        path: 'forgot-password',
        element: (
          <GuestOnly>
            <ForgotPasswordPage />
          </GuestOnly>
        ),
      },
      { path: 'reset-password', element: <ResetPasswordPage /> },
      { path: 'verify-email', element: <VerifyEmailPage /> },
      { path: 'confirm-email-change', element: <ConfirmEmailChangePage /> },

      {
        path: 'federation/complete',
        element: <FederationCompletePage />,
      },
      {
        path: 'device',
        element: (
          <RequireAuth>
            <DeviceCodePage />
          </RequireAuth>
        ),
      },
      {
        path: 'device/confirm',
        element: (
          <RequireAuth>
            <DeviceConsentPage />
          </RequireAuth>
        ),
      },
      {
        path: 'authorize',
        element: (
          <RequireAuth>
            <AuthorizePage />
          </RequireAuth>
        ),
      },

      {
        path: 'account',
        element: (
          <RequireAuth>
            <AccountLayout />
          </RequireAuth>
        ),
        children: [
          { index: true, element: <OverviewPage /> },
          { path: 'profile', element: <ProfilePage /> },
          { path: 'security', element: <SecurityPage /> },
          { path: 'developer', element: <DeveloperPanelPage /> },
          {
            path: 'developer/applications/:resourceId',
            element: <DeveloperResourceDetailPage kind="application" />,
            children: [
              { index: true, element: <DeveloperResourceSectionRedirect /> },
              { path: 'overview', element: <DeveloperResourceOverviewSubpage /> },
              { path: 'protocols', element: <DeveloperResourceProtocolsSubpage /> },
              { path: 'access', element: <DeveloperResourceAccessSubpage /> },
              { path: 'activity', element: <DeveloperResourceActivitySubpage /> },
            ],
          },
          {
            path: 'developer/oauth-clients/:resourceId',
            element: <DeveloperResourceDetailPage kind="oauth" />,
            children: developerProtocolDetailChildren,
          },
          {
            path: 'developer/saml-service-providers/:resourceId',
            element: <DeveloperResourceDetailPage kind="saml" />,
            children: developerProtocolDetailChildren,
          },
        ],
      },

      {
        path: 'admin/login',
        element: (
          <AdminOriginGate>
            <AdminGuestOnly>
              <AdminLoginPage />
            </AdminGuestOnly>
          </AdminOriginGate>
        ),
      },
      {
        path: 'admin',
        element: (
          <AdminOriginGate>
            <RequireAdmin>
              <AdminLayout />
            </RequireAdmin>
          </AdminOriginGate>
        ),
        children: [
          { index: true, element: <AdminOverviewPage /> },
          { path: 'users', element: <AdminUsersPage /> },
          {
            path: 'users/:userId',
            element: <AdminUserDetailPage />,
            children: [
              { index: true, element: <AdminUserSectionRedirect /> },
              { path: 'overview', element: <AdminUserOverviewSubpage /> },
              { path: 'access', element: <AdminUserAccessSubpage /> },
            ],
          },
          { path: 'applications', element: <AdminResourceListPage kind="application" /> },
          {
            path: 'applications/:resourceId',
            element: <AdminResourceDetailPage kind="application" />,
            children: [
              { index: true, element: <AdminResourceSectionRedirect /> },
              { path: 'overview', element: <AdminResourceOverviewSubpage /> },
              { path: 'protocols', element: <AdminResourceProtocolsSubpage /> },
              { path: 'access', element: <AdminResourceAccessSubpage /> },
              { path: 'activity', element: <AdminResourceActivitySubpage /> },
            ],
          },
          { path: 'oauth-clients', element: <Navigate to="/admin/applications" replace /> },
          {
            path: 'oauth-clients/:resourceId',
            element: <AdminResourceDetailPage kind="oauth" />,
            children: protocolDetailChildren,
          },
          {
            path: 'saml-service-providers',
            element: <Navigate to="/admin/applications" replace />,
          },
          {
            path: 'saml-service-providers/:resourceId',
            element: <AdminResourceDetailPage kind="saml" />,
            children: protocolDetailChildren,
          },
          {
            path: 'federation-providers',
            element: <AdminResourceListPage kind="federation" />,
          },
          {
            path: 'federation-providers/:resourceId',
            element: <AdminResourceDetailPage kind="federation" />,
            children: protocolDetailChildren,
          },
          { path: 'audit-events', element: <AdminAuditEventsPage /> },
          { path: 'configuration-versions', element: <AdminConfigurationVersionsPage /> },
          { path: 'compliance-documents', element: <AdminComplianceDocumentsPage /> },
          {
            path: 'configuration-versions/:configurationId',
            element: <AdminConfigurationVersionDetailPage />,
          },
          { path: 'key-rotation-requests', element: <AdminKeyRotationsPage /> },
          { path: 'backup-exercises', element: <AdminBackupExercisesPage /> },
        ],
      },

      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
