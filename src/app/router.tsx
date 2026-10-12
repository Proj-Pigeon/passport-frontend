import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';

import { AccountLayout } from '@/components/AccountLayout';
import { NotFoundPage } from '@/components/NotFoundPage';
import { RouteErrorPage } from '@/components/RouteErrorPage';
import { OverviewPage } from '@/features/account/OverviewPage';
import { ProfilePage } from '@/features/account/ProfilePage';
import { SecurityPage } from '@/features/account/SecurityPage';
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage';
import { FederationCompletePage } from '@/features/auth/FederationCompletePage';
import { LoginPage } from '@/features/auth/LoginPage';
import { RegisterPage } from '@/features/auth/RegisterPage';
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage';
import { VerifyEmailPage } from '@/features/auth/VerifyEmailPage';
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

      {
        path: 'federation/complete',
        element: <FederationCompletePage />,
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

      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
