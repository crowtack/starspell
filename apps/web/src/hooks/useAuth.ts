import { useCallback, useEffect, useState } from 'react';
import type {
  AuthMeResponse,
  LoginInput,
  RegisterInput,
  UpdateProfileInput,
  UserSettingsSave,
} from '@starspell/shared';
import {
  fetchMe,
  loginAccount,
  logoutAccount,
  registerAccount,
  updateProfile,
  updateSettings,
} from '../api/auth';
import { ApiError } from '../api/client';

export interface UseAuthResult {
  account: AuthMeResponse | null;
  loading: boolean;
  apiReachable: boolean;
  refreshMe: () => Promise<AuthMeResponse | null>;
  register: (input: RegisterInput) => Promise<AuthMeResponse>;
  login: (input: LoginInput) => Promise<AuthMeResponse>;
  logout: () => Promise<void>;
  saveProfile: (input: UpdateProfileInput) => Promise<void>;
  syncSettings: (patch: Partial<UserSettingsSave>) => Promise<void>;
}

export function useAuth(): UseAuthResult {
  const [account, setAccount] = useState<AuthMeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiReachable, setApiReachable] = useState(true);

  const refreshMe = useCallback(async (): Promise<AuthMeResponse | null> => {
    try {
      const me = await fetchMe();
      setAccount(me);
      setApiReachable(true);
      return me;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setAccount(null);
        setApiReachable(true);
      } else {
        setAccount(null);
        setApiReachable(false);
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  const register = useCallback(async (input: RegisterInput): Promise<AuthMeResponse> => {
    const me = await registerAccount(input);
    setAccount(me);
    setApiReachable(true);
    return me;
  }, []);

  const login = useCallback(async (input: LoginInput): Promise<AuthMeResponse> => {
    const me = await loginAccount(input);
    setAccount(me);
    setApiReachable(true);
    return me;
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await logoutAccount();
    } finally {
      setAccount(null);
    }
  }, []);

  const saveProfile = useCallback(async (input: UpdateProfileInput): Promise<void> => {
    const res = await updateProfile(input);
    setAccount((prev) =>
      prev
        ? {
            ...prev,
            profile: res.profile,
            difficulties: res.difficulties,
          }
        : prev,
    );
  }, []);

  const syncSettings = useCallback(async (patch: Partial<UserSettingsSave>): Promise<void> => {
    const nextSettings = await updateSettings(patch);
    setAccount((prev) => (prev ? { ...prev, settings: nextSettings } : prev));
  }, []);

  return {
    account,
    loading,
    apiReachable,
    refreshMe,
    register,
    login,
    logout,
    saveProfile,
    syncSettings,
  };
}
