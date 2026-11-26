import type {
  AccountDifficultyStat,
  AccountProfile,
  AuthMeResponse,
  GuestImportConfirmInput,
  GuestImportConfirmResponse,
  GuestImportPreviewInput,
  GuestImportPreviewResponse,
  LoginInput,
  RegisterInput,
  UpdateProfileInput,
  UpdateSettingsInput,
  UserSettingsSave,
} from '@starspell/shared';
import { apiRequest } from './client';

export function registerAccount(input: RegisterInput): Promise<AuthMeResponse> {
  return apiRequest<AuthMeResponse>('/api/auth/register', {
    method: 'POST',
    body: input,
  });
}

export function loginAccount(input: LoginInput): Promise<AuthMeResponse> {
  return apiRequest<AuthMeResponse>('/api/auth/login', {
    method: 'POST',
    body: input,
  });
}

export function logoutAccount(): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>('/api/auth/logout', {
    method: 'POST',
  });
}

export function fetchMe(): Promise<AuthMeResponse> {
  return apiRequest<AuthMeResponse>('/api/auth/me');
}

export function updateProfile(
  input: UpdateProfileInput,
): Promise<{ profile: AccountProfile; difficulties: AccountDifficultyStat[] }> {
  return apiRequest('/api/profile', {
    method: 'PATCH',
    body: input,
  });
}

export function updateSettings(input: UpdateSettingsInput): Promise<UserSettingsSave> {
  return apiRequest<UserSettingsSave>('/api/settings', {
    method: 'PATCH',
    body: input,
  });
}

export function previewGuestImport(
  input: GuestImportPreviewInput,
): Promise<GuestImportPreviewResponse> {
  return apiRequest<GuestImportPreviewResponse>('/api/import/guest/preview', {
    method: 'POST',
    body: input,
  });
}

export function confirmGuestImport(
  input: GuestImportConfirmInput,
): Promise<GuestImportConfirmResponse> {
  return apiRequest<GuestImportConfirmResponse>('/api/import/guest/confirm', {
    method: 'POST',
    body: input,
  });
}
