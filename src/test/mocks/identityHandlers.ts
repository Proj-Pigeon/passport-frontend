import { http, HttpResponse, type RequestHandler } from 'msw';

import type { IdentityRecord, AdminIdentityReveal } from '@/api/endpoints/account/identity';
import { currentUser, hasAdminStepUp, type MockDb } from './db';
import { envelope, notFound, readJson, str, unauthorized } from './handlers';

export function createIdentityHandlers(db: MockDb): RequestHandler[] {
  const accountGuard = (request: Request) => {
    if (!currentUser(db)) return unauthorized();
    if (
      request.method !== 'GET' &&
      db.requireCsrf &&
      request.headers.get('x-csrf-token') !== db.csrfToken
    )
      return envelope(403, 'forbidden', 'CSRF token is required.');
    return null;
  };
  const adminGuard = (request: Request, write = false) => {
    if (!db.adminSession) return unauthorized();
    if (!db.adminSession.capabilities.includes(write ? 'users:write' : 'users:read'))
      return envelope(403, 'forbidden', 'Administrator permission is required.');
    if (write && !hasAdminStepUp(db))
      return envelope(403, 'forbidden', 'A recent passkey user-verification step-up is required.');
    if (write && db.requireCsrf && request.headers.get('x-csrf-token') !== db.adminCsrfToken)
      return envelope(403, 'forbidden', 'CSRF token is required.');
    return null;
  };
  return [
    http.get(
      '*/v1/me/identity',
      ({ request }) =>
        accountGuard(request) ??
        HttpResponse.json({
          enabled: db.identityEnabled,
          identity: db.identities.get(db.currentUserId ?? '')?.[0] ?? null,
        }),
    ),
    http.post('*/v1/me/identity/sessions', ({ request }) => {
      const failure = accountGuard(request);
      if (failure) return failure;
      if (!db.identityEnabled)
        return envelope(503, 'dependency_unavailable', 'Identity verification is unavailable.');
      const userId = db.currentUserId!;
      const attempts = db.identities.get(userId) ?? [];
      const active = attempts.find(
        (item) =>
          item.review_state === 'pending' &&
          !['Expired', 'Abandoned', 'Kyc Expired', 'Declined', 'Approved'].includes(item.status),
      );
      const now = new Date().toISOString();
      const record: IdentityRecord = active ?? {
        id: `kyc_mock_${attempts.length + 1}`,
        session_id: `session-${attempts.length + 1}`,
        status: 'Not Started',
        review_state: 'pending',
        full_name_mask: '',
        document_number_mask: '',
        document_type: '',
        issuing_country: '',
        decision_at: null,
        created_at: now,
        updated_at: now,
        verified: false,
      };
      if (!active) db.identities.set(userId, [record, ...attempts]);
      return HttpResponse.json(
        {
          id: record.id,
          session_id: record.session_id,
          session_url: `https://verify.didit.me/session/${record.session_id}`,
          expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
        },
        { status: 201 },
      );
    }),
    http.post('*/v1/me/identity/sessions/:id/refresh', ({ request, params }) => {
      const failure = accountGuard(request);
      if (failure) return failure;
      const records = db.identities.get(db.currentUserId!) ?? [];
      if (!records.some((record) => record.id === params.id)) return notFound();
      return HttpResponse.json({ enabled: db.identityEnabled, identity: records[0] ?? null });
    }),
    http.get('*/admin/v1/users/:userId/identity', ({ request, params }) => {
      const failure = adminGuard(request);
      if (failure) return failure;
      const records = db.identities.get(String(params.userId)) ?? [];
      return HttpResponse.json({ identity: records[0] ?? null, attempts: records });
    }),
    http.post('*/admin/v1/users/:userId/identity/reveal', async ({ request, params }) => {
      const failure = adminGuard(request, true);
      if (failure) return failure;
      const input = await readJson(request);
      const record = db.identities
        .get(String(params.userId))
        ?.find((item) => item.id === str(input?.id));
      if (!record) return notFound();
      const revealed: AdminIdentityReveal | undefined = db.identityMaterials.get(record.id);
      return revealed ? HttpResponse.json(revealed) : notFound();
    }),
    http.post('*/admin/v1/users/:userId/identity/review', async ({ request, params }) => {
      const failure = adminGuard(request, true);
      if (failure) return failure;
      if (db.adminSession?.user_id === params.userId)
        return envelope(403, 'forbidden', 'Self review is not allowed.');
      const input = await readJson(request);
      const record = db.identities
        .get(String(params.userId))
        ?.find((item) => item.id === str(input?.id));
      if (!record) return notFound();
      const decision = str(input?.decision);
      if (!['approve', 'reject', 'reset'].includes(decision) || !str(input?.reason).trim())
        return envelope(422, 'validation_failed', 'A decision and reason are required.');
      record.review_state =
        decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'reset';
      record.verified = decision === 'approve';
      if (decision === 'approve') record.status = 'Approved';
      if (decision === 'reject') record.status = 'Declined';
      record.updated_at = new Date().toISOString();
      return new HttpResponse(null, { status: 204 });
    }),
  ];
}
