import { apiGet } from '../http';
import type { ComplianceDocuments } from '../types';

export function getComplianceDocuments(signal?: AbortSignal) {
  return apiGet<ComplianceDocuments>('/v1/compliance-documents', {
    signal,
    suppressUnauthorized: true,
  });
}
