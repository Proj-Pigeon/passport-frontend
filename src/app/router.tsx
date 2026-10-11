import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';

import { NotFoundPage } from '@/components/NotFoundPage';
import { PlaceholderPage } from '@/components/PlaceholderPage';
import { RootLayout } from '@/components/RootLayout';
import { RouteErrorPage } from '@/components/RouteErrorPage';

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <Navigate to="/account" replace /> },
      {
        path: 'login',
        element: (
          <PlaceholderPage
            title="登录"
            milestone="M2"
            description="密码登录、Passkey 登录、第三方登录"
          />
        ),
      },
      {
        path: 'register',
        element: (
          <PlaceholderPage title="注册" milestone="M2" description="注册并发送验证邮件" />
        ),
      },
      {
        path: 'forgot-password',
        element: (
          <PlaceholderPage title="忘记密码" milestone="M2" description="申请密码重置邮件" />
        ),
      },
      {
        path: 'reset-password',
        element: (
          <PlaceholderPage
            title="重置密码"
            milestone="M2"
            description="读取 #token= 后设置新密码"
          />
        ),
      },
      {
        path: 'verify-email',
        element: (
          <PlaceholderPage title="邮箱验证" milestone="M2" description="读取 #token= 后确认邮箱" />
        ),
      },
      {
        path: 'federation/complete',
        element: (
          <PlaceholderPage
            title="第三方登录结果"
            milestone="M5"
            description="处理 result=success / link_success"
          />
        ),
      },
      {
        path: 'authorize',
        element: (
          <PlaceholderPage
            title="授权同意"
            milestone="M6"
            description="OAuth interaction 授权 / 拒绝"
          />
        ),
      },
      {
        path: 'account',
        children: [
          {
            index: true,
            element: (
              <PlaceholderPage
                title="账号概览"
                milestone="M3"
                description="个人信息与安全摘要"
              />
            ),
          },
          {
            path: 'profile',
            element: (
              <PlaceholderPage title="个人资料" milestone="M3" description="昵称与头像" />
            ),
          },
          {
            path: 'security',
            element: (
              <PlaceholderPage
                title="安全"
                milestone="M4"
                description="Passkey 管理与 Step-up"
              />
            ),
          },
          {
            path: 'connections',
            element: (
              <PlaceholderPage title="连接账号" milestone="M5" description="绑定第三方身份" />
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
