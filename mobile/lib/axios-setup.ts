import axios from 'axios';
import { authService } from './auth-service';
import { useAuthStore } from '../hooks/use-auth-store';

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

axios.interceptors.request.use((config) => {
  const state = useAuthStore.getState();
  if (state.accessToken && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer `;
  }
  return config;
});

axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        try {
          const token = await new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          });
          originalRequest.headers.Authorization = `Bearer `;
          return axios(originalRequest);
        } catch (err) {
          return Promise.reject(err);
        }
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const state = useAuthStore.getState();
      const refreshToken = state.refreshToken;

      if (!refreshToken) {
        isRefreshing = false;
        await state.clearAuth();
        return Promise.reject(error);
      }

      try {
        const { accessToken, refreshToken: newRefreshToken } = await authService.refreshSession(refreshToken);
        
        if (state.publicKey) {
          await state.setAuth(accessToken, newRefreshToken, state.publicKey);
        }
        
        processQueue(null, accessToken);
        originalRequest.headers.Authorization = `Bearer `;
        return axios(originalRequest);
      } catch (err) {
        processQueue(err, null);
        await state.clearAuth();
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

