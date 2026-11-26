import type {
  AbandonSoloSessionInput,
  AppendSoloEventsInput,
  AppendSoloEventsResult,
  CreateSoloSessionInput,
  SoloSessionDto,
} from '@starspell/shared';
import { apiRequest } from './client';

export function createSoloSession(input: CreateSoloSessionInput): Promise<SoloSessionDto> {
  return apiRequest<SoloSessionDto>('/api/solo/sessions', {
    method: 'POST',
    body: input,
  });
}

export function getActiveSoloSession(): Promise<{ session: SoloSessionDto | null }> {
  return apiRequest<{ session: SoloSessionDto | null }>('/api/solo/sessions/active');
}

export function appendSoloEvents(
  sessionId: string,
  input: AppendSoloEventsInput,
): Promise<AppendSoloEventsResult> {
  return apiRequest<AppendSoloEventsResult>(`/api/solo/sessions/${sessionId}/events`, {
    method: 'POST',
    body: input,
  });
}

export function abandonSoloSession(
  sessionId: string,
  input: AbandonSoloSessionInput,
): Promise<SoloSessionDto> {
  return apiRequest<SoloSessionDto>(`/api/solo/sessions/${sessionId}/abandon`, {
    method: 'POST',
    body: input,
  });
}
