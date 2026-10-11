import { apiGet, apiPost } from '../http';
import type { OAuthContinueResult, OAuthInteraction } from '../types';

function interactionPath(interactionId: string, suffix = ''): string {
  return `/oauth2/authorize/interactions/${encodeURIComponent(interactionId)}${suffix}`;
}

export function getInteraction(interactionId: string, signal?: AbortSignal) {
  return apiGet<OAuthInteraction>(interactionPath(interactionId), { signal });
}

export function approveInteraction(interactionId: string) {
  return apiPost<OAuthContinueResult>(interactionPath(interactionId, '/approve'), undefined, {
    accept: 'application/json',
  });
}

export function denyInteraction(interactionId: string) {
  return apiPost<OAuthContinueResult>(interactionPath(interactionId, '/deny'), undefined, {
    accept: 'application/json',
  });
}
