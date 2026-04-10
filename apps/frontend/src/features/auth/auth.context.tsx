'use client'
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { apiClient } from '@/shared/api/client'

/**
 * Module-level ref so the Axios interceptor can read the access token
 * without going through React state (avoids stale closure issues).
 */
export const accessTokenRef = { current: null as string | null }

export interface AuthUser {
  id: string
  username: string
  organizationId: string
  isSuperAdmin: boolean
  roles: string[]
  permissions: string[]
}

interface AuthContextValue {
  user: AuthUser | null
  accessToken: string | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  setTokens: (token: string, user: AuthUser) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * Module-level promise so the refresh request fires exactly once,
 * even when React Strict Mode double-mounts in development.
 */
let refreshPromise: Promise<{ accessToken: string } | null> | null = null

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const setTokens = useCallback((token: string, u: AuthUser) => {
    accessTokenRef.current = token
    setAccessToken(token)
    setUser(u)
  }, [])

  // Restore session from HttpOnly refresh cookie on every mount / page reload
  useEffect(() => {
    let cancelled = false

    if (!refreshPromise) {
      const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api'
      refreshPromise = import('axios').then(({ default: axios }) =>
        axios
          .post<{ accessToken: string }>(`${BASE_URL}/auth/refresh`, {}, { withCredentials: true })
          .then((r) => r.data)
          .catch(() => null)
      )
    }

    refreshPromise
      .then((data) => {
        if (cancelled || !data) return
        const token = data.accessToken
        accessTokenRef.current = token
        setAccessToken(token)
        return apiClient.get<AuthUser>('/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        })
      })
      .then((r) => {
        if (cancelled || !r) return
        setUser(r.data)
      })
      .catch(() => {
        if (cancelled) return
        accessTokenRef.current = null
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(
    async (username: string, password: string) => {
      const res = await apiClient.post<{ accessToken: string; user: AuthUser }>('/auth/login', {
        username,
        password,
      })
      setTokens(res.data.accessToken, res.data.user)
    },
    [setTokens]
  )

  const logout = useCallback(async () => {
    try {
      await apiClient.post('/auth/logout')
    } finally {
      accessTokenRef.current = null
      setAccessToken(null)
      setUser(null)
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, accessToken, loading, login, logout, setTokens }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
