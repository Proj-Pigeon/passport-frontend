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
import { AdminResourceDetailPage } from '@/features/admin/pages/AdminResourceDetailPage';
import { AdminResourceListPage } from '@/features/admin/pages/AdminResourceListPage';
import { AdminUserDetailPage } from '@/features/admin/pages/AdminUserDetailPage';
import { AdminUsersPage } from '@/features/admin/pages/AdminUsersPage';
import { AdminGuestOnly, RequireAdmin } from '@/features/admin/session/guards';
import { AdminOriginGate } from '@/features/admin/session/AdminOriginGate';
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
          { path: 'users/:userId', element: <AdminUserDetailPage /> },
          { path: 'applications', element: <AdminResourceListPage kind="application" /> },
          {
            path: 'applications/:resourceId',
            element: <AdminResourceDetailPage kind="application" />,
          },
          { path: 'oauth-clients', element: <Navigate to="/admin/applications" replace /> },
          { path: 'oauth-clients/:resourceId', element: <AdminResourceDetailPage kind="oauth" /> },
          {
            path: 'saml-service-providers',
            element: <Navigate to="/admin/applications" replace />,
          },
          {
            path: 'saml-service-providers/:resourceId',
            element: <AdminResourceDetailPage kind="saml" />,
          },
          {
            path: 'federation-providers',
            element: <AdminResourceListPage kind="federation" />,
          },
          {
            path: 'federation-providers/:resourceId',
            element: <AdminResourceDetailPage kind="federation" />,
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
