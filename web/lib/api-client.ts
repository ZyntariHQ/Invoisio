import axios, { AxiosError } from 'axios';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

let accessToken: string | null = null;
let refreshToken: string | null = null;
let isRefreshing = false;
let failedQueue: Array<{ resolve: (value?: unknown) => void; reject: (reason?: any) => void }> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

function getOrCreateCorrelationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `corr-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const apiClient = axios.create({
  baseURL: API_URL,
});

apiClient.interceptors.request.use((config) => {
  config.headers = config.headers ?? {};
  config.headers['X-Correlation-ID'] = getOrCreateCorrelationId();

  if (accessToken != null && accessToken.length > 0) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        try {
          const token = await new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          });
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return apiClient(originalRequest);
        } catch (err) {
          return Promise.reject(err);
        }
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const response = await axios.post<{ accessToken: string; refreshToken: string }>(
          `${API_URL}/auth/refresh`,
          { refreshToken }
        );
        const { accessToken: newAccessToken, refreshToken: newRefreshToken } = response.data;
        
        setApiAccessToken(newAccessToken);
        setApiRefreshToken(newRefreshToken);
        
        // Let the application update its storage if needed (we'll do it via event or direct storage in use-wallet-auth)
        if (typeof window !== 'undefined') {
          const raw = window.localStorage.getItem('invoisio:web:wallet-auth');
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              parsed.accessToken = newAccessToken;
              parsed.refreshToken = newRefreshToken;
              window.localStorage.setItem('invoisio:web:wallet-auth', JSON.stringify(parsed));
            } catch {}
          }
        }

        processQueue(null, newAccessToken);
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return apiClient(originalRequest);
      } catch (err) {
        processQueue(err, null);
        setApiAccessToken(null);
        setApiRefreshToken(null);
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem('invoisio:web:wallet-auth');
          window.location.reload(); // Simple force-logout
        }
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export function setApiAccessToken(token: string | null): void {
  accessToken = token;
}

export function getApiAccessToken(): string | null {
  return accessToken;
}

export function setApiRefreshToken(token: string | null): void {
  refreshToken = token;
}

export function getApiRefreshToken(): string | null {
  return refreshToken;
}

export function extractApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const err = error as AxiosError<{ message?: string | string[] }>;
    const message = err.response?.data?.message;

    if (Array.isArray(message)) {
      return message.join(', ');
    }

    if (typeof message === 'string' && message.length > 0) {
      return message;
    }

    if (typeof err.message === 'string' && err.message.length > 0) {
      return err.message;
    }
  }

  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return 'Something went wrong. Please try again.';
}
