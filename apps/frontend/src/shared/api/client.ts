import axios from 'axios';
import { accessTokenRef } from '@/features/auth/auth.context';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

export const apiClient = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
});

let refreshing: Promise<string> | null = null;

apiClient.interceptors.request.use((config) => {
  const token = accessTokenRef.current;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      if (!refreshing) {
        refreshing = axios
          .post<{ accessToken: string }>(
            `${BASE_URL}/auth/refresh`,
            {},
            { withCredentials: true },
          )
          .then((r) => {
            accessTokenRef.current = r.data.accessToken;
            return r.data.accessToken;
          })
          .finally(() => {
            refreshing = null;
          });
      }
      try {
        const newToken = await refreshing;
        original.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(original);
      } catch {
        accessTokenRef.current = null;
        if (typeof window !== 'undefined') window.location.href = '/login';
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  },
);
