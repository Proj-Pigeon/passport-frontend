import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';

import { AccountLayout } from '@/components/AccountLayout';
import { NotFoundPage } from '@/components/NotFoundPage';
import { PlaceholderPage } from '@/components/PlaceholderPage';
import { RouteErrorPage } from '@/components/RouteErrorPage';
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage';
import { LoginPage } from '@/features/auth/LoginPage';
import { RegisterPage } from '@/features/auth/RegisterPage';
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage';
import { VerifyEmailPage } from '@/features/auth/VerifyEmailPage';
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
        element: (
          <PlaceholderPage
            titleKey="placeholder.federationComplete"
            milestone="M5"
            descriptionKey="placeholder.federationCompleteDescription"
          />
        ),
      },
      {
        path: 'authorize',
        element: (
          <RequireAuth>
            <PlaceholderPage
              titleKey="placeholder.authorize"
              milestone="M6"
              descriptionKey="placeholder.authorizeDescription"
            />
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
          {
            index: true,
            element: (
              <PlaceholderPage
                titleKey="placeholder.account"
                milestone="M3"
                descriptionKey="placeholder.accountDescription"
              />
            ),
          },
          {
            path: 'profile',
            element: (
              <PlaceholderPage
                titleKey="placeholder.profile"
                milestone="M3"
                descriptionKey="placeholder.profileDescription"
              />
            ),
          },
          {
            path: 'security',
            element: (
              <PlaceholderPage
                titleKey="placeholder.security"
                milestone="M4"
                descriptionKey="placeholder.securityDescription"
              />
            ),
          },
        ],
      },

      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
