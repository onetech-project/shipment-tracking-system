'use client';
import React, { createContext, useContext, useState, useCallback } from 'react';
import { apiClient } from '@/shared/api/client';

/**
 * Module-level ref so the Axios interceptor can read the access token
 * without going through React state (avoids stale closure issues).
 */
export const accessTokenRef = { current: null as string | null };

export interface AuthUser {
  id: string;
  username: string;
  organizationId: string;
  isSuperAdmin: boolean;
  roles: string[];
}

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  login: (username: string, password: string, organizationId: string) => Promise<void>;
  logout: () => Promise<void>;
  setTokens: (token: string, user: AuthUser) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const setTokens = useCallback((token: string, u: AuthUser) => {
    accessTokenRef.current = token;
    setAccessToken(token);
    setUser(u);
  }, []);

  const login = useCallback(async (username: string, password: string, organizationId: string) => {
    const res = await apiClient.post<{ accessToken: string; user: AuthUser }>('/auth/login', {
      username,
      password,
      organizationId,
    });
    setTokens(res.data.accessToken, res.data.user);
  }, [setTokens]);

  const logout = useCallback(async () => {
    try {
      await apiClient.post('/auth/logout');
    } finally {
      accessTokenRef.current = null;
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, accessToken, login, logout, setTokens }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

